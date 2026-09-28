import { describe, expect, it, vi } from 'vitest';
import type { ArchiveImage } from '../db/types';
import type { LineageStep } from './LineageStore';
import { createLineageNavigator, type LineageNavigatorDeps } from './LineageNavigator';

describe('LineageNavigator', () => {
    describe('replayIntoGenerate', () => {

        it('reports unavailable when the step is missing or not generate-replayable', async () => {
            const editStep = createStep({ id: 'step-3', archiveImageId: 'image-3', stepType: 'ai-edit' });
            const { navigator, sessionStore } = setup({ steps: [editStep], images: [] });

            expect(await navigator.replayIntoGenerate('does-not-exist')).toEqual({
                status: 'unavailable',
                reason: 'This step cannot be replayed into Generate',
            });
            expect(await navigator.replayIntoGenerate('step-3')).toEqual({
                status: 'unavailable',
                reason: 'This step cannot be replayed into Generate',
            });
            expect(sessionStore.transferFromArchive).not.toHaveBeenCalled();
            expect(sessionStore.writeDraft).not.toHaveBeenCalled();
        });
    });

    describe('replayIntoEditor', () => {

        it('reports unavailable when the image is missing from the archive', async () => {
            const step = createStep({ id: 'step-5', archiveImageId: 'image-5', stepType: 'save-as-copy' });
            const { navigator, sessionStore } = setup({ steps: [step], images: [] });

            const outcome = await navigator.replayIntoEditor('step-5');

            expect(outcome).toEqual({
                status: 'unavailable',
                reason: 'Selected step image is missing from the local archive',
            });
            expect(sessionStore.saveLineageSource).not.toHaveBeenCalled();
        });

        it('reports unavailable when the step is not editor-replayable', async () => {
            const step = createStep({ id: 'step-6', archiveImageId: 'image-6', stepType: 'generation' });
            const { navigator } = setup({ steps: [step], images: [createImage({ id: 'image-6' })] });

            expect(await navigator.replayIntoEditor('step-6')).toEqual({
                status: 'unavailable',
                reason: 'This step cannot be replayed into Editor',
            });
        });
    });

    describe('fork', () => {

        it('reports unavailable when the step no longer exists', async () => {
            const { navigator, sessionStore } = setup({ steps: [], images: [] });

            expect(await navigator.fork('missing')).toEqual({
                status: 'unavailable',
                reason: 'Selected lineage step no longer exists',
            });
            expect(sessionStore.saveLineageSource).not.toHaveBeenCalled();
        });
    });
});

interface SetupOptions {
    steps: LineageStep[];
    images: ArchiveImage[];
}

function setup({ steps, images }: SetupOptions) {
    const sessionStore = {
        transferFromArchive: vi.fn().mockResolvedValue(undefined),
        writeDraft: vi.fn(),
        saveLineageSource: vi.fn(),
    } satisfies LineageNavigatorDeps['sessionStore'];

    const navigator = createLineageNavigator({
        lineageStore: {
            getById: async (id) => steps.find((step) => step.id === id) ?? null,
        },
        sessionStore,
        findImage: (archiveImageId) => images.find((image) => image.id === archiveImageId) ?? null,
    });

    return { navigator, sessionStore };
}

function createImage(overrides: Partial<ArchiveImage> = {}): ArchiveImage {
    return {
        id: 'image-1',
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

function createStep(
    overrides: Partial<LineageStep> & Pick<LineageStep, 'id' | 'archiveImageId' | 'stepType'>,
): LineageStep {
    return {
        parentStepId: null,
        timestamp: '2026-04-04T09:00:00.000Z',
        metadata: {},
        ...overrides,
    };
}
