import { describe, expect, it } from 'vitest';
import {
    GEMINI_FLASH_REASONING_MODEL,
    OPENAI_IMAGE_MODEL,
    getImageModelLabel,
    isStoredImageModelSlug,
    OPENAI_RESPONSES_MODEL,
    resolveImageModelConfig,
    isImageModelSlug,
    resolveReasoningModelConfig,
    isReasoningModelSlug,
    sanitizeReasoningModel,
} from './openaiModels';

describe('openaiModels image registry', () => {

    it('keeps retired image models readable but unavailable for use', () => {
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

    it('rejects unknown image model slugs', () => {
        expect(() => resolveImageModelConfig('unknown-model')).toThrow('Unknown image model: unknown-model');
    });

    it('rejects inherited image model keys', () => {
        expect(() => resolveImageModelConfig('toString')).toThrow('Unknown image model: toString');
        expect(isImageModelSlug('toString')).toBe(false);
    });

    it('only accepts strings for image model slugs', () => {
        expect(isImageModelSlug(null)).toBe(false);
        expect(isImageModelSlug(123)).toBe(false);
        expect(isImageModelSlug({})).toBe(false);
    });

    it('sanitizes retired or invalid reasoning preferences without changing active choices', () => {
        expect(sanitizeReasoningModel('gpt-5.4')).toBe('gpt-6-sol');
        expect(sanitizeReasoningModel('unknown-model')).toBe('gpt-6-sol');
        expect(sanitizeReasoningModel(null)).toBe('gpt-6-sol');
        expect(sanitizeReasoningModel(GEMINI_FLASH_REASONING_MODEL)).toBe(GEMINI_FLASH_REASONING_MODEL);
        expect(sanitizeReasoningModel(OPENAI_RESPONSES_MODEL)).toBe(OPENAI_RESPONSES_MODEL);
    });

    it('rejects unknown reasoning model slugs', () => {
        expect(() => resolveReasoningModelConfig('unknown-model')).toThrow('Unknown reasoning model: unknown-model');
    });

    it('rejects inherited reasoning model keys', () => {
        expect(() => resolveReasoningModelConfig('toString')).toThrow('Unknown reasoning model: toString');
        expect(isReasoningModelSlug('toString')).toBe(false);
    });

    it('only accepts strings for reasoning model slugs', () => {
        expect(isReasoningModelSlug(null)).toBe(false);
        expect(isReasoningModelSlug(456)).toBe(false);
        expect(isReasoningModelSlug([])).toBe(false);
    });
});
