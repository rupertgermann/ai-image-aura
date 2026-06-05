import { describe, expect, it } from 'vitest';
import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import {
    addUploadedLayer,
    addDraftReferences,
    createBaseLayerStack,
    deleteLayers,
    duplicateLayers,
    getEditableLayerIds,
    getCombinedLayerBounds,
    hydrateLayerStack,
    insertAiResultLayer,
    moveLayer,
    planAiTransformTarget,
    pushHistory,
    repairEditorDraftForImage,
    redoHistory,
    removeDraftReferenceAt,
    undoHistory,
    updateLayer,
} from './layers';

describe('layer editor helpers', () => {
    it('hydrates non-layered images as a locked base layer without durable metadata', () => {
        const stack = createBaseLayerStack(createImage());

        expect(stack).toEqual({
            canvasWidth: 1200,
            canvasHeight: 800,
            layers: [
                expect.objectContaining({
                    id: 'base',
                    kind: 'base',
                    assetUrl: 'data:image/png;base64,source',
                    locked: true,
                    width: 1200,
                    height: 800,
                }),
            ],
        });
    });

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

    it('adds uploaded layers centered, selected-ready, visible, and opaque', () => {
        const result = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1', 'cloud.png');

        expect(result.layerId).toBe('layer-1');
        expect(result.layerStack.layers.at(-1)).toEqual(expect.objectContaining({
            id: 'layer-1',
            name: 'cloud.png',
            kind: 'uploaded',
            visible: true,
            opacity: 1,
            locked: false,
            x: 204.8,
            y: 204.8,
            width: 614.4,
            height: 614.4,
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

    it('applies stack operations while preserving base-layer guardrails', () => {
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

    it('filters shared layer actions to editable non-base layers', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const lockedStack = updateLayer(stack, 'layer-1', { locked: true });

        expect(getEditableLayerIds(stack, ['base', 'layer-1', 'missing'])).toEqual(['layer-1']);
        expect(getEditableLayerIds(lockedStack, ['base', 'layer-1'])).toEqual([]);
    });

    it('does not create a new stack for invalid layer reorders', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        expect(moveLayer(stack, 'base', 1)).toBe(stack);
        expect(moveLayer(stack, 'layer-1', 1)).toBe(stack);
        expect(moveLayer(stack, 'layer-1', -1)).toBe(stack);
    });

    it('inserts AI results above targets and hides non-base targets', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;
        const result = insertAiResultLayer(stack, ['base', 'layer-1'], 'data:image/png;base64,ai', () => 'ai-layer');

        expect(result.layerStack.layers.map((layer) => [layer.id, layer.visible])).toEqual([
            ['base', true],
            ['layer-1', false],
            ['ai-layer', true],
        ]);
        expect(result.targetBounds).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
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

    it('tracks reference add and remove operations through snapshot history', () => {
        const draft = {
            layerStack: createStack(),
            adjustments: { brightness: 100, contrast: 100, saturation: 100, filter: 'none' },
            references: ['data:image/png;base64,ref1'],
            selectedLayerIds: ['base'],
            primarySelectedLayerId: 'base',
        };
        const added = pushHistory({ past: [], present: draft, future: [] }, addDraftReferences(draft, ['data:image/png;base64,ref2']));
        const removed = pushHistory(added, removeDraftReferenceAt(added.present, 0));

        expect(removed.present.references).toEqual(['data:image/png;base64,ref2']);
        expect(undoHistory(removed).present.references).toEqual([
            'data:image/png;base64,ref1',
            'data:image/png;base64,ref2',
        ]);
        expect(redoHistory(undoHistory(removed)).present.references).toEqual(['data:image/png;base64,ref2']);
    });

    it('computes selected visible layer bounds', () => {
        const stack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        expect(getCombinedLayerBounds(stack, ['layer-1'])).toEqual({
            x: 204.8,
            y: 204.8,
            width: 614.4000000000001,
            height: 614.4000000000001,
        });
    });

    it('plans selected visible non-base layers as a bounded AI transform target', () => {
        const layerStack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        const plan = planAiTransformTarget(createDraft(layerStack, ['layer-1']));

        expect(plan).toEqual({
            mode: 'selected-layers',
            targetLayerIds: ['layer-1'],
            targetBounds: {
                x: 204.8,
                y: 204.8,
                width: 614.4000000000001,
                height: 614.4000000000001,
            },
            requiresCompositionContext: true,
            metadata: {
                targetMode: 'selected-layers',
                targetLayerCount: 1,
                targetIncludesBaseLayer: false,
            },
        });
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

    it('falls back to a whole-composition AI transform target for base-only selection', () => {
        const layerStack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        const plan = planAiTransformTarget(createDraft(layerStack, ['base']));

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

    it('falls back to a whole-composition AI transform target when no layers are selected', () => {
        const layerStack = addUploadedLayer(createStack(), 'data:image/png;base64,upload', () => 'layer-1').layerStack;

        const plan = planAiTransformTarget(createDraft(layerStack, []));

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
