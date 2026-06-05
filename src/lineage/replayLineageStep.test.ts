import { describe, expect, it } from 'vitest';
import type { ArchiveImage } from '../db/types';
import type { LineageStep } from './LineageStore';
import { buildGenerateReplay, isEditorReplayable, isGenerateReplayable } from './replayLineageStep';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL } from '../utils/openaiModels';

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
                model: 'gpt-image-2',
                prompt: 'cathedral-sized jellyfish drifting over a neon harbor',
                style: 'editorial sci-fi',
                lighting: 'storm glow',
                palette: 'violet + amber',
                gptImage2: {
                    quality: 'high',
                    size: '1536x1024',
                    background: 'transparent',
                },
                nanoBananaPro: {
                    aspectRatio: '1:1',
                    imageSize: '1K',
                },
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
                model: 'gpt-image-2',
                prompt: 'editorial portrait, deep blue haze, dramatic rim light',
                style: '35mm film still',
                lighting: 'neon rim light',
                palette: 'cobalt + vermilion + bone',
                gptImage2: {
                    quality: 'high',
                    size: '1536x1024',
                    background: 'transparent',
                },
                nanoBananaPro: {
                    aspectRatio: '1:1',
                    imageSize: '1K',
                },
                isSaved: false,
            },
            lineageSource: {
                archiveImageId: 'autopilot:run:iteration:2',
                stepId: 'step-9',
            },
        });
    });

    it('restores nano model controls from lineage metadata', () => {
        const step = createStep({
            id: 'step-nano',
            archiveImageId: 'image-nano',
            stepType: 'generation',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {
                model: 'nano-banana-pro',
                prompt: 'crystal observatory over a kelp forest',
                aspectRatio: '16:9',
                imageSize: '4K',
                style: 'isometric diorama',
            },
        });

        expect(buildGenerateReplay(null, step).draft).toMatchObject({
            model: 'nano-banana-pro',
            prompt: 'crystal observatory over a kelp forest',
            nanoBananaPro: {
                aspectRatio: '16:9',
                imageSize: '4K',
            },
            style: 'isometric diorama',
        });
    });

    it('hydrates generate replay from typed Generate lineage metadata without flat legacy fields', () => {
        const step = createStep({
            id: 'step-typed',
            archiveImageId: 'image-typed',
            stepType: 'generation',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {
                prompt: 'wide botanical observatory under glass',
                imageModel: {
                    slug: NANO_BANANA_PRO_IMAGE_MODEL,
                    controls: {
                        aspectRatio: '21:9',
                        imageSize: '2K',
                    },
                },
                dimensions: {
                    width: 2048,
                    height: 878,
                },
                sourceArchiveImageId: null,
                referenceImages: {
                    count: 0,
                    ids: [],
                },
                style: 'architectural model',
            },
        });

        expect(buildGenerateReplay(null, step).draft).toMatchObject({
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            prompt: 'wide botanical observatory under glass',
            nanoBananaPro: {
                aspectRatio: '21:9',
                imageSize: '2K',
            },
            gptImage2: {
                quality: 'medium',
                size: '1024x1024',
                background: 'auto',
            },
            style: 'architectural model',
            isSaved: false,
        });
    });

    it('falls back to archive image controls for older sparse Generate metadata', () => {
        const image = createImage({
            model: OPENAI_IMAGE_MODEL,
            quality: 'low',
            aspectRatio: '1024x1536',
            background: 'opaque',
        });
        const step = createStep({
            id: 'step-old',
            archiveImageId: 'image-old',
            stepType: 'generation',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {
                prompt: 'legacy record',
            },
        });

        expect(buildGenerateReplay(image, step).draft).toMatchObject({
            model: OPENAI_IMAGE_MODEL,
            prompt: 'legacy record',
            gptImage2: {
                quality: 'low',
                size: '1024x1536',
                background: 'opaque',
            },
            isSaved: false,
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
