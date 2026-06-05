import type { ArchiveImage } from '../db/types';
import { DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft, type GenerateDraft, type GenerateLineageSource } from '../generate-session/GenerateSession';
import { DEFAULT_IMAGE_MODEL, isImageModelSlug } from '../utils/openaiModels';
import type { ImageBackground, ImageQuality } from '../utils/openai';
import type { LineageStep } from './LineageStore';

type ReplayableStep = Pick<LineageStep, 'stepType'>;

export function isGenerateReplayable(step: ReplayableStep) {
    return step.stepType === 'generation' || step.stepType === 'reference-generation' || step.stepType === 'autopilot-iteration';
}

export function isEditorReplayable(step: ReplayableStep) {
    return step.stepType === 'ai-edit' || step.stepType === 'save-as-copy';
}

export function buildGenerateReplay(image: ArchiveImage | null, step: LineageStep): {
    draft: GenerateDraft;
    lineageSource: GenerateLineageSource;
} {
    const model = resolveReplayModel(image, step);

    return {
        draft: sanitizeGenerateDraft({
            ...DEFAULT_GENERATE_DRAFT,
            model,
            prompt: asString(step.metadata.prompt) ?? image?.prompt ?? '',
            style: asString(step.metadata.style) ?? image?.style ?? 'none',
            lighting: asString(step.metadata.lighting) ?? image?.lighting ?? 'none',
            palette: asString(step.metadata.palette) ?? image?.palette ?? 'none',
            gptImage2: {
                ...DEFAULT_GENERATE_DRAFT.gptImage2,
                quality: asQuality(step.metadata.quality) ?? asQuality(image?.quality) ?? DEFAULT_GENERATE_DRAFT.gptImage2.quality,
                size: asString(step.metadata.aspectRatio) ?? image?.aspectRatio ?? DEFAULT_GENERATE_DRAFT.gptImage2.size,
                background: asBackground(step.metadata.background) ?? asBackground(image?.background) ?? DEFAULT_GENERATE_DRAFT.gptImage2.background,
            },
            nanoBananaPro: {
                ...DEFAULT_GENERATE_DRAFT.nanoBananaPro,
                aspectRatio: asString(step.metadata.aspectRatio) as GenerateDraft['nanoBananaPro']['aspectRatio'] ?? image?.aspectRatio as GenerateDraft['nanoBananaPro']['aspectRatio'] ?? DEFAULT_GENERATE_DRAFT.nanoBananaPro.aspectRatio,
                imageSize: asString(step.metadata.imageSize) as GenerateDraft['nanoBananaPro']['imageSize'] ?? image?.quality as GenerateDraft['nanoBananaPro']['imageSize'] ?? DEFAULT_GENERATE_DRAFT.nanoBananaPro.imageSize,
            },
            isSaved: false,
        }),
        lineageSource: {
            archiveImageId: step.archiveImageId,
            stepId: step.id,
        },
    };
}

function resolveReplayModel(image: ArchiveImage | null, step: LineageStep) {
    if (isImageModelSlug(step.metadata.model)) {
        return step.metadata.model;
    }

    if (isImageModelSlug(image?.model)) {
        return image.model;
    }

    return DEFAULT_IMAGE_MODEL;
}

function asString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asQuality(value: unknown): ImageQuality | null {
    return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function asBackground(value: unknown): ImageBackground | null {
    return value === 'auto' || value === 'opaque' || value === 'transparent' ? value : null;
}
