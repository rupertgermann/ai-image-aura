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
                goalText: 'A moody editorial portrait with electric blue haze',
                iterationNumber: 1,
                evaluatorScore: 84,
                evaluatorFeedback: ['Push the rim light harder.'],
                outputImageDataUrl: 'data:image/png;base64,auto1',
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
