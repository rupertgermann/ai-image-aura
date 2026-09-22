export const OPENAI_PROVIDER = 'openai';
export const GOOGLE_PROVIDER = 'google';
export const LOCAL_PROVIDER = 'local';

export type Provider = typeof OPENAI_PROVIDER | typeof GOOGLE_PROVIDER | typeof LOCAL_PROVIDER;

export function getProviderLabel(provider: Provider): string {
    switch (provider) {
        case OPENAI_PROVIDER: return 'OpenAI';
        case GOOGLE_PROVIDER: return 'Google';
        case LOCAL_PROVIDER: return 'Local server';
        default: return assertNever(provider);
    }
}

export function assertNever(value: never): never {
    throw new Error(`Unexpected value: ${value}`);
}

export const OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const NANO_BANANA_PRO_IMAGE_MODEL = 'nano-banana-pro';
export const QWEN_IMAGE_2_1_IMAGE_MODEL = 'qwen-image-2.1';
export const DEFAULT_IMAGE_MODEL = OPENAI_IMAGE_MODEL;
export const OPENAI_RESPONSES_MODEL = 'gpt-5.4';
export const GEMINI_FLASH_REASONING_MODEL = 'gemini-2.5-flash';

export type NanoBananaAspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
export type NanoBananaImageSize = '1K' | '2K' | '4K';
export type QwenAspectRatio = '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16';
export type QwenImageSize = '1K' | '2K';

export interface ImageModelConfig {
    slug: string;
    provider: Provider;
    apiModel: string;
    label: string;
    endpoints: {
        generate: string;
        edit: string;
    };
    parameters: Partial<Record<'size' | 'quality' | 'background' | 'aspectRatio' | 'imageSize', string>>;
    capabilities: {
        transformMask: boolean;
        partialImageStreaming: boolean;
    };
}

export interface ReasoningModelConfig {
    slug: string;
    provider: Provider;
    apiModel: string;
    label: string;
    endpoint: string;
}

export const IMAGE_MODEL_REGISTRY = {
    [OPENAI_IMAGE_MODEL]: {
        slug: OPENAI_IMAGE_MODEL,
        provider: OPENAI_PROVIDER,
        apiModel: OPENAI_IMAGE_MODEL,
        label: 'GPT Image 2',
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
    },
    [NANO_BANANA_PRO_IMAGE_MODEL]: {
        slug: NANO_BANANA_PRO_IMAGE_MODEL,
        provider: GOOGLE_PROVIDER,
        apiModel: 'gemini-3-pro-image-preview',
        label: 'Nano Banana Pro',
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
            partialImageStreaming: false,
        },
    },
    [QWEN_IMAGE_2_1_IMAGE_MODEL]: {
        slug: QWEN_IMAGE_2_1_IMAGE_MODEL,
        provider: LOCAL_PROVIDER,
        apiModel: QWEN_IMAGE_2_1_IMAGE_MODEL,
        label: 'Qwen Image 2.1',
        endpoints: {
            generate: '/v1/images/generations',
            edit: '/v1/images/edits',
        },
        parameters: {
            size: 'size',
        },
        capabilities: {
            transformMask: false,
            partialImageStreaming: false,
        },
    },
} as const satisfies Record<string, ImageModelConfig>;

export type ImageModelSlug = keyof typeof IMAGE_MODEL_REGISTRY;

export const REASONING_MODEL_REGISTRY = {
    [OPENAI_RESPONSES_MODEL]: {
        slug: OPENAI_RESPONSES_MODEL,
        provider: OPENAI_PROVIDER,
        apiModel: OPENAI_RESPONSES_MODEL,
        label: 'GPT 5.4',
        endpoint: 'https://api.openai.com/v1/responses',
    },
    [GEMINI_FLASH_REASONING_MODEL]: {
        slug: GEMINI_FLASH_REASONING_MODEL,
        provider: GOOGLE_PROVIDER,
        apiModel: GEMINI_FLASH_REASONING_MODEL,
        label: 'Gemini 2.5 Flash',
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_REASONING_MODEL}:generateContent`,
    },
} as const satisfies Record<string, ReasoningModelConfig>;

export type ReasoningModelSlug = keyof typeof REASONING_MODEL_REGISTRY;

export function resolveImageModelConfig(slug: string = DEFAULT_IMAGE_MODEL): ImageModelConfig {
    if (!isImageModelSlug(slug)) {
        throw new Error(`Unknown image model: ${slug}`);
    }

    return IMAGE_MODEL_REGISTRY[slug];
}

export function isImageModelSlug(value: unknown): value is ImageModelSlug {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(IMAGE_MODEL_REGISTRY, value);
}

export function resolveReasoningModelConfig(slug: string = OPENAI_RESPONSES_MODEL): ReasoningModelConfig {
    if (!isReasoningModelSlug(slug)) {
        throw new Error(`Unknown reasoning model: ${slug}`);
    }

    return REASONING_MODEL_REGISTRY[slug];
}

export function isReasoningModelSlug(value: unknown): value is ReasoningModelSlug {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REASONING_MODEL_REGISTRY, value);
}
