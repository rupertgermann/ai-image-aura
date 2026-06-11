import { describe, expect, it } from 'vitest';
import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import { createArchiveStore } from './ArchiveStore';

type ArchiveMetadataRecord = Omit<ArchiveImage, 'url' | 'references'> & {
    storedUrl: string;
    referenceIds: number[];
    layerStack?: ArchiveLayerStack;
};

class InMemoryArchiveMetadataPort {
    readonly records = new Map<string, ArchiveMetadataRecord>();

    async list() {
        return Array.from(this.records.values());
    }

    async get(id: string) {
        return this.records.get(id) ?? null;
    }

    async save(record: ArchiveMetadataRecord) {
        this.records.set(record.id, record);
    }

    async remove(id: string) {
        this.records.delete(id);
    }
}

class InMemoryBlobPort {
    readonly blobs = new Map<string, string>();
    failOnSaveKey: string | null = null;
    failOnRemoveKey: string | null = null;

    async save(key: string, data: string) {
        if (key === this.failOnSaveKey) {
            throw new Error(`save failed for ${key}`);
        }

        this.blobs.set(key, data);
    }

    async load(key: string) {
        return this.blobs.get(key) ?? null;
    }

    async remove(key: string) {
        if (key === this.failOnRemoveKey) {
            throw new Error(`remove failed for ${key}`);
        }

        this.blobs.delete(key);
    }

    async listKeys() {
        return Array.from(this.blobs.keys());
    }
}

describe('ArchiveStore layer asset ownership', () => {
    it('hydrates durable layer metadata with layer bitmap assets', async () => {
        const { store, metadata } = createStore();

        await store.save(createImageInput({
            id: 'image-1',
            layerStack: createLayerStack('image-1', ['base', 'upload']),
        }));

        expect(metadata.records.get('image-1')?.layerStack?.layers.map((layer) => [layer.id, layer.assetUrl])).toEqual([
            ['base', ''],
            ['upload', ''],
        ]);
        await expect(store.list()).resolves.toEqual([
            expect.objectContaining({
                id: 'image-1',
                layerStack: expect.objectContaining({
                    layers: [
                        expect.objectContaining({ id: 'base', assetUrl: 'data:image/png;base64,image-1-base' }),
                        expect.objectContaining({ id: 'upload', assetUrl: 'data:image/png;base64,image-1-upload' }),
                    ],
                }),
            }),
        ]);
    });

    it('save as copy gives copied layered images independent layer assets', async () => {
        const { store } = createStore();
        const source = await store.save(createImageInput({
            id: 'source',
            layerStack: createLayerStack('source', ['base', 'upload']),
        }));

        await store.save({
            ...source,
            id: 'copy',
            url: 'data:image/png;base64,copy-preview',
            layerStack: source.layerStack,
        });
        await store.remove('source');

        await expect(store.list()).resolves.toEqual([
            expect.objectContaining({
                id: 'copy',
                layerStack: expect.objectContaining({
                    layers: [
                        expect.objectContaining({ id: 'base', assetUrl: 'data:image/png;base64,source-base' }),
                        expect.objectContaining({ id: 'upload', assetUrl: 'data:image/png;base64,source-upload' }),
                    ],
                }),
            }),
        ]);
    });

    it('removes stale layer assets on overwrite', async () => {
        const { store, blobs } = createStore();

        await store.save(createImageInput({
            id: 'image-1',
            layerStack: createLayerStack('old', ['base', 'stale']),
        }));
        await store.save(createImageInput({
            id: 'image-1',
            layerStack: createLayerStack('new', ['base', 'fresh']),
        }));

        expect(blobs.blobs.has('layer_image-1_stale')).toBe(false);
        expect(blobs.blobs.get('layer_image-1_fresh')).toBe('data:image/png;base64,new-fresh');
    });

    it('deleting a layered image removes flattened, reference, and layer assets', async () => {
        const { store, metadata, blobs } = createStore();

        await store.save(createImageInput({
            id: 'image-1',
            references: ['data:image/png;base64,ref'],
            layerStack: createLayerStack('image-1', ['base', 'upload']),
        }));
        await store.remove('image-1');

        expect(metadata.records.has('image-1')).toBe(false);
        expect(blobs.blobs.has('img_image-1')).toBe(false);
        expect(blobs.blobs.has('ref_image-1_0')).toBe(false);
        expect(blobs.blobs.has('layer_image-1_base')).toBe(false);
        expect(blobs.blobs.has('layer_image-1_upload')).toBe(false);
    });

    it('restores previous metadata and blobs after a failed layered overwrite', async () => {
        const { store, blobs } = createStore();

        await store.save(createImageInput({
            id: 'image-1',
            url: 'data:image/png;base64,old-preview',
            layerStack: createLayerStack('old', ['base', 'old-layer']),
        }));
        blobs.failOnSaveKey = 'layer_image-1_new-layer';

        await expect(store.save(createImageInput({
            id: 'image-1',
            url: 'data:image/png;base64,new-preview',
            layerStack: createLayerStack('new', ['base', 'new-layer']),
        }))).rejects.toThrow('save failed for layer_image-1_new-layer');

        blobs.failOnSaveKey = null;
        await expect(store.list()).resolves.toEqual([
            expect.objectContaining({
                id: 'image-1',
                url: 'data:image/png;base64,old-preview',
                layerStack: expect.objectContaining({
                    layers: [
                        expect.objectContaining({ id: 'base', assetUrl: 'data:image/png;base64,old-base' }),
                        expect.objectContaining({ id: 'old-layer', assetUrl: 'data:image/png;base64,old-old-layer' }),
                    ],
                }),
            }),
        ]);
        expect(blobs.blobs.has('layer_image-1_new-layer')).toBe(false);
    });

    it('keeps non-layered save and delete behavior compatible', async () => {
        const { store, metadata, blobs } = createStore();

        await store.save(createImageInput({
            id: 'flat',
            references: ['data:image/png;base64,ref'],
        }));

        await expect(store.list()).resolves.toEqual([
            expect.objectContaining({
                id: 'flat',
                url: 'data:image/png;base64,flat-preview',
                references: ['data:image/png;base64,ref'],
                layerStack: undefined,
            }),
        ]);

        await store.remove('flat');
        expect(metadata.records.has('flat')).toBe(false);
        expect(blobs.blobs.has('img_flat')).toBe(false);
        expect(blobs.blobs.has('ref_flat_0')).toBe(false);
    });

    it('persists favorite archive images and treats missing favorite metadata as non-favorite', async () => {
        const { store, metadata } = createStore();

        await store.save(createImageInput({
            id: 'favorite-image',
            favorite: true,
        }));
        metadata.records.set('legacy-image', {
            id: 'legacy-image',
            storedUrl: 'data:image/png;base64,legacy',
            prompt: 'legacy prompt',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-06-05T08:00:00.000Z',
            width: 1024,
            height: 1024,
            referenceIds: [],
        });

        await expect(store.list()).resolves.toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'favorite-image',
                favorite: true,
            }),
            expect.not.objectContaining({
                id: 'legacy-image',
                favorite: true,
            }),
        ]));
    });

    it('persists actual parameter metadata and treats legacy metadata as absent', async () => {
        const { store, metadata } = createStore();
        const actualParameters = {
            revisedPrompt: 'refined prompt',
            size: '1536x1024',
            quality: 'high',
            elapsedMs: 930,
        };

        await store.save(createImageInput({
            id: 'actual-image',
            actualParameters,
        }));
        metadata.records.set('legacy-image', {
            id: 'legacy-image',
            storedUrl: 'data:image/png;base64,legacy',
            prompt: 'legacy prompt',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-06-05T08:00:00.000Z',
            width: 1024,
            height: 1024,
            referenceIds: [],
        });

        expect(metadata.records.get('actual-image')?.actualParameters).toEqual(actualParameters);
        await expect(store.list()).resolves.toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'actual-image',
                actualParameters,
            }),
            expect.not.objectContaining({
                id: 'legacy-image',
                actualParameters: expect.anything(),
            }),
        ]));
    });

    it('recovers orphaned image blobs when metadata is missing', async () => {
        const { store, metadata, blobs } = createStore();
        blobs.blobs.set('img_orphaned-image', 'data:image/png;base64,orphaned');
        blobs.blobs.set('ref_orphaned-image_0', 'data:image/png;base64,ignored-reference');
        blobs.blobs.set('layer_orphaned-image_base', 'data:image/png;base64,ignored-layer');

        await expect(store.list()).resolves.toEqual([
            expect.objectContaining({
                id: 'orphaned-image',
                url: 'data:image/png;base64,orphaned',
                prompt: 'Recovered image',
                timestamp: '2026-06-05T09:00:00.000Z',
                references: [],
            }),
        ]);
        expect(metadata.records.get('orphaned-image')).toEqual(expect.objectContaining({
            id: 'orphaned-image',
            storedUrl: 'orphaned-image',
            prompt: 'Recovered image',
            referenceIds: [],
        }));
    });
});

function createStore() {
    const metadata = new InMemoryArchiveMetadataPort();
    const blobs = new InMemoryBlobPort();
    const store = createArchiveStore({
        metadata,
        blobs,
        clock: () => '2026-06-05T09:00:00.000Z',
        makeId: () => 'generated-id',
    });

    return { store, metadata, blobs };
}

function createImageInput(overrides: Partial<ArchiveImage> = {}) {
    return {
        id: overrides.id,
        url: overrides.url ?? 'data:image/png;base64,flat-preview',
        prompt: 'prompt',
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        timestamp: overrides.timestamp,
        model: overrides.model,
        width: 1024,
        height: 1024,
        favorite: overrides.favorite,
        references: overrides.references,
        actualParameters: overrides.actualParameters,
        layerStack: overrides.layerStack,
    };
}

function createLayerStack(prefix: string, layerIds: string[]): ArchiveLayerStack {
    return {
        canvasWidth: 1024,
        canvasHeight: 1024,
        layers: layerIds.map((layerId, index) => ({
            id: layerId,
            name: index === 0 ? 'Base' : layerId,
            kind: index === 0 ? 'base' : 'uploaded',
            assetUrl: `data:image/png;base64,${prefix}-${layerId}`,
            x: index * 20,
            y: index * 20,
            width: index === 0 ? 1024 : 400,
            height: index === 0 ? 1024 : 400,
            rotation: index * 5,
            opacity: 1,
            blendMode: 'normal',
            visible: true,
            locked: index === 0,
        })),
    };
}
