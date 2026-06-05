import { describe, expect, it } from 'vitest';
import type { StorageProvider } from '../services/StorageService';
import { createGenerateSessionStore, DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft } from './GenerateSession';

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
            },
            nanoBananaPro: {
                aspectRatio: '3:2',
                imageSize: '1K',
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
            },
            nanoBananaPro: {
                aspectRatio: '16:9',
                imageSize: '4K',
            },
        })).toMatchObject({
            model: 'nano-banana-pro',
            gptImage2: {
                quality: 'low',
                size: '1024x1536',
                background: 'opaque',
            },
            nanoBananaPro: {
                aspectRatio: '16:9',
                imageSize: '4K',
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
