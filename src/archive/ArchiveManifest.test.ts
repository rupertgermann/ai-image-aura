import { describe, expect, it } from 'vitest';
import {
    ARCHIVE_MANIFEST_VERSION,
    LINEAGE_MANIFEST_VERSION,
    createArchiveManifestLayerStack,
    parseArchiveManifest,
    parseLineageManifest,
} from './ArchiveManifest';
import type { ArchiveLayerStack } from '../db/types';
import { OPENAI_IMAGE_MODEL, OPENAI_RESPONSES_MODEL } from '../utils/openaiModels';

describe('ArchiveManifest', () => {
    it('accepts the existing archive manifest version and preserves stable layer ids', () => {
        const manifest = parseArchiveManifest({
            version: ARCHIVE_MANIFEST_VERSION,
            images: [
                {
                    id: 'layered-image',
                    prompt: 'layered',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-06-05T10:00:00.000Z',
                    imageFileName: 'aura-layered-image.png',
                    references: [],
                    layerStack: createManifestLayerStack(),
                },
            ],
        });

        expect(manifest.version).toBe(1);
        expect(manifest.images[0].layerStack?.layers.map((layer) => [layer.id, layer.assetFileName])).toEqual([
            ['base', 'aura-layered-image-layer-base.png'],
            ['upload', 'aura-layered-image-layer-upload.png'],
        ]);
    });

    it('rejects malformed layer stack entries', () => {
        expect(() => parseArchiveManifest({
            version: ARCHIVE_MANIFEST_VERSION,
            images: [
                {
                    id: 'layered-image',
                    prompt: 'layered',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-06-05T10:00:00.000Z',
                    imageFileName: 'aura-layered-image.png',
                    references: [],
                    layerStack: {
                        canvasWidth: 1024,
                        canvasHeight: 1024,
                        layers: [
                            {
                                id: 'base',
                                name: 'Base',
                                kind: 'bitmap',
                                assetFileName: 'aura-layered-image-layer-base.png',
                                x: 0,
                                y: 0,
                                width: 1024,
                                height: 1024,
                                rotation: 0,
                                opacity: 1,
                                visible: true,
                                locked: true,
                            },
                        ],
                    },
                },
            ],
        })).toThrow('Invalid layer kind');
    });

    it('rejects invalid lineage step types through the shared parser', () => {
        expect(() => parseLineageManifest({
            version: LINEAGE_MANIFEST_VERSION,
            steps: [
                {
                    id: 'step-1',
                    archiveImageId: 'image-1',
                    parentStepId: null,
                    stepType: 'mystery-step',
                    timestamp: '2026-06-05T10:00:00.000Z',
                    metadata: {},
                },
            ],
        })).toThrow('Invalid lineage step type');
    });

    it('preserves legacy Generate, Editor, and Autopilot lineage metadata', () => {
        const legacySteps = [
            createLineageStep({
                id: 'generate-legacy',
                stepType: 'reference-generation',
                metadata: {
                    prompt: 'legacy prompt',
                    referenceCount: 2,
                    referenceIds: ['image-1:reference:0', 'image-1:reference:1'],
                },
            }),
            createLineageStep({
                id: 'editor-legacy',
                stepType: 'ai-edit',
                metadata: {
                    editPrompt: 'replace the sky',
                    targetMode: 'selected-layers',
                    targetLayerCount: 1,
                    aiResultLayerName: 'AI result',
                },
            }),
            createLineageStep({
                id: 'autopilot-legacy',
                stepType: 'autopilot-iteration',
                metadata: {
                    goalText: 'make the result moodier',
                    reasoningModel: OPENAI_RESPONSES_MODEL,
                    iterationNumber: 2,
                    evaluatorScore: 86,
                    evaluatorFeedback: ['needs stronger contrast'],
                    outputImageDataUrl: 'data:image/png;base64,auto',
                },
            }),
        ];

        expect(parseLineageManifest({
            version: LINEAGE_MANIFEST_VERSION,
            steps: legacySteps,
        }).steps.map((step) => step.metadata)).toEqual(legacySteps.map((step) => step.metadata));
    });

    it('validates typed lineage metadata while preserving the manifest shape', () => {
        const typedSteps = [
            createLineageStep({
                id: 'generate-typed',
                stepType: 'reference-generation',
                metadata: createTypedGenerateMetadata(),
            }),
            createLineageStep({
                id: 'editor-typed',
                stepType: 'ai-edit',
                metadata: createTypedEditorMetadata(),
            }),
            createLineageStep({
                id: 'autopilot-typed',
                stepType: 'autopilot-iteration',
                metadata: createTypedAutopilotMetadata(),
            }),
        ];

        expect(parseLineageManifest({
            version: LINEAGE_MANIFEST_VERSION,
            steps: typedSteps,
        })).toEqual({
            version: LINEAGE_MANIFEST_VERSION,
            steps: typedSteps,
        });
    });

    it('rejects malformed typed lineage metadata through the shared parser', () => {
        expect(() => parseLineageManifest({
            version: LINEAGE_MANIFEST_VERSION,
            steps: [
                createLineageStep({
                    id: 'broken-typed-step',
                    stepType: 'generation',
                    metadata: {
                        imageModel: {
                            slug: 'not-a-model',
                            controls: {},
                        },
                    },
                }),
            ],
        })).toThrow('Invalid lineage imageModel slug');
    });

    it('validates exported layer stacks before they are written to a ZIP manifest', () => {
        const layerStack: ArchiveLayerStack = {
            canvasWidth: 1024,
            canvasHeight: 1024,
            layers: [
                {
                    id: 'base',
                    name: 'Base',
                    kind: 'base',
                    assetUrl: 'data:image/png;base64,base',
                    x: 0,
                    y: 0,
                    width: 1024,
                    height: 1024,
                    rotation: 0,
                    opacity: 1,
                    visible: true,
                    locked: true,
                },
            ],
        };

        expect(createArchiveManifestLayerStack(
            'layered-image',
            layerStack,
            (imageId, layerId) => `aura-${imageId}-layer-${layerId}.png`,
        )).toEqual({
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
                    width: 1024,
                    height: 1024,
                    rotation: 0,
                    opacity: 1,
                    visible: true,
                    locked: true,
                },
            ],
        });
    });
});

function createManifestLayerStack() {
    return {
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
                width: 1024,
                height: 1024,
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: true,
            },
            {
                id: 'upload',
                name: 'Upload',
                kind: 'uploaded',
                assetFileName: 'aura-layered-image-layer-upload.png',
                x: 120,
                y: 160,
                width: 400,
                height: 300,
                rotation: 0,
                opacity: 0.8,
                visible: true,
                locked: false,
            },
        ],
    };
}

function createLineageStep(overrides: {
    id: string;
    stepType: string;
    metadata: Record<string, unknown>;
}) {
    return {
        archiveImageId: 'image-1',
        parentStepId: null,
        timestamp: '2026-06-05T10:00:00.000Z',
        ...overrides,
    };
}

function createTypedGenerateMetadata() {
    return {
        prompt: 'typed prompt',
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
        sourceArchiveImageId: null,
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
            archiveImageId: 'image-2',
        },
        save: {
            overwrite: false,
            copy: true,
        },
        editorAdjustment: {
            brightness: 110,
            contrast: 100,
            saturation: 120,
            filter: 'none',
        },
        aiEdit: {
            prompt: 'replace the sky',
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
        outputArchiveImageId: 'image-2',
        overwrite: false,
        editPrompt: 'replace the sky',
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
            number: 2,
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
        prompt: 'typed prompt',
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
        iterationNumber: 2,
        evaluatorScore: 86,
        evaluatorFeedback: ['needs stronger contrast'],
        outputImageDataUrl: 'data:image/png;base64,auto',
        runLabel: 'Autopilot Run · make the result moodier',
    };
}
