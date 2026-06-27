import { openAiReasoningClient, type ReasoningClient } from './ReasoningClient';
import { buildReasoningCostLedger } from '../costs/apiCost';
import type { ApiCostLedger } from '../db/types';

export const PROMPT_REFINER_PROMPT_VERSION = 'prompt-refiner.v1';

export const PROMPT_REFINER_SYSTEM_PROMPT = [
    `Version: ${PROMPT_REFINER_PROMPT_VERSION}`,
    'You refine image generation prompts using critique feedback.',
    'Return a single improved prompt and nothing else.',
    'Keep the prompt concrete, visually specific, and ready for direct image generation.',
].join('\n');

export interface PromptRefiner {
    refine(input: { goal: string; currentPrompt: string; feedback: string[]; apiKey: string }): Promise<PromptRefinement>;
}

export interface PromptRefinement {
    prompt: string;
    costLedger?: ApiCostLedger;
}

export function createPromptRefiner(client: ReasoningClient = openAiReasoningClient): PromptRefiner {
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

            return {
                prompt,
                ...buildReasoningCost(client, response.usage),
            };
        },
    };
}

export const promptRefiner = createPromptRefiner();

function buildReasoningCost(client: ReasoningClient, usage: unknown): { costLedger?: ApiCostLedger } {
    if (!client.provider || !client.model) {
        return {};
    }

    return {
        costLedger: buildReasoningCostLedger({
            provider: client.provider,
            model: client.model,
            operation: 'prompt-refinement',
            label: 'Prompt refinement',
            usage,
        }),
    };
}
