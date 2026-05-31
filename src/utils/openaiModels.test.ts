import { describe, expect, it } from 'vitest';
import {
    DEFAULT_IMAGE_MODEL,
    IMAGE_MODEL_REGISTRY,
    OPENAI_IMAGE_MODEL,
    resolveImageModelConfig,
} from './openaiModels';

describe('openaiModels image registry', () => {
    it('keeps gpt-image-2 as the default image model', () => {
        expect(DEFAULT_IMAGE_MODEL).toBe(OPENAI_IMAGE_MODEL);
    });

    it('maps gpt-image-2 to the OpenAI provider contract used today', () => {
        expect(resolveImageModelConfig(OPENAI_IMAGE_MODEL)).toEqual(IMAGE_MODEL_REGISTRY[OPENAI_IMAGE_MODEL]);
        expect(IMAGE_MODEL_REGISTRY[OPENAI_IMAGE_MODEL]).toMatchObject({
            slug: OPENAI_IMAGE_MODEL,
            provider: 'openai',
            apiModel: OPENAI_IMAGE_MODEL,
            endpoints: {
                generate: 'https://api.openai.com/v1/images/generations',
                edit: 'https://api.openai.com/v1/images/edits',
            },
            parameters: {
                size: 'size',
                quality: 'quality',
                background: 'background',
            },
        });
    });

    it('rejects unknown image model slugs', () => {
        expect(() => resolveImageModelConfig('unknown-model')).toThrow('Unknown image model: unknown-model');
    });
});
