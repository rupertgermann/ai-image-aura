import { describe, expect, it } from 'vitest';
import type { LineageStep } from './LineageStore';
import { loadLineageTimeline } from './loadLineageTimeline';

describe('loadLineageTimeline', () => {
    it('builds readable entries, parent indicator, and descendant count', async () => {
        const step1 = createStep({
            id: 'step-1',
            archiveImageId: 'image-1',
            parentStepId: 'parent-1',
            stepType: 'save-as-copy',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: {
                editorAdjustments: {
                    brightness: 100,
                    contrast: 90,
                    saturation: 120,
                    filter: 'none',
                },
            },
        });
        const step2 = createStep({
            id: 'step-2',
            archiveImageId: 'image-1',
            stepType: 'overwrite',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {
                editorAdjustments: {
                    brightness: 115,
                    contrast: 100,
                    saturation: 125,
                    filter: 'sepia(100%)',
                },
            },
        });
        const child = createStep({
            id: 'step-3',
            archiveImageId: 'image-2',
            parentStepId: 'step-2',
            stepType: 'save-as-copy',
            timestamp: '2026-04-04T11:00:00.000Z',
            metadata: {},
        });

        const timeline = await loadLineageTimeline('image-1', createStore({
            byArchiveImageId: {
                'image-1': [step1, step2],
            },
            byId: {
                'parent-1': createStep({
                    id: 'parent-1',
                    archiveImageId: 'image-0',
                    stepType: 'ai-edit',
                    timestamp: '2026-04-04T08:00:00.000Z',
                    metadata: { editPrompt: 'add a brighter horizon glow' },
                }),
            },
            children: {
                'step-1': [],
                'step-2': [child],
            },
        }));

        expect(timeline).toEqual({
            entries: [
                {
                    id: 'parent-1',
                    archiveImageId: 'image-0',
                    stepType: 'ai-edit',
                    label: 'AI Edit',
                    summary: 'AI edit: add a brighter horizon glow',
                    timestamp: '2026-04-04T08:00:00.000Z',
                    goalText: null,
                    iterationNumber: null,
                    evaluatorScore: null,
                    evaluatorFeedback: [],
                    replayImageDataUrl: null,
                    runLabel: null,
                },
                {
                    id: 'step-1',
                    archiveImageId: 'image-1',
                    stepType: 'save-as-copy',
                    label: 'Saved as Copy',
                    summary: 'Adjusted contrast, saturation',
                    timestamp: '2026-04-04T09:00:00.000Z',
                    goalText: null,
                    iterationNumber: null,
                    evaluatorScore: null,
                    evaluatorFeedback: [],
                    replayImageDataUrl: null,
                    runLabel: null,
                },
                {
                    id: 'step-2',
                    archiveImageId: 'image-1',
                    stepType: 'overwrite',
                    label: 'Overwrite Save',
                    summary: 'Adjusted brightness, saturation, filter',
                    timestamp: '2026-04-04T10:00:00.000Z',
                    goalText: null,
                    iterationNumber: null,
                    evaluatorScore: null,
                    evaluatorFeedback: [],
                    replayImageDataUrl: null,
                    runLabel: null,
                },
            ],
            parent: {
                label: 'AI edit: add a brighter horizon glow',
                archiveImageId: 'image-0',
                missing: false,
            },
            descendantCount: 1,
        });
    });

    it('returns an origin unknown parent when the parent step is missing', async () => {
        const timeline = await loadLineageTimeline('image-1', createStore({
            byArchiveImageId: {
                'image-1': [createStep({
                    id: 'step-1',
                    archiveImageId: 'image-1',
                    parentStepId: 'missing-parent',
                    stepType: 'save-as-copy',
                    timestamp: '2026-04-04T09:00:00.000Z',
                    metadata: {},
                })],
            },
            byId: {},
            children: {
                'step-1': [],
            },
        }));

        expect(timeline.parent).toEqual({
            label: 'Origin unknown',
            archiveImageId: null,
            missing: true,
        });
    });

    it('returns an empty state when the image has no lineage steps', async () => {
        const timeline = await loadLineageTimeline('image-1', createStore({
            byArchiveImageId: {
                'image-1': [],
            },
            byId: {},
            children: {},
        }));

        expect(timeline).toEqual({
            entries: [],
            parent: null,
            descendantCount: 0,
        });
    });

    it('includes autopilot ancestor metadata for saved images', async () => {
        const autopilotStep = createStep({
            id: 'auto-1',
            archiveImageId: 'autopilot:run:iteration:1',
            stepType: 'autopilot-iteration',
            timestamp: '2026-04-04T08:00:00.000Z',
            metadata: {
                goal: { text: 'A moody editorial portrait with electric blue haze' },
                iteration: { number: 1 },
                evaluation: {
                    score: 84,
                    feedback: ['Push the rim light harder.'],
                },
                replayImage: { dataUrl: 'data:image/png;base64,auto1' },
                run: { label: 'Autopilot Run · A moody editorial portrait with ele...' },
            },
        });
        const savedStep = createStep({
            id: 'saved-1',
            archiveImageId: 'image-1',
            parentStepId: 'auto-1',
            stepType: 'generation',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: {
                prompt: 'editorial portrait, electric blue haze',
            },
        });

        const timeline = await loadLineageTimeline('image-1', createStore({
            byArchiveImageId: {
                'image-1': [savedStep],
            },
            byId: {
                'auto-1': autopilotStep,
            },
            children: {
                'saved-1': [],
            },
        }));

        expect(timeline.entries).toEqual([
            expect.objectContaining({
                id: 'auto-1',
                stepType: 'autopilot-iteration',
                goalText: 'A moody editorial portrait with electric blue haze',
                iterationNumber: 1,
                evaluatorScore: 84,
                evaluatorFeedback: ['Push the rim light harder.'],
                replayImageDataUrl: 'data:image/png;base64,auto1',
                runLabel: 'Autopilot Run · A moody editorial portrait with ele...',
            }),
            expect.objectContaining({
                id: 'saved-1',
                stepType: 'generation',
                runLabel: null,
            }),
        ]);
    });

    it('summarizes sparse legacy autopilot metadata safely', async () => {
        const timeline = await loadLineageTimeline('autopilot:legacy:iteration:1', createStore({
            byArchiveImageId: {
                'autopilot:legacy:iteration:1': [createStep({
                    id: 'auto-legacy',
                    archiveImageId: 'autopilot:legacy:iteration:1',
                    stepType: 'autopilot-iteration',
                    timestamp: '2026-04-04T08:00:00.000Z',
                    metadata: {},
                })],
            },
            byId: {},
            children: {
                'auto-legacy': [],
            },
        }));

        expect(timeline.entries).toEqual([
            expect.objectContaining({
                id: 'auto-legacy',
                summary: 'Autopilot iteration recorded',
                goalText: null,
                iterationNumber: null,
                evaluatorScore: null,
                evaluatorFeedback: [],
                replayImageDataUrl: null,
                runLabel: 'Autopilot Run',
            }),
        ]);
    });

    it('summarizes layered save and targeted AI metadata without layer assets', async () => {
        const timeline = await loadLineageTimeline('image-1', createStore({
            byArchiveImageId: {
                'image-1': [
                    createStep({
                        id: 'step-1',
                        archiveImageId: 'image-1',
                        stepType: 'overwrite',
                        timestamp: '2026-04-04T09:00:00.000Z',
                        metadata: {
                            isLayered: true,
                            layerCount: 3,
                            visibleLayerCount: 2,
                        },
                    }),
                    createStep({
                        id: 'step-2',
                        archiveImageId: 'image-1',
                        stepType: 'ai-edit',
                        timestamp: '2026-04-04T10:00:00.000Z',
                        metadata: {
                            isLayered: true,
                            editPrompt: 'replace the sky',
                            targetMode: 'selected-layers',
                            targetLayerCount: 1,
                            aiResultLayerName: 'AI result',
                        },
                    }),
                ],
            },
            byId: {},
            children: {
                'step-1': [],
                'step-2': [],
            },
        }));

        expect(timeline.entries.map((entry) => entry.summary)).toEqual([
            'Saved layered image · 3 layers · 2 visible',
            'AI edit: replace the sky · targeted 1 layer · result: AI result',
        ]);
    });

    it('summarizes typed Editor metadata without legacy flat fields', async () => {
        const timeline = await loadLineageTimeline('image-1', createStore({
            byArchiveImageId: {
                'image-1': [
                    createStep({
                        id: 'step-1',
                        archiveImageId: 'image-1',
                        stepType: 'overwrite',
                        timestamp: '2026-04-04T09:00:00.000Z',
                        metadata: {
                            editorAdjustment: {
                                brightness: 115,
                                contrast: 100,
                                saturation: 125,
                                filter: 'sepia(100%)',
                            },
                        },
                    }),
                    createStep({
                        id: 'step-2',
                        archiveImageId: 'image-1',
                        stepType: 'save-as-copy',
                        timestamp: '2026-04-04T09:30:00.000Z',
                        metadata: {
                            layers: {
                                layered: true,
                                count: 3,
                                visibleCount: 2,
                                aiResultLayer: null,
                            },
                        },
                    }),
                    createStep({
                        id: 'step-3',
                        archiveImageId: 'image-1',
                        stepType: 'ai-edit',
                        timestamp: '2026-04-04T10:00:00.000Z',
                        metadata: {
                            aiEdit: {
                                prompt: 'replace the sky',
                                imageModel: {
                                    slug: 'gpt-image-2',
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
                            layers: {
                                layered: true,
                                count: 3,
                                visibleCount: 2,
                                aiResultLayer: {
                                    id: 'ai-layer',
                                    name: 'AI result',
                                },
                            },
                        },
                    }),
                ],
            },
            byId: {},
            children: {
                'step-1': [],
                'step-2': [],
                'step-3': [],
            },
        }));

        expect(timeline.entries.map((entry) => entry.summary)).toEqual([
            'Adjusted brightness, saturation, filter',
            'Saved layered copy · 3 layers · 2 visible',
            'AI edit: replace the sky · targeted 1 layer · result: AI result',
        ]);
    });

    it('summarizes typed Generate reference metadata and preserves older sparse fallbacks', async () => {
        const timeline = await loadLineageTimeline('image-1', createStore({
            byArchiveImageId: {
                'image-1': [
                    createStep({
                        id: 'step-typed',
                        archiveImageId: 'image-1',
                        stepType: 'reference-generation',
                        timestamp: '2026-04-04T09:00:00.000Z',
                        metadata: {
                            prompt: 'lantern-lit greenhouse',
                            referenceImages: {
                                count: 2,
                                ids: ['image-1:reference:0', 'image-1:reference:1'],
                            },
                        },
                    }),
                    createStep({
                        id: 'step-old',
                        archiveImageId: 'image-1',
                        stepType: 'generation',
                        timestamp: '2026-04-04T10:00:00.000Z',
                        metadata: {},
                    }),
                ],
            },
            byId: {},
            children: {
                'step-typed': [],
                'step-old': [],
            },
        }));

        expect(timeline.entries.map((entry) => entry.summary)).toEqual([
            'Prompt: lantern-lit greenhouse with 2 references',
            'Generated from saved settings',
        ]);
    });
});

function createStore(data: {
    byArchiveImageId: Record<string, LineageStep[]>;
    byId: Record<string, LineageStep>;
    children: Record<string, LineageStep[]>;
}) {
    return {
        getByArchiveImageId: async (archiveImageId: string) => data.byArchiveImageId[archiveImageId] ?? [],
        getById: async (id: string) => data.byId[id] ?? null,
        getChildren: async (parentStepId: string) => data.children[parentStepId] ?? [],
    };
}

function createStep(overrides: Partial<LineageStep> & Pick<LineageStep, 'id' | 'archiveImageId' | 'stepType' | 'timestamp'>): LineageStep {
    return {
        parentStepId: null,
        metadata: {},
        ...overrides,
    };
}
