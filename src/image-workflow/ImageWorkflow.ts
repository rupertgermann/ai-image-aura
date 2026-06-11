import { dataURLtoFile, fileToDataURL } from '../utils/file';
import {
    type ImageBackground,
    type ImageQuality,
} from '../utils/openai';
import {
    mapImageModelEditProviderRequest,
    mapImageModelGenerateProviderRequest,
} from '../image-models/ImageModelControls';
import { DEFAULT_IMAGE_MODEL, resolveImageModelConfig, type ImageModelSlug, type NanoBananaAspectRatio, type NanoBananaImageSize } from '../utils/openaiModels';
import { imageProviderRegistry, type ImageProvider, type ImageProviderRegistry, type ImageProviderResponse } from './ImageProvider';

export type { ImageProvider, ImageProviderRegistry } from './ImageProvider';
export { NANO_REFERENCE_LIMIT } from '../image-models/ImageModelControls';

export interface GenerateImageInput {
    apiKey: string;
    model?: ImageModelSlug;
    prompt: string;
    quality: ImageQuality;
    aspectRatio: string;
    background: ImageBackground;
    batchSize?: number;
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
    compositionContextImage?: File | null;
    referenceImages: File[];
    maskImage?: File | Blob | null;
    quality?: ImageQuality;
    aspectRatio?: NanoBananaAspectRatio;
    imageSize?: NanoBananaImageSize;
}

export type GenerateBatchResult =
    | {
        slotIndex: number;
        status: 'success';
        imageUrl: string;
    }
    | {
        slotIndex: number;
        status: 'failed';
        error: string;
    };

export interface ImageWorkflow {
    generate(input: GenerateImageInput): Promise<GenerateBatchResult[]>;
    edit(input: EditImageInput): Promise<string>;
    serializeReferences(files: File[]): Promise<string[]>;
    hydrateReferences(dataUrls: string[]): File[];
}

export function createImageWorkflow(providers: ImageProviderRegistry = imageProviderRegistry): ImageWorkflow {
    return {
        async generate(input) {
            const { model, modelSlug, provider } = resolveImageProvider(input.model, providers);
            const providerRequest = mapImageModelGenerateProviderRequest(modelSlug, {
                quality: input.quality,
                aspectRatio: input.aspectRatio,
                background: input.background,
                batchSize: input.batchSize,
                imageSize: input.imageSize,
                referenceImages: input.referenceImages,
            });

            const batchSize = providerRequest.batchSize ?? 1;

            try {
                const responses = await provider.generate({
                    apiKey: input.apiKey,
                    model,
                    prompt: buildGenerationPrompt(input),
                    ...providerRequest,
                });
                const results = mapGenerateBatchResults(responses, batchSize);

                if (!hasSuccessfulGeneratedImage(results) && batchSize === 1) {
                    const [result] = results;
                    throw new Error(result?.status === 'failed'
                        ? result.error
                        : 'No image data returned from image provider');
                }

                return results;
            } catch (error) {
                if (batchSize === 1) {
                    throw error;
                }

                return Array.from({ length: batchSize }, (_, slotIndex) => ({
                    slotIndex,
                    status: 'failed' as const,
                    error: error instanceof Error ? error.message : 'Image generation failed',
                }));
            }
        },

        async edit(input) {
            const { model, modelSlug, provider } = resolveImageProvider(input.model, providers);
            const providerRequest = mapImageModelEditProviderRequest(modelSlug, {
                sourceImage: createEditSourceFile(input.sourceImage),
                compositionContextImage: input.compositionContextImage,
                referenceImages: input.referenceImages,
                quality: input.quality,
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
            });

            return requestImageDataUrl(provider.edit({
                apiKey: input.apiKey,
                model,
                prompt: input.prompt,
                maskImage: input.maskImage,
                ...providerRequest,
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

const createEditSourceFile = (sourceImage: Blob) => {
    return new File([sourceImage], 'edit-input.png', {
        type: sourceImage.type || 'image/png',
    });
};

const resolveImageProvider = (slug: ImageModelSlug = DEFAULT_IMAGE_MODEL, providers: ImageProviderRegistry): {
    model: ReturnType<typeof resolveImageModelConfig>;
    modelSlug: ImageModelSlug;
    provider: ImageProvider;
} => {
    const model = resolveImageModelConfig(slug);
    const provider = providers[model.provider];

    if (!provider) {
        throw new Error(`No image provider configured for ${model.provider}`);
    }

    return { model, modelSlug: slug, provider };
};

const requestImageDataUrl = async (request: Promise<ImageProviderResponse>) => {
    const result = await request;

    if (!result.b64_json) {
        throw new Error('No image data returned from image provider');
    }

    return `data:image/png;base64,${result.b64_json}`;
};

export function getFirstSuccessfulGeneratedImage(results: GenerateBatchResult[]): string | null {
    return results.find((result) => result.status === 'success')?.imageUrl ?? null;
}

function hasSuccessfulGeneratedImage(results: GenerateBatchResult[]): boolean {
    return getFirstSuccessfulGeneratedImage(results) !== null;
}

function mapGenerateBatchResults(responses: ImageProviderResponse[], batchSize: number): GenerateBatchResult[] {
    return Array.from({ length: batchSize }, (_, slotIndex) => {
        const response = responses[slotIndex];

        if (response?.b64_json) {
            return {
                slotIndex,
                status: 'success',
                imageUrl: `data:image/png;base64,${response.b64_json}`,
            };
        }

        return {
            slotIndex,
            status: 'failed',
            error: response?.error ?? 'No image data returned from image provider',
        };
    });
}
