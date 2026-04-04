import { openAiResponsesClient, type OpenAiResponsesClient } from '../utils/openai';

export const SATISFACTION_EVALUATOR_PROMPT_VERSION = 'satisfaction-evaluator.v1';

export const SATISFACTION_EVALUATOR_SYSTEM_PROMPT = [
    `Version: ${SATISFACTION_EVALUATOR_PROMPT_VERSION}`,
    'You evaluate how well an image satisfies a creative goal.',
    'Return strict JSON with this shape:',
    '{"score": number, "feedback": string[]}',
    'Rules:',
    '- score must be an integer from 0 to 100',
    '- feedback must contain 1 to 4 specific, visual, actionable sentences',
    '- focus on observable mismatches between the image and the goal',
    '- do not include markdown fences or commentary outside the JSON',
].join('\n');

const FALLBACK_EVALUATION = {
    score: 0,
    feedback: ['Unable to evaluate the image against the goal. Try another iteration.'],
};

export interface SatisfactionEvaluation {
    score: number;
    feedback: string[];
}

export interface SatisfactionEvaluator {
    evaluate(input: { imageDataUrl: string; goal: string; apiKey: string }): Promise<SatisfactionEvaluation>;
}

export function createSatisfactionEvaluator(client: OpenAiResponsesClient = openAiResponsesClient): SatisfactionEvaluator {
    return {
        async evaluate(input) {
            const response = await client.createResponse({
                apiKey: input.apiKey,
                systemPrompt: SATISFACTION_EVALUATOR_SYSTEM_PROMPT,
                userText: `Goal:\n${input.goal.trim()}\n\nEvaluate how well the image satisfies this goal.`,
                imageDataUrl: input.imageDataUrl,
            });

            return parseEvaluation(response.outputText);
        },
    };
}

function parseEvaluation(outputText: string): SatisfactionEvaluation {
    try {
        const parsed = JSON.parse(outputText) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return FALLBACK_EVALUATION;
        }

        const record = parsed as { score?: unknown; feedback?: unknown };
        const score = clampScore(record.score);
        const feedback = normalizeFeedback(record.feedback);

        if (feedback.length === 0) {
            return FALLBACK_EVALUATION;
        }

        return { score, feedback };
    } catch {
        return FALLBACK_EVALUATION;
    }
}

function clampScore(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeFeedback(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 4);
}

export const satisfactionEvaluator = createSatisfactionEvaluator();
