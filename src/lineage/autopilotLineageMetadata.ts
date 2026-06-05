import {
    buildImageModelArchiveFields,
    sanitizeImageModelControls,
    type GptImage2Controls,
    type NanoBananaProControls,
} from '../image-models/ImageModelControls';
import type { GenerateImageInput } from '../image-workflow/ImageWorkflow';
import {
    DEFAULT_IMAGE_MODEL,
    NANO_BANANA_PRO_IMAGE_MODEL,
    OPENAI_IMAGE_MODEL,
    isImageModelSlug,
    isReasoningModelSlug,
    type ImageModelSlug,
    type ReasoningModelSlug,
} from '../utils/openaiModels';

export interface AutopilotLineageGoal {
    text: string;
}

export interface AutopilotLineageIteration {
    number: number;
}

export interface AutopilotLineageEvaluation {
    score: number;
    feedback: string[];
}

export interface AutopilotLineageReplayImage {
    dataUrl: string;
}

export interface AutopilotLineageRun {
    label: string;
}

export interface AutopilotLineageReasoningModel {
    slug: ReasoningModelSlug;
}

export interface AutopilotLineageDimensions {
    width: number;
    height: number;
}

export type AutopilotLineageImageModel =
    | {
        slug: typeof OPENAI_IMAGE_MODEL;
        controls: GptImage2Controls;
    }
    | {
        slug: typeof NANO_BANANA_PRO_IMAGE_MODEL;
        controls: NanoBananaProControls;
    };

export interface AutopilotLineageMetadata extends Record<string, unknown> {
    goal: AutopilotLineageGoal;
    iteration: AutopilotLineageIteration;
    evaluation: AutopilotLineageEvaluation;
    replayImage: AutopilotLineageReplayImage;
    run: AutopilotLineageRun;
    reasoningModel: AutopilotLineageReasoningModel | null;
    imageModel: AutopilotLineageImageModel;
    dimensions: AutopilotLineageDimensions;
    prompt: string;
    model: ImageModelSlug;
    quality: string;
    aspectRatio: string;
    background: string;
    width: number;
    height: number;
    imageSize: string | null;
    style: string;
    lighting: string;
    palette: string;
    goalText: string;
    iterationNumber: number;
    evaluatorScore: number;
    evaluatorFeedback: string[];
    outputImageDataUrl: string;
    runLabel: string;
}

export interface AutopilotTimelineMetadata {
    goalText: string | null;
    iterationNumber: number | null;
    evaluatorScore: number | null;
    evaluatorFeedback: string[];
    replayImageDataUrl: string | null;
    runLabel: string;
}

export interface AutopilotGenerateReplayMetadata {
    imageModel: AutopilotLineageImageModel | null;
    model: ImageModelSlug | null;
    prompt: string | null;
    style: string | null;
    lighting: string | null;
    palette: string | null;
    quality: unknown;
    aspectRatio: string | null;
    imageSize: unknown;
    background: unknown;
}

export function buildAutopilotLineageMetadata(input: {
    goal: string;
    reasoningModel?: string;
    iterationNumber: number;
    evaluation: {
        score: number;
        feedback: string[];
    };
    prompt: string;
    settings: Omit<GenerateImageInput, 'apiKey' | 'prompt'>;
    outputImageDataUrl: string;
}): AutopilotLineageMetadata {
    const model = isImageModelSlug(input.settings.model) ? input.settings.model : DEFAULT_IMAGE_MODEL;
    const controls = buildAutopilotImageModelControls(model, input.settings);
    const archiveFields = buildImageModelArchiveFields(model, controls);
    const runLabel = buildAutopilotRunLabel(input.goal);
    const feedback = input.evaluation.feedback.filter((entry) => entry.trim().length > 0);

    return {
        goal: {
            text: input.goal,
        },
        iteration: {
            number: input.iterationNumber,
        },
        evaluation: {
            score: input.evaluation.score,
            feedback,
        },
        replayImage: {
            dataUrl: input.outputImageDataUrl,
        },
        run: {
            label: runLabel,
        },
        reasoningModel: buildAutopilotReasoningModel(input.reasoningModel),
        imageModel: buildAutopilotLineageImageModel(model, controls),
        dimensions: {
            width: archiveFields.width,
            height: archiveFields.height,
        },
        prompt: input.prompt,
        model,
        quality: archiveFields.quality,
        aspectRatio: archiveFields.aspectRatio,
        background: archiveFields.background,
        width: archiveFields.width,
        height: archiveFields.height,
        imageSize: model === NANO_BANANA_PRO_IMAGE_MODEL ? archiveFields.quality : null,
        style: input.settings.style,
        lighting: input.settings.lighting,
        palette: input.settings.palette,
        goalText: input.goal,
        iterationNumber: input.iterationNumber,
        evaluatorScore: input.evaluation.score,
        evaluatorFeedback: feedback,
        outputImageDataUrl: input.outputImageDataUrl,
        runLabel,
    };
}

export function readAutopilotTimelineMetadata(metadata: Record<string, unknown>): AutopilotTimelineMetadata {
    const goal = asRecord(metadata.goal);
    const iteration = asRecord(metadata.iteration);
    const evaluation = asRecord(metadata.evaluation);
    const replayImage = asRecord(metadata.replayImage);
    const run = asRecord(metadata.run);
    const goalText = asString(goal?.text) ?? asString(metadata.goalText);

    return {
        goalText,
        iterationNumber: asFiniteNumber(iteration?.number) ?? asFiniteNumber(metadata.iterationNumber),
        evaluatorScore: asFiniteNumber(evaluation?.score) ?? asFiniteNumber(metadata.evaluatorScore),
        evaluatorFeedback: readStringArray(evaluation?.feedback, metadata.evaluatorFeedback),
        replayImageDataUrl: asString(replayImage?.dataUrl) ?? asString(metadata.outputImageDataUrl),
        runLabel: asString(run?.label) ?? asString(metadata.runLabel) ?? buildAutopilotRunLabel(goalText),
    };
}

export function readAutopilotGenerateReplayMetadata(metadata: Record<string, unknown>): AutopilotGenerateReplayMetadata {
    const imageModel = readAutopilotLineageImageModel(metadata);

    return {
        imageModel,
        model: imageModel?.slug ?? (isImageModelSlug(metadata.model) ? metadata.model : null),
        prompt: asString(metadata.prompt),
        style: asString(metadata.style),
        lighting: asString(metadata.lighting),
        palette: asString(metadata.palette),
        quality: metadata.quality,
        aspectRatio: asString(metadata.aspectRatio),
        imageSize: metadata.imageSize,
        background: metadata.background,
    };
}

export function readAutopilotLineageImageModel(metadata: Record<string, unknown>): AutopilotLineageImageModel | null {
    const imageModel = asRecord(metadata.imageModel);
    if (!imageModel || !isImageModelSlug(imageModel.slug)) {
        return null;
    }

    return buildAutopilotLineageImageModel(
        imageModel.slug,
        sanitizeImageModelControls(imageModel.slug, imageModel.controls),
    );
}

export function readAutopilotLineageReasoningModel(metadata: Record<string, unknown>): AutopilotLineageReasoningModel | null {
    const reasoningModel = asRecord(metadata.reasoningModel);
    if (reasoningModel && isReasoningModelSlug(reasoningModel.slug)) {
        return {
            slug: reasoningModel.slug,
        };
    }

    if (isReasoningModelSlug(metadata.reasoningModel)) {
        return {
            slug: metadata.reasoningModel,
        };
    }

    return null;
}

function buildAutopilotImageModelControls(
    model: typeof OPENAI_IMAGE_MODEL,
    settings: Omit<GenerateImageInput, 'apiKey' | 'prompt'>,
): GptImage2Controls;
function buildAutopilotImageModelControls(
    model: typeof NANO_BANANA_PRO_IMAGE_MODEL,
    settings: Omit<GenerateImageInput, 'apiKey' | 'prompt'>,
): NanoBananaProControls;
function buildAutopilotImageModelControls(
    model: ImageModelSlug,
    settings: Omit<GenerateImageInput, 'apiKey' | 'prompt'>,
): GptImage2Controls | NanoBananaProControls;
function buildAutopilotImageModelControls(
    model: ImageModelSlug,
    settings: Omit<GenerateImageInput, 'apiKey' | 'prompt'>,
) {
    if (model === NANO_BANANA_PRO_IMAGE_MODEL) {
        return sanitizeImageModelControls(model, {
            aspectRatio: settings.aspectRatio,
            imageSize: settings.imageSize,
        });
    }

    return sanitizeImageModelControls(model, {
        quality: settings.quality,
        size: settings.aspectRatio,
        background: settings.background,
    });
}

function buildAutopilotLineageImageModel(
    model: typeof OPENAI_IMAGE_MODEL,
    controls: GptImage2Controls,
): AutopilotLineageImageModel;
function buildAutopilotLineageImageModel(
    model: typeof NANO_BANANA_PRO_IMAGE_MODEL,
    controls: NanoBananaProControls,
): AutopilotLineageImageModel;
function buildAutopilotLineageImageModel(
    model: ImageModelSlug,
    controls: GptImage2Controls | NanoBananaProControls,
): AutopilotLineageImageModel;
function buildAutopilotLineageImageModel(
    model: ImageModelSlug,
    controls: GptImage2Controls | NanoBananaProControls,
): AutopilotLineageImageModel {
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

function buildAutopilotReasoningModel(reasoningModel: string | undefined): AutopilotLineageReasoningModel | null {
    return isReasoningModelSlug(reasoningModel)
        ? { slug: reasoningModel }
        : null;
}

function buildAutopilotRunLabel(goalText: string | null) {
    const goal = excerpt(goalText, 36);
    return goal ? `Autopilot Run · ${goal}` : 'Autopilot Run';
}

function excerpt(value: string | null, maxLength: number) {
    if (!value) {
        return null;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
}

function asFiniteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(primary: unknown, fallback: unknown) {
    const primaryValues = asStringArray(primary);
    return primaryValues.length > 0 ? primaryValues : asStringArray(fallback);
}

function asStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
}
