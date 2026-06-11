import { describe, expect, it } from 'vitest';
import type { StorageProvider } from '../services/StorageService';
import { createGenerateSessionStore, DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft, type GenerateBatchSnapshot } from './GenerateSession';

describe('GenerateSession draft migration', () => {
    it('migrates legacy flat controls into the gpt-image-2 block', () => {
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
            gptImage2: {
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
            gptImage2: {
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
            gptImage2: {
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

        await store.saveCurrentResult('data:image/png;base64,result', references);

        await expect(store.loadCurrentResult()).resolves.toBe('data:image/png;base64,result');
        await expect(store.loadCurrentResultReferences()).resolves.toEqual(references);

        await store.saveCurrentResult('data:image/png;base64,legacy-result');

        await expect(store.loadCurrentResultReferences()).resolves.toBeNull();

        await store.clearCurrentResult();

        await expect(store.loadCurrentResult()).resolves.toBeNull();
        await expect(store.loadCurrentResultReferences()).resolves.toBeNull();
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
        await expect(store.loadCurrentResult()).resolves.toBeNull();
        await expect(store.loadCurrentResultReferences()).resolves.toBeNull();
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
                gptImage2: {
                    ...DEFAULT_GENERATE_DRAFT.gptImage2,
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
        await expect(store.loadCurrentResult()).resolves.toBe('data:image/png;base64,result-0');
        await expect(store.loadCurrentResultReferences()).resolves.toEqual(['data:image/png;base64,used-ref']);
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

    async clearAll(): Promise<void> {
        this.values.clear();
    }

    async listKeys(): Promise<string[]> {
        return Array.from(this.values.keys());
    }
}
