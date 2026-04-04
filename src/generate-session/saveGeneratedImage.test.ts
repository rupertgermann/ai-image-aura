import { describe, expect, it, vi } from 'vitest';
import { createLineageStore, type LineageMetadataPort, type LineageStep } from '../lineage/LineageStore';
import { saveGeneratedImage } from './saveGeneratedImage';
import type { ArchiveImage } from '../db/types';
import type { GenerateLineageSource } from './GenerateSession';

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
    it('writes a generation step after a successful archive save', async () => {
        const lineage = createStore();
        const sessionStore = createSessionStore();
        const image = createArchiveImage();

        const savedImage = await saveGeneratedImage(image, {
            saveImage: vi.fn(async (nextImage) => nextImage),
            lineageStore: lineage,
            sessionStore,
        });

        const steps = await lineage.getByArchiveImageId(savedImage.id);

        expect(steps).toEqual([
            expect.objectContaining({
                archiveImageId: savedImage.id,
                parentStepId: null,
                stepType: 'generation',
                timestamp: savedImage.timestamp,
                metadata: expect.objectContaining({
                    prompt: savedImage.prompt,
                    quality: savedImage.quality,
                    aspectRatio: savedImage.aspectRatio,
                    sourceArchiveImageId: null,
                    referenceIds: [],
                }),
            }),
        ]);
        expect(sessionStore.clearLineageSource).toHaveBeenCalledOnce();
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
                    referenceCount: 2,
                    referenceIds: [
                        'generated-2:reference:0',
                        'generated-2:reference:1',
                    ],
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
        model: 'gpt-image-1.5',
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
