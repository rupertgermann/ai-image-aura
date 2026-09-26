import { describe, expect, it, vi } from 'vitest';
import { createLineageStore, type LineageMetadataPort, type LineageStep } from '../lineage/LineageStore';
import { saveGeneratedImage } from './saveGeneratedImage';
import type { ArchiveImage } from '../db/types';
import { DEFAULT_GENERATE_DRAFT, type GenerateDraft, type GenerateLineageSource } from './GenerateSession';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL } from '../utils/openaiModels';
import { buildGenerateReplay } from '../lineage/replayLineageStep';

class InMemoryLineageMetadataPort implements LineageMetadataPort {
    private readonly steps = new Map<string, LineageStep>();

    async init(): Promise<void> {
        return undefined;
    }

    async save(step: LineageStep): Promise<void> {
        this.steps.set(step.id, step);
    }

    async getById(id: string): Promise<LineageStep | null> {
        return this.steps.get(id) ?? null;
    }

    async getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]> {
        return Array.from(this.steps.values())
            .filter((step) => step.archiveImageId === archiveImageId)
            .sort(compareSteps);
    }

    async getChildren(parentStepId: string): Promise<LineageStep[]> {
        return Array.from(this.steps.values())
            .filter((step) => step.parentStepId === parentStepId)
            .sort(compareSteps);
    }

    async remove(id: string): Promise<void> {
        this.steps.delete(id);
    }
}

describe('saveGeneratedImage', () => {
    it('saves Qwen controls for exact lineage replay', async () => {
        const lineage = createStore();
        const image = createArchiveImage({
            id: 'qwen-output', model: QWEN_IMAGE_2_1_IMAGE_MODEL, quality: '2K',
            aspectRatio: '9:16', background: 'transparent', width: 1536, height: 2752,
        });
        const runDraft: GenerateDraft = {
            ...DEFAULT_GENERATE_DRAFT,
            model: QWEN_IMAGE_2_1_IMAGE_MODEL,
            prompt: image.prompt,
            qwenImage2_1: { aspectRatio: '9:16' as const, imageSize: '2K' as const, background: 'transparent' as const, batchSize: 3 },
        };

        await saveGeneratedImage(image, {
            saveImage: async (nextImage) => nextImage,
            lineageStore: lineage,
            sessionStore: createSessionStore(),
            runDraft,
        });
        const [step] = await lineage.getByArchiveImageId(image.id);
        expect(step.metadata).toMatchObject({
            model: QWEN_IMAGE_2_1_IMAGE_MODEL,
            imageModel: { slug: QWEN_IMAGE_2_1_IMAGE_MODEL, controls: runDraft.qwenImage2_1 },
            imageSize: '2K', background: 'transparent',
            dimensions: { width: 1536, height: 2752 },
        });
        expect(buildGenerateReplay(image, step).draft.qwenImage2_1).toEqual(runDraft.qwenImage2_1);
    });
    it('writes a reference-generation step with stable reference ids', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore();
        const image = createArchiveImage({
            id: 'generated-2',
            references: ['data:image/png;base64,aaa', 'data:image/png;base64,bbb'],
        });

        await saveGeneratedImage(image, {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
        });

        await expect(lineage.getByArchiveImageId('generated-2')).resolves.toEqual([
            expect.objectContaining({
                stepType: 'reference-generation',
                metadata: expect.objectContaining({
                    referenceImages: {
                        count: 2,
                        ids: [
                            'generated-2:reference:0',
                            'generated-2:reference:1',
                        ],
                    },
                    referenceCount: 2,
                    referenceIds: [
                        'generated-2:reference:0',
                        'generated-2:reference:1',
                    ],
                }),
            }),
        ]);
    });

    it('writes actual parameters into generation lineage metadata', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore();
        const actualParameters = {
            revisedPrompt: 'refined prompt',
            size: '1536x1024',
            quality: 'high',
            elapsedMs: 930,
        };
        const image = createArchiveImage({
            id: 'generated-with-actuals',
            actualParameters,
        });

        await saveGeneratedImage(image, {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
        });

        await expect(lineage.getByArchiveImageId('generated-with-actuals')).resolves.toEqual([
            expect.objectContaining({
                stepType: 'generation',
                metadata: expect.objectContaining({
                    actualParameters,
                }),
            }),
        ]);
    });

    it('records nano-banana-pro archive metadata dimensions through shared Image model controls', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore();
        const image = createArchiveImage({
            id: 'generated-nano',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            quality: '2K',
            aspectRatio: '16:9',
            background: 'auto',
            width: 2048,
            height: 1152,
        });

        await saveGeneratedImage(image, {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
        });

        await expect(lineage.getByArchiveImageId('generated-nano')).resolves.toEqual([
            expect.objectContaining({
                stepType: 'generation',
                metadata: expect.objectContaining({
                    model: NANO_BANANA_PRO_IMAGE_MODEL,
                    imageModel: {
                        slug: NANO_BANANA_PRO_IMAGE_MODEL,
                        controls: {
                            aspectRatio: '16:9',
                            imageSize: '2K',
                            batchSize: 1,
                        },
                    },
                    dimensions: {
                        width: 2048,
                        height: 1152,
                    },
                    quality: '2K',
                    aspectRatio: '16:9',
                    background: 'auto',
                    width: 2048,
                    height: 1152,
                    imageSize: '2K',
                }),
            }),
        ]);
    });

    it('links create-similar saves to the source image latest lineage step', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore({ archiveImageId: 'source-image' });
        await lineage.save({
            archiveImageId: 'source-image',
            parentStepId: null,
            stepType: 'generation',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: { prompt: 'first prompt' },
        });
        await lineage.save({
            archiveImageId: 'source-image',
            parentStepId: 'step-1',
            stepType: 'overwrite',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: { prompt: 'refined prompt' },
        });

        await saveGeneratedImage(createArchiveImage({ id: 'branch-image' }), {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
        });

        await expect(lineage.getByArchiveImageId('branch-image')).resolves.toEqual([
            expect.objectContaining({
                parentStepId: 'step-2',
                metadata: expect.objectContaining({
                    sourceArchiveImageId: 'source-image',
                }),
            }),
        ]);
    });

    it('uses the explicitly selected lineage step id for forked saves', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore({ archiveImageId: 'source-image', stepId: 'step-1' });
        await lineage.save({
            archiveImageId: 'source-image',
            parentStepId: null,
            stepType: 'generation',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: { prompt: 'first prompt' },
        });
        await lineage.save({
            archiveImageId: 'source-image',
            parentStepId: 'step-1',
            stepType: 'overwrite',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: { prompt: 'newest prompt' },
        });

        await saveGeneratedImage(createArchiveImage({ id: 'forked-image' }), {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
        });

        const steps = await lineage.getByArchiveImageId('forked-image');
        expect(steps.at(-1)).toEqual(expect.objectContaining({
            parentStepId: 'step-1',
        }));
    });

    it('can reuse a captured lineage source for multiple batch result saves', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore(null);
        await lineage.save({
            archiveImageId: 'source-image',
            parentStepId: null,
            stepType: 'generation',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: { prompt: 'source prompt' },
        });
        const lineageSource = { archiveImageId: 'source-image' };

        await saveGeneratedImage(createArchiveImage({ id: 'batch-result-1' }), {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
            lineageSource,
        });
        await saveGeneratedImage(createArchiveImage({ id: 'batch-result-2' }), {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
            lineageSource,
        });

        await expect(lineage.getByArchiveImageId('batch-result-1')).resolves.toEqual([
            expect.objectContaining({ parentStepId: 'step-1' }),
        ]);
        await expect(lineage.getByArchiveImageId('batch-result-2')).resolves.toEqual([
            expect.objectContaining({ parentStepId: 'step-1' }),
        ]);
    });

    it('does not write provenance when archive save fails', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore({ archiveImageId: 'source-image' });
        const error = new Error('disk full');

        await expect(saveGeneratedImage(createArchiveImage(), {
            saveImage: vi.fn(async () => {
                throw error;
            }),
            lineageStore: lineage,
            sessionStore,
        })).rejects.toThrow(error);

        await expect(lineage.getByArchiveImageId('generated-1')).resolves.toEqual([]);
        expect(sessionStore.clearLineageSource).not.toHaveBeenCalled();
    });
});

function createStore() {
    let nextId = 0;

    return createLineageStore({
        metadata: new InMemoryLineageMetadataPort(),
        makeId: () => {
            nextId += 1;
            return `step-${nextId}`;
        },
    });
}

function createSessionStore(lineageSource: GenerateLineageSource | null = null) {
    return {
        loadLineageSource: vi.fn(() => lineageSource),
        clearLineageSource: vi.fn(),
    };
}

function createArchiveImage(overrides: Partial<ArchiveImage> = {}): ArchiveImage {
    return {
        id: 'generated-1',
        url: 'data:image/png;base64,abc123',
        prompt: 'bioluminescent forest',
        model: OPENAI_IMAGE_MODEL,
        timestamp: '2026-04-04T12:00:00.000Z',
        width: 1024,
        height: 1024,
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        style: 'risograph poster',
        lighting: 'golden hour',
        palette: 'copper + teal + cream',
        references: [],
        ...overrides,
    };
}

function compareSteps(left: LineageStep, right: LineageStep) {
    return left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id);
}
