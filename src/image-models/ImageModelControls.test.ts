import { describe, expect, it } from 'vitest';
import {
    buildImageModelArchiveFields,
    coerceImageModelControlValue,
    getDefaultImageModelControls,
    getImageModelReferenceCapacityMessage,
    getImageModelReferenceLimitMessage,
    mapImageModelEditProviderRequest,
    mapImageModelGenerateProviderRequest,
    sanitizeImageModelControls,
} from './ImageModelControls';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL } from '../utils/openaiModels';

describe('Image model controls', () => {
    it.each([OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL] as const)('uses shared GPT Image controls for %s', (model) => {
        expect(sanitizeImageModelControls(model, { quality: 'invalid' }).quality).toBe('medium');
        for (const quality of ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const) {
            const controls = { quality, size: '1536x1024', background: 'transparent' as const, batchSize: 4 };
            expect(sanitizeImageModelControls(model, controls)).toEqual(controls);
            expect(coerceImageModelControlValue(model, 'quality', quality)).toBe(quality);
            expect(buildImageModelArchiveFields(model, controls)).toEqual({
                quality, aspectRatio: '1536x1024', background: 'transparent', width: 1536, height: 1024,
            });
            expect(mapImageModelGenerateProviderRequest(model, {
                ...controls, aspectRatio: controls.size, referenceImages: [],
            })).toEqual({ ...controls, referenceImages: [] });
            expect(mapImageModelEditProviderRequest(model, {
                quality, sourceImage: new File(['source'], 'source.png'), referenceImages: [],
            }).quality).toBe(quality);
        }
    });

    it('keeps a snapped Qwen edit request within the one-megapixel budget', () => {
        const request = mapImageModelEditProviderRequest(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            sourceImage: new File(['source'], 'source.png'), referenceImages: [],
            sourceDimensions: { width: 2000, height: 1000 },
        });
        expect(request.size).toBe('1440x704');
        const [width, height] = request.size!.split('x').map(Number);
        expect(width * height).toBeLessThanOrEqual(1024 * 1024);
        expect(width % 32).toBe(0);
        expect(height % 32).toBe(0);

        const nearSquare = mapImageModelEditProviderRequest(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            sourceImage: new File(['source'], 'source.png'), referenceImages: [],
            sourceDimensions: { width: 1010, height: 1010 },
        });
        expect(nearSquare.size).toBe('992x992');
    });

    it('sanitizes Qwen controls and caps references including the Editor target', () => {
        expect(sanitizeImageModelControls(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            aspectRatio: '21:9', imageSize: '4K', background: 'opaque', batchSize: 20,
        })).toEqual({ aspectRatio: '1:1', imageSize: '768', background: 'auto', batchSize: 4 });
        const files = Array.from({ length: 12 }, (_, index) => new File(['x'], `${index}.png`));
        expect(mapImageModelEditProviderRequest(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            sourceImage: files[0], compositionContextImage: files[1], referenceImages: files.slice(2),
            sourceDimensions: { width: 2048, height: 1024 },
        })).toEqual({
            size: '1440x704',
            referenceImages: files.slice(0, 10),
        });
        expect(mapImageModelEditProviderRequest(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            sourceImage: files[0], referenceImages: [],
        })).toEqual({ referenceImages: [files[0]] });
    });

    it('warns when Qwen Editor context leaves room for only eight user references', () => {
        const sourceImage = new File(['target'], 'target.png');
        const compositionContextImage = new File(['context'], 'context.png');
        const userReferences = Array.from({ length: 9 }, (_, index) => new File(['ref'], `ref-${index}.png`));

        expect(getImageModelReferenceLimitMessage(QWEN_IMAGE_2_1_IMAGE_MODEL, 8, 'AI transforms', 2)).toBeNull();
        expect(getImageModelReferenceLimitMessage(QWEN_IMAGE_2_1_IMAGE_MODEL, 9, 'AI transforms', 2)).toBe(
            'Qwen Image 2.1 uses the first 8 reference images for AI transforms.',
        );
        expect(getImageModelReferenceLimitMessage(QWEN_IMAGE_2_1_IMAGE_MODEL, 9, 'AI transforms', 1)).toBeNull();
        expect(getImageModelReferenceLimitMessage(QWEN_IMAGE_2_1_IMAGE_MODEL, 10, 'AI transforms', 1)).toBe(
            'Qwen Image 2.1 uses the first 9 reference images for AI transforms.',
        );
        expect(mapImageModelEditProviderRequest(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            sourceImage,
            compositionContextImage,
            referenceImages: userReferences,
        }).referenceImages).toEqual([sourceImage, compositionContextImage, ...userReferences.slice(0, 8)]);
        expect(mapImageModelEditProviderRequest(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            sourceImage,
            referenceImages: userReferences,
        }).referenceImages).toEqual([sourceImage, ...userReferences]);
    });

    it('validates defaults and coercion for both Image models', () => {
        expect(sanitizeImageModelControls(OPENAI_IMAGE_MODEL, {
            quality: 'best',
            size: '1600x900',
            background: 'clear',
            batchSize: 99,
        })).toEqual({
            ...getDefaultImageModelControls(OPENAI_IMAGE_MODEL),
            batchSize: 4,
        });
        expect(sanitizeImageModelControls(OPENAI_IMAGE_MODEL, {
            batchSize: '4',
        })).toEqual({
            ...getDefaultImageModelControls(OPENAI_IMAGE_MODEL),
            batchSize: 4,
        });
        expect(sanitizeImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL, {
            aspectRatio: '1536x1024',
            imageSize: '4K',
            batchSize: 8,
        })).toEqual({
            aspectRatio: '3:2',
            imageSize: '4K',
            batchSize: 4,
        });
        expect(coerceImageModelControlValue(NANO_BANANA_PRO_IMAGE_MODEL, 'aspectRatio', '1024x1536')).toBe('2:3');
        expect(coerceImageModelControlValue(NANO_BANANA_PRO_IMAGE_MODEL, 'batchSize', '3')).toBe('3');
        expect(coerceImageModelControlValue(OPENAI_IMAGE_MODEL, 'quality', 'best')).toBe('medium');
        expect(coerceImageModelControlValue(OPENAI_IMAGE_MODEL, 'batchSize', '9')).toBe('4');
    });

    it('builds archive metadata dimensions for Generate saves through shared Image model controls', () => {
        expect(buildImageModelArchiveFields(OPENAI_IMAGE_MODEL, {
            quality: 'high',
            size: '1536x1024',
            background: 'transparent',
        })).toEqual({
            quality: 'high',
            aspectRatio: '1536x1024',
            background: 'transparent',
            width: 1536,
            height: 1024,
        });
        expect(buildImageModelArchiveFields(NANO_BANANA_PRO_IMAGE_MODEL, {
            aspectRatio: '16:9',
            imageSize: '2K',
        })).toEqual({
            quality: '2K',
            aspectRatio: '16:9',
            background: 'auto',
            width: 2048,
            height: 1152,
        });
    });

    it('maps Generate Provider requests for both Image models', () => {
        const references = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );

        expect(mapImageModelGenerateProviderRequest(OPENAI_IMAGE_MODEL, {
            quality: 'high',
            aspectRatio: ' 1536x1024 ',
            background: 'transparent',
            batchSize: 3,
            referenceImages: references,
        })).toEqual({
            quality: 'high',
            size: '1536x1024',
            background: 'transparent',
            batchSize: 3,
            referenceImages: references,
        });
        expect(mapImageModelGenerateProviderRequest(NANO_BANANA_PRO_IMAGE_MODEL, {
            quality: 'high',
            aspectRatio: '1024x1536',
            background: 'transparent',
            batchSize: 4,
            imageSize: '4K',
            referenceImages: references,
        })).toEqual({
            aspectRatio: '2:3',
            imageSize: '4K',
            batchSize: 4,
            referenceImages: references.slice(0, 14),
        });
    });

    it('reports when a Generate result cannot be appended as another Reference image', () => {
        expect(getImageModelReferenceCapacityMessage(OPENAI_IMAGE_MODEL, 50, 'generation')).toBeNull();
        expect(getImageModelReferenceCapacityMessage(NANO_BANANA_PRO_IMAGE_MODEL, 13, 'generation')).toBeNull();
        expect(getImageModelReferenceCapacityMessage(NANO_BANANA_PRO_IMAGE_MODEL, 14, 'generation')).toBe(
            'Nano Banana Pro already has 14 reference images for generation. Remove one before adding another.',
        );
    });

    it('maps Editor Provider requests with source and Reference image limits for each Image model', () => {
        const sourceImage = new File(['source'], 'source.png', { type: 'image/png' });
        const references = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );

        expect(mapImageModelEditProviderRequest(OPENAI_IMAGE_MODEL, {
            sourceImage,
            compositionContextImage: references[1],
            referenceImages: references.slice(0, 1),
            quality: 'low',
        })).toEqual({
            quality: 'low',
            size: '1024x1024',
            background: 'auto',
            referenceImages: [sourceImage, references[1], references[0]],
        });

        const nanoRequest = mapImageModelEditProviderRequest(NANO_BANANA_PRO_IMAGE_MODEL, {
            sourceImage,
            compositionContextImage: new File(['context'], 'composition-context.png', { type: 'image/png' }),
            referenceImages: references,
        });

        expect(nanoRequest).toEqual({
            aspectRatio: '1:1',
            imageSize: '1K',
            preserveSourceDimensions: true,
            referenceImages: [
                sourceImage,
                expect.objectContaining({ name: 'composition-context.png' }),
                ...references.slice(0, 14),
            ],
        });
        expect(nanoRequest.referenceImages).toHaveLength(16);
    });
});
