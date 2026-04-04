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
        })).resolves.toBe('Cinematic fashion portrait, strong rim lighting, tailored black coat, moody editorial studio backdrop');
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
});
