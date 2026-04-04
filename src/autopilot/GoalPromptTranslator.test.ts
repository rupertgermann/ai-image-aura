import { describe, expect, it, vi } from 'vitest';
import { createGoalPromptTranslator } from './GoalPromptTranslator';

describe('GoalPromptTranslator', () => {
    it('returns a prompt translated from the goal', async () => {
        const translator = createGoalPromptTranslator({
            createResponse: vi.fn(async () => ({
                outputText: 'Cinematic portrait of a jazz singer in deep blue haze, gold rim light, smoky club interior',
            })),
        });

        await expect(translator.translate({
            apiKey: 'key',
            goal: 'I want a moody jazz singer portrait in a smoky club with dramatic gold light',
        })).resolves.toBe('Cinematic portrait of a jazz singer in deep blue haze, gold rim light, smoky club interior');
    });

    it('propagates API errors', async () => {
        const translator = createGoalPromptTranslator({
            createResponse: vi.fn(async () => {
                throw new Error('translator failed');
            }),
        });

        await expect(translator.translate({
            apiKey: 'key',
            goal: 'A brutalist hotel lobby at dawn',
        })).rejects.toThrow('translator failed');
    });
});
