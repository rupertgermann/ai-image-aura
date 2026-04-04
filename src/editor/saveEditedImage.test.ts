import { describe, expect, it, vi } from 'vitest';
import type { ArchiveImage } from '../db/types';
import { createLineageStore, type LineageMetadataPort, type LineageStep } from '../lineage/LineageStore';
import { saveEditedImage, type EditorSaveContext } from './saveEditedImage';

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

describe('saveEditedImage', () => {
    it('writes an ai-edit step when an AI edit is saved as a copy', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        const savedImage = await saveEditedImage(createArchiveImage(), 'data:image/png;base64,edited-copy', {
            ...createSaveContext(),
            isCopy: true,
            aiEditPrompt: 'add a moonlit skyline',
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            clock: () => '2026-04-04T12:00:00.000Z',
            makeId: () => 'branch-image',
        });

        await expect(lineage.getByArchiveImageId(savedImage.id)).resolves.toEqual([
            expect.objectContaining({
                archiveImageId: 'branch-image',
                parentStepId: 'step-2',
                stepType: 'ai-edit',
                timestamp: '2026-04-04T12:00:00.000Z',
                metadata: expect.objectContaining({
                    sourceArchiveImageId: 'source-image',
                    outputArchiveImageId: 'branch-image',
                    editPrompt: 'add a moonlit skyline',
                    overwrite: false,
                    editorAdjustments: expect.objectContaining({
                        brightness: 110,
                        contrast: 95,
                        saturation: 125,
                        filter: 'sepia(100%)',
                    }),
                }),
            }),
        ]);
    });

    it('writes a save-as-copy step branching from the source image', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        await saveEditedImage(createArchiveImage(), 'data:image/png;base64,manual-copy', {
            ...createSaveContext(),
            isCopy: true,
            aiEditPrompt: null,
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            clock: () => '2026-04-04T12:30:00.000Z',
            makeId: () => 'manual-branch',
        });

        await expect(lineage.getByArchiveImageId('manual-branch')).resolves.toEqual([
            expect.objectContaining({
                archiveImageId: 'manual-branch',
                parentStepId: 'step-2',
                stepType: 'save-as-copy',
                metadata: expect.objectContaining({
                    sourceArchiveImageId: 'source-image',
                    outputArchiveImageId: 'manual-branch',
                    overwrite: false,
                    editPrompt: null,
                }),
            }),
        ]);
    });

    it('writes an overwrite step pointing to the previous step for that image', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        await saveEditedImage(createArchiveImage(), 'data:image/png;base64,manual-overwrite', {
            ...createSaveContext(),
            isCopy: false,
            aiEditPrompt: null,
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            clock: () => '2026-04-04T13:00:00.000Z',
        });

        await expect(lineage.getByArchiveImageId('source-image')).resolves.toEqual([
            expect.objectContaining({ id: 'step-1', stepType: 'generation' }),
            expect.objectContaining({ id: 'step-2', stepType: 'ai-edit' }),
            expect.objectContaining({
                parentStepId: 'step-2',
                stepType: 'overwrite',
                timestamp: '2026-04-04T13:00:00.000Z',
                metadata: expect.objectContaining({
                    sourceArchiveImageId: 'source-image',
                    outputArchiveImageId: 'source-image',
                    overwrite: true,
                    editPrompt: null,
                }),
            }),
        ]);
    });

    it('marks AI overwrite saves as ai-edit lineage steps', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        await saveEditedImage(createArchiveImage(), 'data:image/png;base64,ai-overwrite', {
            ...createSaveContext(),
            isCopy: false,
            aiEditPrompt: 'make the nebula denser',
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            clock: () => '2026-04-04T13:30:00.000Z',
        });

        const steps = await lineage.getByArchiveImageId('source-image');
        expect(steps.at(-1)).toEqual(expect.objectContaining({
            parentStepId: 'step-2',
            stepType: 'ai-edit',
            metadata: expect.objectContaining({
                editPrompt: 'make the nebula denser',
                overwrite: true,
            }),
        }));
    });

    it('does not write provenance when archive save fails', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);
        const error = new Error('disk full');

        await expect(saveEditedImage(createArchiveImage(), 'data:image/png;base64,failed', {
            ...createSaveContext(),
            isCopy: true,
            aiEditPrompt: 'make it cinematic',
        }, {
            saveImage: vi.fn(async () => {
                throw error;
            }),
            lineageStore: lineage,
        })).rejects.toThrow(error);

        const steps = await lineage.getByArchiveImageId('source-image');
        expect(steps).toHaveLength(2);
        await expect(lineage.getByArchiveImageId('failed-copy')).resolves.toEqual([]);
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

async function seedSourceLineage(lineage: ReturnType<typeof createStore>) {
    await lineage.save({
        archiveImageId: 'source-image',
        parentStepId: null,
        stepType: 'generation',
        timestamp: '2026-04-04T09:00:00.000Z',
        metadata: { prompt: 'cosmic koi pond' },
    });
    await lineage.save({
        archiveImageId: 'source-image',
        parentStepId: 'step-1',
        stepType: 'ai-edit',
        timestamp: '2026-04-04T10:00:00.000Z',
        metadata: { editPrompt: 'add aurora reflections' },
    });
}

function createArchiveImage(overrides: Partial<ArchiveImage> = {}): ArchiveImage {
    return {
        id: 'source-image',
        url: 'data:image/png;base64,source',
        prompt: 'cosmic koi pond',
        model: 'gpt-image-1.5',
        timestamp: '2026-04-04T08:00:00.000Z',
        width: 1024,
        height: 1024,
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        style: 'dreamlike',
        lighting: 'moonlit',
        palette: 'indigo + gold',
        references: ['data:image/png;base64,ref1'],
        ...overrides,
    };
}

function createSaveContext(overrides: Partial<EditorSaveContext> = {}): EditorSaveContext {
    return {
        isCopy: false,
        references: ['data:image/png;base64,ref2'],
        adjustments: {
            brightness: 110,
            contrast: 95,
            saturation: 125,
            filter: 'sepia(100%)',
        },
        aiEditPrompt: null,
        ...overrides,
    };
}

function compareSteps(left: LineageStep, right: LineageStep) {
    return left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id);
}
