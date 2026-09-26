import { describe, expect, it } from 'vitest';
import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import {
    addUploadedLayer,
    createBaseLayerStack,
    deleteLayers,
    duplicateLayers,
    hydrateLayerStack,
    moveLayer,
    normalizeLayerStack,
    nudgeLayers,
    planAiTransformTarget,
    reorderLayer,
    pushHistory,
    repairEditorDraftForImage,
    redoHistory,
    undoHistory,
    updateLayer,
} from './layers';

describe('layer editor helpers', () => {
    it('hydrates base-only images from aspect ratio metadata when dimensions are missing', () => {
        const stack = createBaseLayerStack({
            ...createImage(),
            aspectRatio: '16:9',
            width: undefined,
            height: undefined,
        });

        expect(stack).toEqual(expect.objectContaining({
            canvasWidth: 1024,
            canvasHeight: 576,
        }));
        expect(stack.layers[0]).toEqual(expect.objectContaining({
            width: 1024,
            height: 576,
        }));
    });

    it('repairs old square fallback dimensions when they conflict with non-square aspect ratio metadata', () => {
        const stack = createBaseLayerStack({
            ...createImage(),
            aspectRatio: '1536x1024',
            width: 1024,
            height: 1024,
        });

        expect(stack).toEqual(expect.objectContaining({
            canvasWidth: 1536,
            canvasHeight: 1024,
        }));
        expect(stack.layers[0]).toEqual(expect.objectContaining({
            width: 1536,
            height: 1024,
        }));
    });

    it('repairs stale persisted editor drafts that were created with square fallback dimensions', () => {
        const draft = {
            layerStack: createStack(),
            adjustments: { brightness: 100, contrast: 100, saturation: 100, filter: 'none' },
            references: [],
            selectedLayerIds: ['layer-1'],
            primarySelectedLayerId: 'layer-1',
        };
        const repaired = repairEditorDraftForImage(draft, {
            ...createImage(),
            aspectRatio: '16:9',
            width: 1024,
            height: 1024,
        });

        expect(repaired.layerStack.canvasWidth).toBe(1024);
        expect(repaired.layerStack.canvasHeight).toBe(576);
        expect(repaired.layerStack.layers[0]).toEqual(expect.objectContaining({
            width: 1024,
            height: 576,
        }));
        expect(repaired.selectedLayerIds).toEqual(['layer-1']);
    });

    it('repairs durable layer stacks that were saved with old square fallback dimensions', () => {
        const layeredStack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const repaired = hydrateLayerStack({
            ...createImage(),
            aspectRatio: '16:9',
            width: 1024,
            height: 1024,
            layerStack: layeredStack,
        });

        expect(repaired.canvasWidth).toBe(1024);
        expect(repaired.canvasHeight).toBe(576);
        expect(repaired.layers[0]).toEqual(expect.objectContaining({
            width: 1024,
            height: 576,
        }));
        expect(repaired.layers[1]).toEqual(expect.objectContaining({
            x: 204.8,
            y: 115.2,
            width: 614.4,
            height: expect.closeTo(345.6),
        }));
    });

    it('fits uploaded layers to the canvas without distorting their source aspect ratio', () => {
        const landscape = addUploadedLayer(
            createStack(),
            'data:image/png;base64,landscape',
            () => 'landscape-layer',
            'landscape.png',
            { width: 1600, height: 800 },
        ).layerStack.layers.at(-1);
        const portrait = addUploadedLayer(
            createStack(),
            'data:image/png;base64,portrait',
            () => 'portrait-layer',
            'portrait.png',
            { width: 800, height: 1600 },
        ).layerStack.layers.at(-1);

        expect(landscape).toEqual(expect.objectContaining({
            width: 614.4,
            height: 307.2,
            x: 204.8,
            y: 358.4,
        }));
        expect(portrait).toEqual(expect.objectContaining({
            width: 307.2,
            height: 614.4,
            x: 358.4,
            y: 204.8,
        }));
    });

    it('updates, duplicates, moves, and deletes uploaded layers without duplicating or deleting the base layer', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const renamed = updateLayer(stack, 'layer-1', { name: 'Glow', opacity: 0.4, visible: false });
        const duplicated = duplicateLayers(renamed, ['base', 'layer-1'], () => 'layer-2');
        const moved = moveLayer(duplicated.layerStack, 'layer-2', -1);
        const deleted = deleteLayers(moved, ['base', 'layer-1']);

        expect(renamed.layers[1]).toEqual(expect.objectContaining({ name: 'Glow', opacity: 0.4, visible: false }));
        expect(duplicated.duplicatedIds).toEqual(['layer-2']);
        expect(moved.layers.map((layer) => layer.id)).toEqual(['base', 'layer-2', 'layer-1']);
        expect(deleted.layers.map((layer) => layer.id)).toEqual(['base', 'layer-2']);
    });

    it('blocks position, opacity, and blend-mode changes on locked layers but allows renaming, visibility changes, and unlocking', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const locked = updateLayer(stack, 'layer-1', { locked: true });
        const patched = updateLayer(locked, 'layer-1', {
            name: 'Frozen',
            visible: false,
            x: 999,
            opacity: 0.2,
            blendMode: 'multiply',
        });
        const unlocked = updateLayer(patched, 'layer-1', { locked: false });

        expect(patched.layers[1]).toEqual(expect.objectContaining({
            name: 'Frozen',
            visible: false,
            x: 204.8,
            opacity: 1,
            blendMode: 'normal',
            locked: true,
        }));
        expect(unlocked.layers[1]).toEqual(expect.objectContaining({ locked: false }));
    });

    it('updates layer blend modes and defaults legacy stacks to normal', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const blended = updateLayer(stack, 'layer-1', { blendMode: 'screen' });
        const legacyLayer = Object.fromEntries(
            Object.entries(stack.layers[1]).filter(([key]) => key !== 'blendMode'),
        ) as typeof stack.layers[1];
        const normalized = normalizeLayerStack({
            ...stack,
            layers: [stack.layers[0], legacyLayer],
        });

        expect(blended.layers[1].blendMode).toBe('screen');
        expect(normalized.layers[1].blendMode).toBe('normal');
    });

    it('reorders unlocked layers to a clamped target index above the base layer', () => {
        const withFirst = addUploadedLayer(createStack(), 'data:image/png;base64,a', () => 'layer-1').layerStack;
        const stack = addUploadedLayer(withFirst, 'data:image/png;base64,b', () => 'layer-2').layerStack;

        expect(reorderLayer(stack, 'layer-2', 1).layers.map((layer) => layer.id)).toEqual(['base', 'layer-2', 'layer-1']);
        expect(reorderLayer(stack, 'layer-1', 99).layers.map((layer) => layer.id)).toEqual(['base', 'layer-2', 'layer-1']);
        expect(reorderLayer(stack, 'layer-2', 0).layers.map((layer) => layer.id)).toEqual(['base', 'layer-2', 'layer-1']);
        expect(reorderLayer(stack, 'layer-1', 0)).toBe(stack);
        expect(reorderLayer(stack, 'base', 2)).toBe(stack);
        expect(reorderLayer(updateLayer(stack, 'layer-1', { locked: true }), 'layer-1', 2).layers.map((layer) => layer.id))
            .toEqual(['base', 'layer-1', 'layer-2']);
    });

    it('nudges selected editable layers and leaves base and locked layers in place', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const lockedStack = updateLayer(stack, 'layer-1', { locked: true });

        const nudged = nudgeLayers(stack, ['base', 'layer-1'], 10, -5);
        expect(nudged.layers[0]).toEqual(expect.objectContaining({ x: 0, y: 0 }));
        expect(nudged.layers[1]).toEqual(expect.objectContaining({ x: 214.8, y: 199.8 }));
        expect(nudgeLayers(lockedStack, ['layer-1'], 10, 10)).toBe(lockedStack);
        expect(nudgeLayers(stack, [], 10, 10)).toBe(stack);
        expect(nudgeLayers(stack, ['layer-1'], 0, 0)).toBe(stack);
    });

    it('does not create a new stack for invalid layer reorders', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        expect(moveLayer(stack, 'base', 1)).toBe(stack);
        expect(moveLayer(stack, 'layer-1', 1)).toBe(stack);
        expect(moveLayer(stack, 'layer-1', -1)).toBe(stack);
    });

    it('supports bounded snapshot undo and redo', () => {
        const draft = {
            layerStack: createStack(),
            adjustments: { brightness: 100, contrast: 100, saturation: 100, filter: 'none' },
            references: [],
            selectedLayerIds: ['base'],
            primarySelectedLayerId: 'base',
        };
        const first = pushHistory({ past: [], present: draft, future: [] }, {
            ...draft,
            selectedLayerIds: ['layer-1'],
            primarySelectedLayerId: 'layer-1',
        }, 1);
        const second = pushHistory(first, {
            ...first.present,
            selectedLayerIds: ['layer-2'],
            primarySelectedLayerId: 'layer-2',
        }, 1);

        expect(second.past).toHaveLength(1);
        expect(undoHistory(second).present.primarySelectedLayerId).toBe('layer-1');
        expect(redoHistory(undoHistory(second)).present.primarySelectedLayerId).toBe('layer-2');
    });

    it('plans base-plus-non-base selection as selected layers anchored by the base bounds', () => {
        const layerStack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        const plan = planAiTransformTarget(createDraft(layerStack, ['layer-1', 'base']));

        expect(plan).toEqual({
            mode: 'selected-layers',
            targetLayerIds: ['base', 'layer-1'],
            targetBounds: { x: 0, y: 0, width: 1024, height: 1024 },
            requiresCompositionContext: true,
            metadata: {
                targetMode: 'selected-layers',
                targetLayerCount: 2,
                targetIncludesBaseLayer: true,
            },
        });
    });

    it('falls back to a whole-composition AI transform target for hidden selected layers', () => {
        const visibleStack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const layerStack = updateLayer(visibleStack, 'layer-1', { visible: false });

        const plan = planAiTransformTarget(createDraft(layerStack, ['layer-1']));

        expect(plan).toEqual({
            mode: 'whole-composition',
            targetLayerIds: ['base'],
            targetBounds: { x: 0, y: 0, width: 1024, height: 1024 },
            requiresCompositionContext: false,
            metadata: {
                targetMode: 'whole-composition',
                targetLayerCount: null,
                targetIncludesBaseLayer: null,
            },
        });
    });

    it('falls back to a whole-composition AI transform target for missing selected layers', () => {
        const layerStack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        const plan = planAiTransformTarget(createDraft(layerStack, ['missing-layer']));

        expect(plan).toEqual({
            mode: 'whole-composition',
            targetLayerIds: ['base', 'layer-1'],
            targetBounds: { x: 0, y: 0, width: 1024, height: 1024 },
            requiresCompositionContext: false,
            metadata: {
                targetMode: 'whole-composition',
                targetLayerCount: null,
                targetIncludesBaseLayer: null,
            },
        });
    });


});

function createImage(): ArchiveImage {
    return {
        id: 'source',
        url: 'data:image/png;base64,source',
        prompt: 'source',
        quality: 'high',
        aspectRatio: '1200x800',
        background: 'transparent',
        timestamp: '2026-01-01T00:00:00.000Z',
        width: 1200,
        height: 800,
    };
}

function createStack(): ArchiveLayerStack {
    return createBaseLayerStack({
        ...createImage(),
        aspectRatio: '1024x1024',
        width: 1024,
        height: 1024,
    });
}

function createDraft(layerStack: ArchiveLayerStack, selectedLayerIds: string[]) {
    return {
        layerStack,
        adjustments: { brightness: 100, contrast: 100, saturation: 100, filter: 'none' },
        references: ['data:image/png;base64,reference'],
        selectedLayerIds,
        primarySelectedLayerId: selectedLayerIds[0] ?? null,
    };
}
