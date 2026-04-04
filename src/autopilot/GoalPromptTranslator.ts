import { openAiResponsesClient, type OpenAiResponsesClient } from '../utils/openai';

export const GOAL_PROMPT_TRANSLATOR_PROMPT_VERSION = 'goal-prompt-translator.v1';

export const GOAL_PROMPT_TRANSLATOR_SYSTEM_PROMPT = [
    `Version: ${GOAL_PROMPT_TRANSLATOR_PROMPT_VERSION}`,
    'You convert a creative goal into a single concise image generation prompt.',
    'Return only the prompt text.',
    'Keep it visually specific, concrete, and ready for direct image generation.',
].join('\n');

export interface GoalPromptTranslator {
    translate(input: { goal: string; apiKey: string }): Promise<string>;
}

export function createGoalPromptTranslator(client: OpenAiResponsesClient = openAiResponsesClient): GoalPromptTranslator {
    return {
        async translate(input) {
            const response = await client.createResponse({
                apiKey: input.apiKey,
                systemPrompt: GOAL_PROMPT_TRANSLATOR_SYSTEM_PROMPT,
                userText: `Creative goal:\n${input.goal.trim()}`,
            });

            const prompt = response.outputText.trim();
            if (!prompt) {
                throw new Error('Goal prompt translator returned an empty prompt');
            }

            return prompt;
        },
    };
}

export const goalPromptTranslator = createGoalPromptTranslator();
