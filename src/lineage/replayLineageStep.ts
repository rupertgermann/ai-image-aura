import type { ArchiveImage } from '../db/types';
import { DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft, type GenerateDraft, type GenerateLineageSource } from '../generate-session/GenerateSession';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL, FLUX_2_KLEIN_4B_IMAGE_MODEL, assertNever, isStoredImageModelSlug, sanitizeImageModel, type ImageModelSlug } from '../utils/openaiModels';
import { sanitizeImageModelControls } from '../image-models/ImageModelControls';
import type { LineageStep } from './LineageStore';
import { readLineageImageModel } from './generateLineageMetadata';
import { readAutopilotGenerateReplayMetadata } from './autopilotLineageMetadata';
import {
    readEditorLineageEditPrompt,
    readEditorLineageImageModel,
    readEditorLineageTransformMask,
} from './editorLineageMetadata';
import { dataURLtoFile } from '../utils/file';

type ReplayableStep = Pick<LineageStep, 'stepType'>;
type GenerateReplayImageModel = NonNullable<ReturnType<typeof readLineageImageModel>>;

export interface EditorReplay {
    prompt: string | null;
    model: ImageModelSlug | null;
    maskImage?: File;
}

type GenerateReplayMetadata = ReturnType<typeof readAutopilotGenerateReplayMetadata>;

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

    const model = readEditorLineageImageModel(step.metadata)?.slug;
    return {
        prompt: readEditorLineageEditPrompt(step.metadata),
        model: model ? sanitizeImageModel(model) : null,
        ...(dataUrl ? { maskImage: dataURLtoFile(dataUrl, 'transform-mask.png') } : {}),
    };
}

export function buildGenerateReplay(image: ArchiveImage | null, step: LineageStep): {
    draft: GenerateDraft;
    lineageSource: GenerateLineageSource;
} {
    const replayMetadata = readGenerateReplayMetadata(step);
    const typedImageModel = replayMetadata.imageModel;
    const model = sanitizeImageModel(typedImageModel?.slug ?? replayMetadata.model ?? image?.model);
    const replayAspectRatio = replayMetadata.aspectRatio ?? image?.aspectRatio;

    return {
        draft: sanitizeGenerateDraft({
            ...DEFAULT_GENERATE_DRAFT,
            model,
            prompt: replayMetadata.prompt ?? image?.prompt ?? '',
            style: replayMetadata.style ?? image?.style ?? 'none',
            lighting: replayMetadata.lighting ?? image?.lighting ?? 'none',
            palette: replayMetadata.palette ?? image?.palette ?? 'none',
            ...resolveReplayControls(model, typedImageModel, replayMetadata, image, replayAspectRatio),
            isSaved: false,
        }),
        lineageSource: {
            archiveImageId: step.archiveImageId,
            stepId: step.id,
        },
    };
}

function resolveReplayControls(
    model: ImageModelSlug,
    typedImageModel: GenerateReplayImageModel | null,
    metadata: GenerateReplayMetadata,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
): Pick<GenerateDraft, 'gptImage' | 'nanoBananaPro' | 'qwenImage2_1' | 'flux2Klein4b'> {
    const defaults = {
        gptImage: DEFAULT_GENERATE_DRAFT.gptImage,
        nanoBananaPro: DEFAULT_GENERATE_DRAFT.nanoBananaPro,
        qwenImage2_1: DEFAULT_GENERATE_DRAFT.qwenImage2_1,
        flux2Klein4b: DEFAULT_GENERATE_DRAFT.flux2Klein4b,
    };
    switch (model) {
        case OPENAI_SUNBURST_IMAGE_MODEL:
        case OPENAI_IMAGE_MODEL:
            return { ...defaults, gptImage: resolveGptImageReplayControls(typedImageModel, metadata, image, replayAspectRatio) };
        case NANO_BANANA_PRO_IMAGE_MODEL:
            return { ...defaults, nanoBananaPro: resolveNanoBananaReplayControls(typedImageModel, metadata, image, replayAspectRatio) };
        case QWEN_IMAGE_2_1_IMAGE_MODEL:
            return { ...defaults, qwenImage2_1: resolveQwenReplayControls(typedImageModel, metadata, image, replayAspectRatio) };
        case FLUX_2_KLEIN_4B_IMAGE_MODEL:
            return { ...defaults, flux2Klein4b: resolveKleinReplayControls(typedImageModel, metadata, image, replayAspectRatio) };
        default: return assertNever(model);
    }
}

function readGenerateReplayMetadata(step: LineageStep): GenerateReplayMetadata {
    if (step.stepType === 'autopilot-iteration') {
        return readAutopilotGenerateReplayMetadata(step.metadata);
    }

    return {
        imageModel: readLineageImageModel(step.metadata),
        model: isStoredImageModelSlug(step.metadata.model) ? step.metadata.model : null,
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

function resolveGptImageReplayControls(
    typedImageModel: GenerateReplayImageModel | null,
    metadata: GenerateReplayMetadata,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
) {
    if (typedImageModel && 'quality' in typedImageModel.controls) {
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

function resolveQwenReplayControls(
    typedImageModel: GenerateReplayImageModel | null,
    metadata: GenerateReplayMetadata,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
) {
    if (typedImageModel?.slug === QWEN_IMAGE_2_1_IMAGE_MODEL) {
        return typedImageModel.controls;
    }

    return sanitizeImageModelControls(QWEN_IMAGE_2_1_IMAGE_MODEL, {
        aspectRatio: replayAspectRatio,
        imageSize: metadata.imageSize ?? image?.quality,
        background: metadata.background ?? image?.background,
    });
}

function resolveKleinReplayControls(
    typedImageModel: GenerateReplayImageModel | null,
    metadata: GenerateReplayMetadata,
    image: ArchiveImage | null,
    replayAspectRatio: string | undefined,
) {
    if (typedImageModel?.slug === FLUX_2_KLEIN_4B_IMAGE_MODEL) {
        return typedImageModel.controls;
    }

    return sanitizeImageModelControls(FLUX_2_KLEIN_4B_IMAGE_MODEL, {
        aspectRatio: replayAspectRatio,
        imageSize: metadata.imageSize ?? image?.quality,
    });
}

function asString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
