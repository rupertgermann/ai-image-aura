import { createAutopilotSession, type AutopilotSessionResult } from '../autopilot/AutopilotSession';
import { getActiveGenerateControls, type GenerateDraft, type GenerateSessionStore } from './GenerateSession';
import type { LineageStore } from '../lineage/LineageStore';
import type { ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import { promptRefiner } from '../autopilot/PromptRefiner';
import { satisfactionEvaluator } from '../autopilot/SatisfactionEvaluator';
import { buildImageModelGenerateReferenceRunPlan } from '../image-models/ImageModelControls';

interface RunGenerateAutopilotInput {
    goal: string;
    apiKey: string;
    reasoningApiKey?: string;
    reasoningModel?: string;
    draft: GenerateDraft;
    referenceImages: File[];
    sessionStore: Pick<GenerateSessionStore, 'loadLineageSource' | 'saveCurrentResult' | 'saveLineageSource'>;
    lineageStore: Pick<LineageStore, 'save'>;
    createSession?: typeof createAutopilotSession;
    workflow?: Pick<ImageWorkflow, 'generate' | 'serializeReferences'>;
    evaluate?: typeof satisfactionEvaluator.evaluate;
    refine?: typeof promptRefiner.refine;
    maxIterations?: number;
    satisfactionThreshold?: number;
    onSessionCreated?: (session: ReturnType<typeof createAutopilotSession>) => void;
    onIterationComplete?: (iteration: AutopilotSessionResult['iterations'][number], runningBest: AutopilotSessionResult['iterations'][number]) => void;
    onError?: (error: Error, iterationNumber: number) => void;
}

export interface RunGenerateAutopilotOutcome {
    session: ReturnType<typeof createAutopilotSession>;
    result: AutopilotSessionResult;
    usedReferenceImages: File[];
    usedReferences: string[] | null;
}

export async function runGenerateAutopilot(input: RunGenerateAutopilotInput): Promise<RunGenerateAutopilotOutcome> {
    const createSession = input.createSession ?? createAutopilotSession;
    const workflow = input.workflow ?? imageWorkflow;
    const controls = getActiveGenerateControls(input.draft);
    const referenceRunPlan = buildImageModelGenerateReferenceRunPlan(input.draft.model, input.referenceImages);
    const usedReferenceImages = referenceRunPlan.providerReferenceImages.slice();
    const session = createSession({
        goal: input.goal,
        initialPrompt: input.draft.prompt,
        settings: {
            model: input.draft.model,
            quality: controls.quality,
            aspectRatio: controls.aspectRatio,
            background: controls.background,
            imageSize: controls.imageSize,
            style: input.draft.style,
            lighting: input.draft.lighting,
            palette: input.draft.palette,
            referenceImages: usedReferenceImages,
        },
        apiKey: input.apiKey,
        reasoningApiKey: input.reasoningApiKey,
        reasoningModel: input.reasoningModel,
        initialParentStepId: input.sessionStore.loadLineageSource()?.stepId ?? null,
        maxIterations: input.maxIterations,
        satisfactionThreshold: input.satisfactionThreshold,
        generate: (request) => workflow.generate(request),
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
    let usedReferences: string[] | null = null;

    if (result.bestIteration) {
        usedReferences = await workflow.serializeReferences(usedReferenceImages.slice());
        await input.sessionStore.saveCurrentResult(result.bestIteration.imageDataUrl, usedReferences);
        input.sessionStore.saveLineageSource({
            archiveImageId: result.bestIteration.archiveImageId,
            stepId: result.bestIteration.stepId,
        });
    }

    return {
        session,
        result,
        usedReferenceImages: usedReferenceImages.slice(),
        usedReferences,
    };
}
