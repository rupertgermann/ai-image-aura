import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ArchiveImage } from '../db/types';
import { downloadGeneratedImage } from '../download/download';
import { generateSessionStore, getActiveGenerateArchiveFields, getActiveGenerateControls, type GenerateDraft, type GenerateSessionStore } from './GenerateSession';
import { imageWorkflow, type ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { lineageStore, type LineageStore } from '../lineage/LineageStore';
import { saveGeneratedImage } from './saveGeneratedImage';
import { runGenerateAutopilot } from './runGenerateAutopilot';
import { createAutopilotSession, type AutopilotSession } from '../autopilot/AutopilotSession';
import { promptRefiner } from '../autopilot/PromptRefiner';
import { satisfactionEvaluator } from '../autopilot/SatisfactionEvaluator';

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
    reasoningApiKey?: string | null;
    reasoningModel?: string;
    draft: GenerateDraft;
    setDraft: Dispatch<SetStateAction<GenerateDraft>>;
    referenceImages: File[];
    replaceReferences: (dataUrls: string[]) => void;
    serializeReferences: () => Promise<string[]>;
    onSaveImage: (image: ArchiveImage) => ArchiveImage | Promise<ArchiveImage>;
    lineage?: Pick<LineageStore, 'getByArchiveImageId' | 'save'>;
    session?: Pick<GenerateSessionStore, 'loadCurrentResult' | 'loadCurrentResultReferences' | 'saveCurrentResult' | 'clearCurrentResult' | 'consumeTransferredReferences' | 'loadLineageSource' | 'saveLineageSource' | 'clearLineageSource'>;
    workflow?: Pick<ImageWorkflow, 'generate' | 'serializeReferences'>;
    createAutopilot?: typeof createAutopilotSession;
    evaluate?: typeof satisfactionEvaluator.evaluate;
    refine?: typeof promptRefiner.refine;
}

interface BuildGeneratedArchiveImageInput {
    id: string;
    url: string;
    timestamp: string;
    draft: GenerateDraft;
    references: string[];
}

interface SnapshotGeneratedReferenceImagesInput {
    referenceImages: File[];
    serializeReferenceFiles: (files: File[]) => Promise<string[]>;
}

interface BuildGeneratedArchiveImageForSaveInput {
    id: string;
    url: string;
    timestamp: string;
    draft: GenerateDraft;
    usedReferences: string[] | null;
    serializeReferences: () => Promise<string[]>;
}

export function buildGeneratedArchiveImage({
    id,
    url,
    timestamp,
    draft,
    references,
}: BuildGeneratedArchiveImageInput): ArchiveImage {
    const archiveFields = getActiveGenerateArchiveFields(draft);

    return {
        id,
        url,
        prompt: draft.prompt,
        model: draft.model,
        timestamp,
        width: archiveFields.width,
        height: archiveFields.height,
        quality: archiveFields.quality,
        aspectRatio: archiveFields.aspectRatio,
        background: archiveFields.background,
        style: draft.style,
        lighting: draft.lighting,
        palette: draft.palette,
        references,
    };
}

export function snapshotGeneratedReferenceImages({
    referenceImages,
    serializeReferenceFiles,
}: SnapshotGeneratedReferenceImagesInput): Promise<string[]> {
    return serializeReferenceFiles(referenceImages.slice());
}

export async function buildGeneratedArchiveImageForSave({
    id,
    url,
    timestamp,
    draft,
    usedReferences,
    serializeReferences,
}: BuildGeneratedArchiveImageForSaveInput): Promise<ArchiveImage> {
    const references = usedReferences ?? await serializeReferences();

    return buildGeneratedArchiveImage({
        id,
        url,
        timestamp,
        draft,
        references,
    });
}

export function useGenerateController({
    apiKey,
    reasoningApiKey,
    reasoningModel,
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
    evaluate,
    refine,
}: UseGenerateControllerOptions) {
    const [currentResult, setCurrentResult] = useState<string | null>(null);
    const [currentResultReferences, setCurrentResultReferences] = useState<string[] | null>(null);
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
        Promise.all([
            session.loadCurrentResult(),
            session.loadCurrentResultReferences(),
        ]).then(([value, references]) => {
            if (value) {
                setCurrentResult(value);
                setCurrentResultReferences(references);
            }
        });

        session.consumeTransferredReferences().then((references) => {
            if (references.length > 0) {
                replaceReferences(references);
            }
        });
    }, [replaceReferences, session]);

    const generate = useCallback(async () => {
        if (!apiKey) {
            setError('Please set the selected image model API key in Settings first.');
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
            const controls = getActiveGenerateControls(draft);
            const usedReferenceImages = referenceImages.slice();
            const usedReferences = await snapshotGeneratedReferenceImages({
                referenceImages: usedReferenceImages,
                serializeReferenceFiles: workflow.serializeReferences,
            });
            const imageUrl = await workflow.generate({
                apiKey,
                model: draft.model,
                prompt: draft.prompt,
                quality: controls.quality,
                aspectRatio: controls.aspectRatio,
                background: controls.background,
                imageSize: controls.imageSize,
                style: draft.style,
                lighting: draft.lighting,
                palette: draft.palette,
                referenceImages: usedReferenceImages,
            });

            setCurrentResult(imageUrl);
            setCurrentResultReferences(usedReferences);
            updateDraft({ isSaved: false });
            await session.saveCurrentResult(imageUrl, usedReferences);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate image');
        } finally {
            setLoading(false);
        }
    }, [apiKey, draft, referenceImages, session, updateDraft, workflow]);

    const runAutopilot = useCallback(async (input: { goal: string; maxIterations?: number; satisfactionThreshold?: number }) => {
        if (!apiKey) {
            setError('Please set the selected image model API key in Settings first.');
            return null;
        }

        if (!reasoningApiKey) {
            setError('Please set the selected reasoning model API key in Settings first.');
            return null;
        }

        if (!draft.prompt.trim() || !input.goal.trim()) {
            return null;
        }

        setLoading(true);
        setError(null);
        setCurrentResultReferences(null);
        setAutopilot({
            running: true,
            iterations: [],
            status: 'running',
            bestIterationNumber: null,
            lastErrorIteration: null,
        });

        try {
            const usedReferenceImages = referenceImages.slice();
            const outcome = await runGenerateAutopilot({
                goal: input.goal,
                apiKey,
                reasoningApiKey,
                reasoningModel,
                draft,
                referenceImages: usedReferenceImages,
                sessionStore: session,
                lineageStore: lineage,
                workflow,
                createSession: createAutopilot,
                evaluate,
                refine,
                onSessionCreated: (sessionInstance) => {
                    autopilotSessionRef.current = sessionInstance;
                },
                maxIterations: input.maxIterations,
                satisfactionThreshold: input.satisfactionThreshold,
                onIterationComplete: (iteration, runningBest) => {
                    setAutopilot((current) => ({
                        ...current,
                        iterations: [...current.iterations, iteration],
                        bestIterationNumber: runningBest.iterationNumber,
                    }));
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
                const usedReferences = await snapshotGeneratedReferenceImages({
                    referenceImages: usedReferenceImages,
                    serializeReferenceFiles: workflow.serializeReferences,
                });
                setCurrentResult(outcome.result.bestIteration.imageDataUrl);
                setCurrentResultReferences(usedReferences);
                updateDraft({
                    prompt: outcome.result.bestIteration.prompt,
                    isSaved: false,
                });
                await session.saveCurrentResult(outcome.result.bestIteration.imageDataUrl, usedReferences);
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
    }, [apiKey, createAutopilot, draft, evaluate, lineage, reasoningApiKey, reasoningModel, referenceImages, refine, session, updateDraft, workflow]);

    const cancelAutopilot = useCallback(() => {
        autopilotSessionRef.current?.cancel();
    }, []);

    const save = useCallback(async () => {
        if (!currentResult || draft.isSaved) {
            return;
        }

        try {
            const image = await buildGeneratedArchiveImageForSave({
                id: crypto.randomUUID(),
                url: currentResult,
                timestamp: new Date().toISOString(),
                draft,
                usedReferences: currentResultReferences,
                serializeReferences,
            });
            await saveGeneratedImage(image, {
                saveImage: async (image) => Promise.resolve(onSaveImage(image)),
                lineageStore: lineage,
                sessionStore: session,
            });
            updateDraft({ isSaved: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save image');
        }
    }, [currentResult, currentResultReferences, draft, lineage, onSaveImage, serializeReferences, session, updateDraft]);

    const download = useCallback(() => {
        if (!currentResult) {
            return;
        }

        downloadGeneratedImage(currentResult);
    }, [currentResult]);

    const clear = useCallback(async () => {
        setCurrentResult(null);
        setCurrentResultReferences(null);
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
