import type { ArchiveImage } from '../db/types';
import type { GenerateDraft, GenerateLineageSource } from '../generate-session/GenerateSession';
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
    return {
        draft: {
            prompt: asString(step.metadata.prompt) ?? image?.prompt ?? '',
            quality: asQuality(step.metadata.quality) ?? asQuality(image?.quality) ?? 'medium',
            aspectRatio: asString(step.metadata.aspectRatio) ?? image?.aspectRatio ?? '1024x1024',
            background: asBackground(step.metadata.background) ?? asBackground(image?.background) ?? 'auto',
            style: asString(step.metadata.style) ?? image?.style ?? 'none',
            lighting: asString(step.metadata.lighting) ?? image?.lighting ?? 'none',
            palette: asString(step.metadata.palette) ?? image?.palette ?? 'none',
            isSaved: false,
        },
        lineageSource: {
            archiveImageId: step.archiveImageId,
            stepId: step.id,
        },
    };
}

function asString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asQuality(value: unknown): GenerateDraft['quality'] | null {
    return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function asBackground(value: unknown): GenerateDraft['background'] | null {
    return value === 'auto' || value === 'opaque' || value === 'transparent' ? value : null;
}
