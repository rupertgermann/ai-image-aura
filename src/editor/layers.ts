import type { ArchiveImage, ArchiveLayer, ArchiveLayerStack } from '../db/types';

export const DEFAULT_HISTORY_LIMIT = 50;

export interface EditorAdjustments {
    brightness: number;
    contrast: number;
    saturation: number;
    filter: string;
}

export interface EditorDraft {
    layerStack: ArchiveLayerStack;
    adjustments: EditorAdjustments;
    references: string[];
    selectedLayerIds: string[];
    primarySelectedLayerId: string | null;
}

export interface LayerHistoryState {
    past: EditorDraft[];
    present: EditorDraft;
    future: EditorDraft[];
}

export function createBaseLayerStack(image: ArchiveImage): ArchiveLayerStack {
    const canvasWidth = image.width ?? 1024;
    const canvasHeight = image.height ?? 1024;

    return {
        canvasWidth,
        canvasHeight,
        layers: [
            {
                id: 'base',
                name: 'Base',
                kind: 'base',
                assetUrl: image.url,
                x: 0,
                y: 0,
                width: canvasWidth,
                height: canvasHeight,
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: true,
            },
        ],
    };
}

export function hydrateLayerStack(image: ArchiveImage): ArchiveLayerStack {
    if (image.layerStack?.layers.length) {
        return normalizeLayerStack(image.layerStack);
    }

    return createBaseLayerStack(image);
}

export function normalizeLayerStack(layerStack: ArchiveLayerStack): ArchiveLayerStack {
    return {
        canvasWidth: layerStack.canvasWidth,
        canvasHeight: layerStack.canvasHeight,
        layers: layerStack.layers.map((layer, index) => ({
            ...layer,
            name: layer.name || (index === 0 ? 'Base' : `Layer ${index + 1}`),
            rotation: layer.rotation ?? 0,
            opacity: clampOpacity(layer.opacity ?? 1),
            visible: layer.visible ?? true,
            locked: layer.kind === 'base' ? true : !!layer.locked,
        })),
    };
}

export function createEditorDraft(image: ArchiveImage): EditorDraft {
    const layerStack = hydrateLayerStack(image);

    return {
        layerStack,
        adjustments: {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            filter: 'none',
        },
        references: image.references ?? [],
        selectedLayerIds: ['base'],
        primarySelectedLayerId: 'base',
    };
}

export function hasDurableLayerStack(layerStack: ArchiveLayerStack): boolean {
    return layerStack.layers.some((layer) => layer.kind !== 'base');
}

export function addUploadedLayer(
    layerStack: ArchiveLayerStack,
    assetUrl: string,
    makeId: () => string,
    name = 'Uploaded layer',
    sourceSize?: { width: number; height: number },
): { layerStack: ArchiveLayerStack; layerId: string } {
    const { width, height } = fitLayerToCanvas(layerStack.canvasWidth, layerStack.canvasHeight, sourceSize);
    const layerId = makeId();
    const layer: ArchiveLayer = {
        id: layerId,
        name,
        kind: 'uploaded',
        assetUrl,
        x: (layerStack.canvasWidth - width) / 2,
        y: (layerStack.canvasHeight - height) / 2,
        width,
        height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
    };

    return {
        layerStack: {
            ...layerStack,
            layers: [...layerStack.layers, layer],
        },
        layerId,
    };
}

export function addDraftReferences(draft: EditorDraft, references: string[]): EditorDraft {
    return {
        ...draft,
        references: [...draft.references, ...references],
    };
}

export function removeDraftReferenceAt(draft: EditorDraft, index: number): EditorDraft {
    return {
        ...draft,
        references: draft.references.filter((_, currentIndex) => currentIndex !== index),
    };
}

export function insertAiResultLayer(
    layerStack: ArchiveLayerStack,
    targetLayerIds: string[],
    assetUrl: string,
    makeId: () => string,
): { layerStack: ArchiveLayerStack; layerId: string; targetBounds: LayerBounds | null } {
    const targetBounds = getCombinedLayerBounds(layerStack, targetLayerIds);
    const targetIndexes = targetLayerIds
        .map((id) => layerStack.layers.findIndex((layer) => layer.id === id))
        .filter((index) => index >= 0);
    const insertIndex = targetIndexes.length ? Math.max(...targetIndexes) + 1 : layerStack.layers.length;
    const layerId = makeId();
    const bounds = targetBounds ?? { x: 0, y: 0, width: layerStack.canvasWidth, height: layerStack.canvasHeight };
    const aiLayer: ArchiveLayer = {
        id: layerId,
        name: 'AI result',
        kind: 'ai-result',
        assetUrl,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
    };
    const layers = layerStack.layers.map((layer) => {
        if (!targetLayerIds.includes(layer.id) || layer.kind === 'base') {
            return layer;
        }

        return { ...layer, visible: false };
    });

    return {
        layerStack: {
            ...layerStack,
            layers: [...layers.slice(0, insertIndex), aiLayer, ...layers.slice(insertIndex)],
        },
        layerId,
        targetBounds,
    };
}

export function moveLayer(layerStack: ArchiveLayerStack, layerId: string, direction: -1 | 1): ArchiveLayerStack {
    const index = layerStack.layers.findIndex((layer) => layer.id === layerId);
    if (index <= 0) {
        return layerStack;
    }

    const layer = layerStack.layers[index];
    if (!layer || layer.locked) {
        return layerStack;
    }

    const nextIndex = index + direction;
    if (nextIndex <= 0 || nextIndex >= layerStack.layers.length) {
        return layerStack;
    }

    const layers = [...layerStack.layers];
    const [removed] = layers.splice(index, 1);
    layers.splice(nextIndex, 0, removed);
    return { ...layerStack, layers };
}

export function getEditableLayerIds(layerStack: ArchiveLayerStack, layerIds: string[]): string[] {
    const selected = new Set(layerIds);
    return layerStack.layers
        .filter((layer) => selected.has(layer.id) && layer.kind !== 'base' && !layer.locked)
        .map((layer) => layer.id);
}

export function updateLayer(layerStack: ArchiveLayerStack, layerId: string, patch: Partial<ArchiveLayer>): ArchiveLayerStack {
    return {
        ...layerStack,
        layers: layerStack.layers.map((layer) => {
            if (layer.id !== layerId || layer.locked && patch.kind !== 'base') {
                return layer;
            }

            return {
                ...layer,
                ...patch,
                opacity: patch.opacity === undefined ? layer.opacity : clampOpacity(patch.opacity),
                locked: layer.kind === 'base' ? true : (patch.locked ?? layer.locked),
            };
        }),
    };
}

export function deleteLayers(layerStack: ArchiveLayerStack, layerIds: string[]): ArchiveLayerStack {
    const ids = new Set(layerIds);
    return {
        ...layerStack,
        layers: layerStack.layers.filter((layer) => layer.kind === 'base' || !ids.has(layer.id)),
    };
}

export function duplicateLayers(
    layerStack: ArchiveLayerStack,
    layerIds: string[],
    makeId: () => string,
): { layerStack: ArchiveLayerStack; duplicatedIds: string[] } {
    const ids = new Set(layerIds);
    const duplicatedIds: string[] = [];
    const layers = layerStack.layers.flatMap((layer) => {
        if (layer.kind === 'base' || !ids.has(layer.id)) {
            return [layer];
        }

        const duplicatedLayer = {
            ...layer,
            id: makeId(),
            name: `${layer.name} copy`,
            x: layer.x + 24,
            y: layer.y + 24,
        };
        duplicatedIds.push(duplicatedLayer.id);
        return [layer, duplicatedLayer];
    });

    return { layerStack: { ...layerStack, layers }, duplicatedIds };
}

export function selectTopmostVisibleLayer(layerStack: ArchiveLayerStack, point: { x: number; y: number }): string | null {
    for (let index = layerStack.layers.length - 1; index >= 0; index -= 1) {
        const layer = layerStack.layers[index];
        if (!layer || !layer.visible || layer.kind === 'base') {
            continue;
        }

        if (
            point.x >= layer.x
            && point.x <= layer.x + layer.width
            && point.y >= layer.y
            && point.y <= layer.y + layer.height
        ) {
            return layer.id;
        }
    }

    return null;
}

export interface LayerBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function getCombinedLayerBounds(layerStack: ArchiveLayerStack, layerIds: string[]): LayerBounds | null {
    const ids = new Set(layerIds);
    const targetLayers = layerStack.layers.filter((layer) => ids.has(layer.id) && layer.visible);
    if (!targetLayers.length) {
        return null;
    }

    const minX = Math.min(...targetLayers.map((layer) => layer.x));
    const minY = Math.min(...targetLayers.map((layer) => layer.y));
    const maxX = Math.max(...targetLayers.map((layer) => layer.x + layer.width));
    const maxY = Math.max(...targetLayers.map((layer) => layer.y + layer.height));

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

export function pushHistory(
    history: LayerHistoryState,
    nextDraft: EditorDraft,
    limit = DEFAULT_HISTORY_LIMIT,
): LayerHistoryState {
    const past = [...history.past, history.present].slice(-limit);
    return { past, present: nextDraft, future: [] };
}

export function undoHistory(history: LayerHistoryState): LayerHistoryState {
    const previous = history.past.at(-1);
    if (!previous) {
        return history;
    }

    return {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
    };
}

export function redoHistory(history: LayerHistoryState): LayerHistoryState {
    const next = history.future[0];
    if (!next) {
        return history;
    }

    return {
        past: [...history.past, history.present],
        present: next,
        future: history.future.slice(1),
    };
}

function fitLayerToCanvas(canvasWidth: number, canvasHeight: number, sourceSize?: { width: number; height: number }) {
    const maxWidth = canvasWidth * 0.6;
    const maxHeight = canvasHeight * 0.6;
    const sourceWidth = Math.max(1, sourceSize?.width ?? 1);
    const sourceHeight = Math.max(1, sourceSize?.height ?? 1);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);

    return {
        width: sourceWidth * scale,
        height: sourceHeight * scale,
    };
}

function clampOpacity(opacity: number) {
    return Math.min(1, Math.max(0, opacity));
}
