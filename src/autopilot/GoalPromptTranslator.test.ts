import { describe, expect, it, vi } from 'vitest';
import { createGoalPromptTranslator } from './GoalPromptTranslator';

describe('GoalPromptTranslator', () => {
    it('attaches reasoning cost metadata when the client returns usage', async () => {
        const translator = createGoalPromptTranslator({
            provider: 'openai',
            model: 'gpt-6-sol',
            createResponse: vi.fn(async () => ({
                outputText: 'A precise image prompt',
                usage: {
                    input_tokens: 100,
                    output_tokens: 20,
                    total_tokens: 120,
                },
            })),
        });

        await expect(translator.translate({
            apiKey: 'key',
            goal: 'A precise image',
        })).resolves.toMatchObject({
            prompt: 'A precise image prompt',
            costLedger: {
                items: [expect.objectContaining({
                    operation: 'goal-translation',
                    status: 'calculated',
                    amountUsd: 0.00055,
                })],
            },
        });
    });
});
