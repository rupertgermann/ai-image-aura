import { describe, expect, it } from 'vitest';
import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import {
    addUploadedLayer,
    createBaseLayerStack,
    deleteLayers,
    duplicateLayers,
    getCombinedLayerBounds,
    insertAiResultLayer,
    moveLayer,
    pushHistory,
    redoHistory,
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
