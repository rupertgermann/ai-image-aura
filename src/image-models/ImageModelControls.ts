import type { ImageBackground, ImageQuality } from '../utils/openai';
import type { ArchiveImage } from '../db/types';
import {
    IMAGE_MODEL_REGISTRY,
    NANO_BANANA_PRO_IMAGE_MODEL,
    OPENAI_IMAGE_MODEL,
    QWEN_IMAGE_2_1_IMAGE_MODEL,
    FLUX_2_KLEIN_4B_IMAGE_MODEL,
    assertNever,
    type ImageModelSlug,
    type NanoBananaAspectRatio,
    type NanoBananaImageSize,
    type Provider,
    type LocalAspectRatio,
    type LocalImageSize,
} from '../utils/openaiModels';

export const NANO_REFERENCE_LIMIT = 14;
export const FLUX_2_KLEIN_REFERENCE_LIMIT = 4;

export type GptImage2Controls = {
    quality: ImageQuality;
    size: string;
    background: ImageBackground;
    batchSize: number;
};

export type NanoBananaProControls = {
    aspectRatio: NanoBananaAspectRatio;
    imageSize: NanoBananaImageSize;
    batchSize: number;
};

export type QwenImage2_1Controls = {
    aspectRatio: LocalAspectRatio;
    imageSize: LocalImageSize;
    background: 'auto' | 'transparent';
    batchSize: number;
};

export type Flux2Klein4bControls = {
    aspectRatio: LocalAspectRatio;
    imageSize: LocalImageSize;
    batchSize: number;
};

export type ImageModelControls = GptImage2Controls | NanoBananaProControls | QwenImage2_1Controls | Flux2Klein4bControls;

export type ImageModelControlId = 'quality' | 'size' | 'background' | 'batchSize' | 'aspectRatio' | 'imageSize';

export interface ActiveImageModelControls {
    quality: ImageQuality;
    aspectRatio: string;
    background: ImageBackground;
    batchSize: number;
    imageSize?: NanoBananaImageSize | LocalImageSize;
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
const LOCAL_ASPECT_RATIOS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'] as const;
const LOCAL_IMAGE_SIZES = ['768', '1K', '2K'] as const;
const QWEN_BACKGROUNDS = ['auto', 'transparent'] as const;

const LOCAL_SIZE_TABLE: Record<LocalAspectRatio, Record<LocalImageSize, string>> = {
    '1:1': { '768': '768x768', '1K': '1024x1024', '2K': '2048x2048' },
    '4:3': { '768': '896x672', '1K': '1152x864', '2K': '2400x1792' },
    '3:4': { '768': '672x896', '1K': '864x1152', '2K': '1792x2400' },
    '3:2': { '768': '960x640', '1K': '1248x832', '2K': '2528x1696' },
    '2:3': { '768': '640x960', '1K': '832x1248', '2K': '1696x2528' },
    '16:9': { '768': '1024x576', '1K': '1376x768', '2K': '2752x1536' },
    '9:16': { '768': '576x1024', '1K': '768x1376', '2K': '1536x2752' },
};

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
        ],
        referenceLimit: null,
    },
    [NANO_BANANA_PRO_IMAGE_MODEL]: {
        defaults: {
            aspectRatio: '1:1',
            imageSize: '1K',
            batchSize: 1,
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
        ],
        referenceLimit: NANO_REFERENCE_LIMIT,
    },
    [QWEN_IMAGE_2_1_IMAGE_MODEL]: {
        defaults: {
            aspectRatio: '1:1',
            imageSize: '768', // ~2x faster than 1K on local hardware
            background: 'auto',
            batchSize: 1,
        },
        generateControls: [
            {
                id: 'aspectRatio', label: 'ASPECT RATIO', kind: 'select', options: [
                    { value: '1:1', label: 'Square (1:1)' },
                    { value: '4:3', label: 'Landscape (4:3)' },
                    { value: '3:4', label: 'Portrait (3:4)' },
                    { value: '3:2', label: 'Landscape (3:2)' },
                    { value: '2:3', label: 'Portrait (2:3)' },
                    { value: '16:9', label: 'Widescreen (16:9)' },
                    { value: '9:16', label: 'Story (9:16)' },
                ],
            },
            {
                id: 'imageSize', label: 'RESOLUTION', kind: 'toggle', options: [
                    { value: '768', label: '768' },
                    { value: '1K', label: '1K' },
                    { value: '2K', label: '2K' },
                ],
            },
            {
                id: 'background', label: 'BACKGROUND', kind: 'select', options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'transparent', label: 'Transparent' },
                ],
            },
            {
                id: 'batchSize', label: 'BATCH SIZE', kind: 'select', options: [
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                ],
            },
        ],
        referenceLimit: 10,
    },
    [FLUX_2_KLEIN_4B_IMAGE_MODEL]: {
        defaults: {
            aspectRatio: '1:1',
            imageSize: '1K',
            batchSize: 1,
        },
        generateControls: [
            {
                id: 'aspectRatio', label: 'ASPECT RATIO', kind: 'select', options: [
                    { value: '1:1', label: 'Square (1:1)' },
                    { value: '4:3', label: 'Landscape (4:3)' },
                    { value: '3:4', label: 'Portrait (3:4)' },
                    { value: '3:2', label: 'Landscape (3:2)' },
                    { value: '2:3', label: 'Portrait (2:3)' },
                    { value: '16:9', label: 'Widescreen (16:9)' },
                    { value: '9:16', label: 'Story (9:16)' },
                ],
            },
            {
                id: 'imageSize', label: 'RESOLUTION', kind: 'toggle', options: [
                    { value: '1K', label: '1K' },
                    { value: '2K', label: '2K' },
                ],
            },
            {
                id: 'batchSize', label: 'BATCH SIZE', kind: 'select', options: [
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                ],
            },
        ],
        referenceLimit: FLUX_2_KLEIN_REFERENCE_LIMIT,
    },
} as const satisfies Record<ImageModelSlug, ImageModelControlFacts>;

export function getDefaultImageModelControls(model: typeof OPENAI_IMAGE_MODEL): GptImage2Controls;
export function getDefaultImageModelControls(model: typeof NANO_BANANA_PRO_IMAGE_MODEL): NanoBananaProControls;
export function getDefaultImageModelControls(model: typeof QWEN_IMAGE_2_1_IMAGE_MODEL): QwenImage2_1Controls;
export function getDefaultImageModelControls(model: typeof FLUX_2_KLEIN_4B_IMAGE_MODEL): Flux2Klein4bControls;
export function getDefaultImageModelControls(model: ImageModelSlug): ImageModelControls;
export function getDefaultImageModelControls(model: ImageModelSlug): ImageModelControls {
    return { ...IMAGE_MODEL_CONTROL_FACTS[model].defaults };
}

export function getImageModelDraftKey(model: ImageModelSlug): 'gptImage2' | 'nanoBananaPro' | 'qwenImage2_1' | 'flux2Klein4b' {
    switch (model) {
        case OPENAI_IMAGE_MODEL: return 'gptImage2';
        case NANO_BANANA_PRO_IMAGE_MODEL: return 'nanoBananaPro';
        case QWEN_IMAGE_2_1_IMAGE_MODEL: return 'qwenImage2_1';
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: return 'flux2Klein4b';
        default: return assertNever(model);
    }
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
    model: typeof QWEN_IMAGE_2_1_IMAGE_MODEL,
    value: unknown,
    fallback?: QwenImage2_1Controls,
): QwenImage2_1Controls;
export function sanitizeImageModelControls(
    model: typeof FLUX_2_KLEIN_4B_IMAGE_MODEL,
    value: unknown,
    fallback?: Flux2Klein4bControls,
): Flux2Klein4bControls;
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
    const record = asRecord(value);
    switch (model) {
        case OPENAI_IMAGE_MODEL: {
            const controls = asGptControls(fallback);
            return {
                quality: coerceImageQuality(record?.quality, controls.quality),
                size: coerceGptImageSize(record?.size, controls.size),
                background: coerceImageBackground(record?.background, controls.background),
                batchSize: coerceGptBatchSize(record?.batchSize, controls.batchSize),
            };
        }
        case NANO_BANANA_PRO_IMAGE_MODEL: {
            const controls = asNanoControls(fallback);
            return {
                aspectRatio: coerceNanoAspectRatio(record?.aspectRatio, controls.aspectRatio),
                imageSize: coerceNanoImageSize(record?.imageSize, controls.imageSize),
                batchSize: coerceGptBatchSize(record?.batchSize, controls.batchSize),
            };
        }
        case QWEN_IMAGE_2_1_IMAGE_MODEL: {
            const controls = asQwenControls(fallback);
            return {
                aspectRatio: coerceLocalAspectRatio(record?.aspectRatio, controls.aspectRatio),
                imageSize: coerceLocalImageSize(record?.imageSize, controls.imageSize),
                background: coerceQwenBackground(record?.background, controls.background),
                batchSize: coerceGptBatchSize(record?.batchSize, controls.batchSize),
            };
        }
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: {
            const controls = asKleinControls(fallback);
            return {
                aspectRatio: coerceLocalAspectRatio(record?.aspectRatio, controls.aspectRatio),
                imageSize: coerceLocalImageSize(record?.imageSize, controls.imageSize),
                batchSize: coerceGptBatchSize(record?.batchSize, controls.batchSize),
            };
        }
        default: return assertNever(model);
    }
}

export function sanitizeArchiveImageModelControls(model: typeof OPENAI_IMAGE_MODEL, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): GptImage2Controls;
export function sanitizeArchiveImageModelControls(model: typeof NANO_BANANA_PRO_IMAGE_MODEL, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): NanoBananaProControls;
export function sanitizeArchiveImageModelControls(model: typeof QWEN_IMAGE_2_1_IMAGE_MODEL, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): QwenImage2_1Controls;
export function sanitizeArchiveImageModelControls(model: typeof FLUX_2_KLEIN_4B_IMAGE_MODEL, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): Flux2Klein4bControls;
export function sanitizeArchiveImageModelControls(model: ImageModelSlug, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): ImageModelControls;
export function sanitizeArchiveImageModelControls(model: ImageModelSlug, image: Pick<ArchiveImage, 'quality' | 'aspectRatio' | 'background'>): ImageModelControls {
    switch (model) {
        case OPENAI_IMAGE_MODEL:
            return sanitizeImageModelControls(model, {
                quality: image.quality,
                size: image.aspectRatio,
                background: image.background,
            });
        case NANO_BANANA_PRO_IMAGE_MODEL:
            return sanitizeImageModelControls(model, {
                aspectRatio: image.aspectRatio,
                imageSize: image.quality,
            });
        case QWEN_IMAGE_2_1_IMAGE_MODEL:
            return sanitizeImageModelControls(model, {
                aspectRatio: image.aspectRatio,
                imageSize: image.quality,
                background: image.background,
            });
        case FLUX_2_KLEIN_4B_IMAGE_MODEL:
            return sanitizeImageModelControls(model, {
                aspectRatio: image.aspectRatio,
                imageSize: image.quality,
            });
        default: return assertNever(model);
    }
}

export function coerceImageModelControlValue(model: ImageModelSlug, controlId: string, value: unknown): string {
    switch (model) {
        case OPENAI_IMAGE_MODEL: {
            const defaults = getDefaultImageModelControls(model);
            if (controlId === 'quality') return coerceImageQuality(value, defaults.quality);
            if (controlId === 'size') return coerceGptImageSize(value, defaults.size);
            if (controlId === 'background') return coerceImageBackground(value, defaults.background);
            if (controlId === 'batchSize') return String(coerceGptBatchSize(value, defaults.batchSize));
            return '';
        }
        case NANO_BANANA_PRO_IMAGE_MODEL: {
            const defaults = getDefaultImageModelControls(model);
            if (controlId === 'aspectRatio') return coerceNanoAspectRatio(value, defaults.aspectRatio);
            if (controlId === 'imageSize') return coerceNanoImageSize(value, defaults.imageSize);
            if (controlId === 'batchSize') return String(coerceGptBatchSize(value, defaults.batchSize));
            return '';
        }
        case QWEN_IMAGE_2_1_IMAGE_MODEL: {
            const defaults = getDefaultImageModelControls(model);
            if (controlId === 'aspectRatio') return coerceLocalAspectRatio(value, defaults.aspectRatio);
            if (controlId === 'imageSize') return coerceLocalImageSize(value, defaults.imageSize);
            if (controlId === 'background') return coerceQwenBackground(value, defaults.background);
            if (controlId === 'batchSize') return String(coerceGptBatchSize(value, defaults.batchSize));
            return '';
        }
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: {
            const defaults = getDefaultImageModelControls(model);
            if (controlId === 'aspectRatio') return coerceLocalAspectRatio(value, defaults.aspectRatio);
            if (controlId === 'imageSize') return coerceLocalImageSize(value, defaults.imageSize);
            if (controlId === 'batchSize') return String(coerceGptBatchSize(value, defaults.batchSize));
            return '';
        }
        default: return assertNever(model);
    }
}

export function getActiveImageModelGenerateControls(model: ImageModelSlug, controls: ImageModelControls): ActiveImageModelControls {
    switch (model) {
        case OPENAI_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            return {
                aspectRatio: sanitized.size,
                imageSize: undefined,
                quality: sanitized.quality,
                background: sanitized.background,
                batchSize: sanitized.batchSize,
            };
        }
        case NANO_BANANA_PRO_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            const gptDefaults = getDefaultImageModelControls(OPENAI_IMAGE_MODEL);
            return {
                aspectRatio: sanitized.aspectRatio,
                imageSize: sanitized.imageSize,
                quality: gptDefaults.quality,
                background: gptDefaults.background,
                batchSize: sanitized.batchSize,
            };
        }
        case QWEN_IMAGE_2_1_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            return {
                aspectRatio: sanitized.aspectRatio,
                imageSize: sanitized.imageSize,
                quality: getDefaultImageModelControls(OPENAI_IMAGE_MODEL).quality,
                background: sanitized.background,
                batchSize: sanitized.batchSize,
            };
        }
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            const gptDefaults = getDefaultImageModelControls(OPENAI_IMAGE_MODEL);
            return {
                aspectRatio: sanitized.aspectRatio,
                imageSize: sanitized.imageSize,
                quality: gptDefaults.quality,
                background: gptDefaults.background,
                batchSize: sanitized.batchSize,
            };
        }
        default: return assertNever(model);
    }
}

export const buildActiveImageModelControls = getActiveImageModelGenerateControls;

export function buildImageModelArchiveFields(model: ImageModelSlug, controls: unknown): ImageModelArchiveFields {
    switch (model) {
        case OPENAI_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            const { width, height } = getExactDimensions(sanitized.size);
            return {
                quality: sanitized.quality,
                aspectRatio: sanitized.size,
                background: sanitized.background,
                width,
                height,
            };
        }
        case NANO_BANANA_PRO_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            const { width, height } = getRatioDimensions(sanitized.aspectRatio, getNanoLongEdge(sanitized.imageSize));
            return {
                quality: sanitized.imageSize,
                aspectRatio: sanitized.aspectRatio,
                background: 'auto',
                width,
                height,
            };
        }
        case QWEN_IMAGE_2_1_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            const { width, height } = getExactDimensions(LOCAL_SIZE_TABLE[sanitized.aspectRatio][sanitized.imageSize]);
            return {
                quality: sanitized.imageSize,
                aspectRatio: sanitized.aspectRatio,
                background: sanitized.background,
                width,
                height,
            };
        }
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: {
            const sanitized = sanitizeImageModelControls(model, controls);
            const { width, height } = getExactDimensions(LOCAL_SIZE_TABLE[sanitized.aspectRatio][sanitized.imageSize]);
            return {
                quality: sanitized.imageSize,
                aspectRatio: sanitized.aspectRatio,
                background: 'auto',
                width,
                height,
            };
        }
        default: return assertNever(model);
    }
}

export function mapImageModelGenerateProviderRequest(
    model: ImageModelSlug,
    input: {
        quality: ImageQuality;
        aspectRatio: string;
        background: ImageBackground;
        batchSize?: number;
        imageSize?: NanoBananaImageSize | LocalImageSize;
        referenceImages: File[];
    },
) {
    const referenceRunPlan = buildImageModelGenerateReferenceRunPlan(model, input.referenceImages);

    switch (model) {
        case OPENAI_IMAGE_MODEL:
            return {
                quality: coerceImageQuality(input.quality, 'medium'),
                size: coerceGptImageSize(input.aspectRatio, '1024x1024'),
                background: coerceImageBackground(input.background, 'auto'),
                batchSize: coerceGptBatchSize(input.batchSize, 1),
                referenceImages: referenceRunPlan.providerReferenceImages,
            };
        case NANO_BANANA_PRO_IMAGE_MODEL: {
            const controls = sanitizeImageModelControls(model, {
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
                batchSize: input.batchSize,
            });
            return {
                aspectRatio: controls.aspectRatio,
                imageSize: controls.imageSize,
                batchSize: controls.batchSize,
                referenceImages: referenceRunPlan.providerReferenceImages,
            };
        }
        case QWEN_IMAGE_2_1_IMAGE_MODEL: {
            const controls = sanitizeImageModelControls(model, {
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
                background: input.background,
                batchSize: input.batchSize,
            });
            return {
                size: LOCAL_SIZE_TABLE[controls.aspectRatio][controls.imageSize],
                batchSize: controls.batchSize,
                referenceImages: referenceRunPlan.providerReferenceImages,
            };
        }
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: {
            const controls = sanitizeImageModelControls(model, {
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
                batchSize: input.batchSize,
            });
            return {
                size: LOCAL_SIZE_TABLE[controls.aspectRatio][controls.imageSize],
                batchSize: controls.batchSize,
                referenceImages: referenceRunPlan.providerReferenceImages,
            };
        }
        default: return assertNever(model);
    }
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
        sourceDimensions?: { width: number; height: number };
    },
) {
    const referenceImages = [
        ...(input.compositionContextImage ? [input.compositionContextImage] : []),
        ...limitReferenceImagesForImageModel(model, input.referenceImages),
    ];

    switch (model) {
        case OPENAI_IMAGE_MODEL:
            return {
                quality: coerceImageQuality(input.quality, 'medium'),
                size: '1024x1024',
                background: 'auto' as ImageBackground,
                referenceImages: [input.sourceImage, ...referenceImages],
            };
        case NANO_BANANA_PRO_IMAGE_MODEL: {
            const controls = sanitizeImageModelControls(model, {
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
            });
            return {
                aspectRatio: controls.aspectRatio,
                imageSize: controls.imageSize,
                preserveSourceDimensions: true,
                referenceImages: [input.sourceImage, ...referenceImages],
            };
        }
        case QWEN_IMAGE_2_1_IMAGE_MODEL:
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: {
            const size = getLocalEditSize(input.sourceDimensions);
            return {
                ...(size ? { size } : {}),
                referenceImages: [input.sourceImage, ...referenceImages].slice(0, IMAGE_MODEL_CONTROL_FACTS[model].referenceLimit),
            };
        }
        default: return assertNever(model);
    }
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
    reservedImageCount = 0,
): string | null {
    const limit = IMAGE_MODEL_CONTROL_FACTS[model].referenceLimit;
    if (limit === null) {
        return null;
    }
    const userReferenceLimit = Math.max(0, limit - reservedImageCount);
    if (referenceCount <= userReferenceLimit) {
        return null;
    }

    return `${IMAGE_MODEL_REGISTRY[model].label} uses the first ${userReferenceLimit} reference images for ${context}.`;
}

export function getImageModelReferenceCapacityMessage(
    model: ImageModelSlug,
    referenceCount: number,
    context: string,
): string | null {
    const limit = IMAGE_MODEL_CONTROL_FACTS[model].referenceLimit;
    if (limit === null || referenceCount < limit) {
        return null;
    }

    return `${IMAGE_MODEL_REGISTRY[model].label} already has ${limit} reference images for ${context}. Remove one before adding another.`;
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
    return 'aspectRatio' in value && !('background' in value)
        ? { ...value, imageSize: coerceNanoImageSize(value.imageSize, '1K') }
        : IMAGE_MODEL_CONTROL_FACTS[NANO_BANANA_PRO_IMAGE_MODEL].defaults;
}

function asKleinControls(value: ImageModelControls): Flux2Klein4bControls {
    return 'aspectRatio' in value && !('background' in value)
        ? { aspectRatio: coerceLocalAspectRatio(value.aspectRatio, '1:1'), imageSize: coerceLocalImageSize(value.imageSize, '1K'), batchSize: value.batchSize }
        : IMAGE_MODEL_CONTROL_FACTS[FLUX_2_KLEIN_4B_IMAGE_MODEL].defaults;
}

function asQwenControls(value: ImageModelControls): QwenImage2_1Controls {
    return 'aspectRatio' in value && 'background' in value
        ? value
        : IMAGE_MODEL_CONTROL_FACTS[QWEN_IMAGE_2_1_IMAGE_MODEL].defaults;
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

function coerceLocalAspectRatio(value: unknown, fallback: LocalAspectRatio): LocalAspectRatio {
    return typeof value === 'string' && (LOCAL_ASPECT_RATIOS as readonly string[]).includes(value)
        ? value as LocalAspectRatio
        : fallback;
}

function coerceLocalImageSize(value: unknown, fallback: LocalImageSize): LocalImageSize {
    return typeof value === 'string' && (LOCAL_IMAGE_SIZES as readonly string[]).includes(value)
        ? value as LocalImageSize
        : fallback;
}

function coerceQwenBackground(value: unknown, fallback: QwenImage2_1Controls['background']): QwenImage2_1Controls['background'] {
    return typeof value === 'string' && (QWEN_BACKGROUNDS as readonly string[]).includes(value)
        ? value as QwenImage2_1Controls['background']
        : fallback;
}

function getLocalEditSize(dimensions: { width: number; height: number } | undefined): string | undefined {
    if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height)
        || dimensions.width <= 0 || dimensions.height <= 0) {
        return undefined;
    }

    const scale = Math.min(1, Math.sqrt((1024 * 1024) / (dimensions.width * dimensions.height)));
    const snap = (edge: number) => Math.max(32, Math.min(Math.round(edge * scale / 32), Math.floor(edge / 32)) * 32);
    let width = snap(dimensions.width);
    let height = snap(dimensions.height);
    const aspectRatio = dimensions.width / dimensions.height;
    while (width * height > 1024 * 1024) {
        const widthError = width > 32 ? Math.abs((width - 32) / height - aspectRatio) : Infinity;
        const heightError = height > 32 ? Math.abs(width / (height - 32) - aspectRatio) : Infinity;
        if (widthError <= heightError) width -= 32;
        else height -= 32;
    }
    return `${width}x${height}`;
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
