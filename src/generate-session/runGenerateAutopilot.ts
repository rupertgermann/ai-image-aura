import { createAutopilotSession, type AutopilotGeneratedImage, type AutopilotSessionResult } from '../autopilot/AutopilotSession';
import { getActiveGenerateControls, type GenerateDraft, type GenerateSessionStore } from './GenerateSession';
import type { LineageStore } from '../lineage/LineageStore';
import type { GenerateImageInput, ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import { promptRefiner } from '../autopilot/PromptRefiner';
import { satisfactionEvaluator } from '../autopilot/SatisfactionEvaluator';
import { buildImageModelGenerateReferenceRunPlan } from '../image-models/ImageModelControls';
import type { ApiCostLedger } from '../db/types';

interface RunGenerateAutopilotInput {
    goal: string;
    apiKey: string;
    reasoningApiKey?: string;
    reasoningModel?: string;
    draft: GenerateDraft;
    referenceImages: File[];
    sessionStore: Pick<GenerateSessionStore, 'loadLineageSource' | 'saveCurrentBatch' | 'saveLineageSource'>;
    lineageStore: Pick<LineageStore, 'save'>;
    createSession?: typeof createAutopilotSession;
    workflow?: Pick<ImageWorkflow, 'generate' | 'serializeReferences'>;
    evaluate?: typeof satisfactionEvaluator.evaluate;
    refine?: typeof promptRefiner.refine;
    initialCostLedger?: ApiCostLedger;
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
            batchSize: 1,
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
        initialCostLedger: input.initialCostLedger,
        maxIterations: input.maxIterations,
        satisfactionThreshold: input.satisfactionThreshold,
        generate: (request) => generateSingleImage(workflow, request),
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
        const lineageSource = {
            archiveImageId: result.bestIteration.archiveImageId,
            stepId: result.bestIteration.stepId,
        };
        await input.sessionStore.saveCurrentBatch({
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: result.bestIteration.imageDataUrl,
                isSaved: false,
                actualParameters: result.bestIteration.actualParameters,
                costLedger: result.bestIteration.costLedger,
                archiveImageId: result.bestIteration.archiveImageId,
            }],
            references: usedReferences,
            draft: null,
            lineageSource,
        });
        input.sessionStore.saveLineageSource(lineageSource);
    }

    return {
        session,
        result,
        usedReferenceImages: usedReferenceImages.slice(),
        usedReferences,
    };
}

async function generateSingleImage(
    workflow: Pick<ImageWorkflow, 'generate'>,
    request: GenerateImageInput,
): Promise<AutopilotGeneratedImage> {
    const results = await workflow.generate({
        ...request,
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
