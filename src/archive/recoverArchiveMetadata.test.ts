import { describe, expect, it } from 'vitest';
import type { LineageStep } from '../lineage/types';
import { recoverArchiveMetadataFromManifests } from './recoverArchiveMetadata';

describe('recoverArchiveMetadataFromManifests', () => {
    it('recreates archive and lineage metadata from manifests when image blobs still exist', async () => {
        const metadata = new InMemoryMetadata();
        const blobs = new InMemoryBlobs([
            ['img_image-1', 'data:image/png;base64,image'],
            ['ref_image-1_0', 'data:image/png;base64,reference'],
        ]);
        const lineage = new InMemoryLineage();

        const summary = await recoverArchiveMetadataFromManifests({
            version: 1,
            images: [
                {
                    id: 'image-1',
                    prompt: 'original prompt',
                    quality: 'medium',
                    aspectRatio: '1536x1024',
                    background: 'auto',
                    timestamp: '2026-05-30T16:10:56.590Z',
                    model: 'gpt-image-2',
                    width: 1536,
                    height: 1024,
                    style: 'none',
                    lighting: 'none',
                    palette: 'none',
                    imageFileName: 'aura-image-1.png',
                    references: [{ fileName: 'aura-image-1-reference-0.png' }],
                    layerStack: {
                        canvasWidth: 1536,
                        canvasHeight: 1024,
                        layers: [
                            {
                                id: 'base',
                                name: 'Base',
                                kind: 'base',
                                assetFileName: 'aura-image-1-layer-base.png',
                                x: 0,
                                y: 0,
                                width: 1536,
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
                                assetFileName: 'aura-image-1-layer-upload.png',
                                x: 120,
                                y: 80,
                                width: 400,
                                height: 300,
                                rotation: 0,
                                opacity: 0.85,
                                visible: true,
                                locked: false,
                            },
                        ],
                    },
                },
                {
                    id: 'missing-image',
                    prompt: 'missing',
                    quality: 'low',
                    aspectRatio: '1024x1024',
                    background: 'auto',
                    timestamp: '2026-05-30T16:12:00.000Z',
                    imageFileName: 'aura-missing-image.png',
                    references: [],
                },
            ],
        }, {
            version: 1,
            steps: [
                {
                    id: 'step-1',
                    archiveImageId: 'image-1',
                    parentStepId: null,
                    stepType: 'generation',
                    timestamp: '2026-05-30T16:10:56.590Z',
                    metadata: { prompt: 'original prompt' },
                },
            ],
        }, { metadata, blobs, lineage });

        expect(summary).toEqual({
            restoredImages: 1,
            skippedMissingImageBlobs: ['missing-image'],
            restoredLineageSteps: 1,
        });
        expect(metadata.records.get('image-1')).toEqual(expect.objectContaining({
            id: 'image-1',
            storedUrl: 'image-1',
            prompt: 'original prompt',
            quality: 'medium',
            aspectRatio: '1536x1024',
            referenceIds: [0],
            model: 'gpt-image-2',
            layerStack: expect.objectContaining({
                layers: [
                    expect.objectContaining({ id: 'base', assetUrl: '' }),
                    expect.objectContaining({ id: 'upload', assetUrl: '' }),
                ],
            }),
        }));
        expect(lineage.steps.get('step-1')).toEqual(expect.objectContaining({
            archiveImageId: 'image-1',
            stepType: 'generation',
        }));
    });

    it('rejects malformed layer stack entries through the shared manifest parser', async () => {
        await expect(recoverArchiveMetadataFromManifests({
            version: 1,
            images: [
                {
                    id: 'image-1',
                    prompt: 'broken',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-05-30T16:10:56.590Z',
                    imageFileName: 'aura-image-1.png',
                    references: [],
                    layerStack: {
                        canvasWidth: 1024,
                        canvasHeight: 1024,
                        layers: [
                            {
                                id: 'base',
                                name: 'Base',
                                kind: 'base',
                                assetFileName: 'aura-image-1-layer-base.png',
                                x: 0,
                                y: 0,
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
        }, undefined, {
            metadata: new InMemoryMetadata(),
            blobs: new InMemoryBlobs([['img_image-1', 'data:image/png;base64,image']]),
            lineage: new InMemoryLineage(),
        })).rejects.toThrow('Invalid layer width');
    });

    it('recovers non-layered archive manifest entries without layer stack data', async () => {
        const metadata = new InMemoryMetadata();

        const summary = await recoverArchiveMetadataFromManifests({
            version: 1,
            images: [
                {
                    id: 'flat-image',
                    prompt: 'flat',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-05-30T16:10:56.590Z',
                    imageFileName: 'aura-flat-image.png',
                    references: [],
                },
            ],
        }, undefined, {
            metadata,
            blobs: new InMemoryBlobs([['img_flat-image', 'data:image/png;base64,flat']]),
            lineage: new InMemoryLineage(),
        });

        expect(summary.restoredImages).toBe(1);
        expect(metadata.records.get('flat-image')).toEqual(expect.objectContaining({
            id: 'flat-image',
            referenceIds: [],
            layerStack: undefined,
        }));
    });
});

class InMemoryMetadata {
    readonly records = new Map<string, unknown>();

    async save(record: unknown) {
        const id = (record as { id: string }).id;
        this.records.set(id, record);
    }
}

class InMemoryBlobs {
    private readonly blobs: Map<string, string>;

    constructor(entries: Array<[string, string]>) {
        this.blobs = new Map(entries);
    }

    async load(key: string) {
        return this.blobs.get(key) ?? null;
    }
}

class InMemoryLineage {
    readonly steps = new Map<string, LineageStep>();

    async save(step: LineageStep) {
        this.steps.set(step.id, step);
        return step;
    }
}
