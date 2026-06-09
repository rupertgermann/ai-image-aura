import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ArchiveStore } from './ArchiveStore';
import type { ArchiveImage } from '../db/types';
import { buildArchiveZip, importArchiveZip, LINEAGE_MANIFEST_FILE, LINEAGE_MANIFEST_VERSION } from './ArchiveTransfer';
import { createLineageStore, type LineageMetadataPort, type LineageStep, type LineageStore } from '../lineage/LineageStore';
import { OPENAI_IMAGE_MODEL, OPENAI_RESPONSES_MODEL } from '../utils/openaiModels';

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

class InMemoryArchiveStore implements Pick<ArchiveStore, 'save'> {
    readonly images = new Map<string, ArchiveImage>();

    async save(input: ArchiveImage): Promise<ArchiveImage> {
        this.images.set(input.id, input);
        return input;
    }
}

describe('ArchiveTransfer', () => {
    it('exports a lineage manifest with every exported image step', async () => {
        const lineage = createStore();
        const images = createImages();

        await seedLineage(lineage);

        const zipBytes = await buildArchiveZip(images, { lineageStore: lineage });
        const zip = await JSZip.loadAsync(zipBytes);
        const manifestText = await zip.file(LINEAGE_MANIFEST_FILE)?.async('text');

        expect(manifestText).toBeTruthy();
        expect(JSON.parse(manifestText ?? 'null')).toEqual({
            version: 1,
            steps: [
                expect.objectContaining({ id: 'step-1', stepType: 'generation' }),
                expect.objectContaining({ id: 'step-2', stepType: 'overwrite' }),
                expect.objectContaining({ id: 'step-3', stepType: 'ai-edit' }),
                expect.objectContaining({ id: 'step-4', stepType: 'save-as-copy' }),
            ],
        });
    });

    it('round-trips typed Generate, Editor, and Autopilot lineage metadata without changing the lineage manifest version', async () => {
        const sourceLineage = createStore();
        const generateMetadata = createTypedGenerateMetadata();
        const editorMetadata = createTypedEditorMetadata();
        const autopilotMetadata = createTypedAutopilotMetadata();
        await sourceLineage.save({
            id: 'typed-generate-step',
            archiveImageId: 'image-1',
            parentStepId: null,
            stepType: 'reference-generation',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: generateMetadata,
        });
        await sourceLineage.save({
            id: 'typed-editor-step',
            archiveImageId: 'image-1',
            parentStepId: 'typed-generate-step',
            stepType: 'ai-edit',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: editorMetadata,
        });
        await sourceLineage.save({
            id: 'typed-autopilot-step',
            archiveImageId: 'image-1',
            parentStepId: 'typed-editor-step',
            stepType: 'autopilot-iteration',
            timestamp: '2026-04-04T11:00:00.000Z',
            metadata: autopilotMetadata,
        });

        const zipBytes = await buildArchiveZip([createImages()[0]!], { lineageStore: sourceLineage });
        const zip = await JSZip.loadAsync(zipBytes);
        const manifest = JSON.parse(await zip.file(LINEAGE_MANIFEST_FILE)!.async('text')) as {
            version: number;
            steps: LineageStep[];
        };

        expect(manifest.version).toBe(LINEAGE_MANIFEST_VERSION);
        expect(manifest.steps).toEqual([
            expect.objectContaining({
                id: 'typed-generate-step',
                metadata: generateMetadata,
            }),
            expect.objectContaining({
                id: 'typed-editor-step',
                metadata: editorMetadata,
            }),
            expect.objectContaining({
                id: 'typed-autopilot-step',
                metadata: autopilotMetadata,
            }),
        ]);

        const importedLineage = createStore();
        const summary = await importArchiveZip(zipBytes, {
            archiveStore: new InMemoryArchiveStore(),
            lineageStore: importedLineage,
        });

        expect(summary.importedStepIds).toEqual(['typed-generate-step', 'typed-editor-step', 'typed-autopilot-step']);
        await expect(importedLineage.getByArchiveImageId('image-1')).resolves.toEqual([
            expect.objectContaining({
                id: 'typed-generate-step',
                metadata: generateMetadata,
            }),
            expect.objectContaining({
                id: 'typed-editor-step',
                metadata: editorMetadata,
            }),
            expect.objectContaining({
                id: 'typed-autopilot-step',
                metadata: autopilotMetadata,
            }),
        ]);
    });

    it('round-trips archive images and lineage relationships through ZIP import', async () => {
        const sourceLineage = createStore();
        const sourceImages = [...createImages(), createLayeredImage()];
        await seedLineage(sourceLineage);

        const zipBytes = await buildArchiveZip(sourceImages, { lineageStore: sourceLineage });
        const archiveStore = new InMemoryArchiveStore();
        const importedLineage = createStore();

        const summary = await importArchiveZip(zipBytes, {
            archiveStore,
            lineageStore: importedLineage,
        });

        expect(summary.brokenParentReferences).toEqual([]);
        expect(summary.missingAssetFiles).toEqual([]);
        expect(summary.importedImageIds).toEqual(['image-1', 'image-2', 'image-3', 'layered-image']);
        expect(summary.importedStepIds).toEqual(['step-1', 'step-2', 'step-3', 'step-4']);
        expect(Array.from(archiveStore.images.keys())).toEqual(['image-1', 'image-2', 'image-3', 'layered-image']);
        expect(archiveStore.images.get('layered-image')?.layerStack?.layers.map((layer) => layer.id)).toEqual(['base', 'upload']);

        await expect(importedLineage.getByArchiveImageId('image-1')).resolves.toEqual([
            expect.objectContaining({ id: 'step-1', stepType: 'generation', parentStepId: null }),
            expect.objectContaining({ id: 'step-2', stepType: 'overwrite', parentStepId: 'step-1' }),
        ]);
        await expect(importedLineage.getByArchiveImageId('image-2')).resolves.toEqual([
            expect.objectContaining({ id: 'step-3', stepType: 'ai-edit', parentStepId: 'step-2' }),
        ]);
        await expect(importedLineage.getByArchiveImageId('image-3')).resolves.toEqual([
            expect.objectContaining({ id: 'step-4', stepType: 'save-as-copy', parentStepId: 'step-2' }),
        ]);
    });

    it('round-trips layered image assets and stable layer ids', async () => {
        const sourceLineage = createStore();
        const sourceImages = [createLayeredImage()];
        const zipBytes = await buildArchiveZip(sourceImages, { lineageStore: sourceLineage });
        const archiveStore = new InMemoryArchiveStore();

        const summary = await importArchiveZip(zipBytes, {
            archiveStore,
            lineageStore: createStore(),
        });

        expect(summary.missingAssetFiles).toEqual([]);
        const imported = archiveStore.images.get('layered-image');
        expect(imported?.layerStack?.layers.map((layer) => [layer.id, layer.assetUrl])).toEqual([
            ['base', 'data:image/png;base64,aaaa'],
            ['upload', 'data:image/png;base64,bBBB'],
        ]);
    });

    it('reports missing layer assets without rejecting old archive imports', async () => {
        const zipBytes = await buildArchiveZip([createLayeredImage()], { lineageStore: createStore() });
        const zip = await JSZip.loadAsync(zipBytes);
        zip.remove('aura-layered-image-layer-upload.png');
        const archiveStore = new InMemoryArchiveStore();

        const summary = await importArchiveZip(await zip.generateAsync({ type: 'uint8array' }), {
            archiveStore,
            lineageStore: createStore(),
        });

        expect(summary.missingAssetFiles).toEqual(['aura-layered-image-layer-upload.png']);
        expect(archiveStore.images.get('layered-image')?.layerStack?.layers.map((layer) => layer.id)).toEqual(['base']);
    });

    it('reports broken parent references during import instead of dropping them', async () => {
        const zip = new JSZip();
        zip.file('aura-image-1.png', Uint8Array.from([105, 109, 103]));
        zip.file('archive-manifest.json', JSON.stringify({
            version: 1,
            images: [
                {
                    id: 'image-1',
                    prompt: 'broken import',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-04-04T09:00:00.000Z',
                    imageFileName: 'aura-image-1.png',
                    references: [],
                },
            ],
        }));
        zip.file('lineage-manifest.json', JSON.stringify({
            version: 1,
            steps: [
                {
                    id: 'step-1',
                    archiveImageId: 'image-1',
                    parentStepId: 'missing-parent',
                    stepType: 'save-as-copy',
                    timestamp: '2026-04-04T09:00:00.000Z',
                    metadata: {},
                },
            ],
        }));

        const summary = await importArchiveZip(await zip.generateAsync({ type: 'uint8array' }), {
            archiveStore: new InMemoryArchiveStore(),
            lineageStore: createStore(),
        });

        expect(summary.brokenParentReferences).toEqual([
            { stepId: 'step-1', parentStepId: 'missing-parent' },
        ]);
        expect(summary.importedStepIds).toEqual(['step-1']);
    });

    it('rejects malformed layer stack entries through the shared manifest parser', async () => {
        const zip = new JSZip();
        zip.file('aura-layered-image.png', Uint8Array.from([105, 109, 103]));
        zip.file('archive-manifest.json', JSON.stringify({
            version: 1,
            images: [
                {
                    id: 'layered-image',
                    prompt: 'broken layered import',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-04-04T12:00:00.000Z',
                    imageFileName: 'aura-layered-image.png',
                    references: [],
                    layerStack: {
                        canvasWidth: 1024,
                        canvasHeight: 1024,
                        layers: [
                            {
                                id: 'base',
                                name: 'Base',
                                kind: 'base',
                                assetFileName: 'aura-layered-image-layer-base.png',
                                x: 0,
                                y: 0,
                                height: 1024,
                                rotation: 0,
                                opacity: 1,
                                blendMode: 'normal',
                                visible: true,
                                locked: true,
                            },
                        ],
                    },
                },
            ],
        }));

        await expect(importArchiveZip(await zip.generateAsync({ type: 'uint8array' }), {
            archiveStore: new InMemoryArchiveStore(),
            lineageStore: createStore(),
        })).rejects.toThrow('Invalid layer width');
    });
});

function createStore(): LineageStore {
    return createLineageStore({ metadata: new InMemoryLineageMetadataPort() });
}

function createLayeredImage(): ArchiveImage {
    return {
        id: 'layered-image',
        url: 'data:image/png;base64,aaaa',
        prompt: 'layered',
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        timestamp: '2026-04-04T12:00:00.000Z',
        width: 1024,
        height: 1024,
        references: [],
        layerStack: {
            canvasWidth: 1024,
            canvasHeight: 1024,
            layers: [
                {
                    id: 'base',
                    name: 'Base',
                    kind: 'base',
                    assetUrl: 'data:image/png;base64,aaaa',
                    x: 0,
                    y: 0,
                    width: 1024,
                    height: 1024,
                    rotation: 0,
                    opacity: 1,
                    blendMode: 'normal',
                    visible: true,
                    locked: true,
                },
                {
                    id: 'upload',
                    name: 'Upload',
                    kind: 'uploaded',
                    assetUrl: 'data:image/png;base64,bBBB',
                    x: 200,
                    y: 200,
                    width: 400,
                    height: 400,
                    rotation: 0,
                    opacity: 0.7,
                    blendMode: 'normal',
                    visible: true,
                    locked: false,
                },
            ],
        },
    };
}

function createImages(): ArchiveImage[] {
    return [
        {
            id: 'image-1',
            url: 'data:image/png;base64,aaaa',
            prompt: 'glass city at dawn',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-04-04T09:00:00.000Z',
            model: OPENAI_IMAGE_MODEL,
            width: 1024,
            height: 1024,
            references: ['data:image/png;base64,ref1'],
        },
        {
            id: 'image-2',
            url: 'data:image/png;base64,bbbb',
            prompt: 'glass city with neon reflections',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-04-04T10:00:00.000Z',
            model: OPENAI_IMAGE_MODEL,
            width: 1024,
            height: 1024,
            references: [],
        },
        {
            id: 'image-3',
            url: 'data:image/png;base64,cccc',
            prompt: 'glass city alternate branch',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-04-04T11:00:00.000Z',
            model: OPENAI_IMAGE_MODEL,
            width: 1024,
            height: 1024,
            references: [],
        },
    ];
}

function createTypedGenerateMetadata() {
    return {
        prompt: 'glass city at dawn',
        model: OPENAI_IMAGE_MODEL,
        imageModel: {
            slug: OPENAI_IMAGE_MODEL,
            controls: {
                quality: 'high',
                size: '1024x1024',
                background: 'transparent',
            },
        },
        dimensions: {
            width: 1024,
            height: 1024,
        },
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        width: 1024,
        height: 1024,
        imageSize: null,
        style: 'none',
        lighting: 'none',
        palette: 'none',
        sourceArchiveImageId: 'source-image',
        referenceImages: {
            count: 1,
            ids: ['image-1:reference:0'],
        },
        referenceCount: 1,
        referenceIds: ['image-1:reference:0'],
    };
}

function createTypedEditorMetadata() {
    return {
        sourceImage: {
            archiveImageId: 'image-1',
        },
        outputImage: {
            archiveImageId: 'image-1',
        },
        save: {
            overwrite: true,
            copy: false,
        },
        editorAdjustment: {
            brightness: 110,
            contrast: 100,
            saturation: 120,
            filter: 'none',
        },
        aiEdit: {
            prompt: 'add neon reflections',
            imageModel: {
                slug: OPENAI_IMAGE_MODEL,
            },
            referenceImages: {
                count: 1,
            },
            transformTarget: {
                mode: 'selected-layers',
                layerCount: 1,
                includesBaseLayer: false,
            },
        },
        layers: {
            layered: true,
            count: 3,
            visibleCount: 2,
            aiResultLayer: {
                id: 'ai-layer',
                name: 'AI result',
            },
        },
        sourceArchiveImageId: 'image-1',
        outputArchiveImageId: 'image-1',
        overwrite: true,
        editPrompt: 'add neon reflections',
        model: OPENAI_IMAGE_MODEL,
        referenceCount: 1,
        editorAdjustments: {
            brightness: 110,
            contrast: 100,
            saturation: 120,
            filter: 'none',
        },
        isLayered: true,
        layerCount: 3,
        visibleLayerCount: 2,
        targetMode: 'selected-layers',
        targetLayerCount: 1,
        targetIncludesBaseLayer: false,
        aiResultLayerId: 'ai-layer',
        aiResultLayerName: 'AI result',
    };
}

function createTypedAutopilotMetadata() {
    return {
        goal: {
            text: 'make the result moodier',
        },
        iteration: {
            number: 1,
        },
        evaluation: {
            score: 86,
            feedback: ['needs stronger contrast'],
        },
        replayImage: {
            dataUrl: 'data:image/png;base64,auto',
        },
        run: {
            label: 'Autopilot Run · make the result moodier',
        },
        reasoningModel: {
            slug: OPENAI_RESPONSES_MODEL,
        },
        imageModel: {
            slug: OPENAI_IMAGE_MODEL,
            controls: {
                quality: 'high',
                size: '1024x1024',
                background: 'transparent',
            },
        },
        dimensions: {
            width: 1024,
            height: 1024,
        },
        prompt: 'glass city at dawn',
        model: OPENAI_IMAGE_MODEL,
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        width: 1024,
        height: 1024,
        imageSize: null,
        style: 'none',
        lighting: 'none',
        palette: 'none',
        goalText: 'make the result moodier',
        iterationNumber: 1,
        evaluatorScore: 86,
        evaluatorFeedback: ['needs stronger contrast'],
        outputImageDataUrl: 'data:image/png;base64,auto',
        runLabel: 'Autopilot Run · make the result moodier',
    };
}

async function seedLineage(lineage: LineageStore) {
    await lineage.save({
        id: 'step-1',
        archiveImageId: 'image-1',
        parentStepId: null,
        stepType: 'generation',
        timestamp: '2026-04-04T09:00:00.000Z',
        metadata: { prompt: 'glass city at dawn' },
    });
    await lineage.save({
        id: 'step-2',
        archiveImageId: 'image-1',
        parentStepId: 'step-1',
        stepType: 'overwrite',
        timestamp: '2026-04-04T09:30:00.000Z',
        metadata: { editorAdjustments: { brightness: 110, contrast: 100, saturation: 100, filter: 'none' } },
    });
    await lineage.save({
        id: 'step-3',
        archiveImageId: 'image-2',
        parentStepId: 'step-2',
        stepType: 'ai-edit',
        timestamp: '2026-04-04T10:00:00.000Z',
        metadata: { editPrompt: 'add neon reflections' },
    });
    await lineage.save({
        id: 'step-4',
        archiveImageId: 'image-3',
        parentStepId: 'step-2',
        stepType: 'save-as-copy',
        timestamp: '2026-04-04T11:00:00.000Z',
        metadata: { editorAdjustments: { brightness: 100, contrast: 120, saturation: 100, filter: 'none' } },
    });
}

function compareSteps(left: LineageStep, right: LineageStep) {
    return left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id);
}
