import { dataURLtoFile, fileToDataURL } from '../utils/file';
import type { ActualImageParameters } from '../db/types';
import {
    type ImageBackground,
    type ImageQuality,
} from '../utils/openai';
import {
    mapImageModelEditProviderRequest,
    mapImageModelGenerateProviderRequest,
} from '../image-models/ImageModelControls';
import { DEFAULT_IMAGE_MODEL, NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL, FLUX_2_KLEIN_4B_IMAGE_MODEL, assertNever, resolveImageModelConfig, type ImageModelSlug, type NanoBananaAspectRatio, type NanoBananaImageSize } from '../utils/openaiModels';
import { imageProviderRegistry, type ImageProvider, type ImageProviderRegistry, type ImageProviderResponse } from './ImageProvider';
import { buildImageCostLedger } from '../costs/apiCost';
import type { ApiCostLedger } from '../db/types';

export type { ImageProvider, ImageProviderRegistry } from './ImageProvider';
export { NANO_REFERENCE_LIMIT } from '../image-models/ImageModelControls';

export interface GenerateImageInput {
    credential: string;
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
    onPartialImage?: (imageUrl: string) => void;
}

export interface EditImageInput {
    credential: string;
    model?: ImageModelSlug;
    prompt: string;
    sourceImage: Blob;
    sourceDimensions?: { width: number; height: number };
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
        actualParameters?: ActualImageParameters;
        costLedger?: ApiCostLedger;
    }
    | {
        slotIndex: number;
        status: 'failed';
        error: string;
    };

export interface EditImageResult {
    imageUrl: string;
    actualParameters?: ActualImageParameters;
    costLedger?: ApiCostLedger;
}

export interface ImageWorkflow {
    generate(input: GenerateImageInput): Promise<GenerateBatchResult[]>;
    edit(input: EditImageInput): Promise<EditImageResult>;
    serializeReferences(files: File[]): Promise<string[]>;
    hydrateReferences(dataUrls: string[]): File[];
}

interface CreateImageWorkflowDeps {
    now?: () => number;
}

export function createImageWorkflow(
    providers: ImageProviderRegistry = imageProviderRegistry,
    deps: CreateImageWorkflowDeps = {},
): ImageWorkflow {
    const now = deps.now ?? (() => performance.now());

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
            const onPartialImage = batchSize === 1 && model.capabilities.partialImageStreaming
                ? createPartialImageHandler(input.onPartialImage)
                : undefined;

            try {
                const startedAt = now();
                const responses = await provider.generate({
                    credential: input.credential,
                    model,
                    prompt: buildGenerationPrompt(modelSlug, input),
                    ...providerRequest,
                    ...(onPartialImage ? { onPartialImage } : {}),
                });
                const elapsedMs = Math.max(0, Math.round(now() - startedAt));
                const results = mapGenerateBatchResults(responses, batchSize, elapsedMs, {
                    provider: model.provider,
                    model: model.apiModel,
                });

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
                sourceDimensions: input.sourceDimensions,
                compositionContextImage: input.compositionContextImage,
                referenceImages: input.referenceImages,
                quality: input.quality,
                aspectRatio: input.aspectRatio,
                imageSize: input.imageSize,
            });

            const startedAt = now();
            const response = await provider.edit({
                credential: input.credential,
                model,
                prompt: input.prompt,
                maskImage: input.maskImage,
                ...providerRequest,
            });
            const elapsedMs = Math.max(0, Math.round(now() - startedAt));

            return mapEditResult(response, elapsedMs, {
                provider: model.provider,
                model: model.apiModel,
            });
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

const buildGenerationPrompt = (model: ImageModelSlug, input: GenerateImageInput) => {
    const modifiers: string[] = [];

    if (input.style !== 'none') modifiers.push(input.style);
    if (input.lighting !== 'none') modifiers.push(input.lighting);
    if (input.palette !== 'none') modifiers.push(`color palette: ${input.palette}`);

    const transparentQwen = model === QWEN_IMAGE_2_1_IMAGE_MODEL && input.background === 'transparent';
    const userPrompt = transparentQwen ? input.prompt.trim().replace(/[.!?]+$/, '') : input.prompt;
    const prompt = modifiers.length > 0
        ? `${userPrompt}, ${modifiers.join(', ')}`
        : userPrompt;

    switch (model) {
        case OPENAI_IMAGE_MODEL:
        case NANO_BANANA_PRO_IMAGE_MODEL:
        case FLUX_2_KLEIN_4B_IMAGE_MODEL:
            return prompt;
        case QWEN_IMAGE_2_1_IMAGE_MODEL:
            return transparentQwen
                ? `This is an RGBA image with transparency. ${prompt.trim().replace(/[.!?]+$/, '')}. The image has alpha channel and the background is transparent.`
                : prompt;
        default: return assertNever(model);
    }
};

function createPartialImageHandler(onPartialImage: GenerateImageInput['onPartialImage']) {
    if (!onPartialImage) {
        return undefined;
    }

    return (partial: ImageProviderResponse) => {
        if (!partial.b64_json) {
            return;
        }

        try {
            onPartialImage(`data:image/png;base64,${partial.b64_json}`);
        } catch {
            // Partial previews should not interrupt the final generation result.
        }
    };
}

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

export function getFirstSuccessfulGeneratedImage(results: GenerateBatchResult[]): string | null {
    return results.find((result) => result.status === 'success')?.imageUrl ?? null;
}

function hasSuccessfulGeneratedImage(results: GenerateBatchResult[]): boolean {
    return getFirstSuccessfulGeneratedImage(results) !== null;
}

function mapGenerateBatchResults(
    responses: ImageProviderResponse[],
    batchSize: number,
    elapsedMs: number,
    costContext: {
        provider: string;
        model: string;
    },
): GenerateBatchResult[] {
    return Array.from({ length: batchSize }, (_, slotIndex) => {
        const response = responses[slotIndex];

        if (response?.b64_json) {
            return {
                slotIndex,
                status: 'success',
                imageUrl: `data:image/png;base64,${response.b64_json}`,
                actualParameters: buildActualImageParameters(response, elapsedMs),
                costLedger: buildImageCostLedger({
                    provider: costContext.provider,
                    model: costContext.model,
                    operation: 'image-generation',
                    label: `Image generation ${slotIndex + 1}`,
                    usage: response.usage,
                    usageScope: response.usageScope,
                    usageImageCount: response.usageImageCount,
                }),
            };
        }

        return {
            slotIndex,
            status: 'failed',
            error: response?.error ?? 'No image data returned from image provider',
        };
    });
}

function mapEditResult(
    response: ImageProviderResponse,
    elapsedMs: number,
    costContext: {
        provider: string;
        model: string;
    },
): EditImageResult {
    if (!response.b64_json) {
        throw new Error(response.error ?? 'No image data returned from image provider');
    }

    return {
        imageUrl: `data:image/png;base64,${response.b64_json}`,
        actualParameters: buildActualImageParameters(response, elapsedMs),
        costLedger: buildImageCostLedger({
            provider: costContext.provider,
            model: costContext.model,
            operation: 'image-edit',
            label: 'AI edit',
            usage: response.usage,
            usageScope: response.usageScope,
            usageImageCount: response.usageImageCount,
        }),
    };
}

function buildActualImageParameters(response: ImageProviderResponse, elapsedMs: number): ActualImageParameters {
    return {
        ...(response.revised_prompt ? { revisedPrompt: response.revised_prompt } : {}),
        ...(response.size ? { size: response.size } : {}),
        ...(response.quality ? { quality: response.quality } : {}),
        elapsedMs,
    };
}
