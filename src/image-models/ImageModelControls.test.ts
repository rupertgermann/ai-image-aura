import { describe, expect, it } from 'vitest';
import {
    IMAGE_MODEL_CONTROL_FACTS,
    buildImageModelGenerateReferenceRunPlan,
    buildImageModelArchiveFields,
    coerceImageModelControlValue,
    getDefaultImageModelControls,
    getImageModelGenerateControls,
    getImageModelReferenceCapacityMessage,
    getImageModelReferenceLimitMessage,
    getImageModelUiChoices,
    imageModelSupportsTransformMask,
    limitReferenceImagesForImageModel,
    mapImageModelEditProviderRequest,
    mapImageModelGenerateProviderRequest,
    sanitizeImageModelControls,
} from './ImageModelControls';
import { IMAGE_MODEL_REGISTRY, NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL } from '../utils/openaiModels';

describe('Image model controls', () => {
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
    it('maps every Qwen aspect ratio and resolution to the fixed sd-server size', () => {
        const sizes = {
            '1:1': ['1024x1024', '2048x2048'],
            '4:3': ['1152x864', '2400x1792'],
            '3:4': ['864x1152', '1792x2400'],
            '3:2': ['1248x832', '2528x1696'],
            '2:3': ['832x1248', '1696x2528'],
            '16:9': ['1376x768', '2752x1536'],
            '9:16': ['768x1376', '1536x2752'],
        } as const;

        expect(getImageModelGenerateControls(QWEN_IMAGE_2_1_IMAGE_MODEL).map((control) => control.id)).toEqual([
            'aspectRatio', 'imageSize', 'background', 'batchSize',
        ]);
        for (const [aspectRatio, [oneK, twoK]] of Object.entries(sizes)) {
            for (const [imageSize, size] of [['1K', oneK], ['2K', twoK]] as const) {
                expect(mapImageModelGenerateProviderRequest(QWEN_IMAGE_2_1_IMAGE_MODEL, {
                    quality: 'medium', aspectRatio, imageSize, background: 'transparent', batchSize: 4,
                    referenceImages: [],
                })).toEqual({ size, batchSize: 4, referenceImages: [] });
                const fields = buildImageModelArchiveFields(QWEN_IMAGE_2_1_IMAGE_MODEL, {
                    aspectRatio, imageSize, background: 'transparent', batchSize: 4,
                });
                expect(`${fields.width}x${fields.height}`).toBe(size);
                expect(fields).toMatchObject({ quality: imageSize, aspectRatio, background: 'transparent' });
            }
        }
    });

    it('sanitizes Qwen controls and caps references including the Editor target', () => {
        expect(getDefaultImageModelControls(QWEN_IMAGE_2_1_IMAGE_MODEL)).toEqual({
            aspectRatio: '1:1', imageSize: '1K', background: 'auto', batchSize: 1,
        });
        expect(sanitizeImageModelControls(QWEN_IMAGE_2_1_IMAGE_MODEL, {
            aspectRatio: '21:9', imageSize: '4K', background: 'opaque', batchSize: 20,
        })).toEqual({ aspectRatio: '1:1', imageSize: '1K', background: 'auto', batchSize: 4 });
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
    it('covers every registered Image model with defaults and Generate UI facts', () => {
        const registrySlugs = Object.keys(IMAGE_MODEL_REGISTRY).sort();

        expect(Object.keys(IMAGE_MODEL_CONTROL_FACTS).sort()).toEqual(registrySlugs);
        expect(getImageModelUiChoices().map((choice) => choice.slug).sort()).toEqual(registrySlugs);
        expect(getImageModelGenerateControls(OPENAI_IMAGE_MODEL)).toEqual([
            {
                id: 'quality',
                label: 'QUALITY',
                kind: 'select',
                options: [
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                ],
            },
            {
                id: 'size',
                label: 'SIZE',
                kind: 'select',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: '1024x1024', label: 'Square (1:1)' },
                    { value: '1536x1024', label: 'Wide (3:2)' },
                    { value: '1024x1536', label: 'Tall (2:3)' },
                ],
            },
            {
                id: 'background',
                label: 'BACKGROUND',
                kind: 'select',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'opaque', label: 'Opaque' },
                    { value: 'transparent', label: 'Transparent' },
                ],
            },
            {
                id: 'batchSize',
                label: 'BATCH SIZE',
                kind: 'select',
                options: [
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                ],
            },
        ]);
        expect(getImageModelGenerateControls(NANO_BANANA_PRO_IMAGE_MODEL).map((control) => control.id)).toEqual([
            'aspectRatio',
            'imageSize',
            'batchSize',
        ]);
    });

    it('exposes transform mask support per Image model', () => {
        expect(imageModelSupportsTransformMask(OPENAI_IMAGE_MODEL)).toBe(true);
        expect(imageModelSupportsTransformMask(NANO_BANANA_PRO_IMAGE_MODEL)).toBe(false);
    });

    it('validates defaults and coercion for both Image models', () => {
        expect(getDefaultImageModelControls(OPENAI_IMAGE_MODEL)).toEqual({
            quality: 'medium',
            size: '1024x1024',
            background: 'auto',
            batchSize: 1,
        });
        expect(getDefaultImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL)).toEqual({
            aspectRatio: '1:1',
            imageSize: '1K',
            batchSize: 1,
        });
        expect(sanitizeImageModelControls(OPENAI_IMAGE_MODEL, {
            quality: 'high',
            size: '1536x1024',
            background: 'transparent',
            batchSize: 3,
        })).toEqual({
            quality: 'high',
            size: '1536x1024',
            background: 'transparent',
            batchSize: 3,
        });
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

    it('keeps Generate Reference run plans aligned with Provider requests when the Image model changes', () => {
        const references = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );

        const openAiRunPlan = buildImageModelGenerateReferenceRunPlan(OPENAI_IMAGE_MODEL, references);
        const openAiProviderRequest = mapImageModelGenerateProviderRequest(OPENAI_IMAGE_MODEL, {
            quality: 'high',
            aspectRatio: '1536x1024',
            background: 'transparent',
            referenceImages: references,
        });

        expect(openAiRunPlan.referenceLimitMessage).toBeNull();
        expect(openAiProviderRequest.referenceImages).toEqual(openAiRunPlan.providerReferenceImages);
        expect(openAiProviderRequest.referenceImages).toHaveLength(15);

        const nanoRunPlan = buildImageModelGenerateReferenceRunPlan(NANO_BANANA_PRO_IMAGE_MODEL, references);
        const nanoProviderRequest = mapImageModelGenerateProviderRequest(NANO_BANANA_PRO_IMAGE_MODEL, {
            quality: 'high',
            aspectRatio: '1024x1536',
            background: 'transparent',
            imageSize: '4K',
            referenceImages: references,
        });

        expect(nanoRunPlan.referenceLimitMessage).toBe(
            'Nano Banana Pro uses the first 14 reference images for generation.',
        );
        expect(nanoProviderRequest.referenceImages).toEqual(nanoRunPlan.providerReferenceImages);
        expect(nanoProviderRequest.referenceImages.map((file) => file.name)).toEqual([
            'ref-0.png',
            'ref-1.png',
            'ref-2.png',
            'ref-3.png',
            'ref-4.png',
            'ref-5.png',
            'ref-6.png',
            'ref-7.png',
            'ref-8.png',
            'ref-9.png',
            'ref-10.png',
            'ref-11.png',
            'ref-12.png',
            'ref-13.png',
        ]);
    });

    it('reports when a Generate result cannot be appended as another Reference image', () => {
        expect(getImageModelReferenceCapacityMessage(OPENAI_IMAGE_MODEL, 50, 'generation')).toBeNull();
        expect(getImageModelReferenceCapacityMessage(NANO_BANANA_PRO_IMAGE_MODEL, 13, 'generation')).toBeNull();
        expect(getImageModelReferenceCapacityMessage(NANO_BANANA_PRO_IMAGE_MODEL, 14, 'generation')).toBe(
            'Nano Banana Pro already has 14 reference images for generation. Remove one before adding another.',
        );
    });

    it('applies future gpt-image-2 Reference limits from Image model facts consistently', () => {
        const references = Array.from({ length: 3 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );
        const openAiFacts = IMAGE_MODEL_CONTROL_FACTS[OPENAI_IMAGE_MODEL] as {
            referenceLimit: number | null;
        };
        const originalReferenceLimit = openAiFacts.referenceLimit;

        try {
            openAiFacts.referenceLimit = 2;
            const runPlan = buildImageModelGenerateReferenceRunPlan(OPENAI_IMAGE_MODEL, references);
            const providerRequest = mapImageModelGenerateProviderRequest(OPENAI_IMAGE_MODEL, {
                quality: 'high',
                aspectRatio: '1536x1024',
                background: 'transparent',
                referenceImages: references,
            });

            expect(runPlan.referenceLimitMessage).toBe(
                'GPT Image 2 uses the first 2 reference images for generation.',
            );
            expect(providerRequest.referenceImages).toEqual(runPlan.providerReferenceImages);
            expect(providerRequest.referenceImages.map((file) => file.name)).toEqual(['ref-0.png', 'ref-1.png']);
        } finally {
            openAiFacts.referenceLimit = originalReferenceLimit;
        }
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

    it('exposes shared UI facts for Reference image limits used by Generate and Editor', () => {
        const references = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );

        expect(limitReferenceImagesForImageModel(OPENAI_IMAGE_MODEL, references)).toHaveLength(15);
        expect(limitReferenceImagesForImageModel(NANO_BANANA_PRO_IMAGE_MODEL, references)).toHaveLength(14);
        expect(getImageModelReferenceLimitMessage(OPENAI_IMAGE_MODEL, references.length, 'generation')).toBeNull();
        expect(getImageModelReferenceLimitMessage(NANO_BANANA_PRO_IMAGE_MODEL, references.length, 'generation')).toBe(
            'Nano Banana Pro uses the first 14 reference images for generation.',
        );
        expect(getImageModelReferenceLimitMessage(NANO_BANANA_PRO_IMAGE_MODEL, references.length, 'AI transforms')).toBe(
            'Nano Banana Pro uses the first 14 reference images for AI transforms.',
        );
    });
});
