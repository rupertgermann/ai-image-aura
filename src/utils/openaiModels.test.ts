import { describe, expect, it } from 'vitest';
import {
    DEFAULT_IMAGE_MODEL,
    GEMINI_FLASH_REASONING_MODEL,
    IMAGE_MODEL_REGISTRY,
    NANO_BANANA_PRO_IMAGE_MODEL,
    QWEN_IMAGE_2_1_IMAGE_MODEL,
    LOCAL_PROVIDER,
    OPENAI_IMAGE_MODEL,
    OPENAI_SUNBURST_IMAGE_MODEL,
    getImageModelLabel,
    isStoredImageModelSlug,
    OPENAI_RESPONSES_MODEL,
    REASONING_MODEL_REGISTRY,
    resolveImageModelConfig,
    isImageModelSlug,
    resolveReasoningModelConfig,
    isReasoningModelSlug,
    sanitizeReasoningModel,
    getProviderLabel,
} from './openaiModels';

describe('openaiModels image registry', () => {
    it('defaults to GPT Image 2.5 Flare', () => {
        expect(DEFAULT_IMAGE_MODEL).toBe('gpt-image-2.5-flare');
        expect(DEFAULT_IMAGE_MODEL).toBe(OPENAI_IMAGE_MODEL);
    });

    it.each([
        ['gpt-image-2.5-flare', 'GPT Image 2.5 Flare'],
        ['gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst'],
    ])('maps %s to the OpenAI image contract', (slug, label) => {
        expect(resolveImageModelConfig(slug)).toMatchObject({
            slug,
            label,
            provider: 'openai',
            apiModel: slug,
            endpoints: {
                generate: 'https://api.openai.com/v1/images/generations',
                edit: 'https://api.openai.com/v1/images/edits',
            },
            parameters: {
                size: 'size',
                quality: 'quality',
                background: 'background',
            },
            capabilities: {
                transformMask: true,
                partialImageStreaming: true,
            },
        });
    });

    it('keeps retired image models readable but unavailable for use', () => {
        expect(OPENAI_SUNBURST_IMAGE_MODEL).toBe('gpt-image-2.5-sunburst');
        expect(isImageModelSlug('gpt-image-2')).toBe(false);
        expect(isStoredImageModelSlug('gpt-image-2')).toBe(true);
        expect(isStoredImageModelSlug(OPENAI_IMAGE_MODEL)).toBe(true);
        expect(isStoredImageModelSlug('toString')).toBe(false);
        expect(isStoredImageModelSlug(null)).toBe(false);
        expect(isStoredImageModelSlug('unknown-model')).toBe(false);
        expect(getImageModelLabel('gpt-image-2')).toBe('GPT Image 2 (retired)');
        expect(getImageModelLabel(OPENAI_IMAGE_MODEL)).toBe('GPT Image 2.5 Flare');
        expect(getImageModelLabel('unknown-model')).toBe('unknown-model');
        expect(getImageModelLabel('toString')).toBe('toString');
        expect(() => resolveImageModelConfig('gpt-image-2')).toThrow('Unknown image model: gpt-image-2');
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
            capabilities: {
                transformMask: false,
            },
        });
    });

    it('registers Qwen Image 2.1 on the Local server', () => {
        expect(IMAGE_MODEL_REGISTRY[QWEN_IMAGE_2_1_IMAGE_MODEL]).toMatchObject({
            slug: 'qwen-image-2.1',
            provider: LOCAL_PROVIDER,
            apiModel: 'qwen-image-2.1',
            label: 'Qwen Image 2.1',
            endpoints: { generate: '/v1/images/generations', edit: '/v1/images/edits' },
            capabilities: { transformMask: false, partialImageStreaming: false },
        });
        expect(isImageModelSlug('qwen-image-2.1')).toBe(true);
        expect(getProviderLabel(LOCAL_PROVIDER)).toBe('Local server');
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
        expect(OPENAI_RESPONSES_MODEL).toBe('gpt-6-sol');
        expect(isReasoningModelSlug('gpt-5.4')).toBe(false);
        expect(resolveReasoningModelConfig(OPENAI_RESPONSES_MODEL)).toEqual(REASONING_MODEL_REGISTRY[OPENAI_RESPONSES_MODEL]);
        expect(REASONING_MODEL_REGISTRY[OPENAI_RESPONSES_MODEL]).toMatchObject({
            provider: 'openai',
            apiModel: OPENAI_RESPONSES_MODEL,
            label: 'GPT 6 Sol',
            endpoint: 'https://api.openai.com/v1/responses',
        });
        expect(REASONING_MODEL_REGISTRY[GEMINI_FLASH_REASONING_MODEL]).toMatchObject({
            provider: 'google',
            apiModel: GEMINI_FLASH_REASONING_MODEL,
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        });
    });

    it('sanitizes retired or invalid reasoning preferences without changing active choices', () => {
        expect(sanitizeReasoningModel('gpt-5.4')).toBe('gpt-6-sol');
        expect(sanitizeReasoningModel('unknown-model')).toBe('gpt-6-sol');
        expect(sanitizeReasoningModel(null)).toBe('gpt-6-sol');
        expect(sanitizeReasoningModel(GEMINI_FLASH_REASONING_MODEL)).toBe(GEMINI_FLASH_REASONING_MODEL);
        expect(sanitizeReasoningModel(OPENAI_RESPONSES_MODEL)).toBe(OPENAI_RESPONSES_MODEL);
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
