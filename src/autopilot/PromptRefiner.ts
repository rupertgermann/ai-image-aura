import { openAiResponsesClient, type OpenAiResponsesClient } from '../utils/openai';

export const PROMPT_REFINER_PROMPT_VERSION = 'prompt-refiner.v1';

export const PROMPT_REFINER_SYSTEM_PROMPT = [
    `Version: ${PROMPT_REFINER_PROMPT_VERSION}`,
    'You refine image generation prompts using critique feedback.',
    'Return a single improved prompt and nothing else.',
    'Keep the prompt concrete, visually specific, and ready for direct image generation.',
].join('\n');

export interface PromptRefiner {
    refine(input: { goal: string; currentPrompt: string; feedback: string[]; apiKey: string }): Promise<string>;
}

export function createPromptRefiner(client: OpenAiResponsesClient = openAiResponsesClient): PromptRefiner {
    return {
        async refine(input) {
            const response = await client.createResponse({
                apiKey: input.apiKey,
                systemPrompt: PROMPT_REFINER_SYSTEM_PROMPT,
                userText: [
                    `Goal:\n${input.goal.trim()}`,
                    `Current prompt:\n${input.currentPrompt.trim()}`,
                    `Feedback:\n${input.feedback.map((entry) => `- ${entry}`).join('\n')}`,
                ].join('\n\n'),
            });

            const prompt = response.outputText.trim();
            if (!prompt) {
                throw new Error('Prompt refiner returned an empty prompt');
            }

            return prompt;
        },
    };
}

export const promptRefiner = createPromptRefiner();
