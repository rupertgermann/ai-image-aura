import type { ActualImageParameters, ApiCostLedger, ArchiveImage } from '../db/types';
import {
    buildImageModelArchiveFields,
    sanitizeArchiveImageModelControls,
    sanitizeImageModelControls,
    type GptImage2Controls,
    type NanoBananaProControls,
} from '../image-models/ImageModelControls';
import {
    DEFAULT_IMAGE_MODEL,
    NANO_BANANA_PRO_IMAGE_MODEL,
    OPENAI_IMAGE_MODEL,
    isImageModelSlug,
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
        slug: typeof OPENAI_IMAGE_MODEL;
        controls: GptImage2Controls;
    }
    | {
        slug: typeof NANO_BANANA_PRO_IMAGE_MODEL;
        controls: NanoBananaProControls;
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
}): GenerateLineageMetadata {
    const model = isImageModelSlug(input.image.model) ? input.image.model : DEFAULT_IMAGE_MODEL;
    const controls = sanitizeArchiveImageModelControls(model, input.image);
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
        imageSize: model === NANO_BANANA_PRO_IMAGE_MODEL ? archiveFields.quality : null,
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

export function readGenerateLineageImageModel(metadata: Record<string, unknown>): GenerateLineageImageModel | null {
    const imageModel = asRecord(metadata.imageModel);
    if (!imageModel || !isImageModelSlug(imageModel.slug)) {
        return null;
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
    model: typeof OPENAI_IMAGE_MODEL,
    controls: GptImage2Controls,
): GenerateLineageImageModel;
function buildGenerateLineageImageModel(
    model: typeof NANO_BANANA_PRO_IMAGE_MODEL,
    controls: NanoBananaProControls,
): GenerateLineageImageModel;
function buildGenerateLineageImageModel(
    model: ImageModelSlug,
    controls: GptImage2Controls | NanoBananaProControls,
): GenerateLineageImageModel;
function buildGenerateLineageImageModel(
    model: ImageModelSlug,
    controls: GptImage2Controls | NanoBananaProControls,
): GenerateLineageImageModel {
    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        return {
            slug: model,
            controls: sanitizeImageModelControls(model, controls),
        };
    }

    return {
        slug: model,
        controls: sanitizeImageModelControls(model, controls),
    };
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
