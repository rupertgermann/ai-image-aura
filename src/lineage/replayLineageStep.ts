import type { ArchiveImage } from '../db/types';
import { DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft, type GenerateDraft, type GenerateLineageSource } from '../generate-session/GenerateSession';
import { DEFAULT_IMAGE_MODEL, NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, isImageModelSlug } from '../utils/openaiModels';
import { sanitizeImageModelControls } from '../image-models/ImageModelControls';
import type { LineageStep } from './LineageStore';
import { readGenerateLineageImageModel } from './generateLineageMetadata';

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
    const typedImageModel = readGenerateLineageImageModel(step.metadata);
    const model = typedImageModel?.slug ?? resolveReplayModel(image, step);
    const replayAspectRatio = asString(step.metadata.aspectRatio) ?? image?.aspectRatio;

    return {
        draft: sanitizeGenerateDraft({
            ...DEFAULT_GENERATE_DRAFT,
            model,
            prompt: asString(step.metadata.prompt) ?? image?.prompt ?? '',
            style: asString(step.metadata.style) ?? image?.style ?? 'none',
            lighting: asString(step.metadata.lighting) ?? image?.lighting ?? 'none',
            palette: asString(step.metadata.palette) ?? image?.palette ?? 'none',
            gptImage2: model === OPENAI_IMAGE_MODEL
                ? resolveGptImage2ReplayControls(typedImageModel, step, image, replayAspectRatio)
                : DEFAULT_GENERATE_DRAFT.gptImage2,
            nanoBananaPro: model === NANO_BANANA_PRO_IMAGE_MODEL
                ? resolveNanoBananaReplayControls(typedImageModel, step, image, replayAspectRatio)
                : DEFAULT_GENERATE_DRAFT.nanoBananaPro,
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

function resolveGptImage2ReplayControls(
    typedImageModel: ReturnType<typeof readGenerateLineageImageModel>,
    step: LineageStep,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
) {
    if (typedImageModel?.slug === OPENAI_IMAGE_MODEL) {
        return typedImageModel.controls;
    }

    return sanitizeImageModelControls(OPENAI_IMAGE_MODEL, {
        quality: step.metadata.quality ?? image?.quality,
        size: replayAspectRatio,
        background: step.metadata.background ?? image?.background,
    });
}

function resolveNanoBananaReplayControls(
    typedImageModel: ReturnType<typeof readGenerateLineageImageModel>,
    step: LineageStep,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
) {
    if (typedImageModel?.slug === NANO_BANANA_PRO_IMAGE_MODEL) {
        return typedImageModel.controls;
    }

    return sanitizeImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL, {
        aspectRatio: replayAspectRatio,
        imageSize: step.metadata.imageSize ?? image?.quality,
    });
}

function asString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
