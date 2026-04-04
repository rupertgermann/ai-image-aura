import { describe, expect, it, vi } from 'vitest';
import { createSatisfactionEvaluator } from './SatisfactionEvaluator';

describe('SatisfactionEvaluator', () => {
    it('returns score and feedback from a valid GPT response', async () => {
        const evaluator = createSatisfactionEvaluator({
            createResponse: vi.fn(async () => ({
                outputText: JSON.stringify({
                    score: 91,
                    feedback: ['The lighting matches the goal well.', 'The subject needs a stronger silhouette.'],
                }),
            })),
        });

        await expect(evaluator.evaluate({
            apiKey: 'test-key',
            goal: 'A cinematic portrait with strong rim lighting',
            imageDataUrl: 'data:image/png;base64,abc',
        })).resolves.toEqual({
            score: 91,
            feedback: ['The lighting matches the goal well.', 'The subject needs a stronger silhouette.'],
        });
    });

    it('returns a graceful low score when the response is malformed', async () => {
        const evaluator = createSatisfactionEvaluator({
            createResponse: vi.fn(async () => ({ outputText: '{"score":"high"}' })),
        });

        await expect(evaluator.evaluate({
            apiKey: 'test-key',
            goal: 'An editorial fashion photo',
            imageDataUrl: 'data:image/png;base64,abc',
        })).resolves.toEqual({
            score: 0,
            feedback: ['Unable to evaluate the image against the goal. Try another iteration.'],
        });
    });

    it('propagates API errors from the client', async () => {
        const evaluator = createSatisfactionEvaluator({
            createResponse: vi.fn(async () => {
                throw new Error('rate limited');
            }),
        });

        await expect(evaluator.evaluate({
            apiKey: 'test-key',
            goal: 'A brutalist lobby with soft daylight',
            imageDataUrl: 'data:image/png;base64,abc',
        })).rejects.toThrow('rate limited');
    });
});
