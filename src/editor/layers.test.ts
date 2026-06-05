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
    insertAiResultLayer,
    moveLayer,
    pushHistory,
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
        width: 1024,
        height: 1024,
    });
}
