import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft } from './GenerateSession';

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
});
