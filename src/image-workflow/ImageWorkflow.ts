import { dataURLtoFile, fileToDataURL } from '../utils/file';
import {
    type ImageBackground,
    type ImageQuality,
} from '../utils/openai';
import { DEFAULT_IMAGE_MODEL, NANO_BANANA_PRO_IMAGE_MODEL, resolveImageModelConfig, type ImageModelSlug, type NanoBananaAspectRatio, type NanoBananaImageSize } from '../utils/openaiModels';
import { imageProviderRegistry, type ImageProvider, type ImageProviderRegistry, type ImageProviderResponse } from './ImageProvider';

export type { ImageProvider, ImageProviderRegistry } from './ImageProvider';

const VALID_GENERATION_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);
const VALID_NANO_ASPECT_RATIOS = new Set<NanoBananaAspectRatio>(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
export const NANO_REFERENCE_LIMIT = 14;

export interface GenerateImageInput {
    apiKey: string;
    model?: ImageModelSlug;
    prompt: string;
    quality: ImageQuality;
    aspectRatio: string;
    background: ImageBackground;
    imageSize?: NanoBananaImageSize;
    style: string;
    lighting: string;
    palette: string;
    referenceImages: File[];
}

export interface EditImageInput {
    apiKey: string;
    model?: ImageModelSlug;
    prompt: string;
    sourceImage: Blob;
    referenceImages: File[];
    quality?: ImageQuality;
    aspectRatio?: NanoBananaAspectRatio;
    imageSize?: NanoBananaImageSize;
}

export interface ImageWorkflow {
    generate(input: GenerateImageInput): Promise<string>;
    edit(input: EditImageInput): Promise<string>;
    serializeReferences(files: File[]): Promise<string[]>;
    hydrateReferences(dataUrls: string[]): File[];
}

export function createImageWorkflow(providers: ImageProviderRegistry = imageProviderRegistry): ImageWorkflow {
    return {
        async generate(input) {
            const { model, provider } = resolveImageProvider(input.model, providers);

            return requestImageDataUrl(provider.generate({
                apiKey: input.apiKey,
                model,
                prompt: buildGenerationPrompt(input),
                quality: input.quality,
                size: sanitizeGenerationSize(input.aspectRatio),
                background: input.background,
                aspectRatio: model.slug === NANO_BANANA_PRO_IMAGE_MODEL ? normalizeNanoAspectRatio(input.aspectRatio) : undefined,
                imageSize: input.imageSize,
                referenceImages: trimNanoReferences(model.slug, input.referenceImages),
            }));
        },

        async edit(input) {
            const { model, provider } = resolveImageProvider(input.model, providers);

            return requestImageDataUrl(provider.edit({
                apiKey: input.apiKey,
                model,
                prompt: input.prompt,
                quality: input.quality ?? 'medium',
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
                preserveSourceDimensions: model.slug === NANO_BANANA_PRO_IMAGE_MODEL,
                referenceImages: [createEditSourceFile(input.sourceImage), ...input.referenceImages],
            }));
        },

        serializeReferences(files) {
            return Promise.all(files.map((file) => fileToDataURL(file)));
        },

        hydrateReferences(dataUrls) {
            return dataUrls.map((dataUrl, index) => dataURLtoFile(dataUrl, `ref-${index}.png`));
        },
    };
}

const trimNanoReferences = (modelSlug: ImageModelSlug, referenceImages: File[]) => {
    return modelSlug === NANO_BANANA_PRO_IMAGE_MODEL
        ? referenceImages.slice(0, NANO_REFERENCE_LIMIT)
        : referenceImages;
};

function isNanoAspectRatio(value: string): value is NanoBananaAspectRatio {
    return VALID_NANO_ASPECT_RATIOS.has(value as NanoBananaAspectRatio);
}

const normalizeNanoAspectRatio = (size: string): NanoBananaAspectRatio => {
    const normalizedSize = size.trim();
    const mapped = (
        normalizedSize === '1536x1024' ? '3:2' :
            normalizedSize === '1024x1536' ? '2:3' :
                normalizedSize === 'auto' || normalizedSize === '1024x1024' ? '1:1' :
                    normalizedSize
    );

    return isNanoAspectRatio(mapped) ? mapped : '1:1';
};

export const imageWorkflow = createImageWorkflow();

const buildGenerationPrompt = (input: GenerateImageInput) => {
    const modifiers: string[] = [];

    if (input.style !== 'none') modifiers.push(input.style);
    if (input.lighting !== 'none') modifiers.push(input.lighting);
    if (input.palette !== 'none') modifiers.push(`color palette: ${input.palette}`);

    return modifiers.length > 0
        ? `${input.prompt}, ${modifiers.join(', ')}`
        : input.prompt;
};

const sanitizeGenerationSize = (size: string) => {
    const normalizedSize = size.trim();
    return VALID_GENERATION_SIZES.has(normalizedSize) ? normalizedSize : '1024x1024';
};

const createEditSourceFile = (sourceImage: Blob) => {
    return new File([sourceImage], 'edit-input.png', {
        type: sourceImage.type || 'image/png',
    });
};

const resolveImageProvider = (slug: ImageModelSlug = DEFAULT_IMAGE_MODEL, providers: ImageProviderRegistry): {
    model: ReturnType<typeof resolveImageModelConfig>;
    provider: ImageProvider;
} => {
    const model = resolveImageModelConfig(slug);
    const provider = providers[model.provider];

    if (!provider) {
        throw new Error(`No image provider configured for ${model.provider}`);
    }

    return { model, provider };
};

const requestImageDataUrl = async (request: Promise<ImageProviderResponse>) => {
    const result = await request;

    if (!result.b64_json) {
        throw new Error('No image data returned from image provider');
    }

    return `data:image/png;base64,${result.b64_json}`;
};
