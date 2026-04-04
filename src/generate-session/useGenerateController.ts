import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ArchiveImage } from '../db/types';
import { downloadGeneratedImage } from '../download/download';
import { generateSessionStore, type GenerateDraft, type GenerateSessionStore } from './GenerateSession';
import { imageWorkflow, type ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { lineageStore, type LineageStore } from '../lineage/LineageStore';
import { saveGeneratedImage } from './saveGeneratedImage';
import { runGenerateAutopilot } from './runGenerateAutopilot';
import { createAutopilotSession, type AutopilotSession } from '../autopilot/AutopilotSession';

interface AutopilotProgressState {
    running: boolean;
    iterations: Array<{
        stepId: string;
        archiveImageId: string;
        iterationNumber: number;
        prompt: string;
        imageDataUrl: string;
        score: number;
        feedback: string[];
    }>;
    status: 'idle' | 'running' | 'satisfied' | 'max-iterations' | 'cancelled' | 'failed';
    bestIterationNumber: number | null;
    lastErrorIteration: number | null;
}

interface UseGenerateControllerOptions {
    apiKey: string | null;
    draft: GenerateDraft;
    setDraft: Dispatch<SetStateAction<GenerateDraft>>;
    referenceImages: File[];
    replaceReferences: (dataUrls: string[]) => void;
    serializeReferences: () => Promise<string[]>;
    onSaveImage: (image: ArchiveImage) => ArchiveImage | Promise<ArchiveImage>;
    lineage?: Pick<LineageStore, 'getByArchiveImageId' | 'save'>;
    session?: Pick<GenerateSessionStore, 'loadCurrentResult' | 'saveCurrentResult' | 'clearCurrentResult' | 'consumeTransferredReferences' | 'loadLineageSource' | 'saveLineageSource' | 'clearLineageSource'>;
    workflow?: Pick<ImageWorkflow, 'generate'>;
    createAutopilot?: typeof createAutopilotSession;
}

const VALID_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);

export function useGenerateController({
    apiKey,
    draft,
    setDraft,
    referenceImages,
    replaceReferences,
    serializeReferences,
    onSaveImage,
    lineage = lineageStore,
    session = generateSessionStore,
    workflow = imageWorkflow,
    createAutopilot = createAutopilotSession,
}: UseGenerateControllerOptions) {
    const [currentResult, setCurrentResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autopilot, setAutopilot] = useState<AutopilotProgressState>({
        running: false,
        iterations: [],
        status: 'idle',
        bestIterationNumber: null,
        lastErrorIteration: null,
    });
    const autopilotSessionRef = useRef<AutopilotSession | null>(null);

    const updateDraft = useCallback((patch: Partial<GenerateDraft>) => {
        setDraft((currentDraft) => ({ ...currentDraft, ...patch }));
    }, [setDraft]);

    useEffect(() => {
        session.loadCurrentResult().then((value) => {
            if (value) {
                setCurrentResult(value);
            }
        });

        session.consumeTransferredReferences().then((references) => {
            if (references.length > 0) {
                replaceReferences(references);
            }
        });
    }, [replaceReferences, session]);

    useEffect(() => {
        if (!VALID_SIZES.has(draft.aspectRatio)) {
            setDraft((currentDraft) => ({ ...currentDraft, aspectRatio: '1024x1024' }));
        }
    }, [draft.aspectRatio, setDraft]);

    const generate = useCallback(async () => {
        if (!apiKey) {
            setError('Please set your OpenAI API Key in Settings first.');
            return;
        }

        if (!draft.prompt.trim()) {
            return;
        }

        setLoading(true);
        setError(null);
        setAutopilot((current) => ({
            ...current,
            running: false,
        }));

        try {
            const imageUrl = await workflow.generate({
                apiKey,
                prompt: draft.prompt,
                quality: draft.quality,
                aspectRatio: draft.aspectRatio,
                background: draft.background,
                style: draft.style,
                lighting: draft.lighting,
                palette: draft.palette,
                referenceImages,
            });

            setCurrentResult(imageUrl);
            updateDraft({ isSaved: false });
            await session.saveCurrentResult(imageUrl);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate image');
        } finally {
            setLoading(false);
        }
    }, [apiKey, draft, referenceImages, session, updateDraft, workflow]);

    const runAutopilot = useCallback(async (input: { goal: string; maxIterations?: number; satisfactionThreshold?: number }) => {
        if (!apiKey) {
            setError('Please set your OpenAI API Key in Settings first.');
            return null;
        }

        if (!draft.prompt.trim() || !input.goal.trim()) {
            return null;
        }

        setLoading(true);
        setError(null);
        setAutopilot({
            running: true,
            iterations: [],
            status: 'running',
            bestIterationNumber: null,
            lastErrorIteration: null,
        });

        try {
            const outcome = await runGenerateAutopilot({
                goal: input.goal,
                apiKey,
                draft,
                referenceImages,
                sessionStore: session,
                lineageStore: lineage,
                workflow,
                createSession: createAutopilot,
                onSessionCreated: (sessionInstance) => {
                    autopilotSessionRef.current = sessionInstance;
                },
                maxIterations: input.maxIterations,
                satisfactionThreshold: input.satisfactionThreshold,
                onIterationComplete: (iteration) => {
                    setAutopilot((current) => {
                        const iterations = [...current.iterations, iteration];
                        const bestIteration = iterations.reduce<typeof iteration | null>((best, candidate) => {
                            if (!best || candidate.score > best.score) {
                                return candidate;
                            }

                            if (candidate.score === best.score && candidate.iterationNumber < best.iterationNumber) {
                                return candidate;
                            }

                            return best;
                        }, null);

                        return {
                            ...current,
                            iterations,
                            bestIterationNumber: bestIteration?.iterationNumber ?? null,
                        };
                    });
                    setCurrentResult(iteration.imageDataUrl);
                },
                onError: (error, iterationNumber) => {
                    setError(error.message);
                    setAutopilot((current) => ({
                        ...current,
                        lastErrorIteration: iterationNumber,
                    }));
                },
            });

            if (outcome.result.bestIteration) {
                setCurrentResult(outcome.result.bestIteration.imageDataUrl);
                updateDraft({
                    prompt: outcome.result.bestIteration.prompt,
                    isSaved: false,
                });
            }

            if (outcome.result.status === 'failed' && outcome.result.error) {
                setError(outcome.result.error.message);
            }

            setAutopilot((current) => ({
                ...current,
                running: false,
                status: outcome.result.status,
                bestIterationNumber: outcome.result.bestIteration?.iterationNumber ?? current.bestIterationNumber,
            }));

            return outcome.result;
        } finally {
            autopilotSessionRef.current = null;
            setLoading(false);
        }
    }, [apiKey, createAutopilot, draft, lineage, referenceImages, session, updateDraft, workflow]);

    const cancelAutopilot = useCallback(() => {
        autopilotSessionRef.current?.cancel();
    }, []);

    const save = useCallback(async () => {
        if (!currentResult || draft.isSaved) {
            return;
        }

        try {
            const references = await serializeReferences();
            const { width, height } = getImageDimensions(draft.aspectRatio);
            await saveGeneratedImage({
                id: crypto.randomUUID(),
                url: currentResult,
                prompt: draft.prompt,
                model: 'gpt-image-1.5',
                timestamp: new Date().toISOString(),
                width,
                height,
                quality: draft.quality,
                aspectRatio: draft.aspectRatio,
                background: draft.background,
                style: draft.style,
                lighting: draft.lighting,
                palette: draft.palette,
                references,
            }, {
                saveImage: async (image) => Promise.resolve(onSaveImage(image)),
                lineageStore: lineage,
                sessionStore: session,
            });
            updateDraft({ isSaved: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save image');
        }
    }, [currentResult, draft, lineage, onSaveImage, serializeReferences, session, updateDraft]);

    const download = useCallback(() => {
        if (!currentResult) {
            return;
        }

        downloadGeneratedImage(currentResult);
    }, [currentResult]);

    const clear = useCallback(async () => {
        setCurrentResult(null);
        await session.clearCurrentResult();
    }, [session]);

    return {
        currentResult,
        loading,
        error,
        autopilot,
        updateDraft,
        generate,
        runAutopilot,
        cancelAutopilot,
        save,
        download,
        clear,
    };
}

function getImageDimensions(aspectRatio: string) {
    if (aspectRatio === 'auto') {
        return { width: 1024, height: 1024 };
    }

    const [width, height] = aspectRatio.split('x').map(Number);

    if (!width || !height) {
        return { width: 1024, height: 1024 };
    }

    return { width, height };
}
