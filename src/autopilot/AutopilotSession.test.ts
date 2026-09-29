import { describe, expect, it, vi } from 'vitest';
import { createAutopilotSession } from './AutopilotSession';
import type { LineageMetadataPort, LineageStep } from '../lineage/LineageStore';
import { createLineageStore, type LineageStore } from '../lineage/LineageStore';
import type { GenerateImageInput, GenerateImageSettings } from '../image-workflow/ImageWorkflow';
import { GEMINI_FLASH_REASONING_MODEL, OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import { buildReasoningCostLedger, calculateApiCostTotals } from '../costs/apiCost';
import type { ApiCostLedger, ApiCostLineItem } from '../db/types';

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
        return Array.from(this.steps.values()).filter((step) => step.archiveImageId === archiveImageId);
    }

    async getChildren(parentStepId: string): Promise<LineageStep[]> {
        return Array.from(this.steps.values()).filter((step) => step.parentStepId === parentStepId);
    }

    async remove(id: string): Promise<void> {
        this.steps.delete(id);
    }
}

describe('AutopilotSession', () => {
    it('runs the full generate evaluate refine loop and returns the highest score', async () => {
        const lineage = createStore();
        const callbacks = { onIterationComplete: vi.fn(), onError: vi.fn() };
        const getProviderCredential = vi.fn(() => 'reasoning-key');
        const generate = vi.fn()
            .mockResolvedValueOnce('data:image/png;base64,one')
            .mockResolvedValueOnce('data:image/png;base64,two')
            .mockResolvedValueOnce('data:image/png;base64,three');
        const createResponse = vi.fn()
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 40, feedback: ['Needs stronger lighting.'] }) })
            .mockResolvedValueOnce({ outputText: 'prompt 2' })
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 88, feedback: ['Closer, but improve composition.'] }) })
            .mockResolvedValueOnce({ outputText: 'prompt 3' })
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 72, feedback: ['Lost some atmosphere.'] }) });

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            imageCredential: 'key',
            getProviderCredential,
            reasoningModel: GEMINI_FLASH_REASONING_MODEL,
            maxIterations: 3,
            satisfactionThreshold: 90,
            generate,
            lineageStore: lineage,
            callbacks,
            makeRunId: () => 'run-1',
        }, { reasoningClient: { createResponse } }).run();

        expect(result.status).toBe('max-iterations');
        expect(result.bestIteration).toEqual(expect.objectContaining({ iterationNumber: 2, score: 88, prompt: 'prompt 2' }));
        expect(generate).toHaveBeenCalledTimes(3);
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({ credential: 'key' }));
        expect(getProviderCredential).toHaveBeenCalledWith('google');
        expect(createResponse).toHaveBeenCalledTimes(5);
        expect(createResponse).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'reasoning-key' }));
        expect(result.bestIteration?.costLedger?.items.map((item) => item.operation)).toEqual([
            'satisfaction-evaluation', 'prompt-refinement', 'satisfaction-evaluation', 'prompt-refinement', 'satisfaction-evaluation',
        ]);
        expect(result.bestIteration?.costLedger?.items.every((item) => item.provider === 'google' && item.model === GEMINI_FLASH_REASONING_MODEL)).toBe(true);
        expect(callbacks.onIterationComplete).toHaveBeenCalledTimes(3);
        expect(callbacks.onIterationComplete.mock.calls.map(([, runningBest]) => runningBest.iterationNumber)).toEqual([1, 2, 2]);
        await expect(lineage.getChildren('step-1')).resolves.toEqual([
            expect.objectContaining({ id: 'step-2', parentStepId: 'step-1' }),
        ]);
        await expect(lineage.getChildren('step-2')).resolves.toEqual([
            expect.objectContaining({ id: 'step-3', parentStepId: 'step-2' }),
        ]);
        await expect(lineage.getById('step-1')).resolves.toEqual(expect.objectContaining({
            parentStepId: null,
            metadata: expect.objectContaining({
                goal: { text: 'A cinematic portrait' },
                reasoningModel: { slug: GEMINI_FLASH_REASONING_MODEL },
                imageModel: {
                    slug: OPENAI_IMAGE_MODEL,
                    controls: {
                        quality: 'high',
                        size: '1024x1024',
                        background: 'transparent',
                        batchSize: 1,
                    },
                },
                iteration: { number: 1 },
                evaluation: {
                    score: 40,
                    feedback: ['Needs stronger lighting.'],
                },
                replayImage: { dataUrl: 'data:image/png;base64,one' },
                run: { label: 'Autopilot Run · A cinematic portrait' },
            }),
        }));
    });

    it('exposes a running best that breaks score ties by earliest iteration', async () => {
        const lineage = createStore();
        const callbacks = { onIterationComplete: vi.fn(), onError: vi.fn() };

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            imageCredential: 'key',
            getProviderCredential: () => 'reasoning-key',
            maxIterations: 2,
            satisfactionThreshold: 90,
            generate: vi.fn()
                .mockResolvedValueOnce('data:image/png;base64,one')
                .mockResolvedValueOnce('data:image/png;base64,two'),
            lineageStore: lineage,
            callbacks,
        }, { reasoningClient: { createResponse: vi.fn()
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 80, feedback: ['Good.'] }) })
            .mockResolvedValueOnce({ outputText: 'prompt 2' })
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 80, feedback: ['Also good.'] }) }),
        } }).run();

        expect(result.bestIteration).toEqual(expect.objectContaining({ iterationNumber: 1 }));
        expect(callbacks.onIterationComplete.mock.calls.map(([, runningBest]) => runningBest.iterationNumber)).toEqual([1, 1]);
    });

    it('includes initial reasoning costs in the final best iteration total', async () => {
        const lineage = createStore();
        const initialCostLedger = buildReasoningCostLedger({
            provider: 'openai', model: 'gpt-6-sol', operation: 'goal-translation', label: 'Goal translation',
            usage: { input_tokens: 100, output_tokens: 20 },
        });
        const imageCostLedger = createCostLedger(createCostItem('image-generation', 0.04));

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            imageCredential: 'key',
            getProviderCredential: () => 'reasoning-key',
            maxIterations: 1,
            satisfactionThreshold: 90,
            initialCostLedger,
            generate: vi.fn().mockResolvedValueOnce({
                imageDataUrl: 'data:image/png;base64,one',
                costLedger: imageCostLedger,
            }),
            lineageStore: lineage,
        }, { reasoningClient: { createResponse: vi.fn().mockResolvedValueOnce({
            outputText: JSON.stringify({ score: 95, feedback: ['Strong match.'] }),
            usage: { input_tokens: 100, output_tokens: 335 },
        }) } }).run();

        expect(result.bestIteration?.costLedger?.items.map((item) => item.operation)).toEqual([
            'goal-translation',
            'image-generation',
            'satisfaction-evaluation',
        ]);
        expect(calculateApiCostTotals(result.bestIteration?.costLedger).totalUsd).toBeCloseTo(0.045825);
        expect(result.iterations[0]?.costLedger?.items.map((item) => item.operation)).toEqual([
            'image-generation',
            'satisfaction-evaluation',
        ]);
    });

    it('freezes the Reference image snapshot for every iteration', async () => {
        const lineage = createStore();
        const firstReference = new File(['reference-0'], 'ref-0.png', { type: 'image/png' });
        const secondReference = new File(['reference-1'], 'ref-1.png', { type: 'image/png' });
        const settings = createSettings([firstReference, secondReference]);
        const seenReferenceNames: string[][] = [];
        const seenBatchSizes: number[] = [];
        const generate = vi.fn(async (input: GenerateImageInput) => {
            seenReferenceNames.push(input.referenceImages.map((file) => file.name));
            seenBatchSizes.push(input.controls.batchSize);
            input.controls.batchSize = 4;
            input.referenceImages.push(new File(['request-mutation'], `request-mutated-${seenReferenceNames.length}.png`, { type: 'image/png' }));
            settings.controls.batchSize = 3;
            settings.referenceImages.push(new File(['external-mutation'], `external-${seenReferenceNames.length}.png`, { type: 'image/png' }));

            return `data:image/png;base64,iteration-${seenReferenceNames.length}`;
        });

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings,
            imageCredential: 'key',
            getProviderCredential: () => 'reasoning-key',
            maxIterations: 2,
            satisfactionThreshold: 90,
            generate,
            lineageStore: lineage,
        }, { reasoningClient: { createResponse: vi.fn()
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 50, feedback: ['Keep going.'] }) })
            .mockResolvedValueOnce({ outputText: 'prompt 2' })
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 95, feedback: ['Strong match.'] }) }),
        } }).run();

        expect(result.status).toBe('satisfied');
        expect(seenReferenceNames).toEqual([
            ['ref-0.png', 'ref-1.png'],
            ['ref-0.png', 'ref-1.png'],
        ]);
        expect(seenBatchSizes).toEqual([1, 1]);
        await expect(lineage.getById('step-1')).resolves.toMatchObject({
            metadata: { imageModel: { controls: { batchSize: 1 } } },
        });
        await expect(lineage.getById('step-2')).resolves.toMatchObject({
            metadata: { imageModel: { controls: { batchSize: 1 } } },
        });
    });

    it('stops early when the satisfaction threshold is met', async () => {
        const lineage = createStore();
        const generate = vi.fn().mockResolvedValueOnce('data:image/png;base64,one');
        const createResponse = vi.fn().mockResolvedValueOnce({ outputText: JSON.stringify({ score: 95, feedback: ['Strong match.'] }) });

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            imageCredential: 'key',
            getProviderCredential: () => 'reasoning-key',
            maxIterations: 4,
            satisfactionThreshold: 90,
            generate,
            lineageStore: lineage,
        }, { reasoningClient: { createResponse } }).run();

        expect(result.status).toBe('satisfied');
        expect(result.iterations).toHaveLength(1);
        expect(createResponse).toHaveBeenCalledTimes(1);
    });

    it('cancels after the current iteration completes and preserves completed lineage', async () => {
        const lineage = createStore();
        let sessionRef: ReturnType<typeof createAutopilotSession> | null = null;
        const session = createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            imageCredential: 'key',
            getProviderCredential: () => 'reasoning-key',
            maxIterations: 4,
            satisfactionThreshold: 90,
            generate: vi.fn().mockResolvedValueOnce('data:image/png;base64,one'),
            lineageStore: lineage,
        }, { reasoningClient: { createResponse: vi.fn().mockImplementationOnce(async () => {
            sessionRef?.cancel();
            return { outputText: JSON.stringify({ score: 60, feedback: ['Keep refining.'] }) };
        }) } });
        sessionRef = session;

        const result = await session.run();

        expect(result.status).toBe('cancelled');
        expect(result.iterations).toHaveLength(1);
        await expect(lineage.getById('step-1')).resolves.toEqual(expect.objectContaining({ stepType: 'autopilot-iteration' }));
    });

    it('stops on generation failure, preserves prior steps, and reports the error via callback', async () => {
        const lineage = createStore();
        const callbacks = { onIterationComplete: vi.fn(), onError: vi.fn() };
        const error = new Error('generation failed');

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            imageCredential: 'key',
            getProviderCredential: () => 'reasoning-key',
            maxIterations: 3,
            satisfactionThreshold: 90,
            generate: vi.fn()
                .mockResolvedValueOnce('data:image/png;base64,one')
                .mockRejectedValueOnce(error),
            lineageStore: lineage,
            callbacks,
        }, { reasoningClient: { createResponse: vi.fn()
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 55, feedback: ['Push the framing further.'] }) })
            .mockResolvedValueOnce({ outputText: 'prompt 2' }),
        } }).run();

        expect(result.status).toBe('failed');
        expect(result.error).toBe(error);
        expect(result.iterations).toHaveLength(1);
        expect(callbacks.onError).toHaveBeenCalledWith(error, 2);
        await expect(lineage.getById('step-1')).resolves.toEqual(expect.objectContaining({ stepType: 'autopilot-iteration' }));
    });
});

function createStore(): LineageStore {
    let nextId = 0;

    return createLineageStore({
        metadata: new InMemoryLineageMetadataPort(),
        makeId: () => {
            nextId += 1;
            return `step-${nextId}`;
        },
    });
}

function createSettings(referenceImages: File[] = []): GenerateImageSettings {
    return {
        model: OPENAI_IMAGE_MODEL,
        style: 'risograph poster',
        lighting: 'golden hour',
        palette: 'copper + teal + cream',
        referenceImages,
        controls: { quality: 'high', size: '1024x1024', background: 'transparent', batchSize: 1 },
    };
}

function createCostLedger(item: ApiCostLineItem): ApiCostLedger {
    return {
        version: 1,
        currency: 'USD',
        items: [item],
    };
}

function createCostItem(id: string, amountUsd: number): ApiCostLineItem {
    return {
        id,
        kind: id === 'image-generation' ? 'image-generation' : 'reasoning',
        operation: id,
        provider: id === 'image-generation' ? 'openai' : 'openai',
        model: id === 'image-generation' ? 'gpt-image-2.5-flare' : 'gpt-6-sol',
        label: id,
        status: 'calculated',
        currency: 'USD',
        amountUsd,
    };
}
