import { describe, expect, it } from 'vitest';
import {
    ARCHIVE_MANIFEST_VERSION,
    LINEAGE_MANIFEST_VERSION,
    createArchiveManifestLayerStack,
    parseArchiveManifest,
    parseLineageManifest,
} from './ArchiveManifest';
import type { ArchiveLayerStack } from '../db/types';

describe('ArchiveManifest', () => {
    it('accepts the existing archive manifest version and preserves stable layer ids', () => {
        const manifest = parseArchiveManifest({
            version: ARCHIVE_MANIFEST_VERSION,
            images: [
                {
                    id: 'layered-image',
                    prompt: 'layered',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-06-05T10:00:00.000Z',
                    imageFileName: 'aura-layered-image.png',
                    references: [],
                    layerStack: createManifestLayerStack(),
                },
            ],
        });

        expect(manifest.version).toBe(1);
        expect(manifest.images[0].layerStack?.layers.map((layer) => [layer.id, layer.assetFileName])).toEqual([
            ['base', 'aura-layered-image-layer-base.png'],
            ['upload', 'aura-layered-image-layer-upload.png'],
        ]);
    });

    it('rejects malformed layer stack entries', () => {
        expect(() => parseArchiveManifest({
            version: ARCHIVE_MANIFEST_VERSION,
            images: [
                {
                    id: 'layered-image',
                    prompt: 'layered',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-06-05T10:00:00.000Z',
                    imageFileName: 'aura-layered-image.png',
                    references: [],
                    layerStack: {
                        canvasWidth: 1024,
                        canvasHeight: 1024,
                        layers: [
                            {
                                id: 'base',
                                name: 'Base',
                                kind: 'bitmap',
                                assetFileName: 'aura-layered-image-layer-base.png',
                                x: 0,
                                y: 0,
                                width: 1024,
                                height: 1024,
                                rotation: 0,
                                opacity: 1,
                                visible: true,
                                locked: true,
                            },
                        ],
                    },
                },
            ],
        })).toThrow('Invalid layer kind');
    });

    it('rejects invalid lineage step types through the shared parser', () => {
        expect(() => parseLineageManifest({
            version: LINEAGE_MANIFEST_VERSION,
            steps: [
                {
                    id: 'step-1',
                    archiveImageId: 'image-1',
                    parentStepId: null,
                    stepType: 'mystery-step',
                    timestamp: '2026-06-05T10:00:00.000Z',
                    metadata: {},
                },
            ],
        })).toThrow('Invalid lineage step type');
    });

    it('validates exported layer stacks before they are written to a ZIP manifest', () => {
        const layerStack: ArchiveLayerStack = {
            canvasWidth: 1024,
            canvasHeight: 1024,
            layers: [
                {
                    id: 'base',
                    name: 'Base',
                    kind: 'base',
                    assetUrl: 'data:image/png;base64,base',
                    x: 0,
                    y: 0,
                    width: 1024,
                    height: 1024,
                    rotation: 0,
                    opacity: 1,
                    visible: true,
                    locked: true,
                },
            ],
        };

        expect(createArchiveManifestLayerStack(
            'layered-image',
            layerStack,
            (imageId, layerId) => `aura-${imageId}-layer-${layerId}.png`,
        )).toEqual({
            canvasWidth: 1024,
            canvasHeight: 1024,
            layers: [
                {
                    id: 'base',
                    name: 'Base',
                    kind: 'base',
                    assetFileName: 'aura-layered-image-layer-base.png',
                    x: 0,
                    y: 0,
                    width: 1024,
                    height: 1024,
                    rotation: 0,
                    opacity: 1,
                    visible: true,
                    locked: true,
                },
            ],
        });
    });
});

function createManifestLayerStack() {
    return {
        canvasWidth: 1024,
        canvasHeight: 1024,
        layers: [
            {
                id: 'base',
                name: 'Base',
                kind: 'base',
                assetFileName: 'aura-layered-image-layer-base.png',
                x: 0,
                y: 0,
                width: 1024,
                height: 1024,
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: true,
            },
            {
                id: 'upload',
                name: 'Upload',
                kind: 'uploaded',
                assetFileName: 'aura-layered-image-layer-upload.png',
                x: 120,
                y: 160,
                width: 400,
                height: 300,
                rotation: 0,
                opacity: 0.8,
                visible: true,
                locked: false,
            },
        ],
    };
}
