import { describe, expect, it, vi } from 'vitest';
import { createPromptRefiner } from './PromptRefiner';

describe('PromptRefiner', () => {
    it('returns a non-empty refined prompt', async () => {
        const refiner = createPromptRefiner({
            createResponse: vi.fn(async () => ({
                outputText: 'Cinematic fashion portrait, strong rim lighting, tailored black coat, moody editorial studio backdrop',
            })),
        });

        await expect(refiner.refine({
            apiKey: 'test-key',
            goal: 'A cinematic editorial portrait',
            currentPrompt: 'portrait',
            feedback: ['The lighting should be more dramatic.'],
        })).resolves.toEqual({
            prompt: 'Cinematic fashion portrait, strong rim lighting, tailored black coat, moody editorial studio backdrop',
        });
    });

    it('propagates API errors to the caller', async () => {
        const refiner = createPromptRefiner({
            createResponse: vi.fn(async () => {
                throw new Error('upstream unavailable');
            }),
        });

        await expect(refiner.refine({
            apiKey: 'test-key',
            goal: 'An interior still life',
            currentPrompt: 'still life',
            feedback: ['The composition should feel more intentional.'],
        })).rejects.toThrow('upstream unavailable');
    });

    it('attaches reasoning cost metadata when the client returns usage', async () => {
        const refiner = createPromptRefiner({
            provider: 'openai',
            model: 'gpt-5.4',
            createResponse: vi.fn(async () => ({
                outputText: 'Sharper prompt',
                usage: {
                    input_tokens: 200,
                    output_tokens: 30,
                    total_tokens: 230,
                },
            })),
        });

        await expect(refiner.refine({
            apiKey: 'test-key',
            goal: 'A sharper image',
            currentPrompt: 'image',
            feedback: ['Be more specific.'],
        })).resolves.toMatchObject({
            prompt: 'Sharper prompt',
            costLedger: {
                items: [expect.objectContaining({
                    operation: 'prompt-refinement',
                    status: 'calculated',
                    amountUsd: 0.00095,
                })],
            },
        });
    });
});
