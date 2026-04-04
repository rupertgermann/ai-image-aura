import { createAutopilotSession, type AutopilotSessionResult } from '../autopilot/AutopilotSession';
import type { GenerateDraft, GenerateSessionStore } from './GenerateSession';
import type { LineageStore } from '../lineage/LineageStore';
import type { ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import { promptRefiner } from '../autopilot/PromptRefiner';
import { satisfactionEvaluator } from '../autopilot/SatisfactionEvaluator';

interface RunGenerateAutopilotInput {
    goal: string;
    apiKey: string;
    draft: GenerateDraft;
    referenceImages: File[];
    sessionStore: Pick<GenerateSessionStore, 'loadLineageSource' | 'saveCurrentResult' | 'saveLineageSource'>;
    lineageStore: Pick<LineageStore, 'save'>;
    createSession?: typeof createAutopilotSession;
    workflow?: Pick<ImageWorkflow, 'generate'>;
    evaluate?: typeof satisfactionEvaluator.evaluate;
    refine?: typeof promptRefiner.refine;
    maxIterations?: number;
    satisfactionThreshold?: number;
    onSessionCreated?: (session: ReturnType<typeof createAutopilotSession>) => void;
    onIterationComplete?: (iteration: AutopilotSessionResult['iterations'][number]) => void;
    onError?: (error: Error, iterationNumber: number) => void;
}

export interface RunGenerateAutopilotOutcome {
    session: ReturnType<typeof createAutopilotSession>;
    result: AutopilotSessionResult;
}

export async function runGenerateAutopilot(input: RunGenerateAutopilotInput): Promise<RunGenerateAutopilotOutcome> {
    const createSession = input.createSession ?? createAutopilotSession;
    const session = createSession({
        goal: input.goal,
        initialPrompt: input.draft.prompt,
        settings: {
            quality: input.draft.quality,
            aspectRatio: input.draft.aspectRatio,
            background: input.draft.background,
            style: input.draft.style,
            lighting: input.draft.lighting,
            palette: input.draft.palette,
            referenceImages: input.referenceImages,
        },
        apiKey: input.apiKey,
        initialParentStepId: input.sessionStore.loadLineageSource()?.stepId ?? null,
        maxIterations: input.maxIterations,
        satisfactionThreshold: input.satisfactionThreshold,
        generate: (request) => (input.workflow ?? imageWorkflow).generate(request),
        evaluate: input.evaluate,
        refine: input.refine,
        lineageStore: input.lineageStore,
        callbacks: {
            onIterationComplete: input.onIterationComplete,
            onError: input.onError,
        },
    });
    input.onSessionCreated?.(session);
    const result = await session.run();

    if (result.bestIteration) {
        await input.sessionStore.saveCurrentResult(result.bestIteration.imageDataUrl);
        input.sessionStore.saveLineageSource({
            archiveImageId: result.bestIteration.archiveImageId,
            stepId: result.bestIteration.stepId,
        });
    }

    return {
        session,
        result,
    };
}
