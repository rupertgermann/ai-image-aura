import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ActualImageParameters, ApiCostLedger, ArchiveImage } from '../db/types';
import { downloadGeneratedImage } from '../download/download';
import {
    generateSessionStore,
    getActiveGenerateArchiveFields,
    getActiveGenerateModel,
    type GenerateBatchSnapshot,
    type GenerateDraft,
    type GenerateLineageSource,
    type GenerateResultSlot,
    type GenerateRunDraft,
    type GenerateSessionStore,
} from './GenerateSession';
import { imageWorkflow, type GenerateBatchResult, type ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { lineageStore, type LineageStore } from '../lineage/LineageStore';
import type { GenerationSaveRequest } from '../archive/saveArchiveImage';
import { runGenerateAutopilot } from './runGenerateAutopilot';
import { buildImageModelGenerateReferenceRunPlan } from '../image-models/ImageModelControls';
import { createAutopilotSession, translateAutopilotGoal, type AutopilotIteration, type AutopilotSession, type AutopilotSessionResult } from '../autopilot/AutopilotSession';
import {
    browserCompletionNotificationPort,
    type CompletionNotificationPayload,
    type CompletionNotificationPort,
} from '../app/CompletionNotificationPort';
import { dataURLtoFile } from '../utils/file';
import { getProviderLabel, LOCAL_PROVIDER, resolveImageModelConfig, type Provider, type ReasoningModelSlug } from '../utils/openaiModels';

export type { GenerateResultSlot };

interface AutopilotPreview {
    previousImageUrl: string | null;
    lineageSource: GenerateLineageSource | null;
    iterations: AutopilotIteration[];
    bestIterationNumber: number | null;
}

interface AutopilotResultSummary {
    status: AutopilotSessionResult['status'];
    bestIterationNumber: number | null;
    lastErrorIteration: number | null;
}

interface DisplayedBatch {
    snapshot: GenerateBatchSnapshot;
    autopilotSummary: AutopilotResultSummary | null;
}

interface UseGenerateControllerOptions {
    imageCredential: string | null;
    getProviderCredential: (provider: Provider) => string | null;
    reasoningModel?: ReasoningModelSlug;
    draft: GenerateDraft;
    setDraft: Dispatch<SetStateAction<GenerateDraft>>;
    referenceImages: File[];
    replaceReferences: (dataUrls: string[]) => void;
    serializeReferences: () => Promise<string[]>;
    onSaveImage: (request: GenerationSaveRequest) => ArchiveImage | Promise<ArchiveImage>;
    lineage?: Pick<LineageStore, 'getByArchiveImageId' | 'save'>;
    session?: Pick<GenerateSessionStore, 'loadCurrentBatch' | 'saveCurrentBatch' | 'clearCurrentResult' | 'consumeTransferredReferences' | 'loadLineageSource' | 'saveLineageSource' | 'clearLineageSource'>;
    workflow?: Pick<ImageWorkflow, 'generate' | 'serializeReferences'>;
    createAutopilot?: typeof createAutopilotSession;
    completionNotificationsEnabled?: boolean;
    completionNotificationPort?: Pick<CompletionNotificationPort, 'showCompletion'>;
    isDocumentHidden?: () => boolean;
}

interface GenerateSessionRestoration {
    session: NonNullable<UseGenerateControllerOptions['session']>;
    batch: Promise<GenerateBatchSnapshot | null> | null;
    references: Promise<string[]> | null;
}

interface BuildGeneratedArchiveImageInput {
    id: string;
    url: string;
    timestamp: string;
    draft: GenerateRunDraft;
    references: string[];
    actualParameters?: ActualImageParameters;
    costLedger?: ApiCostLedger;
}

interface SaveGenerateResultSlotsInput {
    results: GenerateResultSlot[];
    slotIndexes?: number[];
    draft: GenerateDraft;
    runDraft: GenerateRunDraft | null;
    usedReferences: string[] | null;
    runLineageSource: GenerateLineageSource | null;
    serializeReferences: () => Promise<string[]>;
    saveImage: (request: GenerationSaveRequest) => ArchiveImage | Promise<ArchiveImage>;
    onSaved?: (results: GenerateResultSlot[]) => void | Promise<void>;
    createArchiveImageId?: () => string;
    now?: () => Date;
}

interface AddGeneratedResultAsReferenceInput {
    slot: GenerateResultSlot;
    lineageSource?: GenerateLineageSource | null;
    addReferenceFiles: (files: File[]) => void;
    session: Pick<GenerateSessionStore, 'saveLineageSource' | 'clearLineageSource'>;
}

interface AddGeneratedResultAsReferenceActionInput extends AddGeneratedResultAsReferenceInput {
    capacityMessage: string | null;
    setNotice: (message: string | null) => void;
}

function buildGeneratedArchiveImage({
    id,
    url,
    timestamp,
    draft,
    references,
    actualParameters,
    costLedger,
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
        actualParameters,
        costLedger,
        references,
    };
}

export async function saveGenerateResultSlots({
    results,
    slotIndexes,
    draft,
    runDraft,
    usedReferences,
    runLineageSource,
    serializeReferences,
    saveImage,
    onSaved,
    createArchiveImageId = () => crypto.randomUUID(),
    now = () => new Date(),
}: SaveGenerateResultSlotsInput): Promise<GenerateResultSlot[]> {
    const selectedSlotIndexes = new Set(slotIndexes);
    const shouldSaveSlot = (slot: GenerateResultSlot): slot is Extract<GenerateResultSlot, { status: 'success' }> => (
        slot.status === 'success' &&
        !slot.isSaved &&
        (!slotIndexes || selectedSlotIndexes.has(slot.slotIndex))
    );
    let nextResults = results;

    for (const slot of results.filter(shouldSaveSlot)) {
        const archiveImageId = createArchiveImageId();
        const image = buildGeneratedArchiveImage({
            id: archiveImageId,
            url: slot.imageUrl,
            timestamp: now().toISOString(),
            draft: runDraft ?? draft,
            references: usedReferences ?? await serializeReferences(),
            actualParameters: slot.actualParameters,
            costLedger: slot.costLedger,
        });
        const savedImage = await saveImage({
            kind: 'generation',
            image,
            source: runLineageSource,
            runDraft: runDraft ?? draft,
        });
        nextResults = markGenerateResultSlotSaved(nextResults, slot.slotIndex, savedImage.id);
        await onSaved?.(nextResults);
    }

    return nextResults;
}

export function addGeneratedResultAsReference({
    slot,
    lineageSource,
    addReferenceFiles,
    session,
}: AddGeneratedResultAsReferenceInput) {
    if (slot.status !== 'success') {
        return false;
    }

    addReferenceFiles([
        dataURLtoFile(slot.imageUrl, `generated-result-${slot.slotIndex + 1}.png`),
    ]);

    if (slot.archiveImageId) {
        session.saveLineageSource({ archiveImageId: slot.archiveImageId });
    } else if (lineageSource) {
        session.saveLineageSource(lineageSource);
    } else {
        session.clearLineageSource();
    }

    return true;
}

export function addGeneratedResultAsReferenceFromAction({
    capacityMessage,
    setNotice,
    ...input
}: AddGeneratedResultAsReferenceActionInput) {
    if (capacityMessage) {
        setNotice(capacityMessage);
        return false;
    }

    try {
        const added = addGeneratedResultAsReference(input);
        if (added) {
            setNotice(null);
        }
        return added;
    } catch (referenceError) {
        setNotice(referenceError instanceof Error ? referenceError.message : 'Failed to use result as reference.');
        return false;
    }
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
    imageCredential,
    getProviderCredential,
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
    completionNotificationsEnabled = false,
    completionNotificationPort = browserCompletionNotificationPort,
    isDocumentHidden = () => typeof document !== 'undefined' && document.hidden,
}: UseGenerateControllerOptions) {
    const [displayedBatch, setDisplayedBatch] = useState<DisplayedBatch | null>(null);
    const [autopilotPreview, setAutopilotPreview] = useState<AutopilotPreview | null>(null);
    const [currentPartialResult, setCurrentPartialResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [translatingGoal, setTranslatingGoal] = useState(false);
    const [goalTranslationCostContext, setGoalTranslationCostContext] = useState<{
        goal: string;
        prompt: string;
        ledger: ApiCostLedger;
    } | null>(null);
    const runningRef = useRef(false);
    const savingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const autopilotSessionRef = useRef<AutopilotSession | null>(null);
    const autopilotCancelRequested = useRef(false);
    const partialRunIdRef = useRef(0);
    const restorationRef = useRef<GenerateSessionRestoration | null>(null);

    const latestIteration = autopilotPreview?.iterations.at(-1);
    const batch = displayedBatch?.snapshot ?? null;
    const currentBatch = useMemo<GenerateBatchSnapshot | null>(() => autopilotPreview ? {
        results: latestIteration ? [buildAutopilotResultSlot(latestIteration)] : [],
        references: null,
        draft: null,
        lineageSource: autopilotPreview.lineageSource,
    } : batch, [autopilotPreview, batch, latestIteration]);
    const currentBatchResults = currentBatch?.results ?? [];
    const currentRunDraft = currentBatch?.draft ?? null;
    const currentResult = autopilotPreview
        ? latestIteration?.imageDataUrl ?? autopilotPreview.previousImageUrl
        : getFirstSuccessfulResultSlot(currentBatchResults)?.imageUrl ?? null;

    const adoptBatch = useCallback(async (next: DisplayedBatch, persistedDraft = next.snapshot.draft) => {
        if (restorationRef.current?.session === session) restorationRef.current.batch = null;
        setDisplayedBatch(next);
        setAutopilotPreview(null);
        await session.saveCurrentBatch({ ...next.snapshot, draft: persistedDraft });
    }, [session]);

    const updateDraft = useCallback((patch: Partial<GenerateDraft>) => {
        setDraft((currentDraft) => ({ ...currentDraft, ...patch }));
    }, [setDraft]);

    useEffect(() => {
        // StrictMode reattaches the observer, but transferred references can only be consumed once.
        if (restorationRef.current?.session !== session) {
            restorationRef.current = {
                session,
                batch: session.loadCurrentBatch(),
                references: session.consumeTransferredReferences(),
            };
        }
        const restoration = restorationRef.current;
        let active = true;

        void restoration.batch?.then((batch) => {
            if (active && restoration.batch && batch) {
                setDisplayedBatch({ snapshot: batch, autopilotSummary: null });
            }
        }, () => {
            if (active && restoration.batch && !runningRef.current && !savingRef.current) {
                setError('Could not restore the saved generation results.');
            }
        });

        void restoration.references?.then((references) => {
            if (!active) return;
            restoration.references = null;
            if (references.length > 0) {
                replaceReferences(references);
            }
        }, () => {
            if (!active) return;
            restoration.references = null;
            if (!runningRef.current && !savingRef.current) {
                setError('Could not restore transferred reference images.');
            }
        });

        return () => { active = false; };
    }, [replaceReferences, session]);

    const generate = useCallback(async () => {
        if (runningRef.current || savingRef.current) return;
        if (!imageCredential) {
            setError(missingImageCredentialMessage(draft.model));
            return;
        }

        if (!draft.prompt.trim()) {
            return;
        }

        runningRef.current = true;
        setLoading(true);
        setError(null);
        const partialRunId = ++partialRunIdRef.current;
        setCurrentPartialResult(null);
        let completionNotification: CompletionNotificationPayload | null = null;

        try {
            const imageModel = getActiveGenerateModel(draft);
            const usedReferenceImages = buildImageModelGenerateReferenceRunPlan(draft.model, referenceImages).providerReferenceImages.slice();
            const runDraft = cloneGenerateDraft(draft);
            const runLineageSource = session.loadLineageSource();
            const onPartialImage = shouldStreamGeneratePartials(draft)
                ? (imageUrl: string) => {
                    if (partialRunIdRef.current === partialRunId) setCurrentPartialResult(imageUrl);
                }
                : undefined;
            const usedReferences = await workflow.serializeReferences(usedReferenceImages.slice());
            const results = await workflow.generate({
                credential: imageCredential,
                ...imageModel,
                prompt: draft.prompt,
                style: draft.style,
                lighting: draft.lighting,
                palette: draft.palette,
                referenceImages: usedReferenceImages,
                onPartialImage,
            });
            const batchResults = buildGenerateResultSlots(results);
            const successfulResult = getFirstSuccessfulResultSlot(batchResults);
            if (!successfulResult) {
                const restoration = restorationRef.current;
                const previousBatch = currentBatch
                    ?? (restoration?.session === session ? await restoration.batch : null);
                if (getFirstSuccessfulResultSlot(previousBatch?.results ?? [])) {
                    const failure = batchResults.find((result) => result.status === 'failed');
                    throw new Error(failure?.error ?? 'Generation failed for every batch result.');
                }
            }
            const batchSnapshot: GenerateBatchSnapshot = {
                results: batchResults,
                references: usedReferences,
                draft: runDraft,
                lineageSource: runLineageSource,
            };

            if (partialRunIdRef.current === partialRunId) setCurrentPartialResult(null);
            await adoptBatch({ snapshot: batchSnapshot, autopilotSummary: null });

            if (!successfulResult) {
                updateDraft({ isSaved: false });
                setError('Generation failed for every batch result.');
                completionNotification = {
                    title: 'Generation failed',
                    body: 'Every batch result failed.',
                };
                return;
            }

            updateDraft({ isSaved: false });
            completionNotification = {
                title: 'Generation complete',
                body: 'Your image is ready in AURA.',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to generate image';
            if (partialRunIdRef.current === partialRunId) setCurrentPartialResult(null);
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
            runningRef.current = false;
            setLoading(false);
        }
    }, [adoptBatch, imageCredential, completionNotificationPort, completionNotificationsEnabled, currentBatch, draft, isDocumentHidden, referenceImages, session, updateDraft, workflow]);

    const translateGoal = useCallback(async (goal: string) => {
        setTranslatingGoal(true);
        try {
            const translation = await translateAutopilotGoal({ goal, reasoningModel, getProviderCredential });
            updateDraft({ prompt: translation.prompt, isSaved: false });
            setGoalTranslationCostContext(translation.costLedger ? {
                goal,
                prompt: translation.prompt,
                ledger: translation.costLedger,
            } : null);
        } catch (translationError) {
            setGoalTranslationCostContext(null);
            throw translationError;
        } finally {
            setTranslatingGoal(false);
        }
    }, [getProviderCredential, reasoningModel, updateDraft]);

    const runAutopilot = useCallback(async (input: {
        goal: string;
        maxIterations?: number;
        satisfactionThreshold?: number;
    }) => {
        if (runningRef.current || savingRef.current) return null;
        if (!imageCredential) {
            setError(missingImageCredentialMessage(draft.model));
            return null;
        }

        if (!draft.prompt.trim() || !input.goal.trim()) {
            return null;
        }

        autopilotCancelRequested.current = false;
        runningRef.current = true;
        setLoading(true);
        setError(null);
        setCurrentPartialResult(null);
        setAutopilotPreview({
            previousImageUrl: currentResult,
            lineageSource: session.loadLineageSource(),
            iterations: [],
            bestIterationNumber: null,
        });

        let completionNotification: CompletionNotificationPayload | null = null;
        let lastErrorIteration: number | null = null;

        try {
            const initialCostLedger = goalTranslationCostContext
                && goalTranslationCostContext.goal === input.goal
                && goalTranslationCostContext.prompt === draft.prompt
                ? goalTranslationCostContext.ledger
                : undefined;
            const runReferenceImages = referenceImages.slice();
            const outcome = await runGenerateAutopilot({
                goal: input.goal,
                imageCredential,
                getProviderCredential,
                reasoningModel,
                draft,
                referenceImages: runReferenceImages,
                sessionStore: session,
                lineageStore: lineage,
                workflow,
                createSession: createAutopilot,
                initialCostLedger,
                onSessionCreated: (sessionInstance) => {
                    autopilotSessionRef.current = sessionInstance;
                    if (autopilotCancelRequested.current) sessionInstance.cancel();
                },
                maxIterations: input.maxIterations,
                satisfactionThreshold: input.satisfactionThreshold,
                onIterationComplete: (iteration, runningBest) => {
                    setAutopilotPreview((current) => current && ({
                        ...current,
                        iterations: [...current.iterations, iteration],
                        bestIterationNumber: runningBest.iterationNumber,
                    }));
                },
                onError: (error, iterationNumber) => {
                    lastErrorIteration = iterationNumber;
                    setError(error.message);
                },
            });

            if (outcome.batch?.draft) {
                updateDraft({
                    prompt: outcome.batch.draft.prompt,
                    isSaved: false,
                });
                await adoptBatch({
                    snapshot: outcome.batch,
                    autopilotSummary: {
                        status: outcome.result.status,
                        bestIterationNumber: outcome.result.bestIteration?.iterationNumber ?? null,
                        lastErrorIteration,
                    },
                });
                if (outcome.batch.lineageSource) {
                    session.saveLineageSource(outcome.batch.lineageSource);
                }
            }

            if (outcome.result.status === 'failed' && outcome.result.error) {
                setError(outcome.result.error.message);
            }

            completionNotification = createAutopilotCompletionNotification(outcome.result);

            return outcome.result;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Autopilot failed';
            setError(message);
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
            setAutopilotPreview(null);
            autopilotSessionRef.current = null;
            runningRef.current = false;
            setLoading(false);
        }
    }, [adoptBatch, currentResult, imageCredential, completionNotificationPort, completionNotificationsEnabled, createAutopilot, draft, getProviderCredential, goalTranslationCostContext, isDocumentHidden, lineage, reasoningModel, referenceImages, session, updateDraft, workflow]);

    const cancelAutopilot = useCallback(() => {
        autopilotCancelRequested.current = true;
        autopilotSessionRef.current?.cancel();
    }, []);

    const saveResults = useCallback(async (slotIndexes?: number[]) => {
        if (savingRef.current || runningRef.current || !displayedBatch) return;
        const { snapshot } = displayedBatch;
        if (!hasUnsavedSuccessfulResults(snapshot.results)) return;
        savingRef.current = true;
        setSaving(true);
        setError(null);
        try {
            await saveGenerateResultSlots({
                results: snapshot.results,
                slotIndexes,
                draft,
                runDraft: snapshot.draft,
                usedReferences: snapshot.references,
                runLineageSource: snapshot.lineageSource,
                serializeReferences,
                saveImage: onSaveImage,
                onSaved: async (results) => {
                    session.clearLineageSource();
                    updateDraft({ isSaved: areAllSuccessfulResultsSaved(results) });
                    // Legacy results keep unknown run inputs in memory, but persist the draft used to save.
                    await adoptBatch({ ...displayedBatch, snapshot: { ...snapshot, results } }, snapshot.draft ?? draft);
                },
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not save. Your results are still here; try again or download them.');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [adoptBatch, displayedBatch, draft, onSaveImage, serializeReferences, session, updateDraft]);

    const saveResult = (slotIndex: number) => saveResults([slotIndex]);
    const saveAllResults = () => saveResults();
    const save = () => saveResults([0]);

    const download = useCallback(() => {
        if (!currentResult) {
            return;
        }

        downloadGeneratedImage(currentResult);
    }, [currentResult]);

    const downloadResult = useCallback((slotIndex: number) => {
        const slot = currentBatch?.results.find((result) => result.slotIndex === slotIndex);
        if (slot?.status === 'success') {
            downloadGeneratedImage(slot.imageUrl);
        }
    }, [currentBatch]);

    const clear = useCallback(async () => {
        if (runningRef.current || savingRef.current) return;
        if (restorationRef.current?.session === session) restorationRef.current.batch = null;
        setError(null);
        setDisplayedBatch(null);
        setAutopilotPreview(null);
        setCurrentPartialResult(null);
        await session.clearCurrentResult();
    }, [session]);

    return {
        currentResult,
        currentPartialResult,
        currentBatchResults,
        currentRunDraft,
        currentRunLineageSource: currentBatch?.lineageSource ?? null,
        loading,
        saving,
        error,
        autopilotPreview,
        autopilotSummary: autopilotPreview ? null : displayedBatch?.autopilotSummary ?? null,
        translatingGoal,
        translateGoal,
        updateDraft,
        generate,
        runAutopilot,
        cancelAutopilot,
        save,
        saveResult,
        saveAllResults,
        download,
        downloadResult,
        clear,
    };
}

export function shouldStreamGeneratePartials(draft: GenerateDraft) {
    const model = resolveImageModelConfig(draft.model);
    const { controls } = getActiveGenerateModel(draft);

    return model.capabilities.partialImageStreaming && controls.batchSize === 1;
}

export function buildGenerateResultSlots(results: GenerateBatchResult[]): GenerateResultSlot[] {
    return results.map((result) => result.status === 'success'
        ? {
            slotIndex: result.slotIndex,
            status: 'success',
            imageUrl: result.imageUrl,
            isSaved: false,
            actualParameters: result.actualParameters,
            costLedger: result.costLedger,
        }
        : result);
}

function areAllSuccessfulResultsSaved(results: GenerateResultSlot[]) {
    const successfulResults = results.filter((result): result is Extract<GenerateResultSlot, { status: 'success' }> =>
        result.status === 'success',
    );

    return successfulResults.length > 0 && successfulResults.every((result) => result.isSaved);
}

function hasUnsavedSuccessfulResults(results: GenerateResultSlot[]) {
    return results.some((result) => result.status === 'success' && !result.isSaved);
}

function getFirstSuccessfulResultSlot(results: GenerateResultSlot[]) {
    return results.find((result): result is Extract<GenerateResultSlot, { status: 'success' }> =>
        result.status === 'success',
    ) ?? null;
}

function markGenerateResultSlotSaved(
    results: GenerateResultSlot[],
    slotIndex: number,
    archiveImageId: string,
): GenerateResultSlot[] {
    return results.map((result) => result.slotIndex === slotIndex && result.status === 'success'
        ? {
            ...result,
            isSaved: true,
            archiveImageId,
        }
        : result);
}

function buildAutopilotResultSlot(iteration: AutopilotIteration): Extract<GenerateResultSlot, { status: 'success' }> {
    return {
        slotIndex: 0,
        status: 'success',
        imageUrl: iteration.imageDataUrl,
        isSaved: false,
        archiveImageId: iteration.archiveImageId,
        ...(iteration.actualParameters ? { actualParameters: iteration.actualParameters } : {}),
        ...(iteration.costLedger ? { costLedger: iteration.costLedger } : {}),
    };
}

function cloneGenerateDraft(draft: GenerateDraft): GenerateDraft {
    return {
        ...draft,
        gptImage: { ...draft.gptImage },
        nanoBananaPro: { ...draft.nanoBananaPro },
        qwenImage2_1: { ...draft.qwenImage2_1 },
        flux2Klein4b: { ...draft.flux2Klein4b },
    };
}

function missingImageCredentialMessage(model: GenerateDraft['model']): string {
    const provider = resolveImageModelConfig(model).provider;
    return provider === LOCAL_PROVIDER
        ? 'Please set the Local server URL in Settings first.'
        : `Please set the ${getProviderLabel(provider)} API key in Settings first.`;
}
