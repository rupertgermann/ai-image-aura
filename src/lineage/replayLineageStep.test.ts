import { describe, expect, it } from 'vitest';
import type { ArchiveImage } from '../db/types';
import type { LineageStep } from './LineageStore';
import { buildGenerateReplay, isEditorReplayable, isGenerateReplayable } from './replayLineageStep';

describe('replayLineageStep', () => {
    it('hydrates a generate draft from lineage metadata and preserves an exact fork source', () => {
        const image = createImage();
        const step = createStep({
            id: 'step-7',
            archiveImageId: 'image-7',
            stepType: 'reference-generation',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {
                prompt: 'cathedral-sized jellyfish drifting over a neon harbor',
                quality: 'high',
                aspectRatio: '1536x1024',
                background: 'transparent',
                style: 'editorial sci-fi',
                lighting: 'storm glow',
                palette: 'violet + amber',
            },
        });

        expect(buildGenerateReplay(image, step)).toEqual({
            draft: {
                prompt: 'cathedral-sized jellyfish drifting over a neon harbor',
                quality: 'high',
                aspectRatio: '1536x1024',
                background: 'transparent',
                style: 'editorial sci-fi',
                lighting: 'storm glow',
                palette: 'violet + amber',
                isSaved: false,
            },
            lineageSource: {
                archiveImageId: 'image-7',
                stepId: 'step-7',
            },
        });
    });

    it('reports which lineage steps can replay into generate or editor', () => {
        expect(isGenerateReplayable(createStep({ id: 'a', archiveImageId: 'image-a', stepType: 'generation', timestamp: '2026-04-04T09:00:00.000Z' }))).toBe(true);
        expect(isGenerateReplayable(createStep({ id: 'aa', archiveImageId: 'image-aa', stepType: 'autopilot-iteration', timestamp: '2026-04-04T09:00:00.000Z' }))).toBe(true);
        expect(isGenerateReplayable(createStep({ id: 'b', archiveImageId: 'image-b', stepType: 'ai-edit', timestamp: '2026-04-04T09:00:00.000Z' }))).toBe(false);
        expect(isEditorReplayable(createStep({ id: 'c', archiveImageId: 'image-c', stepType: 'save-as-copy', timestamp: '2026-04-04T09:00:00.000Z' }))).toBe(true);
        expect(isEditorReplayable(createStep({ id: 'd', archiveImageId: 'image-d', stepType: 'reference-generation', timestamp: '2026-04-04T09:00:00.000Z' }))).toBe(false);
    });

    it('hydrates a generate draft from an autopilot step without an archive image fallback', () => {
        const step = createStep({
            id: 'step-9',
            archiveImageId: 'autopilot:run:iteration:2',
            stepType: 'autopilot-iteration',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {
                prompt: 'editorial portrait, deep blue haze, dramatic rim light',
                quality: 'high',
                aspectRatio: '1536x1024',
                background: 'transparent',
                style: '35mm film still',
                lighting: 'neon rim light',
                palette: 'cobalt + vermilion + bone',
            },
        });

        expect(buildGenerateReplay(null, step)).toEqual({
            draft: {
                prompt: 'editorial portrait, deep blue haze, dramatic rim light',
                quality: 'high',
                aspectRatio: '1536x1024',
                background: 'transparent',
                style: '35mm film still',
                lighting: 'neon rim light',
                palette: 'cobalt + vermilion + bone',
                isSaved: false,
            },
            lineageSource: {
                archiveImageId: 'autopilot:run:iteration:2',
                stepId: 'step-9',
            },
        });
    });
});

function createImage(overrides: Partial<ArchiveImage> = {}): ArchiveImage {
    return {
        id: 'image-7',
        url: 'data:image/png;base64,abc',
        prompt: 'fallback prompt',
        quality: 'medium',
        aspectRatio: '1024x1024',
        background: 'auto',
        timestamp: '2026-04-04T08:00:00.000Z',
        style: 'none',
        lighting: 'none',
        palette: 'none',
        ...overrides,
    };
}

function createStep(overrides: Partial<LineageStep> & Pick<LineageStep, 'id' | 'archiveImageId' | 'stepType' | 'timestamp'>): LineageStep {
    return {
        parentStepId: null,
        metadata: {},
        ...overrides,
    };
}
