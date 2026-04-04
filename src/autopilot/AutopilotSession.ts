import { promptRefiner } from './PromptRefiner';
import { satisfactionEvaluator } from './SatisfactionEvaluator';
import type { LineageStore } from '../lineage/LineageStore';
import type { GenerateImageInput } from '../image-workflow/ImageWorkflow';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';

export const DEFAULT_AUTOPILOT_MAX_ITERATIONS = 4;
export const MAX_AUTOPILOT_ITERATIONS = 8;
export const DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD = 90;

export interface AutopilotIteration {
    stepId: string;
    archiveImageId: string;
    iterationNumber: number;
    prompt: string;
    imageDataUrl: string;
    score: number;
    feedback: string[];
}

export interface AutopilotSessionResult {
    status: 'satisfied' | 'max-iterations' | 'cancelled' | 'failed';
    iterations: AutopilotIteration[];
    bestIteration: AutopilotIteration | null;
    error: Error | null;
}

interface ProgressCallbacks {
    onIterationComplete?: (iteration: AutopilotIteration) => void;
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
    initialParentStepId?: string | null;
    maxIterations?: number;
    satisfactionThreshold?: number;
    generate?: (input: GenerateImageInput) => Promise<string>;
    evaluate?: (input: { imageDataUrl: string; goal: string; apiKey: string }) => Promise<{ score: number; feedback: string[] }>;
    refine?: (input: { goal: string; currentPrompt: string; feedback: string[]; apiKey: string }) => Promise<string>;
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
        const generate = this.input.generate ?? ((input) => imageWorkflow.generate(input));
        const evaluate = this.input.evaluate ?? ((input) => satisfactionEvaluator.evaluate(input));
        const refine = this.input.refine ?? ((input) => promptRefiner.refine(input));
        const maxIterations = Math.max(1, Math.min(MAX_AUTOPILOT_ITERATIONS, this.input.maxIterations ?? DEFAULT_AUTOPILOT_MAX_ITERATIONS));
        const satisfactionThreshold = Math.max(0, Math.min(100, this.input.satisfactionThreshold ?? DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD));
        const iterations: AutopilotIteration[] = [];
        const runId = this.input.makeRunId?.() ?? crypto.randomUUID();
        let currentPrompt = this.input.initialPrompt;
        let parentStepId = this.input.initialParentStepId ?? null;

        for (let iterationNumber = 1; iterationNumber <= maxIterations; iterationNumber += 1) {
            try {
                const imageDataUrl = await generate({
                    ...this.input.settings,
                    apiKey: this.input.apiKey,
                    prompt: currentPrompt,
                });

                const evaluation = await evaluate({
                    imageDataUrl,
                    goal: this.input.goal,
                    apiKey: this.input.apiKey,
                });

                const archiveImageId = `autopilot:${runId}:iteration:${iterationNumber}`;
                const step = await this.input.lineageStore.save({
                    archiveImageId,
                    parentStepId,
                    stepType: 'autopilot-iteration',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        goalText: this.input.goal,
                        iterationNumber,
                        evaluatorScore: evaluation.score,
                        evaluatorFeedback: evaluation.feedback,
                        prompt: currentPrompt,
                        quality: this.input.settings.quality,
                        aspectRatio: this.input.settings.aspectRatio,
                        background: this.input.settings.background,
                        style: this.input.settings.style,
                        lighting: this.input.settings.lighting,
                        palette: this.input.settings.palette,
                        outputImageDataUrl: imageDataUrl,
                    },
                });

                const completedIteration: AutopilotIteration = {
                    stepId: step.id,
                    archiveImageId,
                    iterationNumber,
                    prompt: currentPrompt,
                    imageDataUrl,
                    score: evaluation.score,
                    feedback: evaluation.feedback,
                };

                iterations.push(completedIteration);
                this.input.callbacks?.onIterationComplete?.(completedIteration);
                parentStepId = step.id;

                if (evaluation.score >= satisfactionThreshold) {
                    return buildResult('satisfied', iterations, null);
                }

                if (this.cancelled) {
                    return buildResult('cancelled', iterations, null);
                }

                if (iterationNumber === maxIterations) {
                    return buildResult('max-iterations', iterations, null);
                }

                currentPrompt = await refine({
                    goal: this.input.goal,
                    currentPrompt,
                    feedback: evaluation.feedback,
                    apiKey: this.input.apiKey,
                });
            } catch (error) {
                const normalizedError = error instanceof Error ? error : new Error('Autopilot run failed');
                this.input.callbacks?.onError?.(normalizedError, iterationNumber);
                return buildResult('failed', iterations, normalizedError);
            }
        }

        return buildResult('max-iterations', iterations, null);
    }
}

function buildResult(status: AutopilotSessionResult['status'], iterations: AutopilotIteration[], error: Error | null): AutopilotSessionResult {
    return {
        status,
        iterations,
        bestIteration: getBestIteration(iterations),
        error,
    };
}

function getBestIteration(iterations: AutopilotIteration[]) {
    return iterations.reduce<AutopilotIteration | null>((best, iteration) => {
        if (!best) {
            return iteration;
        }

        if (iteration.score > best.score) {
            return iteration;
        }

        if (iteration.score === best.score && iteration.iterationNumber < best.iterationNumber) {
            return iteration;
        }

        return best;
    }, null);
}

export function createAutopilotSession(input: CreateAutopilotSessionInput): AutopilotSession {
    return new DefaultAutopilotSession(input);
}
