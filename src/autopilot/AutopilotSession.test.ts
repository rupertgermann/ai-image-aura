import { describe, expect, it, vi } from 'vitest';
import { createAutopilotSession } from './AutopilotSession';
import type { LineageMetadataPort, LineageStep } from '../lineage/LineageStore';
import { createLineageStore, type LineageStore } from '../lineage/LineageStore';

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
        const generate = vi.fn()
            .mockResolvedValueOnce('data:image/png;base64,one')
            .mockResolvedValueOnce('data:image/png;base64,two')
            .mockResolvedValueOnce('data:image/png;base64,three');
        const evaluate = vi.fn()
            .mockResolvedValueOnce({ score: 40, feedback: ['Needs stronger lighting.'] })
            .mockResolvedValueOnce({ score: 88, feedback: ['Closer, but improve composition.'] })
            .mockResolvedValueOnce({ score: 72, feedback: ['Lost some atmosphere.'] });
        const refine = vi.fn()
            .mockResolvedValueOnce('prompt 2')
            .mockResolvedValueOnce('prompt 3');

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            apiKey: 'key',
            maxIterations: 3,
            satisfactionThreshold: 90,
            generate,
            evaluate,
            refine,
            lineageStore: lineage,
            callbacks,
            makeRunId: () => 'run-1',
        }).run();

        expect(result.status).toBe('max-iterations');
        expect(result.bestIteration).toEqual(expect.objectContaining({ iterationNumber: 2, score: 88, prompt: 'prompt 2' }));
        expect(generate).toHaveBeenCalledTimes(3);
        expect(refine).toHaveBeenCalledTimes(2);
        expect(callbacks.onIterationComplete).toHaveBeenCalledTimes(3);
        await expect(lineage.getChildren('step-1')).resolves.toEqual([
            expect.objectContaining({ id: 'step-2', parentStepId: 'step-1' }),
        ]);
        await expect(lineage.getChildren('step-2')).resolves.toEqual([
            expect.objectContaining({ id: 'step-3', parentStepId: 'step-2' }),
        ]);
    });

    it('stops early when the satisfaction threshold is met', async () => {
        const lineage = createStore();
        const generate = vi.fn().mockResolvedValueOnce('data:image/png;base64,one');
        const evaluate = vi.fn().mockResolvedValueOnce({ score: 95, feedback: ['Strong match.'] });
        const refine = vi.fn();

        const result = await createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            apiKey: 'key',
            maxIterations: 4,
            satisfactionThreshold: 90,
            generate,
            evaluate,
            refine,
            lineageStore: lineage,
        }).run();

        expect(result.status).toBe('satisfied');
        expect(result.iterations).toHaveLength(1);
        expect(refine).not.toHaveBeenCalled();
    });

    it('cancels after the current iteration completes and preserves completed lineage', async () => {
        const lineage = createStore();
        let sessionRef: ReturnType<typeof createAutopilotSession> | null = null;
        const session = createAutopilotSession({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            settings: createSettings(),
            apiKey: 'key',
            maxIterations: 4,
            satisfactionThreshold: 90,
            generate: vi.fn().mockResolvedValueOnce('data:image/png;base64,one'),
            evaluate: vi.fn().mockImplementationOnce(async () => {
                sessionRef?.cancel();
                return { score: 60, feedback: ['Keep refining.'] };
            }),
            refine: vi.fn(),
            lineageStore: lineage,
        });
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
            apiKey: 'key',
            maxIterations: 3,
            satisfactionThreshold: 90,
            generate: vi.fn()
                .mockResolvedValueOnce('data:image/png;base64,one')
                .mockRejectedValueOnce(error),
            evaluate: vi.fn().mockResolvedValueOnce({ score: 55, feedback: ['Push the framing further.'] }),
            refine: vi.fn().mockResolvedValueOnce('prompt 2'),
            lineageStore: lineage,
            callbacks,
        }).run();

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

function createSettings() {
    return {
        quality: 'high' as const,
        aspectRatio: '1024x1024',
        background: 'transparent' as const,
        style: 'risograph poster',
        lighting: 'golden hour',
        palette: 'copper + teal + cream',
        referenceImages: [],
    };
}
