import type { ActualImageParameters, ApiCostLedger, ArchiveImage } from '../db/types';
import type { GenerateDraft } from '../generate-session/GenerateSession';
import {
    buildImageModelArchiveFields,
    sanitizeArchiveImageModelControls,
    sanitizeImageModelControls,
    type GptImageControls,
    type NanoBananaProControls,
    type QwenImage2_1Controls,
    type Flux2Klein4bControls,
    type ImageModelControls,
} from '../image-models/ImageModelControls';
import {
    DEFAULT_IMAGE_MODEL,
    NANO_BANANA_PRO_IMAGE_MODEL,
    OPENAI_IMAGE_MODEL,
    OPENAI_SUNBURST_IMAGE_MODEL,
    QWEN_IMAGE_2_1_IMAGE_MODEL,
    FLUX_2_KLEIN_4B_IMAGE_MODEL,
    assertNever,
    isImageModelSlug,
    isStoredImageModelSlug,
    type ImageModelSlug,
} from '../utils/openaiModels';

export interface GenerateLineageDimensions {
    width: number;
    height: number;
}

export interface GenerateLineageReferenceImages {
    count: number;
    ids: string[];
}

export type GenerateLineageImageModel =
    | {
        slug: typeof OPENAI_IMAGE_MODEL | typeof OPENAI_SUNBURST_IMAGE_MODEL | 'gpt-image-2';
        controls: GptImageControls;
    }
    | {
        slug: typeof NANO_BANANA_PRO_IMAGE_MODEL;
        controls: NanoBananaProControls;
    }
    | {
        slug: typeof QWEN_IMAGE_2_1_IMAGE_MODEL;
        controls: QwenImage2_1Controls;
    }
    | {
        slug: typeof FLUX_2_KLEIN_4B_IMAGE_MODEL;
        controls: Flux2Klein4bControls;
    };

export interface GenerateLineageMetadata extends Record<string, unknown> {
    prompt: string;
    model: ImageModelSlug;
    imageModel: GenerateLineageImageModel;
    dimensions: GenerateLineageDimensions;
    quality: string;
    aspectRatio: string;
    background: string;
    width: number;
    height: number;
    imageSize: string | null;
    style: string;
    lighting: string;
    palette: string;
    sourceArchiveImageId: string | null;
    actualParameters?: ActualImageParameters;
    costLedger?: ApiCostLedger;
    referenceImages: GenerateLineageReferenceImages;
    referenceCount: number;
    referenceIds: string[];
}

export function buildGenerateLineageMetadata(input: {
    image: ArchiveImage;
    sourceArchiveImageId: string | null;
    runDraft?: GenerateDraft | null;
}): GenerateLineageMetadata {
    const model = isImageModelSlug(input.image.model) ? input.image.model : DEFAULT_IMAGE_MODEL;
    const controls = getGenerateLineageControls(model, input.image, input.runDraft);
    const archiveFields = buildImageModelArchiveFields(model, controls);
    const width = input.image.width ?? archiveFields.width;
    const height = input.image.height ?? archiveFields.height;
    const referenceIds = (input.image.references ?? []).map((_, index) => createReferenceId(input.image.id, index));

    return {
        prompt: input.image.prompt,
        model,
        imageModel: buildGenerateLineageImageModel(model, controls),
        dimensions: {
            width,
            height,
        },
        quality: archiveFields.quality,
        aspectRatio: archiveFields.aspectRatio,
        background: archiveFields.background,
        width,
        height,
        imageSize: getLineageImageSize(model, archiveFields.quality),
        style: input.image.style ?? 'none',
        lighting: input.image.lighting ?? 'none',
        palette: input.image.palette ?? 'none',
        sourceArchiveImageId: input.sourceArchiveImageId,
        ...(input.image.actualParameters ? { actualParameters: input.image.actualParameters } : {}),
        ...(input.image.costLedger ? { costLedger: input.image.costLedger } : {}),
        referenceImages: {
            count: referenceIds.length,
            ids: referenceIds,
        },
        referenceCount: referenceIds.length,
        referenceIds,
    };
}

function getGenerateLineageControls(
    model: ImageModelSlug,
    image: ArchiveImage,
    runDraft: GenerateDraft | null | undefined,
): ImageModelControls {
    switch (model) {
        case OPENAI_SUNBURST_IMAGE_MODEL:
        case OPENAI_IMAGE_MODEL: return sanitizeArchiveImageModelControls(model, image);
        case NANO_BANANA_PRO_IMAGE_MODEL: return sanitizeArchiveImageModelControls(model, image);
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: return sanitizeArchiveImageModelControls(model, image);
        case QWEN_IMAGE_2_1_IMAGE_MODEL:
            return runDraft?.model === model
                ? sanitizeImageModelControls(model, runDraft.qwenImage2_1)
                : sanitizeArchiveImageModelControls(model, image);
        default: return assertNever(model);
    }
}

export function readGenerateLineageImageModel(metadata: Record<string, unknown>): GenerateLineageImageModel | null {
    const imageModel = asRecord(metadata.imageModel);
    if (!imageModel || !isStoredImageModelSlug(imageModel.slug)) {
        return null;
    }

    if (imageModel.slug === 'gpt-image-2') {
        return { slug: imageModel.slug, controls: sanitizeImageModelControls(OPENAI_IMAGE_MODEL, imageModel.controls) };
    }

    return buildGenerateLineageImageModel(
        imageModel.slug,
        sanitizeImageModelControls(imageModel.slug, imageModel.controls),
    );
}

export function readGenerateLineageReferenceCount(metadata: Record<string, unknown>): number {
    const referenceImages = asRecord(metadata.referenceImages);
    const typedCount = asFiniteNumber(referenceImages?.count);
    if (typedCount !== null) {
        return typedCount;
    }

    return asFiniteNumber(metadata.referenceCount) ?? 0;
}

function buildGenerateLineageImageModel(
    model: ImageModelSlug,
    controls: ImageModelControls,
): GenerateLineageImageModel {
    switch (model) {
        case OPENAI_SUNBURST_IMAGE_MODEL:
        case OPENAI_IMAGE_MODEL: return { slug: model, controls: sanitizeImageModelControls(model, controls) };
        case NANO_BANANA_PRO_IMAGE_MODEL: return { slug: model, controls: sanitizeImageModelControls(model, controls) };
        case QWEN_IMAGE_2_1_IMAGE_MODEL: return { slug: model, controls: sanitizeImageModelControls(model, controls) };
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: return { slug: model, controls: sanitizeImageModelControls(model, controls) };
        default: return assertNever(model);
    }
}

export function getLineageImageSize(model: ImageModelSlug, quality: string): string | null {
    switch (model) {
        case OPENAI_SUNBURST_IMAGE_MODEL:
        case OPENAI_IMAGE_MODEL: return null;
        case NANO_BANANA_PRO_IMAGE_MODEL:
        case QWEN_IMAGE_2_1_IMAGE_MODEL:
        case FLUX_2_KLEIN_4B_IMAGE_MODEL: return quality;
        default: return assertNever(model);
    }
}

function createReferenceId(archiveImageId: string, index: number) {
    return `${archiveImageId}:reference:${index}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
