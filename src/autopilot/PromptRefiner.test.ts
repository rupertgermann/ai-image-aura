import { describe, expect, it, vi } from 'vitest';
import { createPromptRefiner } from './PromptRefiner';

describe('PromptRefiner', () => {
    it('attaches reasoning cost metadata when the client returns usage', async () => {
        const refiner = createPromptRefiner({
            provider: 'openai',
            model: 'gpt-6-sol',
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
