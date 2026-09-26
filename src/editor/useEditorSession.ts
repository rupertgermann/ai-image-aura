import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { ArchiveImage, ArchiveLayerBlendMode } from '../db/types';
import { loadEditorDraft, saveEditorDraft } from './editorDraftStorage';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';
import { fileToDataURL } from '../utils/file';
import {
    addUploadedLayer,
    createEditorDraft,
    addDraftReferences,
    deleteLayers,
    duplicateLayers,
    getEditableLayerIds,
    hasDurableLayerStack,
    moveLayer,
    nudgeLayers,
    pushHistory,
    reorderLayer,
    repairEditorDraftForImage,
    redoHistory,
    removeDraftReferenceAt,
    undoHistory,
    updateLayer,
    type EditorDraft,
    type LayerHistoryState,
} from './layers';

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_CONTRAST = 100;
const DEFAULT_SATURATION = 100;
const DEFAULT_FILTER = 'none';

export function useEditorSession(image: ArchiveImage | null) {
    const adjustmentGesture = useRef<'idle' | 'start' | 'active'>('idle');
    const sessionKey = image?.id ?? 'default';
    const savedDraft = useMemo(() => image ? createEditorDraft(image) : null, [image]);
    const [history, setHistory] = useState<LayerHistoryState | null>(null);
    const [draftLoading, setDraftLoading] = useState(true);
    const [draftError, setDraftError] = useState<string | null>(null);
    const latestDraft = useRef<EditorDraft | null>(null);
    const restoreDraft = useEffectEvent((persisted: EditorDraft | null) => {
        const next = image && persisted ? repairEditorDraftForImage(persisted, image) : savedDraft;
        latestDraft.current = next;
        setHistory(next ? { past: [], present: next, future: [] } : null);
        setDraftLoading(false);
    });
    useEffect(() => {
        let cancelled = false;
        loadEditorDraft(sessionKey).then((persisted) => {
            if (!cancelled) restoreDraft(persisted);
        }).catch(() => {
            if (!cancelled) {
                setDraftError('Could not restore your draft. Your saved archive image is still available.');
                restoreDraft(null);
            }
        });
        return () => { cancelled = true; };
    }, [sessionKey]);
    const persistDraft = useCallback((next: EditorDraft) => {
        void saveEditorDraft(sessionKey, next).then(() => setDraftError(null)).catch(() => {
            setDraftError('Your draft could not be stored. Save to the archive before leaving this page.');
        });
    }, [sessionKey]);
    const draft = history?.present ?? savedDraft;
    const referenceCollection = useReferenceImageCollection({ initialDataUrls: draft?.references ?? image?.references });
    const replaceReferenceDataUrls = referenceCollection.replaceWithDataUrls;
    const makeId = useCallback(() => crypto.randomUUID(), []);
    const stackChanged = useMemo(() => JSON.stringify(draft?.layerStack) !== JSON.stringify(savedDraft?.layerStack), [draft?.layerStack, savedDraft?.layerStack]);
    const referencesChanged = useMemo(() => JSON.stringify(draft?.references) !== JSON.stringify(savedDraft?.references), [draft?.references, savedDraft?.references]);
    const isDirty = !draftLoading && !!draft && !!savedDraft && (stackChanged || referencesChanged || JSON.stringify(draft.adjustments) !== JSON.stringify(savedDraft.adjustments));

    const commitDraft = useCallback((nextDraft: EditorDraft, recordHistory = true) => {
        if (draftLoading) return;
        latestDraft.current = nextDraft;
        setHistory((current) => {
            if (!current) {
                return { past: [], present: nextDraft, future: [] };
            }

            return recordHistory ? pushHistory(current, nextDraft) : { ...current, present: nextDraft };
        });
        if (adjustmentGesture.current !== 'active') persistDraft(nextDraft);
    }, [draftLoading, persistDraft]);

    const updateAdjustments = useCallback((patch: Partial<EditorDraft['adjustments']>) => {
        if (!draft) {
            return;
        }

        // One undo step per slider drag; keyboard changes remain individual steps.
        const recordHistory = adjustmentGesture.current !== 'active';
        if (adjustmentGesture.current !== 'idle') adjustmentGesture.current = 'active';
        commitDraft({ ...draft, adjustments: { ...draft.adjustments, ...patch } }, recordHistory);
    }, [commitDraft, draft]);

    const resetAdjustments = () => {
        updateAdjustments({
            brightness: DEFAULT_BRIGHTNESS,
            contrast: DEFAULT_CONTRAST,
            saturation: DEFAULT_SATURATION,
            filter: DEFAULT_FILTER,
        });
    };

    const serializeReferences = () => {
        return Promise.resolve(draft?.references ?? []);
    };

    const addLayerFiles = useCallback(async (files: File[]) => {
        if (!draft || files.length === 0) {
            return;
        }

        let nextDraft = draft;
        for (const file of files) {
            const dataUrl = await fileToDataURL(file);
            const imageSize = await readImageSize(dataUrl);
            const result = addUploadedLayer(nextDraft.layerStack, dataUrl, makeId, file.name || 'Uploaded layer', imageSize);
            nextDraft = {
                ...nextDraft,
                layerStack: result.layerStack,
                selectedLayerIds: [result.layerId],
                primarySelectedLayerId: result.layerId,
            };
        }

        commitDraft(nextDraft);
    }, [commitDraft, draft, makeId]);

    const selectLayer = useCallback((layerId: string, additive = false) => {
        if (!draft) {
            return;
        }

        const alreadySelected = draft.selectedLayerIds.includes(layerId);
        const selectedLayerIds = additive
            ? alreadySelected
                ? draft.selectedLayerIds.filter((id) => id !== layerId)
                : [...draft.selectedLayerIds, layerId]
            : [layerId];
        const primarySelectedLayerId = alreadySelected && additive
            ? selectedLayerIds.includes(draft.primarySelectedLayerId ?? '')
                ? draft.primarySelectedLayerId
                : selectedLayerIds.at(-1) ?? null
            : layerId;

        commitDraft({
            ...draft,
            selectedLayerIds,
            primarySelectedLayerId,
        }, false);
    }, [commitDraft, draft]);

    const mutateLayerStack = useCallback((nextLayerStack: EditorDraft['layerStack'], nextSelection?: string[]) => {
        if (!draft) {
            return;
        }

        const selectedLayerIds = nextSelection ?? draft.selectedLayerIds.filter((id) => nextLayerStack.layers.some((layer) => layer.id === id));
        const primarySelectedLayerId = nextSelection
            ? selectedLayerIds[0] ?? null
            : selectedLayerIds.includes(draft.primarySelectedLayerId ?? '')
                ? draft.primarySelectedLayerId
                : selectedLayerIds[0] ?? null;

        commitDraft({
            ...draft,
            layerStack: nextLayerStack,
            selectedLayerIds,
            primarySelectedLayerId,
        });
    }, [commitDraft, draft]);

    const undo = useCallback(() => {
        if (!history) return;
        const next = undoHistory(history);
        latestDraft.current = next.present;
        setHistory(next);
        persistDraft(next.present);
    }, [history, persistDraft]);

    const redo = useCallback(() => {
        if (!history) return;
        const next = redoHistory(history);
        latestDraft.current = next.present;
        setHistory(next);
        persistDraft(next.present);
    }, [history, persistDraft]);

    const revertDraft = useCallback(() => {
        if (!savedDraft) {
            return;
        }

        commitDraft(savedDraft);
    }, [savedDraft, commitDraft]);

    useEffect(() => {
        if (!isDirty) {
            return undefined;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    useEffect(() => {
        replaceReferenceDataUrls(draft?.references ?? []);
    }, [draft?.references, replaceReferenceDataUrls]);

    const addReferenceFiles = useCallback(async (files: File[]) => {
        if (!draft || files.length === 0) {
            return;
        }

        const dataUrls = await Promise.all(files.map((file) => fileToDataURL(file)));
        commitDraft(addDraftReferences(draft, dataUrls));
    }, [commitDraft, draft]);

    const removeReferenceAt = useCallback((index: number) => {
        if (!draft) {
            return;
        }

        commitDraft(removeDraftReferenceAt(draft, index));
    }, [commitDraft, draft]);

    const clearSelection = useCallback(() => {
        if (!draft) {
            return;
        }

        commitDraft({
            ...draft,
            selectedLayerIds: [],
            primarySelectedLayerId: null,
        }, false);
    }, [commitDraft, draft]);

    return {
        beginAdjustment: () => { adjustmentGesture.current = 'start'; },
        endAdjustment: () => {
            if (adjustmentGesture.current === 'active' && latestDraft.current) persistDraft(latestDraft.current);
            adjustmentGesture.current = 'idle';
        },
        draftLoading,
        draftError,
        draft,
        layerStack: draft?.layerStack ?? null,
        selectedLayerIds: draft?.selectedLayerIds ?? [],
        primarySelectedLayerId: draft?.primarySelectedLayerId ?? null,
        brightness: draft?.adjustments.brightness ?? DEFAULT_BRIGHTNESS,
        setBrightness: (value: number) => updateAdjustments({ brightness: value }),
        contrast: draft?.adjustments.contrast ?? DEFAULT_CONTRAST,
        setContrast: (value: number) => updateAdjustments({ contrast: value }),
        saturation: draft?.adjustments.saturation ?? DEFAULT_SATURATION,
        setSaturation: (value: number) => updateAdjustments({ saturation: value }),
        filter: draft?.adjustments.filter ?? DEFAULT_FILTER,
        setFilter: (value: string) => updateAdjustments({ filter: value }),
        adjustments: draft?.adjustments ?? {
            brightness: DEFAULT_BRIGHTNESS,
            contrast: DEFAULT_CONTRAST,
            saturation: DEFAULT_SATURATION,
            filter: DEFAULT_FILTER,
        },
        durableLayerStack: draft && hasDurableLayerStack(draft.layerStack) ? draft.layerStack : null,
        referenceImages: referenceCollection.files,
        referencePreviews: referenceCollection.previews,
        addReferenceFiles,
        removeReferenceAt,
        addLayerFiles,
        selectLayer,
        clearSelection,
        renameLayer: (layerId: string, name: string) => draft && mutateLayerStack(updateLayer(draft.layerStack, layerId, { name })),
        setLayerVisible: (layerId: string, visible: boolean) => draft && mutateLayerStack(updateLayer(draft.layerStack, layerId, { visible })),
        setLayerOpacity: (layerId: string, opacity: number) => draft && mutateLayerStack(updateLayer(draft.layerStack, layerId, { opacity })),
        setLayerLocked: (layerId: string, locked: boolean) => draft && mutateLayerStack(updateLayer(draft.layerStack, layerId, { locked })),
        setLayerBlendMode: (layerId: string, blendMode: ArchiveLayerBlendMode) => draft && mutateLayerStack(updateLayer(draft.layerStack, layerId, { blendMode })),
        reorderLayerTo: (layerId: string, targetIndex: number) => {
            if (!draft) return;
            const nextLayerStack = reorderLayer(draft.layerStack, layerId, targetIndex);
            if (nextLayerStack === draft.layerStack) return;
            mutateLayerStack(nextLayerStack);
        },
        nudgeSelectedLayers: (dx: number, dy: number) => {
            if (!draft) return;
            const nextLayerStack = nudgeLayers(draft.layerStack, draft.selectedLayerIds, dx, dy);
            if (nextLayerStack === draft.layerStack) return;
            mutateLayerStack(nextLayerStack);
        },
        updateLayerTransform: (layerId: string, patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => draft && mutateLayerStack(updateLayer(draft.layerStack, layerId, patch)),
        duplicateSelectedLayers: () => {
            if (!draft) return;
            const editableLayerIds = getEditableLayerIds(draft.layerStack, draft.selectedLayerIds);
            if (!editableLayerIds.length) return;
            const result = duplicateLayers(draft.layerStack, editableLayerIds, makeId);
            mutateLayerStack(result.layerStack, result.duplicatedIds);
        },
        deleteSelectedLayers: () => {
            if (!draft) return;
            const editableLayerIds = getEditableLayerIds(draft.layerStack, draft.selectedLayerIds);
            if (!editableLayerIds.length) return;
            mutateLayerStack(deleteLayers(draft.layerStack, editableLayerIds));
        },
        moveSelectedLayer: (direction: -1 | 1) => {
            if (!draft?.primarySelectedLayerId) return;
            const nextLayerStack = moveLayer(draft.layerStack, draft.primarySelectedLayerId, direction);
            if (nextLayerStack === draft.layerStack) return;
            mutateLayerStack(nextLayerStack);
        },
        commitDraft,
        undo,
        redo,
        canUndo: !!history?.past.length,
        canRedo: !!history?.future.length,
        isDirty,
        revertDraft,
        resetAdjustments,
        serializeReferences,
    };
}

function readImageSize(source: string): Promise<{ width: number; height: number } | undefined> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
        });
        image.onerror = () => resolve(undefined);
        image.src = source;
    });
}
