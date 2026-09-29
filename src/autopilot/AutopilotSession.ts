import { createPromptRefiner } from './PromptRefiner';
import { createSatisfactionEvaluator } from './SatisfactionEvaluator';
import { createGoalPromptTranslator } from './GoalPromptTranslator';
import { resolveReasoningClient, type ReasoningClient } from './ReasoningClient';
import { getProviderLabel, OPENAI_RESPONSES_MODEL, resolveReasoningModelConfig, type Provider, type ReasoningModelSlug } from '../utils/openaiModels';
import type { LineageStore } from '../lineage/LineageStore';
import type { ActualImageParameters, ApiCostLedger } from '../db/types';
import type { GenerateImageInput, GenerateImageSettings } from '../image-workflow/ImageWorkflow';
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

interface AutopilotReasoningInput {
    reasoningModel?: ReasoningModelSlug;
    getProviderCredential: (provider: Provider) => string | null;
}

interface AutopilotReasoningDeps {
    reasoningClient?: Pick<ReasoningClient, 'createResponse'>;
}

interface CreateAutopilotSessionInput extends AutopilotReasoningInput {
    goal: string;
    initialPrompt: string;
    settings: GenerateImageSettings;
    imageCredential: string;
    initialParentStepId?: string | null;
    initialCostLedger?: ApiCostLedger;
    maxIterations?: number;
    satisfactionThreshold?: number;
    generate?: (input: GenerateImageInput) => Promise<AutopilotGeneratedImage>;
    lineageStore: Pick<LineageStore, 'save'>;
    callbacks?: ProgressCallbacks;
    makeRunId?: () => string;
}

class DefaultAutopilotSession implements AutopilotSession {
    private readonly input: CreateAutopilotSessionInput;
    private readonly reasoning: ReturnType<typeof resolveAutopilotReasoning>;
    private cancelled = false;

    constructor(input: CreateAutopilotSessionInput, deps: AutopilotReasoningDeps) {
        this.input = input;
        this.reasoning = resolveAutopilotReasoning(input, deps);
    }

    cancel(): void {
        this.cancelled = true;
    }

    async run(): Promise<AutopilotSessionResult> {
        const generate = this.input.generate ?? generateSingleImage;
        const { evaluate } = createSatisfactionEvaluator(this.reasoning.client);
        const { refine } = createPromptRefiner(this.reasoning.client);
        const maxIterations = Math.max(1, Math.min(MAX_AUTOPILOT_ITERATIONS, this.input.maxIterations ?? DEFAULT_AUTOPILOT_MAX_ITERATIONS));
        const satisfactionThreshold = Math.max(0, Math.min(100, this.input.satisfactionThreshold ?? DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD));
        const reasoningApiKey = this.reasoning.apiKey;
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
                const generatedImage = await generate({
                    ...iterationSettings,
                    credential: this.input.imageCredential,
                    prompt: currentPrompt,
                });
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
                        reasoningModel: this.reasoning.model,
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

                const refinement = await refine({
                    goal: this.input.goal,
                    currentPrompt,
                    feedback: evaluation.feedback,
                    apiKey: reasoningApiKey,
                });
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

// Choose the highest score; break ties using the earliest iteration.
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

export function createAutopilotSession(input: CreateAutopilotSessionInput, deps: AutopilotReasoningDeps = {}): AutopilotSession {
    return new DefaultAutopilotSession(input, deps);
}

export async function translateAutopilotGoal(input: AutopilotReasoningInput & { goal: string }) {
    const { client, apiKey } = resolveAutopilotReasoning(input);
    return createGoalPromptTranslator(client).translate({ goal: input.goal, apiKey });
}

function resolveAutopilotReasoning(input: AutopilotReasoningInput, deps: AutopilotReasoningDeps = {}) {
    const model = input.reasoningModel ?? OPENAI_RESPONSES_MODEL;
    const config = resolveReasoningModelConfig(model);
    const apiKey = input.getProviderCredential(config.provider);
    if (!apiKey) {
        throw new Error(`Please set the ${getProviderLabel(config.provider)} API key for the reasoning model in Settings first.`);
    }

    return {
        model,
        apiKey,
        client: {
            provider: config.provider,
            model: config.apiModel,
            createResponse: deps.reasoningClient?.createResponse ?? resolveReasoningClient(model).createResponse,
        },
    };
}

async function generateSingleImage(input: GenerateImageInput): Promise<AutopilotGeneratedImage> {
    const request = { ...input };
    request.controls = { ...input.controls, batchSize: 1 };
    const results = await imageWorkflow.generate(request);
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

function snapshotAutopilotSettings(
    settings: GenerateImageSettings,
): GenerateImageSettings {
    const snapshot = { ...settings };
    snapshot.controls = { ...settings.controls };
    snapshot.referenceImages = settings.referenceImages.slice();
    return snapshot;
}
