import type { ImageBackground, ImageQuality } from '../utils/openai';
import type { ArchiveImage } from '../db/types';
import {
    IMAGE_MODEL_REGISTRY,
    NANO_BANANA_PRO_IMAGE_MODEL,
    OPENAI_IMAGE_MODEL,
    type ImageModelSlug,
    type NanoBananaAspectRatio,
    type NanoBananaImageSize,
    type Provider,
} from '../utils/openaiModels';

export const NANO_REFERENCE_LIMIT = 14;

export type GptImage2Controls = {
    quality: ImageQuality;
    size: string;
    background: ImageBackground;
    batchSize: number;
};

export type NanoBananaProControls = {
    aspectRatio: NanoBananaAspectRatio;
    imageSize: NanoBananaImageSize;
};

export type ImageModelControls = GptImage2Controls | NanoBananaProControls;

export type ImageModelControlId = 'quality' | 'size' | 'background' | 'batchSize' | 'aspectRatio' | 'imageSize';

export interface ActiveImageModelControls {
    quality: ImageQuality;
    aspectRatio: string;
    background: ImageBackground;
    batchSize: number;
    imageSize?: NanoBananaImageSize;
}

export interface ImageModelArchiveFields {
    quality: string;
    aspectRatio: string;
    background: string;
    width: number;
    height: number;
}

export interface ImageModelControlOption {
    value: string;
    label: string;
}

export interface ImageModelGenerateControl {
    id: ImageModelControlId;
    label: string;
    kind: 'toggle' | 'select';
    options: ImageModelControlOption[];
}

export interface ImageModelGenerateReferenceRunPlan<T> {
    providerReferenceImages: T[];
    referenceLimitMessage: string | null;
}

interface ImageModelControlFacts {
    defaults: ImageModelControls;
    generateControls: ImageModelGenerateControl[];
    referenceLimit: number | null;
}

const GPT_IMAGE_2_SIZES = ['1024x1024', '1536x1024', '1024x1536', 'auto'] as const;
const GPT_IMAGE_2_BATCH_SIZE_MIN = 1;
const GPT_IMAGE_2_BATCH_SIZE_MAX = 4;
const IMAGE_QUALITIES = ['low', 'medium', 'high'] as const;
const IMAGE_BACKGROUNDS = ['auto', 'opaque', 'transparent'] as const;
const NANO_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
const NANO_IMAGE_SIZES = ['1K', '2K', '4K'] as const;

export const IMAGE_MODEL_CONTROL_FACTS = {
    [OPENAI_IMAGE_MODEL]: {
        defaults: {
            quality: 'medium',
            size: '1024x1024',
            background: 'auto',
            batchSize: 1,
        },
        generateControls: [
            {
                id: 'quality',
                label: 'QUALITY',
                kind: 'toggle',
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
                kind: 'toggle',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'opaque', label: 'Opaque' },
                    { value: 'transparent', label: 'Transparent' },
                ],
            },
            {
                id: 'batchSize',
                label: 'BATCH SIZE',
                kind: 'toggle',
                options: [
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                ],
            },
        ],
        referenceLimit: null,
    },
    [NANO_BANANA_PRO_IMAGE_MODEL]: {
        defaults: {
            aspectRatio: '1:1',
            imageSize: '1K',
        },
        generateControls: [
            {
                id: 'aspectRatio',
                label: 'ASPECT RATIO',
                kind: 'select',
                options: [
                    { value: '1:1', label: 'Square (1:1)' },
                    { value: '2:3', label: 'Portrait (2:3)' },
                    { value: '3:2', label: 'Landscape (3:2)' },
                    { value: '3:4', label: 'Portrait (3:4)' },
                    { value: '4:3', label: 'Landscape (4:3)' },
                    { value: '4:5', label: 'Portrait (4:5)' },
                    { value: '5:4', label: 'Landscape (5:4)' },
                    { value: '9:16', label: 'Story (9:16)' },
                    { value: '16:9', label: 'Widescreen (16:9)' },
                    { value: '21:9', label: 'Cinema (21:9)' },
                ],
            },
            {
                id: 'imageSize',
                label: 'RESOLUTION',
                kind: 'toggle',
                options: [
                    { value: '1K', label: '1K' },
                    { value: '2K', label: '2K' },
                    { value: '4K', label: '4K' },
                ],
            },
        ],
        referenceLimit: NANO_REFERENCE_LIMIT,
    },
} as const satisfies Record<ImageModelSlug, ImageModelControlFacts>;

export function getDefaultImageModelControls(model: typeof OPENAI_IMAGE_MODEL): GptImage2Controls;
export function getDefaultImageModelControls(model: typeof NANO_BANANA_PRO_IMAGE_MODEL): NanoBananaProControls;
export function getDefaultImageModelControls(model: ImageModelSlug): ImageModelControls;
export function getDefaultImageModelControls(model: ImageModelSlug): ImageModelControls {
    return { ...IMAGE_MODEL_CONTROL_FACTS[model].defaults };
}

export function getImageModelDraftKey(model: ImageModelSlug): 'gptImage2' | 'nanoBananaPro' {
    return model === NANO_BANANA_PRO_IMAGE_MODEL ? 'nanoBananaPro' : 'gptImage2';
}

export function getImageModelGenerateControls(model: ImageModelSlug): ImageModelGenerateControl[] {
    return IMAGE_MODEL_CONTROL_FACTS[model].generateControls.map((control) => ({
        ...control,
        options: control.options.map((option) => ({ ...option })),
    }));
}

export function getImageModelUiChoices(): Array<{
    slug: ImageModelSlug;
    label: string;
    provider: Provider;
}> {
    return (Object.keys(IMAGE_MODEL_REGISTRY) as ImageModelSlug[]).map((slug) => {
        const config = IMAGE_MODEL_REGISTRY[slug];
        return {
            slug,
            label: config.label,
            provider: config.provider,
        };
    });
}

export function imageModelSupportsTransformMask(model: ImageModelSlug): boolean {
    return IMAGE_MODEL_REGISTRY[model].capabilities.transformMask;
}

export function sanitizeImageModelControls(
    model: typeof OPENAI_IMAGE_MODEL,
    value: unknown,
    fallback?: GptImage2Controls,
): GptImage2Controls;
export function sanitizeImageModelControls(
    model: typeof NANO_BANANA_PRO_IMAGE_MODEL,
    value: unknown,
    fallback?: NanoBananaProControls,
): NanoBananaProControls;
export function sanitizeImageModelControls(
    model: ImageModelSlug,
    value: unknown,
    fallback?: ImageModelControls,
): ImageModelControls;
export function sanitizeImageModelControls(
    model: ImageModelSlug,
    value: unknown,
    fallback: ImageModelControls = getDefaultImageModelControls(model),
): ImageModelControls {
    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        const record = asRecord(value);
        const fallbackControls = asNanoControls(fallback);
        return {
            aspectRatio: coerceNanoAspectRatio(record?.aspectRatio, fallbackControls.aspectRatio),
            imageSize: coerceNanoImageSize(record?.imageSize, fallbackControls.imageSize),
        };
    }

    const record = asRecord(value);
    const fallbackControls = asGptControls(fallback);
    return {
        quality: coerceImageQuality(record?.quality, fallbackControls.quality),
        size: coerceGptImageSize(record?.size, fallbackControls.size),
        background: coerceImageBackground(record?.background, fallbackControls.background),
        batchSize: coerceGptBatchSize(record?.batchSize, fallbackControls.batchSize),
    };
}

export function sanitizeArchiveImageModelControls(model: typeof OPENAI_IMAGE_MODEL, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): GptImage2Controls;
export function sanitizeArchiveImageModelControls(model: typeof NANO_BANANA_PRO_IMAGE_MODEL, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): NanoBananaProControls;
export function sanitizeArchiveImageModelControls(model: ImageModelSlug, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): ImageModelControls;
export function sanitizeArchiveImageModelControls(model: ImageModelSlug, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): ImageModelControls {
    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        return sanitizeImageModelControls(model, {
            aspectRatio: image.aspectRatio,
            imageSize: image.quality,
        });
    }

    return sanitizeImageModelControls(model, {
        quality: image.quality,
        size: image.aspectRatio,
        background: image.background,
    });
}

export function coerceImageModelControlValue(model: ImageModelSlug, controlId: string, value: unknown): string {
    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        const defaults = getDefaultImageModelControls(model) as NanoBananaProControls;
        if (controlId === 'aspectRatio') {
            return coerceNanoAspectRatio(value, defaults.aspectRatio);
        }
        if (controlId === 'imageSize') {
            return coerceNanoImageSize(value, defaults.imageSize);
        }
        return '';
    }

    const defaults = getDefaultImageModelControls(model) as GptImage2Controls;
    if (controlId === 'quality') {
        return coerceImageQuality(value, defaults.quality);
    }
    if (controlId === 'size') {
        return coerceGptImageSize(value, defaults.size);
    }
    if (controlId === 'background') {
        return coerceImageBackground(value, defaults.background);
    }
    if (controlId === 'batchSize') {
        return String(coerceGptBatchSize(value, defaults.batchSize));
    }
    return '';
}

export function getActiveImageModelGenerateControls(model: ImageModelSlug, controls: ImageModelControls): ActiveImageModelControls {
    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        const sanitized = sanitizeImageModelControls(model, controls) as NanoBananaProControls;
        const gptDefaults = getDefaultImageModelControls(OPENAI_IMAGE_MODEL) as GptImage2Controls;
        return {
            aspectRatio: sanitized.aspectRatio,
            imageSize: sanitized.imageSize,
            quality: gptDefaults.quality,
            background: gptDefaults.background,
            batchSize: 1,
        };
    }

    const sanitized = sanitizeImageModelControls(model, controls) as GptImage2Controls;
    return {
        aspectRatio: sanitized.size,
        imageSize: undefined,
        quality: sanitized.quality,
        background: sanitized.background,
        batchSize: sanitized.batchSize,
    };
}

export const buildActiveImageModelControls = getActiveImageModelGenerateControls;

export function buildImageModelArchiveFields(model: ImageModelSlug, controls: unknown): ImageModelArchiveFields {
    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        const sanitized = sanitizeImageModelControls(model, controls) as NanoBananaProControls;
        const { width, height } = getRatioDimensions(sanitized.aspectRatio, getNanoLongEdge(sanitized.imageSize));
        return {
            quality: sanitized.imageSize,
            aspectRatio: sanitized.aspectRatio,
            background: 'auto',
            width,
            height,
        };
    }

    const sanitized = sanitizeImageModelControls(model, controls) as GptImage2Controls;
    const { width, height } = getExactDimensions(sanitized.size);
    return {
        quality: sanitized.quality,
        aspectRatio: sanitized.size,
        background: sanitized.background,
        width,
        height,
    };
}

export function mapImageModelGenerateProviderRequest(
    model: ImageModelSlug,
    input: {
        quality: ImageQuality;
        aspectRatio: string;
        background: ImageBackground;
        batchSize?: number;
        imageSize?: NanoBananaImageSize;
        referenceImages: File[];
    },
) {
    const referenceRunPlan = buildImageModelGenerateReferenceRunPlan(model, input.referenceImages);

    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        const controls = sanitizeImageModelControls(model, {
            aspectRatio: input.aspectRatio,
            imageSize: input.imageSize,
        }) as NanoBananaProControls;
        return {
            aspectRatio: controls.aspectRatio,
            imageSize: controls.imageSize,
            referenceImages: referenceRunPlan.providerReferenceImages,
        };
    }

    return {
        quality: coerceImageQuality(input.quality, 'medium'),
        size: coerceGptImageSize(input.aspectRatio, '1024x1024'),
        background: coerceImageBackground(input.background, 'auto'),
        batchSize: coerceGptBatchSize(input.batchSize, 1),
        referenceImages: referenceRunPlan.providerReferenceImages,
    };
}

export function mapImageModelEditProviderRequest(
    model: ImageModelSlug,
    input: {
        sourceImage: File;
        compositionContextImage?: File | null;
        referenceImages: File[];
        quality?: ImageQuality;
        aspectRatio?: NanoBananaAspectRatio;
        imageSize?: NanoBananaImageSize;
    },
) {
    const referenceImages = [
        ...(input.compositionContextImage ? [input.compositionContextImage] : []),
        ...limitReferenceImagesForImageModel(model, input.referenceImages),
    ];

    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        const controls = sanitizeImageModelControls(model, {
            aspectRatio: input.aspectRatio,
            imageSize: input.imageSize,
        }) as NanoBananaProControls;
        return {
            aspectRatio: controls.aspectRatio,
            imageSize: controls.imageSize,
            preserveSourceDimensions: true,
            referenceImages: [input.sourceImage, ...referenceImages],
        };
    }

    return {
        quality: coerceImageQuality(input.quality, 'medium'),
        size: '1024x1024',
        background: 'auto' as ImageBackground,
        referenceImages: [input.sourceImage, ...referenceImages],
    };
}

export function limitReferenceImagesForImageModel<T>(model: ImageModelSlug, referenceImages: T[]): T[] {
    const limit = IMAGE_MODEL_CONTROL_FACTS[model].referenceLimit;
    return limit === null ? referenceImages : referenceImages.slice(0, limit);
}

export function buildImageModelGenerateReferenceRunPlan<T>(
    model: ImageModelSlug,
    referenceImages: T[],
): ImageModelGenerateReferenceRunPlan<T> {
    return {
        providerReferenceImages: limitReferenceImagesForImageModel(model, referenceImages),
        referenceLimitMessage: getImageModelReferenceLimitMessage(model, referenceImages.length, 'generation'),
    };
}

export function getImageModelReferenceLimitMessage(
    model: ImageModelSlug,
    referenceCount: number,
    context: string,
): string | null {
    const limit = IMAGE_MODEL_CONTROL_FACTS[model].referenceLimit;
    if (limit === null || referenceCount <= limit) {
        return null;
    }

    return `${IMAGE_MODEL_REGISTRY[model].label} uses the first ${limit} reference images for ${context}.`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asGptControls(value: ImageModelControls): GptImage2Controls {
    return 'quality' in value ? value : IMAGE_MODEL_CONTROL_FACTS[OPENAI_IMAGE_MODEL].defaults;
}

function asNanoControls(value: ImageModelControls): NanoBananaProControls {
    return 'aspectRatio' in value ? value : IMAGE_MODEL_CONTROL_FACTS[NANO_BANANA_PRO_IMAGE_MODEL].defaults;
}

function coerceImageQuality(value: unknown, fallback: ImageQuality): ImageQuality {
    return typeof value === 'string' && (IMAGE_QUALITIES as readonly string[]).includes(value)
        ? value as ImageQuality
        : fallback;
}

function coerceImageBackground(value: unknown, fallback: ImageBackground): ImageBackground {
    return typeof value === 'string' && (IMAGE_BACKGROUNDS as readonly string[]).includes(value)
        ? value as ImageBackground
        : fallback;
}

function coerceGptImageSize(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim();
    return (GPT_IMAGE_2_SIZES as readonly string[]).includes(normalized) ? normalized : fallback;
}

function coerceGptBatchSize(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string'
            ? Number(value.trim())
            : NaN;

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(
        GPT_IMAGE_2_BATCH_SIZE_MAX,
        Math.max(GPT_IMAGE_2_BATCH_SIZE_MIN, Math.trunc(parsed)),
    );
}

function coerceNanoAspectRatio(value: unknown, fallback: NanoBananaAspectRatio): NanoBananaAspectRatio {
    if (value === '1024x1024' || value === 'auto') return '1:1';
    if (value === '1536x1024') return '3:2';
    if (value === '1024x1536') return '2:3';

    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim();
    if (normalized === '1024x1024' || normalized === 'auto') return '1:1';
    if (normalized === '1536x1024') return '3:2';
    if (normalized === '1024x1536') return '2:3';

    return (NANO_ASPECT_RATIOS as readonly string[]).includes(normalized)
        ? normalized as NanoBananaAspectRatio
        : fallback;
}

function coerceNanoImageSize(value: unknown, fallback: NanoBananaImageSize): NanoBananaImageSize {
    return typeof value === 'string' && (NANO_IMAGE_SIZES as readonly string[]).includes(value)
        ? value as NanoBananaImageSize
        : fallback;
}

function getExactDimensions(size: string) {
    if (size === 'auto') {
        return { width: 1024, height: 1024 };
    }

    const [width, height] = size.split('x').map(Number);
    return width && height ? { width, height } : { width: 1024, height: 1024 };
}

function getRatioDimensions(aspectRatio: string, longEdge: number) {
    const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
    if (!widthRatio || !heightRatio) {
        return { width: longEdge, height: longEdge };
    }

    if (widthRatio >= heightRatio) {
        return {
            width: longEdge,
            height: Math.round(longEdge * (heightRatio / widthRatio)),
        };
    }

    return {
        width: Math.round(longEdge * (widthRatio / heightRatio)),
        height: longEdge,
    };
}

function getNanoLongEdge(imageSize: NanoBananaImageSize) {
    if (imageSize === '4K') return 4096;
    if (imageSize === '2K') return 2048;
    return 1024;
}
