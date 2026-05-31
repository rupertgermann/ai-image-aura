export const OPENAI_PROVIDER = 'openai';
export const GOOGLE_PROVIDER = 'google';

export type Provider = typeof OPENAI_PROVIDER | typeof GOOGLE_PROVIDER;

export const OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_IMAGE_MODEL = OPENAI_IMAGE_MODEL;
export const OPENAI_RESPONSES_MODEL = 'gpt-5.4';

export interface ImageModelConfig {
    slug: string;
    provider: Provider;
    apiModel: string;
    endpoints: {
        generate: string;
        edit: string;
    };
    parameters: Partial<Record<'size' | 'quality' | 'background' | 'aspectRatio' | 'imageSize', string>>;
}

export const IMAGE_MODEL_REGISTRY = {
    [OPENAI_IMAGE_MODEL]: {
        slug: OPENAI_IMAGE_MODEL,
        provider: OPENAI_PROVIDER,
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
    },
} as const satisfies Record<string, ImageModelConfig>;

export type ImageModelSlug = keyof typeof IMAGE_MODEL_REGISTRY;

export function resolveImageModelConfig(slug: string = DEFAULT_IMAGE_MODEL): ImageModelConfig {
    const config = IMAGE_MODEL_REGISTRY[slug as ImageModelSlug];

    if (!config) {
        throw new Error(`Unknown image model: ${slug}`);
    }

    return config;
}
