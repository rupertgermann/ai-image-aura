import { describe, expect, it, vi } from 'vitest';
import type { ArchiveImage } from '../db/types';
import { createLineageStore, type LineageMetadataPort, type LineageStep } from '../lineage/LineageStore';
import { saveEditedImage, type EditorSaveContext } from './saveEditedImage';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL } from '../utils/openaiModels';

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
                    sourceImage: {
                        archiveImageId: 'source-image',
                    },
                    outputImage: {
                        archiveImageId: 'branch-image',
                    },
                    save: {
                        overwrite: false,
                        copy: true,
                    },
                    aiEdit: {
                        prompt: 'add a moonlit skyline',
                        imageModel: {
                            slug: OPENAI_IMAGE_MODEL,
                        },
                        referenceImages: {
                            count: 1,
                        },
                        transformTarget: {
                            mode: null,
                            layerCount: null,
                            includesBaseLayer: null,
                        },
                    },
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
                    sourceImage: {
                        archiveImageId: 'source-image',
                    },
                    outputImage: {
                        archiveImageId: 'manual-branch',
                    },
                    save: {
                        overwrite: false,
                        copy: true,
                    },
                    editorAdjustment: {
                        brightness: 110,
                        contrast: 95,
                        saturation: 125,
                        filter: 'sepia(100%)',
                    },
                    aiEdit: null,
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
                    sourceImage: {
                        archiveImageId: 'source-image',
                    },
                    outputImage: {
                        archiveImageId: 'source-image',
                    },
                    save: {
                        overwrite: true,
                        copy: false,
                    },
                    editorAdjustment: {
                        brightness: 110,
                        contrast: 95,
                        saturation: 125,
                        filter: 'sepia(100%)',
                    },
                    aiEdit: null,
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

    it('records the model used for an AI edit on the saved image and lineage step', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        const savedImage = await saveEditedImage(createArchiveImage(), 'data:image/png;base64,nano-edit', {
            ...createSaveContext(),
            isCopy: true,
            aiEditPrompt: 'preserve the source composition but make it cinematic',
            aiEditModel: NANO_BANANA_PRO_IMAGE_MODEL,
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            clock: () => '2026-04-04T15:00:00.000Z',
            makeId: () => 'nano-edit-copy',
        });

        expect(savedImage.model).toBe(NANO_BANANA_PRO_IMAGE_MODEL);
        const steps = await lineage.getByArchiveImageId('nano-edit-copy');
        expect(steps.at(-1)?.metadata).toEqual(expect.objectContaining({
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            aiEdit: expect.objectContaining({
                imageModel: {
                    slug: NANO_BANANA_PRO_IMAGE_MODEL,
                },
            }),
        }));
    });

    it('stores masked AI edit lineage as a transform mask asset without adding mask layers', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        const savedImage = await saveEditedImage(createArchiveImage(), 'data:image/png;base64,masked-edit', {
            ...createSaveContext(),
            isCopy: true,
            layerStack: createLayerStack(),
            aiEditPrompt: 'replace only the painted area',
            targetMode: 'selected-layers',
            transformMask: {
                assetId: null,
                dataUrl: 'data:image/png;base64,bWFzaw==',
                mimeType: 'image/png',
            },
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            makeId: () => 'masked-copy',
        });

        const steps = await lineage.getByArchiveImageId(savedImage.id);
        expect(steps.at(-1)?.metadata).toEqual(expect.objectContaining({
            aiEdit: expect.objectContaining({
                transformMask: {
                    assetId: 'masked-copy:transform-mask',
                    dataUrl: 'data:image/png;base64,bWFzaw==',
                    mimeType: 'image/png',
                },
            }),
            transformMaskAsset: {
                assetId: 'masked-copy:transform-mask',
                dataUrl: 'data:image/png;base64,bWFzaw==',
                mimeType: 'image/png',
            },
        }));
        expect(savedImage.layerStack?.layers.map((layer) => layer.id)).toEqual(['base', 'upload', 'ai-layer']);
        expect(savedImage.layerStack?.layers.some((layer) => layer.id.includes('mask'))).toBe(false);
    });

    it('persists layered save metadata without putting the full stack in lineage', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        const savedImage = await saveEditedImage(createArchiveImage(), 'data:image/png;base64,layered', {
            ...createSaveContext(),
            isCopy: true,
            layerStack: createLayerStack(),
            aiEditPrompt: 'replace the sky',
            targetMode: 'selected-layers',
            targetLayerCount: 1,
            targetIncludesBaseLayer: false,
            aiResultLayerId: 'ai-layer',
            aiResultLayerName: 'AI result',
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            makeId: () => 'layered-copy',
        });

        expect(savedImage.layerStack?.layers.map((layer) => layer.id)).toEqual(['base', 'upload', 'ai-layer']);
        const steps = await lineage.getByArchiveImageId('layered-copy');
        expect(steps.at(-1)?.metadata).toEqual(expect.objectContaining({
            editPrompt: 'replace the sky',
            model: OPENAI_IMAGE_MODEL,
            layers: {
                layered: true,
                count: 3,
                visibleCount: 2,
                aiResultLayer: {
                    id: 'ai-layer',
                    name: 'AI result',
                },
            },
            isLayered: true,
            layerCount: 3,
            visibleLayerCount: 2,
            targetMode: 'selected-layers',
            targetLayerCount: 1,
            targetIncludesBaseLayer: false,
            aiResultLayerId: 'ai-layer',
            aiResultLayerName: 'AI result',
        }));
        expect(steps.at(-1)?.metadata).not.toHaveProperty('layerStack');
        expect(JSON.stringify(steps.at(-1)?.metadata)).not.toContain('data:image/png;base64');
    });

    it('counts only saved user Reference images in AI edit lineage metadata', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        const savedImage = await saveEditedImage(createArchiveImage(), 'data:image/png;base64,edited-with-refs', {
            ...createSaveContext(),
            isCopy: true,
            references: [
                'data:image/png;base64,user-ref-1',
                'data:image/png;base64,user-ref-2',
            ],
            aiEditPrompt: 'blend the selected subject into the scene',
            targetMode: 'selected-layers',
            targetLayerCount: 1,
            targetIncludesBaseLayer: false,
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            makeId: () => 'edit-with-user-refs',
        });

        const steps = await lineage.getByArchiveImageId(savedImage.id);
        expect(steps.at(-1)).toEqual(expect.objectContaining({
            stepType: 'ai-edit',
            metadata: expect.objectContaining({
                referenceCount: 2,
                targetMode: 'selected-layers',
                aiEdit: {
                    prompt: 'blend the selected subject into the scene',
                    imageModel: {
                        slug: OPENAI_IMAGE_MODEL,
                    },
                    referenceImages: {
                        count: 2,
                    },
                    transformTarget: {
                        mode: 'selected-layers',
                        layerCount: 1,
                        includesBaseLayer: false,
                    },
                },
            }),
        }));
        expect(savedImage.references).toEqual([
            'data:image/png;base64,user-ref-1',
            'data:image/png;base64,user-ref-2',
        ]);
    });


    it('uses an explicit parent step id when forking from an older lineage step', async () => {
        const lineage = createStore();
        await seedSourceLineage(lineage);

        await saveEditedImage(createArchiveImage(), 'data:image/png;base64,forked-overwrite', {
            ...createSaveContext(),
            isCopy: false,
        }, {
            saveImage: vi.fn(async (image) => image),
            lineageStore: lineage,
            parentStepId: 'step-1',
            clock: () => '2026-04-04T14:00:00.000Z',
        });

        const steps = await lineage.getByArchiveImageId('source-image');
        expect(steps.at(-1)).toEqual(expect.objectContaining({
            parentStepId: 'step-1',
            timestamp: '2026-04-04T14:00:00.000Z',
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

function createLayerStack() {
    return {
        canvasWidth: 1024,
        canvasHeight: 1024,
        layers: [
            {
                id: 'base',
                name: 'Base',
                kind: 'base' as const,
                assetUrl: 'data:image/png;base64,source',
                x: 0,
                y: 0,
                width: 1024,
                height: 1024,
                rotation: 0,
                opacity: 1,
                blendMode: 'normal' as const,
                visible: true,
                locked: true,
            },
            {
                id: 'upload',
                name: 'Upload',
                kind: 'uploaded' as const,
                assetUrl: 'data:image/png;base64,upload',
                x: 100,
                y: 100,
                width: 400,
                height: 400,
                rotation: 0,
                opacity: 0.8,
                blendMode: 'normal' as const,
                visible: false,
                locked: false,
            },
            {
                id: 'ai-layer',
                name: 'AI result',
                kind: 'ai-result' as const,
                assetUrl: 'data:image/png;base64,ai',
                x: 100,
                y: 100,
                width: 400,
                height: 400,
                rotation: 0,
                opacity: 1,
                blendMode: 'normal' as const,
                visible: true,
                locked: false,
            },
        ],
    };
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
        model: OPENAI_IMAGE_MODEL,
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
