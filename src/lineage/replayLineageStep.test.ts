import { describe, expect, it } from 'vitest';
import type { ArchiveImage } from '../db/types';
import type { LineageStep } from './LineageStore';
import { buildEditorReplay, buildGenerateReplay } from './replayLineageStep';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL } from '../utils/openaiModels';

describe('replayLineageStep', () => {
    it.each([OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL])('replays %s typed controls for Generate and Autopilot', (model) => {
        const controls = { quality: 'max', size: '1536x1024', background: 'transparent', batchSize: 2 };
        for (const stepType of ['generation', 'autopilot-iteration'] as const) {
            const step = createStep({ id: 'new-model', archiveImageId: 'new-image', stepType,
                timestamp: '2026-09-26', metadata: { prompt: 'new prompt', imageModel: { slug: model, controls } },
            });
            expect(buildGenerateReplay(null, step).draft).toMatchObject({ model, prompt: 'new prompt', gptImage: controls });
        }
        expect(buildEditorReplay(createStep({ id: 'new-edit', archiveImageId: 'new-image', stepType: 'ai-edit',
            timestamp: '2026-09-26', metadata: { aiEdit: { prompt: 'precise edit', imageModel: { slug: model } } },
        }))).toEqual({ model, prompt: 'precise edit' });
    });

    it.each(['generation', 'autopilot-iteration'] as const)('replays retired typed %s controls with Flare without rewriting history', (stepType) => {
        const controls = { quality: 'high', size: '1024x1536', background: 'transparent', batchSize: 3 };
        const step = createStep({ id: 'retired', archiveImageId: 'old-image', stepType,
            timestamp: '2026-04-04T10:00:00.000Z', metadata: {
                prompt: 'historical prompt', imageModel: { slug: 'gpt-image-2', controls },
            },
        });
        expect(buildGenerateReplay(null, step).draft).toMatchObject({
            model: 'gpt-image-2.5-flare', prompt: 'historical prompt', gptImage: controls,
        });
        expect(step.metadata.imageModel).toEqual({ slug: 'gpt-image-2', controls });
    });

    it('replays a retired Editor model as Flare while retaining its prompt', () => {
        const step = createStep({ id: 'retired-edit', archiveImageId: 'old-image', stepType: 'ai-edit',
            timestamp: '2026-04-04T10:00:00.000Z', metadata: {
                aiEdit: { prompt: 'historical edit', imageModel: { slug: 'gpt-image-2' } },
            },
        });
        expect(buildEditorReplay(step)).toEqual({ model: 'gpt-image-2.5-flare', prompt: 'historical edit' });
    });

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
                model: OPENAI_IMAGE_MODEL,
                prompt: 'cathedral-sized jellyfish drifting over a neon harbor',
                style: 'editorial sci-fi',
                lighting: 'storm glow',
                palette: 'violet + amber',
                gptImage: {
                    quality: 'high',
                    size: '1536x1024',
                    background: 'transparent',
                    batchSize: 1,
                },
                nanoBananaPro: {
                    aspectRatio: '1:1',
                    imageSize: '1K',
                    batchSize: 1,
                },
                qwenImage2_1: {
                    aspectRatio: '1:1', imageSize: '768', background: 'auto', batchSize: 1,
                },
                flux2Klein4b: { aspectRatio: '1:1', imageSize: '1K', batchSize: 1 },
                isSaved: false,
            },
            lineageSource: {
                archiveImageId: 'image-7',
                stepId: 'step-7',
            },
        });
    });

    it('hydrates masked editor replay metadata into an edit request mask image', async () => {
        const step = createStep({
            id: 'masked-step',
            archiveImageId: 'masked-image',
            stepType: 'ai-edit',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {
                aiEdit: {
                    prompt: 'replace only the painted area',
                    imageModel: {
                        slug: OPENAI_IMAGE_MODEL,
                    },
                    referenceImages: {
                        count: 0,
                    },
                    transformTarget: {
                        mode: 'selected-layers',
                        layerCount: 1,
                        includesBaseLayer: false,
                    },
                    transformMask: {
                        assetId: 'masked-copy:transform-mask',
                        dataUrl: 'data:image/png;base64,bWFzaw==',
                        mimeType: 'image/png',
                    },
                },
            },
        });

        const replay = buildEditorReplay(step);

        expect(replay).toEqual(expect.objectContaining({
            prompt: 'replace only the painted area',
            model: OPENAI_IMAGE_MODEL,
        }));
        expect(replay?.maskImage).toBeInstanceOf(File);
        await expect(replay?.maskImage?.text()).resolves.toBe('mask');
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
                model: OPENAI_IMAGE_MODEL,
                prompt: 'editorial portrait, deep blue haze, dramatic rim light',
                style: '35mm film still',
                lighting: 'neon rim light',
                palette: 'cobalt + vermilion + bone',
                gptImage: {
                    quality: 'high',
                    size: '1536x1024',
                    background: 'transparent',
                    batchSize: 1,
                },
                nanoBananaPro: {
                    aspectRatio: '1:1',
                    imageSize: '1K',
                    batchSize: 1,
                },
                qwenImage2_1: {
                    aspectRatio: '1:1', imageSize: '768', background: 'auto', batchSize: 1,
                },
                flux2Klein4b: { aspectRatio: '1:1', imageSize: '1K', batchSize: 1 },
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

    it('restores Qwen controls from typed Autopilot lineage and defaults legacy background', () => {
        const typedStep = createStep({
            id: 'qwen-auto', archiveImageId: 'auto-qwen', stepType: 'autopilot-iteration',
            timestamp: '2026-09-22T10:00:00.000Z',
            metadata: {
                prompt: 'transparent leaf',
                imageModel: {
                    slug: QWEN_IMAGE_2_1_IMAGE_MODEL,
                    controls: { aspectRatio: '3:4', imageSize: '2K', background: 'transparent', batchSize: 1 },
                },
            },
        });
        expect(buildGenerateReplay(null, typedStep).draft).toMatchObject({
            model: QWEN_IMAGE_2_1_IMAGE_MODEL,
            qwenImage2_1: { aspectRatio: '3:4', imageSize: '2K', background: 'transparent', batchSize: 1 },
        });

        const legacyStep = createStep({
            ...typedStep, id: 'qwen-legacy', stepType: 'generation',
            metadata: { model: QWEN_IMAGE_2_1_IMAGE_MODEL, aspectRatio: '3:4', imageSize: '2K' },
        });
        expect(buildGenerateReplay(null, legacyStep).draft.qwenImage2_1).toEqual({
            aspectRatio: '3:4', imageSize: '2K', background: 'auto', batchSize: 1,
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
            gptImage: {
                quality: 'medium',
                size: '1024x1024',
                background: 'auto',
            },
            style: 'architectural model',
            isSaved: false,
        });
    });

    it('falls back to Flare with retired archive controls for older sparse Generate metadata', () => {
        const image = createImage({
            model: 'gpt-image-2',
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
            gptImage: {
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
