import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ArchiveImage } from '../db/types';
import { downloadGeneratedImage } from '../download/download';
import { generateSessionStore, getActiveGenerateArchiveFields, getActiveGenerateControls, type GenerateDraft, type GenerateLineageSource, type GenerateSessionStore } from './GenerateSession';
import { getFirstSuccessfulGeneratedImage, imageWorkflow, type GenerateBatchResult, type ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { lineageStore, type LineageStore } from '../lineage/LineageStore';
import { saveGeneratedImage } from './saveGeneratedImage';
import { runGenerateAutopilot } from './runGenerateAutopilot';
import { createAutopilotSession, type AutopilotSession, type AutopilotSessionResult } from '../autopilot/AutopilotSession';
import { promptRefiner } from '../autopilot/PromptRefiner';
import { satisfactionEvaluator } from '../autopilot/SatisfactionEvaluator';
import {
    browserCompletionNotificationPort,
    type CompletionNotificationPayload,
    type CompletionNotificationPort,
} from '../app/CompletionNotificationPort';
import { resolveImageModelConfig } from '../utils/openaiModels';

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

export type GenerateResultSlot =
    | {
        slotIndex: number;
        status: 'success';
        imageUrl: string;
        isSaved: boolean;
        archiveImageId?: string;
    }
    | {
        slotIndex: number;
        status: 'failed';
        error: string;
    };

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
    completionNotificationsEnabled?: boolean;
    completionNotificationPort?: Pick<CompletionNotificationPort, 'showCompletion'>;
    isDocumentHidden?: () => boolean;
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

export function notifyGenerateCompletion({
    enabled,
    documentHidden,
    notificationPort,
    title,
    body,
}: CompletionNotificationPayload & {
    enabled: boolean;
    documentHidden: boolean;
    notificationPort: Pick<CompletionNotificationPort, 'showCompletion'>;
}) {
    if (!enabled || !documentHidden) {
        return;
    }

    notificationPort.showCompletion({ title, body });
}

function createAutopilotCompletionNotification(result: AutopilotSessionResult): CompletionNotificationPayload {
    if (result.status === 'failed') {
        return {
            title: 'Autopilot failed',
            body: result.error?.message ?? 'The Autopilot run stopped before finishing.',
        };
    }

    if (result.status === 'cancelled') {
        return {
            title: 'Autopilot stopped',
            body: 'Showing the best result so far.',
        };
    }

    if (result.status === 'max-iterations') {
        return {
            title: 'Autopilot complete',
            body: 'The run reached the iteration limit.',
        };
    }

    return {
        title: 'Autopilot complete',
        body: result.bestIteration
            ? `Best result selected from iteration ${result.bestIteration.iterationNumber}.`
            : 'Your Autopilot run is complete.',
    };
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
    completionNotificationsEnabled = false,
    completionNotificationPort = browserCompletionNotificationPort,
    isDocumentHidden = () => typeof document !== 'undefined' && document.hidden,
}: UseGenerateControllerOptions) {
    const [currentResult, setCurrentResult] = useState<string | null>(null);
    const [currentBatchResults, setCurrentBatchResults] = useState<GenerateResultSlot[]>([]);
    const [currentResultReferences, setCurrentResultReferences] = useState<string[] | null>(null);
    const [currentRunDraft, setCurrentRunDraft] = useState<GenerateDraft | null>(null);
    const [currentRunLineageSource, setCurrentRunLineageSource] = useState<GenerateLineageSource | null>(null);
    const [currentPartialResult, setCurrentPartialResult] = useState<string | null>(null);
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
    const partialRunIdRef = useRef(0);

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
                setCurrentBatchResults([{
                    slotIndex: 0,
                    status: 'success',
                    imageUrl: value,
                    isSaved: false,
                }]);
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
        const partialRunId = partialRunIdRef.current + 1;
        partialRunIdRef.current = partialRunId;
        setCurrentPartialResult(null);
        setAutopilot((current) => ({
            ...current,
            running: false,
        }));

        let completionNotification: CompletionNotificationPayload | null = null;

        try {
            const controls = getActiveGenerateControls(draft);
            const usedReferenceImages = referenceImages.slice();
            const runDraft = cloneGenerateDraft(draft);
            const runLineageSource = session.loadLineageSource();
            const onPartialImage = shouldStreamGeneratePartials(draft)
                ? (imageUrl: string) => {
                    if (partialRunIdRef.current === partialRunId) {
                        setCurrentPartialResult(imageUrl);
                    }
                }
                : undefined;
            const usedReferences = await snapshotGeneratedReferenceImages({
                referenceImages: usedReferenceImages,
                serializeReferenceFiles: workflow.serializeReferences,
            });
            const results = await workflow.generate({
                apiKey,
                model: draft.model,
                prompt: draft.prompt,
                quality: controls.quality,
                aspectRatio: controls.aspectRatio,
                background: controls.background,
                batchSize: controls.batchSize,
                imageSize: controls.imageSize,
                style: draft.style,
                lighting: draft.lighting,
                palette: draft.palette,
                referenceImages: usedReferenceImages,
                onPartialImage,
            });
            const imageUrl = getFirstSuccessfulGeneratedImage(results);
            const batchResults = buildGenerateResultSlots(results);

            setCurrentBatchResults(batchResults);
            setCurrentRunDraft(runDraft);
            setCurrentRunLineageSource(runLineageSource);
            setCurrentResultReferences(usedReferences);
            setCurrentPartialResult(null);

            if (!imageUrl) {
                setCurrentResult(null);
                updateDraft({ isSaved: false });
                setError('Generation failed for every batch result.');
                await session.clearCurrentResult();
                completionNotification = {
                    title: 'Generation failed',
                    body: 'Every batch result failed.',
                };
                return;
            }

            setCurrentResult(imageUrl);
            updateDraft({ isSaved: false });
            await session.saveCurrentResult(imageUrl, usedReferences);
            completionNotification = {
                title: 'Generation complete',
                body: 'Your image is ready in AURA.',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to generate image';
            setCurrentPartialResult(null);
            setError(message);
            completionNotification = {
                title: 'Generation failed',
                body: message,
            };
        } finally {
            if (completionNotification) {
                notifyGenerateCompletion({
                    enabled: completionNotificationsEnabled,
                    documentHidden: isDocumentHidden(),
                    notificationPort: completionNotificationPort,
                    ...completionNotification,
                });
            }
            setLoading(false);
        }
    }, [apiKey, completionNotificationPort, completionNotificationsEnabled, draft, isDocumentHidden, referenceImages, session, updateDraft, workflow]);

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
        setCurrentPartialResult(null);
        setCurrentResultReferences(null);
        setCurrentBatchResults([]);
        setCurrentRunDraft(null);
        setCurrentRunLineageSource(session.loadLineageSource());
        setAutopilot({
            running: true,
            iterations: [],
            status: 'running',
            bestIterationNumber: null,
            lastErrorIteration: null,
        });

        let completionNotification: CompletionNotificationPayload | null = null;

        try {
            const runReferenceImages = referenceImages.slice();
            const outcome = await runGenerateAutopilot({
                goal: input.goal,
                apiKey,
                reasoningApiKey,
                reasoningModel,
                draft,
                referenceImages: runReferenceImages,
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
                    setCurrentBatchResults([{
                        slotIndex: 0,
                        status: 'success',
                        imageUrl: iteration.imageDataUrl,
                        isSaved: false,
                        archiveImageId: iteration.archiveImageId,
                    }]);
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
                const usedReferences = outcome.usedReferences ?? await snapshotGeneratedReferenceImages({
                    referenceImages: outcome.usedReferenceImages,
                    serializeReferenceFiles: workflow.serializeReferences,
                });
                setCurrentResult(outcome.result.bestIteration.imageDataUrl);
                setCurrentBatchResults([{
                    slotIndex: 0,
                    status: 'success',
                    imageUrl: outcome.result.bestIteration.imageDataUrl,
                    isSaved: false,
                    archiveImageId: outcome.result.bestIteration.archiveImageId,
                }]);
                setCurrentResultReferences(usedReferences);
                setCurrentRunDraft(null);
                setCurrentRunLineageSource({
                    archiveImageId: outcome.result.bestIteration.archiveImageId,
                    stepId: outcome.result.bestIteration.stepId,
                });
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

            completionNotification = createAutopilotCompletionNotification(outcome.result);

            return outcome.result;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Autopilot failed';
            setError(message);
            setAutopilot((current) => ({
                ...current,
                running: false,
                status: 'failed',
            }));
            completionNotification = {
                title: 'Autopilot failed',
                body: message,
            };
            return null;
        } finally {
            if (completionNotification) {
                notifyGenerateCompletion({
                    enabled: completionNotificationsEnabled,
                    documentHidden: isDocumentHidden(),
                    notificationPort: completionNotificationPort,
                    ...completionNotification,
                });
            }
            autopilotSessionRef.current = null;
            setLoading(false);
        }
    }, [apiKey, completionNotificationPort, completionNotificationsEnabled, createAutopilot, draft, evaluate, isDocumentHidden, lineage, reasoningApiKey, reasoningModel, referenceImages, refine, session, updateDraft, workflow]);

    const cancelAutopilot = useCallback(() => {
        autopilotSessionRef.current?.cancel();
    }, []);

    const saveResult = useCallback(async (slotIndex: number) => {
        const slot = currentBatchResults.find((result) => result.slotIndex === slotIndex);
        if (!slot || slot.status !== 'success' || slot.isSaved) {
            return;
        }

        try {
            const archiveImageId = crypto.randomUUID();
            const image = await buildGeneratedArchiveImageForSave({
                id: archiveImageId,
                url: slot.imageUrl,
                timestamp: new Date().toISOString(),
                draft: currentRunDraft ?? draft,
                usedReferences: currentResultReferences,
                serializeReferences,
            });
            await saveGeneratedImage(image, {
                saveImage: async (image) => Promise.resolve(onSaveImage(image)),
                lineageStore: lineage,
                sessionStore: session,
                lineageSource: currentRunLineageSource,
            });
            const nextResults = currentBatchResults.map((result) => result.slotIndex === slotIndex && result.status === 'success'
                ? {
                    ...result,
                    isSaved: true,
                    archiveImageId,
                }
                : result);
            setCurrentBatchResults(nextResults);
            updateDraft({ isSaved: areAllSuccessfulResultsSaved(nextResults) });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save image');
        }
    }, [currentBatchResults, currentResultReferences, currentRunDraft, currentRunLineageSource, draft, lineage, onSaveImage, serializeReferences, session, updateDraft]);

    const save = useCallback(async () => {
        await saveResult(0);
    }, [saveResult]);

    const download = useCallback(() => {
        if (!currentResult) {
            return;
        }

        downloadGeneratedImage(currentResult);
    }, [currentResult]);

    const downloadResult = useCallback((slotIndex: number) => {
        const slot = currentBatchResults.find((result) => result.slotIndex === slotIndex);
        if (slot?.status === 'success') {
            downloadGeneratedImage(slot.imageUrl);
        }
    }, [currentBatchResults]);

    const clear = useCallback(async () => {
        setCurrentResult(null);
        setCurrentPartialResult(null);
        setCurrentBatchResults([]);
        setCurrentResultReferences(null);
        setCurrentRunDraft(null);
        setCurrentRunLineageSource(null);
        await session.clearCurrentResult();
    }, [session]);

    return {
        currentResult,
        currentPartialResult,
        currentBatchResults,
        loading,
        error,
        autopilot,
        updateDraft,
        generate,
        runAutopilot,
        cancelAutopilot,
        save,
        saveResult,
        download,
        downloadResult,
        clear,
    };
}

export function shouldStreamGeneratePartials(draft: GenerateDraft) {
    const model = resolveImageModelConfig(draft.model);
    const controls = getActiveGenerateControls(draft);

    return model.capabilities.partialImageStreaming && controls.batchSize === 1;
}

export function buildGenerateResultSlots(results: GenerateBatchResult[]): GenerateResultSlot[] {
    return results.map((result) => result.status === 'success'
        ? {
            slotIndex: result.slotIndex,
            status: 'success',
            imageUrl: result.imageUrl,
            isSaved: false,
        }
        : result);
}

function areAllSuccessfulResultsSaved(results: GenerateResultSlot[]) {
    const successfulResults = results.filter((result): result is Extract<GenerateResultSlot, { status: 'success' }> =>
        result.status === 'success',
    );

    return successfulResults.length > 0 && successfulResults.every((result) => result.isSaved);
}

function cloneGenerateDraft(draft: GenerateDraft): GenerateDraft {
    return {
        ...draft,
        gptImage2: { ...draft.gptImage2 },
        nanoBananaPro: { ...draft.nanoBananaPro },
    };
}
