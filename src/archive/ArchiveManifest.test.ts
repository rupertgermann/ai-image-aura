import { describe, expect, it } from 'vitest';
import {
    ARCHIVE_MANIFEST_VERSION,
    LINEAGE_MANIFEST_VERSION,
    parseArchiveManifest,
    parseLineageManifest,
} from './ArchiveManifest';
import { OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL, OPENAI_RESPONSES_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL } from '../utils/openaiModels';

describe('ArchiveManifest', () => {
    it.each(['gpt-image-2', OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL])('imports %s images and typed lineage without rewriting stored models', (model) => {
        const image = createManifestImage({ model });
        const controls = { quality: 'high', size: '1024x1024', background: 'transparent', batchSize: 2 };
        const steps = [
            createLineageStep({ id: 'generation', stepType: 'generation', metadata: {
                imageModel: { slug: model, controls },
            } }),
            createLineageStep({ id: 'edit', stepType: 'ai-edit', metadata: {
                aiEdit: { prompt: 'edit', imageModel: { slug: model } },
            } }),
            createLineageStep({ id: 'autopilot', stepType: 'autopilot-iteration', metadata: {
                imageModel: { slug: model, controls }, reasoningModel: { slug: 'gpt-5.4' },
            } }),
        ];
        expect(parseArchiveManifest({ version: 1, images: [image] }).images[0]).toMatchObject(image);
        const parsed = parseLineageManifest({ version: 1, steps });
        expect(parsed.steps.map(step => step.metadata)).toEqual(steps.map(step => step.metadata));
        expect(parseLineageManifest(JSON.parse(JSON.stringify(parsed))).steps).toEqual(parsed.steps);
    });

    it('restores Qwen archive images and typed generation lineage from ZIP manifests', () => {
        const image = createManifestImage({
            model: QWEN_IMAGE_2_1_IMAGE_MODEL, quality: '2K', aspectRatio: '3:4', background: 'transparent',
            width: 1792, height: 2400,
        });
        const step = createLineageStep({
            id: 'qwen-step', stepType: 'generation',
            metadata: {
                ...createTypedGenerateMetadata(), model: QWEN_IMAGE_2_1_IMAGE_MODEL,
                imageModel: { slug: QWEN_IMAGE_2_1_IMAGE_MODEL, controls: {
                    aspectRatio: '3:4', imageSize: '2K', background: 'transparent', batchSize: 3,
                } },
            },
        });
        expect(parseArchiveManifest({ version: 1, images: [image] }).images[0]).toMatchObject(image);
        expect(parseLineageManifest({ version: 1, steps: [step] }).steps[0].metadata.imageModel).toEqual(
            step.metadata.imageModel,
        );
    });

    it('preserves cost ledger metadata while keeping legacy images compatible by omission', () => {
        const costLedger = {
            version: 1 as const,
            currency: 'USD' as const,
            items: [{
                id: 'image-generation:openai:gpt-image-2',
                kind: 'image-generation' as const,
                operation: 'image-generation',
                provider: 'openai',
                model: 'gpt-image-2',
                label: 'Image generation 1',
                status: 'calculated' as const,
                currency: 'USD' as const,
                amountUsd: 0.04,
            }],
        };
        const manifest = parseArchiveManifest({
            version: ARCHIVE_MANIFEST_VERSION,
            images: [
                createManifestImage({ id: 'cost-image', costLedger }),
                createManifestImage({ id: 'legacy-image' }),
            ],
        });

        expect(manifest.images).toEqual([
            expect.objectContaining({ id: 'cost-image', costLedger }),
            expect.not.objectContaining({ id: 'legacy-image', costLedger: expect.anything() }),
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
                                blendMode: 'normal',
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

});

function createManifestImage(overrides: Record<string, unknown> = {}) {
    return {
        id: 'image-1',
        prompt: 'prompt',
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        timestamp: '2026-06-05T10:00:00.000Z',
        imageFileName: 'aura-image-1.png',
        references: [],
        ...overrides,
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
