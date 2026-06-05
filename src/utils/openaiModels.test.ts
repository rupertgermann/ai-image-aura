import { describe, expect, it } from 'vitest';
import {
    DEFAULT_IMAGE_MODEL,
    GEMINI_FLASH_REASONING_MODEL,
    IMAGE_MODEL_REGISTRY,
    NANO_BANANA_PRO_IMAGE_MODEL,
    OPENAI_IMAGE_MODEL,
    OPENAI_RESPONSES_MODEL,
    REASONING_MODEL_REGISTRY,
    resolveImageModelConfig,
    isImageModelSlug,
    resolveReasoningModelConfig,
    isReasoningModelSlug,
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

    it('maps nano-banana-pro to the Google image provider contract', () => {
        expect(IMAGE_MODEL_REGISTRY[NANO_BANANA_PRO_IMAGE_MODEL]).toMatchObject({
            slug: NANO_BANANA_PRO_IMAGE_MODEL,
            provider: 'google',
            apiModel: 'gemini-3-pro-image-preview',
            endpoints: {
                generate: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
                edit: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
            },
            parameters: {
                aspectRatio: 'generationConfig.imageConfig.aspectRatio',
                imageSize: 'generationConfig.imageConfig.imageSize',
            },
        });
    });

    it('defaults image model config to OpenAI image model when no slug is provided', () => {
        expect(resolveImageModelConfig()).toEqual(IMAGE_MODEL_REGISTRY[OPENAI_IMAGE_MODEL]);
    });

    it('rejects unknown image model slugs', () => {
        expect(() => resolveImageModelConfig('unknown-model')).toThrow('Unknown image model: unknown-model');
    });

    it('rejects inherited image model keys', () => {
        expect(() => resolveImageModelConfig('toString')).toThrow('Unknown image model: toString');
        expect(isImageModelSlug('toString')).toBe(false);
    });

    it('correctly validates image model slugs', () => {
        expect(isImageModelSlug(OPENAI_IMAGE_MODEL)).toBe(true);
        expect(isImageModelSlug('unknown-model')).toBe(false);
    });

    it('only accepts strings for image model slugs', () => {
        expect(isImageModelSlug(null)).toBe(false);
        expect(isImageModelSlug(123)).toBe(false);
        expect(isImageModelSlug({})).toBe(false);
    });

    it('maps reasoning models to independent providers', () => {
        expect(resolveReasoningModelConfig(OPENAI_RESPONSES_MODEL)).toEqual(REASONING_MODEL_REGISTRY[OPENAI_RESPONSES_MODEL]);
        expect(REASONING_MODEL_REGISTRY[OPENAI_RESPONSES_MODEL]).toMatchObject({
            provider: 'openai',
            apiModel: OPENAI_RESPONSES_MODEL,
        });
        expect(REASONING_MODEL_REGISTRY[GEMINI_FLASH_REASONING_MODEL]).toMatchObject({
            provider: 'google',
            apiModel: GEMINI_FLASH_REASONING_MODEL,
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        });
    });

    it('defaults reasoning model config to OpenAI response model when no slug is provided', () => {
        expect(resolveReasoningModelConfig()).toEqual(REASONING_MODEL_REGISTRY[OPENAI_RESPONSES_MODEL]);
    });

    it('rejects unknown reasoning model slugs', () => {
        expect(() => resolveReasoningModelConfig('unknown-model')).toThrow('Unknown reasoning model: unknown-model');
    });

    it('rejects inherited reasoning model keys', () => {
        expect(() => resolveReasoningModelConfig('toString')).toThrow('Unknown reasoning model: toString');
        expect(isReasoningModelSlug('toString')).toBe(false);
    });

    it('correctly validates reasoning model slugs', () => {
        expect(isReasoningModelSlug(OPENAI_RESPONSES_MODEL)).toBe(true);
        expect(isReasoningModelSlug('unknown-model')).toBe(false);
    });

    it('only accepts strings for reasoning model slugs', () => {
        expect(isReasoningModelSlug(null)).toBe(false);
        expect(isReasoningModelSlug(456)).toBe(false);
        expect(isReasoningModelSlug([])).toBe(false);
    });
});
