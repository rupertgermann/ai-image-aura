import { promptRefiner } from './PromptRefiner';
import { satisfactionEvaluator } from './SatisfactionEvaluator';
import type { LineageStore } from '../lineage/LineageStore';
import type { ActualImageParameters, ApiCostLedger } from '../db/types';
import type { GenerateImageInput } from '../image-workflow/ImageWorkflow';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import { buildAutopilotLineageMetadata } from '../lineage/autopilotLineageMetadata';
import { mergeApiCostLedgers } from '../costs/apiCost';

export const DEFAULT_AUTOPILOT_MAX_ITERATIONS = 4;
export const MAX_AUTOPILOT_ITERATIONS = 8;
export const DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD = 90;

export interface AutopilotIteration {
    stepId: string;
    archiveImageId: string;
    iterationNumber: number;
    prompt: string;
    imageDataUrl: string;
    actualParameters?: ActualImageParameters;
    costLedger?: ApiCostLedger;
    score: number;
    feedback: string[];
}

export interface AutopilotGeneratedImage {
    imageDataUrl: string;
    actualParameters?: ActualImageParameters;
    costLedger?: ApiCostLedger;
}

export interface AutopilotSessionResult {
    status: 'satisfied' | 'max-iterations' | 'cancelled' | 'failed';
    iterations: AutopilotIteration[];
    bestIteration: AutopilotIteration | null;
    error: Error | null;
}

interface ProgressCallbacks {
    onIterationComplete?: (iteration: AutopilotIteration, runningBest: AutopilotIteration) => void;
    onError?: (error: Error, iterationNumber: number) => void;
}

export interface AutopilotSession {
    run(): Promise<AutopilotSessionResult>;
    cancel(): void;
}

interface CreateAutopilotSessionInput {
    goal: string;
    initialPrompt: string;
    settings: Omit<GenerateImageInput, 'apiKey' | 'prompt'>;
    apiKey: string;
    reasoningApiKey?: string;
    reasoningModel?: string;
    initialParentStepId?: string | null;
    initialCostLedger?: ApiCostLedger;
    maxIterations?: number;
    satisfactionThreshold?: number;
    generate?: (input: GenerateImageInput) => Promise<string | AutopilotGeneratedImage>;
    evaluate?: (input: { imageDataUrl: string; goal: string; apiKey: string }) => Promise<{ score: number; feedback: string[]; costLedger?: ApiCostLedger }>;
    refine?: (input: { goal: string; currentPrompt: string; feedback: string[]; apiKey: string }) => Promise<string | { prompt: string; costLedger?: ApiCostLedger }>;
    lineageStore: Pick<LineageStore, 'save'>;
    callbacks?: ProgressCallbacks;
    makeRunId?: () => string;
}

class DefaultAutopilotSession implements AutopilotSession {
    private readonly input: CreateAutopilotSessionInput;
    private cancelled = false;

    constructor(input: CreateAutopilotSessionInput) {
        this.input = input;
    }

    cancel(): void {
        this.cancelled = true;
    }

    async run(): Promise<AutopilotSessionResult> {
        const generate = this.input.generate ?? generateSingleImage;
        const evaluate = this.input.evaluate ?? ((input) => satisfactionEvaluator.evaluate(input));
        const refine = this.input.refine ?? ((input) => promptRefiner.refine(input));
        const maxIterations = Math.max(1, Math.min(MAX_AUTOPILOT_ITERATIONS, this.input.maxIterations ?? DEFAULT_AUTOPILOT_MAX_ITERATIONS));
        const satisfactionThreshold = Math.max(0, Math.min(100, this.input.satisfactionThreshold ?? DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD));
        const reasoningApiKey = this.input.reasoningApiKey ?? this.input.apiKey;
        const iterations: AutopilotIteration[] = [];
        const runId = this.input.makeRunId?.() ?? crypto.randomUUID();
        const runSettings = snapshotAutopilotSettings(this.input.settings);
        let currentPrompt = this.input.initialPrompt;
        let parentStepId = this.input.initialParentStepId ?? null;
        let runningBest: AutopilotIteration | null = null;
        let runCostLedger = this.input.initialCostLedger;

        for (let iterationNumber = 1; iterationNumber <= maxIterations; iterationNumber += 1) {
            try {
                const iterationSettings = snapshotAutopilotSettings(runSettings);
                const generatedImage = normalizeAutopilotGeneratedImage(await generate({
                    ...iterationSettings,
                    apiKey: this.input.apiKey,
                    prompt: currentPrompt,
                }));
                const imageDataUrl = generatedImage.imageDataUrl;

                const evaluation = await evaluate({
                    imageDataUrl,
                    goal: this.input.goal,
                    apiKey: reasoningApiKey,
                });
                const iterationCostLedger = mergeApiCostLedgers(
                    generatedImage.costLedger,
                    evaluation.costLedger,
                );
                runCostLedger = mergeApiCostLedgers(runCostLedger, iterationCostLedger);

                const archiveImageId = `autopilot:${runId}:iteration:${iterationNumber}`;
                const step = await this.input.lineageStore.save({
                    archiveImageId,
                    parentStepId,
                    stepType: 'autopilot-iteration',
                    timestamp: new Date().toISOString(),
                    metadata: buildAutopilotLineageMetadata({
                        goal: this.input.goal,
                        reasoningModel: this.input.reasoningModel,
                        iterationNumber,
                        evaluation,
                        prompt: currentPrompt,
                        settings: snapshotAutopilotSettings(runSettings),
                        outputImageDataUrl: imageDataUrl,
                        actualParameters: generatedImage.actualParameters,
                        costLedger: iterationCostLedger,
                    }),
                });

                const completedIteration: AutopilotIteration = {
                    stepId: step.id,
                    archiveImageId,
                    iterationNumber,
                    prompt: currentPrompt,
                    imageDataUrl,
                    actualParameters: generatedImage.actualParameters,
                    costLedger: iterationCostLedger,
                    score: evaluation.score,
                    feedback: evaluation.feedback,
                };

                iterations.push(completedIteration);
                runningBest = pickBetterIteration(runningBest, completedIteration);
                this.input.callbacks?.onIterationComplete?.(completedIteration, runningBest);
                parentStepId = step.id;

                if (evaluation.score >= satisfactionThreshold) {
                    return buildResult('satisfied', iterations, null, runCostLedger);
                }

                if (this.cancelled) {
                    return buildResult('cancelled', iterations, null, runCostLedger);
                }

                if (iterationNumber === maxIterations) {
                    return buildResult('max-iterations', iterations, null, runCostLedger);
                }

                const refinement = normalizePromptRefinement(await refine({
                    goal: this.input.goal,
                    currentPrompt,
                    feedback: evaluation.feedback,
                    apiKey: reasoningApiKey,
                }));
                runCostLedger = mergeApiCostLedgers(runCostLedger, refinement.costLedger);
                currentPrompt = refinement.prompt;
            } catch (error) {
                const normalizedError = error instanceof Error ? error : new Error('Autopilot run failed');
                this.input.callbacks?.onError?.(normalizedError, iterationNumber);
                return buildResult('failed', iterations, normalizedError, runCostLedger);
            }
        }

        return buildResult('max-iterations', iterations, null, runCostLedger);
    }
}

function buildResult(
    status: AutopilotSessionResult['status'],
    iterations: AutopilotIteration[],
    error: Error | null,
    runCostLedger?: ApiCostLedger,
): AutopilotSessionResult {
    const bestIteration = getBestIteration(iterations);

    return {
        status,
        iterations,
        bestIteration: bestIteration && runCostLedger
            ? { ...bestIteration, costLedger: runCostLedger }
            : bestIteration,
        error,
    };
}

function getBestIteration(iterations: AutopilotIteration[]): AutopilotIteration | null {
    return iterations.reduce<AutopilotIteration | null>(pickBetterIteration, null);
}

// Single source of truth for "what counts as best": highest score, ties broken by earliest iteration.
function pickBetterIteration(best: AutopilotIteration | null, candidate: AutopilotIteration): AutopilotIteration {
    if (!best) {
        return candidate;
    }

    if (candidate.score > best.score) {
        return candidate;
    }

    if (candidate.score === best.score && candidate.iterationNumber < best.iterationNumber) {
        return candidate;
    }

    return best;
}

export function createAutopilotSession(input: CreateAutopilotSessionInput): AutopilotSession {
    return new DefaultAutopilotSession(input);
}

async function generateSingleImage(input: GenerateImageInput): Promise<AutopilotGeneratedImage> {
    const results = await imageWorkflow.generate({
        ...input,
        batchSize: 1,
    });
    const result = results.find((result) => result.status === 'success');

    if (!result) {
        throw new Error('No image data returned from image provider');
    }

    return {
        imageDataUrl: result.imageUrl,
        actualParameters: result.actualParameters,
        costLedger: result.costLedger,
    };
}

function normalizeAutopilotGeneratedImage(result: string | AutopilotGeneratedImage): AutopilotGeneratedImage {
    return typeof result === 'string'
        ? { imageDataUrl: result }
        : result;
}

function normalizePromptRefinement(result: string | { prompt: string; costLedger?: ApiCostLedger }) {
    return typeof result === 'string'
        ? { prompt: result }
        : result;
}

function snapshotAutopilotSettings(
    settings: Omit<GenerateImageInput, 'apiKey' | 'prompt'>,
): Omit<GenerateImageInput, 'apiKey' | 'prompt'> {
    return {
        ...settings,
        referenceImages: settings.referenceImages.slice(),
    };
}
