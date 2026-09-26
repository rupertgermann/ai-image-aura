import { describe, expect, it, vi } from 'vitest';
import { createSatisfactionEvaluator, parseEvaluation } from './SatisfactionEvaluator';

describe('SatisfactionEvaluator', () => {
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

    it('attaches reasoning cost metadata when the client returns usage', async () => {
        const evaluator = createSatisfactionEvaluator({
            provider: 'openai',
            model: 'gpt-6-sol',
            createResponse: vi.fn(async () => ({
                outputText: JSON.stringify({
                    score: 80,
                    feedback: ['Close.'],
                }),
                usage: {
                    input_tokens: 1000,
                    output_tokens: 200,
                    total_tokens: 1200,
                    input_tokens_details: {
                        cached_tokens: 100,
                    },
                },
            })),
        });

        await expect(evaluator.evaluate({
            apiKey: 'test-key',
            goal: 'A cinematic portrait',
            imageDataUrl: 'data:image/png;base64,abc',
        })).resolves.toMatchObject({
            score: 80,
            feedback: ['Close.'],
            costLedger: {
                items: [expect.objectContaining({
                    operation: 'satisfaction-evaluation',
                    status: 'calculated',
                    amountUsd: 0.005275,
                })],
            },
        });
    });

    it('parses and clamps valid JSON evaluations', () => {
        expect(parseEvaluation(JSON.stringify({
            score: 104.4,
            feedback: [' crisp ', ''],
        }))).toEqual({
            score: 100,
            feedback: ['crisp'],
        });
    });
});
