import { describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '../services/StorageService';
import { createGenerateSessionStore, DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft, transferSimilarFromArchive, type GenerateBatchSnapshot } from './GenerateSession';
import type { LineageStep } from '../lineage/LineageStore';

describe('GenerateSession draft migration', () => {
    it('loads a retired GPT Image draft as Flare without losing its controls', async () => {
        const blobStorage = new InMemoryStorageProvider();
        const legacyDraft = {
            model: 'gpt-image-2', prompt: 'keep my prompt',
            gptImage2: { quality: 'high', size: '1536x1024', background: 'transparent', batchSize: 3 },
        };
        const localStorage = { getItem: () => JSON.stringify(legacyDraft) } as unknown as Storage;
        const store = createGenerateSessionStore({ blobStorage, localStorage });
        const expected = {
            model: 'gpt-image-2.5-flare', prompt: 'keep my prompt',
            gptImage: legacyDraft.gptImage2,
        };
        expect(store.readDraft()).toMatchObject(expected);
        await blobStorage.save('generate_current_batch', JSON.stringify({
            results: [{ slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,old' }],
            draft: legacyDraft,
        }));
        expect((await store.loadCurrentBatch())?.draft).toMatchObject(expected);
    });

    it('Create Similar restores the saved Qwen batch size from generation lineage', async () => {
        const store = createGenerateSessionStore({ blobStorage: new InMemoryStorageProvider() });
        const image = {
            id: 'saved-qwen-batch-result', url: 'data:image/png;base64,AA', prompt: 'cutout',
            model: 'qwen-image-2.1', quality: '2K', aspectRatio: '3:4', background: 'transparent',
            timestamp: '2026-09-22T10:00:00.000Z',
        };
        const generationStep: LineageStep = {
            id: 'generation-step', archiveImageId: image.id, parentStepId: null,
            stepType: 'generation', timestamp: image.timestamp,
            metadata: { imageModel: { slug: 'qwen-image-2.1', controls: {
                aspectRatio: '3:4', imageSize: '2K', background: 'transparent', batchSize: 3,
            } } },
        };
        const laterEdit: LineageStep = {
            ...generationStep, id: 'later-edit', parentStepId: generationStep.id,
            stepType: 'manual-edit', timestamp: '2026-09-22T11:00:00.000Z',
            metadata: {},
        };

        await transferSimilarFromArchive(image, store, {
            getByArchiveImageId: async () => [generationStep, laterEdit],
            getById: async (stepId) => stepId === generationStep.id ? generationStep : null,
        });

        expect(store.readDraft()).toMatchObject({
            model: 'qwen-image-2.1', prompt: 'cutout',
            qwenImage2_1: { aspectRatio: '3:4', imageSize: '2K', background: 'transparent', batchSize: 3 },
        });
        expect(store.loadLineageSource()).toEqual({ archiveImageId: image.id });
    });

    it('Create Similar follows an Editor copy to its source Qwen generation controls', async () => {
        const store = createGenerateSessionStore({ blobStorage: new InMemoryStorageProvider() });
        const copiedImage = {
            id: 'edited-copy', url: 'data:image/png;base64,edited', prompt: 'edited cutout',
            model: 'qwen-image-2.1', quality: '2K', aspectRatio: '3:4', background: 'transparent',
            timestamp: '2026-09-23T10:00:00.000Z',
        };
        const generationStep: LineageStep = {
            id: 'source-generation', archiveImageId: 'source-image', parentStepId: null,
            stepType: 'generation', timestamp: '2026-09-22T10:00:00.000Z',
            metadata: { imageModel: { slug: 'qwen-image-2.1', controls: {
                aspectRatio: '3:4', imageSize: '2K', background: 'transparent', batchSize: 3,
            } } },
        };
        const copyStep: LineageStep = {
            id: 'copy-step', archiveImageId: copiedImage.id, parentStepId: generationStep.id,
            stepType: 'save-as-copy', timestamp: copiedImage.timestamp, metadata: {},
        };
        const lineage = {
            getByArchiveImageId: async (archiveImageId: string) => archiveImageId === copiedImage.id ? [copyStep] : [],
            getById: async (stepId: string) => stepId === generationStep.id ? generationStep : null,
        };

        await transferSimilarFromArchive(copiedImage, store, lineage);

        expect(store.readDraft()).toMatchObject({
            model: 'qwen-image-2.1', prompt: 'edited cutout',
            qwenImage2_1: { aspectRatio: '3:4', imageSize: '2K', background: 'transparent', batchSize: 3 },
        });
        expect(store.loadLineageSource()).toEqual({ archiveImageId: copiedImage.id });
    });
    it('adds default Qwen controls to legacy persisted batch drafts', async () => {
        const blobStorage = new InMemoryStorageProvider();
        await blobStorage.save('generate_current_batch', JSON.stringify({
            results: [{ slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,AA' }],
            draft: { ...DEFAULT_GENERATE_DRAFT, qwenImage2_1: undefined },
        }));
        const batch = await createGenerateSessionStore({ blobStorage }).loadCurrentBatch();
        expect(batch?.draft?.qwenImage2_1).toEqual(DEFAULT_GENERATE_DRAFT.qwenImage2_1);
    });
    it('migrates legacy flat controls into the shared GPT Image block', () => {
        expect(sanitizeGenerateDraft({
            prompt: 'legacy prompt',
            quality: 'high',
            aspectRatio: '1536x1024',
            background: 'transparent',
            style: '35mm film still',
            lighting: 'golden hour',
            palette: 'copper + teal + cream',
            isSaved: true,
        })).toEqual({
            ...DEFAULT_GENERATE_DRAFT,
            prompt: 'legacy prompt',
            style: '35mm film still',
            lighting: 'golden hour',
            palette: 'copper + teal + cream',
            gptImage: {
                quality: 'high',
                size: '1536x1024',
                background: 'transparent',
                batchSize: 1,
            },
            nanoBananaPro: {
                aspectRatio: '3:2',
                imageSize: '1K',
                batchSize: 1,
            },
            isSaved: true,
        });
    });

    it('preserves per-model controls when switching models', () => {
        expect(sanitizeGenerateDraft({
            model: 'nano-banana-pro',
            prompt: 'dual controls',
            gptImage: {
                quality: 'low',
                size: '1024x1536',
                background: 'opaque',
                batchSize: 7,
            },
            nanoBananaPro: {
                aspectRatio: '16:9',
                imageSize: '4K',
                batchSize: 9,
            },
        })).toMatchObject({
            model: 'nano-banana-pro',
            gptImage: {
                quality: 'low',
                size: '1024x1536',
                background: 'opaque',
                batchSize: 4,
            },
            nanoBananaPro: {
                aspectRatio: '16:9',
                imageSize: '4K',
                batchSize: 4,
            },
        });
    });

    it('persists the current result with its used Reference image snapshot', async () => {
        const store = createGenerateSessionStore({
            blobStorage: new InMemoryStorageProvider(),
        });
        const references = [
            'data:image/png;base64,used-ref-0',
            'data:image/png;base64,used-ref-1',
        ];

        const batch: GenerateBatchSnapshot = {
            results: [{ slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,result', isSaved: false }],
            references,
            draft: null,
            lineageSource: null,
        };
        await store.saveCurrentBatch(batch);

        await expect(store.loadCurrentBatch()).resolves.toEqual(batch);

        await store.saveCurrentBatch({ ...batch, references: null });

        expect((await store.loadCurrentBatch())?.references).toBeNull();

        await store.clearCurrentResult();

        await expect(store.loadCurrentBatch()).resolves.toBeNull();
    });

    it('clears stale current generation results when transferring an archive image into Generate', async () => {
        const store = createGenerateSessionStore({
            blobStorage: new InMemoryStorageProvider(),
        });
        await store.saveCurrentBatch({
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,stale-result',
                isSaved: false,
            }],
            references: ['data:image/png;base64,stale-ref'],
            draft: DEFAULT_GENERATE_DRAFT,
            lineageSource: { archiveImageId: 'old-source' },
        });

        await store.transferFromArchive({
            id: 'archive-image',
            url: 'data:image/png;base64,archive',
            prompt: 'use this image',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-06-05T12:00:00.000Z',
            width: 1024,
            height: 1024,
            model: 'gpt-image-2',
            references: ['data:image/png;base64,archive-ref'],
        });

        await expect(store.loadCurrentBatch()).resolves.toBeNull();
        await expect(store.consumeTransferredReferences()).resolves.toEqual(['data:image/png;base64,archive-ref']);
    });

    it('round-trips the current generation batch with slot state and run context', async () => {
        const store = createGenerateSessionStore({
            blobStorage: new InMemoryStorageProvider(),
        });
        const batch: GenerateBatchSnapshot = {
            results: [
                {
                    slotIndex: 0,
                    status: 'success',
                    imageUrl: 'data:image/png;base64,result-0',
                    isSaved: true,
                    archiveImageId: 'archive-0',
                    costLedger: {
                        version: 1,
                        currency: 'USD',
                        items: [{
                            id: 'image-generation:openai:gpt-image-2',
                            kind: 'image-generation',
                            operation: 'image-generation',
                            provider: 'openai',
                            model: 'gpt-image-2',
                            label: 'Image generation 1',
                            status: 'calculated',
                            currency: 'USD',
                            amountUsd: 0.04,
                        }],
                    },
                },
                {
                    slotIndex: 1,
                    status: 'failed',
                    error: 'content filter',
                },
                {
                    slotIndex: 2,
                    status: 'success',
                    imageUrl: 'data:image/png;base64,result-2',
                    isSaved: false,
                },
            ],
            references: ['data:image/png;base64,used-ref'],
            draft: {
                ...DEFAULT_GENERATE_DRAFT,
                prompt: 'stored run prompt',
                gptImage: {
                    ...DEFAULT_GENERATE_DRAFT.gptImage,
                    batchSize: 3,
                },
            },
            lineageSource: {
                archiveImageId: 'source-image',
                stepId: 'source-step',
            },
        };

        await store.saveCurrentBatch(batch);

        await expect(store.loadCurrentBatch()).resolves.toEqual(batch);
    });

    it('migrates legacy single-result storage into a one-item generation batch', async () => {
        const blobStorage = new InMemoryStorageProvider();
        await blobStorage.save('generate_current_result', 'data:image/png;base64,legacy-result');
        await blobStorage.save('generate_current_result_references', JSON.stringify([
            'data:image/png;base64,legacy-ref',
        ]));
        const store = createGenerateSessionStore({ blobStorage });

        await expect(store.loadCurrentBatch()).resolves.toEqual({
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,legacy-result',
                isSaved: false,
            }],
            references: ['data:image/png;base64,legacy-ref'],
            draft: null,
            lineageSource: null,
        });
    });
});

class InMemoryStorageProvider implements StorageProvider {
    private readonly values = new Map<string, string>();

    async save(key: string, data: string): Promise<void> {
        this.values.set(key, data);
    }

    async load(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }

    async remove(key: string): Promise<void> {
        this.values.delete(key);
    }

    async listKeys(): Promise<string[]> {
        return Array.from(this.values.keys());
    }
}

const transferLocalKeys = ['aura_generate_draft', 'generate_lineage_source',
    'aura_generate_prompt', 'aura_generate_quality', 'aura_generate_aspect_ratio',
    'aura_generate_background', 'aura_generate_style', 'aura_generate_lighting',
    'aura_generate_palette', 'aura_generate_is_saved'];
const transferBlobKeys = ['generate_current_batch', 'generate_current_result',
    'generate_current_result_references', 'generate_transferred_references'];

describe('Create Similar transfer recovery', () => {
    it('keeps the later transfer when an overlapping earlier transfer fails', async () => {
        const values = new InMemoryStorageProvider();
        let releaseFirst!: () => void;
        let firstStarted!: () => void;
        const firstBlocked = new Promise<void>((resolve) => { firstStarted = resolve; });
        const release = new Promise<void>((resolve) => { releaseFirst = resolve; });
        const localValues = new Map<string, string>();
        const localStorage: Storage = {
            get length() { return localValues.size; },
            clear: () => localValues.clear(), key: (index) => [...localValues.keys()][index] ?? null,
            getItem: (key) => localValues.get(key) ?? null,
            setItem: (key, value) => { localValues.set(key, value); },
            removeItem: (key) => { localValues.delete(key); },
        };
        const store = createGenerateSessionStore({ localStorage, blobStorage: {
            load: (key) => values.load(key), remove: (key) => values.remove(key),
            listKeys: () => values.listKeys(),
            save: async (key, value) => {
                await values.save(key, value);
                if (key === 'generate_transferred_references' && value === '["first-reference"]') {
                    firstStarted();
                    await release;
                    throw new Error('first transfer failed');
                }
            },
        } });
        store.writeDraft({ ...DEFAULT_GENERATE_DRAFT, prompt: 'original prompt' });
        const image = {
            id: 'first', url: 'image', prompt: 'first prompt', timestamp: '2026-10-24',
            references: ['first-reference'], quality: 'high', aspectRatio: '1024x1024', background: 'auto',
        };
        const first = store.transferFromArchive(image);
        const firstRejected = expect(first).rejects.toThrow('first transfer failed');
        await firstBlocked;
        const second = store.transferFromArchive({ ...image, id: 'second', prompt: 'second prompt', references: ['second-reference'] });
        await new Promise((resolve) => setTimeout(resolve, 20));
        releaseFirst();
        await firstRejected;
        await second;

        expect(store.readDraft().prompt).toBe('second prompt');
        expect(store.loadLineageSource()).toEqual({ archiveImageId: 'second' });
        await expect(store.consumeTransferredReferences()).resolves.toEqual(['second-reference']);
        await expect(store.loadCurrentBatch()).resolves.toBeNull();
    });

    it.each([...transferLocalKeys, ...transferBlobKeys])('restores all raw session state when mutating %s fails', async (failedKey) => {
        const localValues = new Map(transferLocalKeys.map((key) => [key, `raw old ${key}`]));
        const blobValues = new Map(transferBlobKeys.map((key) => [key, `raw old ${key}`]));
        const beforeLocal = new Map(localValues);
        const beforeBlobs = new Map(blobValues);
        let failed = false;
        const fail = (key: string) => {
            if (key === failedKey && !failed) { failed = true; throw new Error('mutation failed'); }
        };
        const localStorage: Storage = {
            get length() { return localValues.size; },
            clear: () => localValues.clear(), key: (index) => [...localValues.keys()][index] ?? null,
            getItem: (key) => localValues.get(key) ?? null,
            setItem: (key, value) => { localValues.set(key, value); fail(key); },
            removeItem: (key) => { localValues.delete(key); fail(key); },
        };
        const blobStorage: StorageProvider = {
            load: async (key) => blobValues.get(key) ?? null,
            save: async (key, value) => { blobValues.set(key, value); fail(key); },
            remove: async (key) => {
                if (failedKey === 'generate_current_batch' && key === 'generate_current_result') {
                    await new Promise((resolve) => setTimeout(resolve, 20));
                }
                blobValues.delete(key); fail(key);
            },
            listKeys: async () => [...blobValues.keys()],
        };
        const store = createGenerateSessionStore({ localStorage, blobStorage });
        await expect(store.transferFromArchive({
            id: 'new-source', url: 'new-image', prompt: 'new prompt', timestamp: '2026-10-24',
            references: ['new-reference'], quality: 'high', aspectRatio: '1024x1024', background: 'auto',
        })).rejects.toThrow('mutation failed');
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(localValues).toEqual(beforeLocal);
        expect(blobValues).toEqual(beforeBlobs);
    });

    it('attempts independent restorations after one restoration rejects', async () => {
        const values = new Map(transferBlobKeys.map((key) => [key, `old ${key}`]));
        const save = vi.fn(async (key: string, value: string) => {
            if (key === 'generate_transferred_references' || key === 'generate_current_batch') throw new Error('storage unavailable');
            values.set(key, value);
        });
        const store = createGenerateSessionStore({ blobStorage: {
            load: async (key) => values.get(key) ?? null, save,
            remove: async (key) => { values.delete(key); }, listKeys: async () => [...values.keys()],
        } });
        await expect(store.transferFromArchive({
            id: 'new', url: 'new', prompt: 'new', timestamp: '2026-10-24', references: ['new'],
            quality: 'high', aspectRatio: '1024x1024', background: 'auto',
        })).rejects.toThrow();
        expect(save).toHaveBeenCalledWith('generate_current_result', 'old generate_current_result');
        expect(save).toHaveBeenCalledWith('generate_current_result_references', 'old generate_current_result_references');
    });
});
