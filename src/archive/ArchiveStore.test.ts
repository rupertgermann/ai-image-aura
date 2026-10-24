import { describe, expect, it, vi } from 'vitest';
import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import { createArchiveStore } from './ArchiveStore';
import { saveArchiveImage, type SaveArchiveImageRequest } from './saveArchiveImage';
import type { SaveLineageStepInput } from '../lineage/LineageStore';

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

    async setFavorite(id: string, favorite: boolean) {
        const record = this.records.get(id);
        if (!record) {
            throw new Error('Archive image no longer exists');
        }
        this.records.set(id, { ...record, favorite: favorite ? true : undefined });
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

describe('archive and lineage completion', () => {
    it.each(['generation', 'copy', 'overwrite'] as const)('restores stored assets after %s lineage failure and retries without duplicates', async (kind) => {
        const { store, metadata, blobs } = createStore();
        const source = await store.save(createImageInput({
            id: 'source', favorite: true,
            references: ['data:image/png;base64,original-reference'],
            layerStack: createLayerStack('original', ['base', 'retained']),
        }));
        const baseline = await store.list();
        await expect(store.get('source')).resolves.toEqual(baseline[0]);
        await expect(store.get('missing')).resolves.toBeNull();
        const save = vi.fn(async (step: SaveLineageStepInput) => ({ ...step, id: 'new-step' }));
        save.mockRejectedValueOnce(new Error('Lineage unavailable'));
        const lineage = {
            getByArchiveImageId: vi.fn(async () => [{ id: 'previous-step', archiveImageId: source.id, parentStepId: null, stepType: 'generation' as const, timestamp: source.timestamp, metadata: {} }]),
            save,
        };
        const request: SaveArchiveImageRequest = kind === 'generation' ? {
            kind, image: { ...source, id: 'generated', url: 'data:image/png;base64,new' },
            source: { archiveImageId: source.id }, runDraft: null,
        } : {
            kind: 'edit', sourceImage: { ...source, url: 'data:image/png;base64,stale-source' },
            updatedUrl: 'data:image/png;base64,new',
            context: {
                isCopy: kind === 'copy', references: ['data:image/png;base64,new-reference'],
                adjustments: { brightness: 110, contrast: 95, saturation: 125, filter: 'none' },
                layerStack: createLayerStack('edited', ['base', 'new']),
            },
        };
        const deps = { archive: store, lineage, makeId: () => 'copy' };
        await expect(saveArchiveImage(request, deps)).rejects.toThrow('Lineage unavailable');
        const reloaded = createArchiveStore({ metadata, blobs });
        await expect(reloaded.list()).resolves.toEqual(baseline);
        const saved = await saveArchiveImage(request, { ...deps, archive: reloaded });
        expect(await reloaded.list()).toHaveLength(kind === 'overwrite' ? 1 : 2);
        expect(save.mock.calls.at(-1)?.[0]).toMatchObject({ archiveImageId: saved.id, parentStepId: 'previous-step' });
        expect(save).toHaveBeenCalledTimes(2);
    });

    it('reports lineage and compensation errors without claiming restoration', async () => {
        const { store } = createStore();
        const image = await store.save(createImageInput({ id: 'source' }));
        const lineageError = new Error('Lineage unavailable');
        const rollbackError = new Error('Rollback unavailable');
        const archive = { get: async () => null, save: async () => image, remove: vi.fn(async () => { throw rollbackError; }) };
        await expect(saveArchiveImage({ kind: 'generation', image, source: null, runDraft: null }, {
            archive,
            lineage: { getByArchiveImageId: async () => [], save: async () => { throw lineageError; } },
        })).rejects.toMatchObject({
            message: expect.stringContaining('Rollback unavailable'),
            errors: [lineageError, rollbackError],
        });
    });
});

describe('ArchiveStore compensation failures', () => {
    it.each(['image', 'reference'] as const)('restores other asset keys before reporting failed %s restoration', async (failedAsset) => {
        const { store, metadata, blobs } = createStore();
        await store.save(createImageInput({
            id: 'image-1',
            references: ['data:image/png;base64,old-reference'],
            layerStack: createLayerStack('old', ['base', 'retained']),
        }));
        const originalError = new Error('Metadata write failed');
        const assetError = new Error(`${failedAsset} restoration failed`);
        vi.spyOn(metadata, 'save').mockRejectedValueOnce(originalError);
        const saveBlob = blobs.save.bind(blobs);
        vi.spyOn(blobs, 'save').mockImplementation(async (key, data) => {
            if ((failedAsset === 'image' && key === 'img_image-1' && data === 'data:image/png;base64,flat-preview')
                || (failedAsset === 'reference' && key === 'ref_image-1_0' && data === 'data:image/png;base64,old-reference')) {
                throw assetError;
            }
            if (key === 'layer_image-1_base' && data === 'data:image/png;base64,old-base') {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            await saveBlob(key, data);
        });

        await expect(store.save(createImageInput({
            id: 'image-1', url: 'data:image/png;base64,new-preview',
            references: ['data:image/png;base64,new-reference', 'data:image/png;base64,extra-reference'],
            layerStack: createLayerStack('new', ['base', 'new-layer']),
        }))).rejects.toMatchObject({ errors: [originalError, assetError] });

        if (failedAsset === 'image') {
            expect(blobs.blobs.get('ref_image-1_0')).toBe('data:image/png;base64,old-reference');
        } else {
            expect(blobs.blobs.get('img_image-1')).toBe('data:image/png;base64,flat-preview');
        }
        expect(blobs.blobs.has('ref_image-1_1')).toBe(false);
        expect(blobs.blobs.get('layer_image-1_base')).toBe('data:image/png;base64,old-base');
        expect(blobs.blobs.get('layer_image-1_retained')).toBe('data:image/png;base64,old-retained');
        expect(blobs.blobs.has('layer_image-1_new-layer')).toBe(false);
    });

    it('reports every failed asset restoration while restoring unaffected keys', async () => {
        const { store, metadata, blobs } = createStore();
        await store.save(createImageInput({
            id: 'image-1', references: ['data:image/png;base64,old-reference'],
            layerStack: createLayerStack('old', ['base']),
        }));
        const originalError = new Error('Metadata write failed');
        const imageError = new Error('Image restoration failed');
        const referenceError = new Error('Reference restoration failed');
        const layerError = new Error('Layer restoration failed');
        vi.spyOn(metadata, 'save').mockRejectedValueOnce(originalError);
        const saveBlob = blobs.save.bind(blobs);
        vi.spyOn(blobs, 'save').mockImplementation(async (key, data) => {
            if (data === 'data:image/png;base64,flat-preview') throw imageError;
            if (data === 'data:image/png;base64,old-reference') throw referenceError;
            if (data === 'data:image/png;base64,old-base') throw layerError;
            await saveBlob(key, data);
        });

        await expect(store.save(createImageInput({
            id: 'image-1', url: 'data:image/png;base64,new-preview',
            references: ['data:image/png;base64,new-reference', 'data:image/png;base64,extra-reference'],
            layerStack: createLayerStack('new', ['base', 'new-layer']),
        }))).rejects.toMatchObject({
            errors: [originalError, { errors: [imageError, referenceError, layerError] }],
        });
        expect(blobs.blobs.has('ref_image-1_1')).toBe(false);
        expect(blobs.blobs.has('layer_image-1_new-layer')).toBe(false);
    });

    it.each(['overwrite', 'delete'] as const)('restores image assets after %s fails while metadata remains unavailable', async (operation) => {
        const { store, metadata, blobs } = createStore();
        await store.save(createImageInput({
            id: 'image-1',
            references: ['data:image/png;base64,old-reference'],
            layerStack: createLayerStack('old', ['base', 'retained']),
        }));
        const baseline = await store.get('image-1');
        const originalError = new Error('Metadata write failed');
        const rollbackError = new Error('Metadata restoration failed');
        vi.spyOn(metadata, 'save').mockRejectedValue(rollbackError);
        if (operation === 'overwrite') {
            vi.mocked(metadata.save).mockRejectedValueOnce(originalError);
        } else {
            vi.spyOn(metadata, 'remove').mockRejectedValue(originalError);
        }

        const write = operation === 'overwrite'
            ? store.save(createImageInput({
                id: 'image-1', url: 'data:image/png;base64,new-preview',
                references: ['data:image/png;base64,new-reference'],
                layerStack: createLayerStack('new', ['base', 'new-layer']),
            }))
            : store.remove('image-1');

        await expect(write).rejects.toMatchObject({
            message: expect.stringContaining('Metadata restoration failed'),
            errors: [originalError, rollbackError],
        });
        await expect(store.get('image-1')).resolves.toEqual(baseline);
        expect(blobs.blobs.has('layer_image-1_new-layer')).toBe(false);
    });

    it('reports the original failure and both failed compensations', async () => {
        const { store, metadata, blobs } = createStore();
        await store.save(createImageInput({ id: 'image-1' }));
        const originalError = new Error('Metadata write failed');
        const metadataError = new Error('Metadata restoration failed');
        const assetError = new Error('Asset restoration failed');
        vi.spyOn(metadata, 'save').mockRejectedValueOnce(originalError).mockRejectedValue(metadataError);
        const saveBlob = blobs.save.bind(blobs);
        vi.spyOn(blobs, 'save').mockImplementation(async (key, data) => {
            if (data === 'data:image/png;base64,flat-preview') {
                throw assetError;
            }
            await saveBlob(key, data);
        });

        await expect(store.save(createImageInput({ id: 'image-1', url: 'data:image/png;base64,new-preview' }))).rejects.toMatchObject({
            message: expect.stringContaining('Asset restoration failed'),
            errors: [originalError, metadataError, assetError],
        });
    });
});

describe('ArchiveStore layer asset ownership', () => {

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
        costLedger: overrides.costLedger,
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
