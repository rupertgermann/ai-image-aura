import { describe, expect, it, vi } from 'vitest';
import { runGenerateAutopilot } from './runGenerateAutopilot';

describe('runGenerateAutopilot', () => {
    it('delegates to AutopilotSession and persists the best result', async () => {
        const run = vi.fn(async () => ({
            status: 'satisfied' as const,
            error: null,
            iterations: [
                {
                    stepId: 'step-1',
                    archiveImageId: 'autopilot:run:iteration:1',
                    iterationNumber: 1,
                    prompt: 'refined prompt',
                    imageDataUrl: 'data:image/png;base64,best',
                    score: 97,
                    feedback: ['Great match.'],
                },
            ],
            bestIteration: {
                stepId: 'step-1',
                archiveImageId: 'autopilot:run:iteration:1',
                iterationNumber: 1,
                prompt: 'refined prompt',
                imageDataUrl: 'data:image/png;base64,best',
                score: 97,
                feedback: ['Great match.'],
            },
        }));
        const cancel = vi.fn();
        const createSession = vi.fn(() => ({ run, cancel }));
        const saveCurrentResult = vi.fn(async () => undefined);
        const saveLineageSource = vi.fn();
        const onSessionCreated = vi.fn();

        const outcome = await runGenerateAutopilot({
            goal: 'A cinematic portrait',
            apiKey: 'key',
            draft: {
                prompt: 'prompt 1',
                quality: 'high',
                aspectRatio: '1024x1024',
                background: 'transparent',
                style: 'risograph poster',
                lighting: 'golden hour',
                palette: 'copper + teal + cream',
                isSaved: false,
            },
            referenceImages: [],
            sessionStore: {
                loadLineageSource: () => ({ archiveImageId: 'source-image', stepId: 'step-parent' }),
                saveCurrentResult,
                saveLineageSource,
            },
            lineageStore: {
                save: vi.fn(),
            },
            createSession,
            onSessionCreated,
        });

        expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            initialParentStepId: 'step-parent',
        }));
        expect(run).toHaveBeenCalledOnce();
        expect(onSessionCreated).toHaveBeenCalledWith(expect.objectContaining({ run, cancel }));
        expect(saveCurrentResult).toHaveBeenCalledWith('data:image/png;base64,best');
        expect(saveLineageSource).toHaveBeenCalledWith({ archiveImageId: 'autopilot:run:iteration:1', stepId: 'step-1' });
        expect(outcome.session.cancel).toBe(cancel);
    });
});
