import type { ArchiveImage } from '../db/types';
import { DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft, type GenerateDraft, type GenerateLineageSource } from '../generate-session/GenerateSession';
import { DEFAULT_IMAGE_MODEL, NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, isImageModelSlug } from '../utils/openaiModels';
import { sanitizeImageModelControls } from '../image-models/ImageModelControls';
import type { LineageStep } from './LineageStore';
import { readGenerateLineageImageModel } from './generateLineageMetadata';
import { readAutopilotGenerateReplayMetadata } from './autopilotLineageMetadata';
import {
    readEditorLineageEditPrompt,
    readEditorLineageImageModel,
    readEditorLineageTransformMask,
} from './editorLineageMetadata';
import { dataURLtoFile } from '../utils/file';

type ReplayableStep = Pick<LineageStep, 'stepType'>;
type GenerateReplayImageModel = NonNullable<ReturnType<typeof readGenerateLineageImageModel>>;

export interface EditorReplay {
    prompt: string | null;
    model: typeof OPENAI_IMAGE_MODEL | typeof NANO_BANANA_PRO_IMAGE_MODEL | null;
    maskImage?: File;
}

interface GenerateReplayMetadata {
    imageModel: GenerateReplayImageModel | null;
    model: ReturnType<typeof resolveReplayModel> | null;
    prompt: string | null;
    style: string | null;
    lighting: string | null;
    palette: string | null;
    quality: unknown;
    aspectRatio: string | null;
    imageSize: unknown;
    background: unknown;
}

export function isGenerateReplayable(step: ReplayableStep) {
    return step.stepType === 'generation' || step.stepType === 'reference-generation' || step.stepType === 'autopilot-iteration';
}

export function isEditorReplayable(step: ReplayableStep) {
    return step.stepType === 'ai-edit' || step.stepType === 'save-as-copy';
}

export function buildEditorReplay(step: LineageStep): EditorReplay | null {
    if (!isEditorReplayable(step)) {
        return null;
    }

    const transformMask = readEditorLineageTransformMask(step.metadata);
    const dataUrl = transformMask?.dataUrl;

    return {
        prompt: readEditorLineageEditPrompt(step.metadata),
        model: readEditorLineageImageModel(step.metadata)?.slug ?? null,
        ...(dataUrl ? { maskImage: dataURLtoFile(dataUrl, 'transform-mask.png') } : {}),
    };
}

export function buildGenerateReplay(image: ArchiveImage | null, step: LineageStep): {
    draft: GenerateDraft;
    lineageSource: GenerateLineageSource;
} {
    const replayMetadata = readGenerateReplayMetadata(step);
    const typedImageModel = replayMetadata.imageModel;
    const model = typedImageModel?.slug
        ?? replayMetadata.model
        ?? resolveReplayModel(image, step.stepType === 'autopilot-iteration' ? null : step);
    const replayAspectRatio = replayMetadata.aspectRatio ?? image?.aspectRatio;

    return {
        draft: sanitizeGenerateDraft({
            ...DEFAULT_GENERATE_DRAFT,
            model,
            prompt: replayMetadata.prompt ?? image?.prompt ?? '',
            style: replayMetadata.style ?? image?.style ?? 'none',
            lighting: replayMetadata.lighting ?? image?.lighting ?? 'none',
            palette: replayMetadata.palette ?? image?.palette ?? 'none',
            gptImage2: model === OPENAI_IMAGE_MODEL
                ? resolveGptImage2ReplayControls(typedImageModel, replayMetadata, image, replayAspectRatio)
                : DEFAULT_GENERATE_DRAFT.gptImage2,
            nanoBananaPro: model === NANO_BANANA_PRO_IMAGE_MODEL
                ? resolveNanoBananaReplayControls(typedImageModel, replayMetadata, image, replayAspectRatio)
                : DEFAULT_GENERATE_DRAFT.nanoBananaPro,
            isSaved: false,
        }),
        lineageSource: {
            archiveImageId: step.archiveImageId,
            stepId: step.id,
        },
    };
}

function readGenerateReplayMetadata(step: LineageStep): GenerateReplayMetadata {
    if (step.stepType === 'autopilot-iteration') {
        return readAutopilotGenerateReplayMetadata(step.metadata);
    }

    return {
        imageModel: readGenerateLineageImageModel(step.metadata),
        model: isImageModelSlug(step.metadata.model) ? step.metadata.model : null,
        prompt: asString(step.metadata.prompt),
        style: asString(step.metadata.style),
        lighting: asString(step.metadata.lighting),
        palette: asString(step.metadata.palette),
        quality: step.metadata.quality,
        aspectRatio: asString(step.metadata.aspectRatio),
        imageSize: step.metadata.imageSize,
        background: step.metadata.background,
    };
}

function resolveReplayModel(image: ArchiveImage | null, step: LineageStep | null) {
    if (isImageModelSlug(step?.metadata.model)) {
        return step.metadata.model;
    }

    if (isImageModelSlug(image?.model)) {
        return image.model;
    }

    return DEFAULT_IMAGE_MODEL;
}

function resolveGptImage2ReplayControls(
    typedImageModel: GenerateReplayImageModel | null,
    metadata: GenerateReplayMetadata,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
) {
    if (typedImageModel?.slug === OPENAI_IMAGE_MODEL) {
        return typedImageModel.controls;
    }

    return sanitizeImageModelControls(OPENAI_IMAGE_MODEL, {
        quality: metadata.quality ?? image?.quality,
        size: replayAspectRatio,
        background: metadata.background ?? image?.background,
    });
}

function resolveNanoBananaReplayControls(
    typedImageModel: GenerateReplayImageModel | null,
    metadata: GenerateReplayMetadata,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
) {
    if (typedImageModel?.slug === NANO_BANANA_PRO_IMAGE_MODEL) {
        return typedImageModel.controls;
    }

    return sanitizeImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL, {
        aspectRatio: replayAspectRatio,
        imageSize: metadata.imageSize ?? image?.quality,
    });
}

function asString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
