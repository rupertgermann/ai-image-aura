import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArchiveImage } from '../db/types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';
import { fileToDataURL } from '../utils/file';
import {
    addUploadedLayer,
    createEditorDraft,
    addDraftReferences,
    deleteLayers,
    duplicateLayers,
    hasDurableLayerStack,
    moveLayer,
    pushHistory,
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
    const sessionKey = image?.id ?? 'default';
    const savedDraft = useMemo(() => image ? createEditorDraft(image) : null, [image]);
    const [persistedDraft, setPersistedDraft] = useLocalStorage<EditorDraft | null>(`editor_${sessionKey}_draft`, savedDraft);
    const initialDraft = persistedDraft ?? savedDraft;
    const [history, setHistory] = useState<LayerHistoryState | null>(() => initialDraft ? {
        past: [],
        present: initialDraft,
        future: [],
    } : null);
    const draft = history?.present ?? savedDraft;
    const referenceCollection = useReferenceImageCollection({ initialDataUrls: draft?.references ?? image?.references });
    const replaceReferenceDataUrls = referenceCollection.replaceWithDataUrls;
    const makeId = useCallback(() => crypto.randomUUID(), []);
    const isDirty = useMemo(() => {
        return !!draft && !!savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft);
    }, [draft, savedDraft]);

    const canvasFilter = useMemo(() => {
        if (!draft) {
            return '';
        }

        return `brightness(${draft.adjustments.brightness}%) contrast(${draft.adjustments.contrast}%) saturate(${draft.adjustments.saturation}%) ${draft.adjustments.filter !== 'none' ? draft.adjustments.filter : ''}`;
    }, [draft]);

    const commitDraft = useCallback((nextDraft: EditorDraft, recordHistory = true) => {
        setHistory((current) => {
            if (!current) {
                return { past: [], present: nextDraft, future: [] };
            }

            return recordHistory ? pushHistory(current, nextDraft) : { ...current, present: nextDraft };
        });
        setPersistedDraft(nextDraft);
    }, [setPersistedDraft]);

    const updateAdjustments = useCallback((patch: Partial<EditorDraft['adjustments']>, recordHistory = true) => {
        if (!draft) {
            return;
        }

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
            const result = addUploadedLayer(nextDraft.layerStack, dataUrl, makeId, file.name || 'Uploaded layer');
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

        const selectedLayerIds = additive
            ? Array.from(new Set([...draft.selectedLayerIds, layerId]))
            : [layerId];
        commitDraft({
            ...draft,
            selectedLayerIds,
            primarySelectedLayerId: layerId,
        }, false);
    }, [commitDraft, draft]);

    const mutateLayerStack = useCallback((nextLayerStack: EditorDraft['layerStack'], nextSelection?: string[]) => {
        if (!draft) {
            return;
        }

        const selectedLayerIds = nextSelection ?? draft.selectedLayerIds.filter((id) => nextLayerStack.layers.some((layer) => layer.id === id));
        commitDraft({
            ...draft,
            layerStack: nextLayerStack,
            selectedLayerIds,
            primarySelectedLayerId: selectedLayerIds[0] ?? 'base',
        });
    }, [commitDraft, draft]);

    const undo = useCallback(() => {
        setHistory((current) => {
            if (!current) {
                return current;
            }
            const next = undoHistory(current);
            setPersistedDraft(next.present);
            return next;
        });
    }, [setPersistedDraft]);

    const redo = useCallback(() => {
        setHistory((current) => {
            if (!current) {
                return current;
            }
            const next = redoHistory(current);
            setPersistedDraft(next.present);
            return next;
        });
    }, [setPersistedDraft]);

    const revertDraft = useCallback(() => {
        if (!savedDraft) {
            return;
        }

        if (isDirty && !window.confirm('Discard the current editor draft and restore the last saved archive state?')) {
            return;
        }

        setHistory({ past: [], present: savedDraft, future: [] });
        setPersistedDraft(savedDraft);
    }, [isDirty, savedDraft, setPersistedDraft]);

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
        draft,
        layerStack: draft?.layerStack ?? null,
        selectedLayerIds: draft?.selectedLayerIds ?? [],
        primarySelectedLayerId: draft?.primarySelectedLayerId ?? null,
        brightness: draft?.adjustments.brightness ?? DEFAULT_BRIGHTNESS,
        setBrightness: (value: number) => updateAdjustments({ brightness: value }, false),
        contrast: draft?.adjustments.contrast ?? DEFAULT_CONTRAST,
        setContrast: (value: number) => updateAdjustments({ contrast: value }, false),
        saturation: draft?.adjustments.saturation ?? DEFAULT_SATURATION,
        setSaturation: (value: number) => updateAdjustments({ saturation: value }, false),
        filter: draft?.adjustments.filter ?? DEFAULT_FILTER,
        setFilter: (value: string) => updateAdjustments({ filter: value }),
        adjustments: draft?.adjustments ?? {
            brightness: DEFAULT_BRIGHTNESS,
            contrast: DEFAULT_CONTRAST,
            saturation: DEFAULT_SATURATION,
            filter: DEFAULT_FILTER,
        },
        canvasFilter,
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
        updateLayerTransform: (layerId: string, patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => draft && mutateLayerStack(updateLayer(draft.layerStack, layerId, patch)),
        duplicateSelectedLayers: () => {
            if (!draft) return;
            const result = duplicateLayers(draft.layerStack, draft.selectedLayerIds, makeId);
            mutateLayerStack(result.layerStack, result.duplicatedIds);
        },
        deleteSelectedLayers: () => draft && mutateLayerStack(deleteLayers(draft.layerStack, draft.selectedLayerIds)),
        moveSelectedLayer: (direction: -1 | 1) => {
            if (!draft?.primarySelectedLayerId) return;
            mutateLayerStack(moveLayer(draft.layerStack, draft.primarySelectedLayerId, direction));
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
