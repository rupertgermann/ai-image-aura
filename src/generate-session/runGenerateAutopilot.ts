import { createAutopilotSession, type AutopilotGeneratedImage, type AutopilotSessionResult } from '../autopilot/AutopilotSession';
import { getActiveGenerateModel, getImageModelDraftKey, type GenerateBatchSnapshot, type GenerateDraft, type GenerateSessionStore } from './GenerateSession';
import type { LineageStore } from '../lineage/LineageStore';
import type { GenerateImageInput, ImageWorkflow } from '../image-workflow/ImageWorkflow';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import type { Provider, ReasoningModelSlug } from '../utils/openaiModels';
import { buildImageModelGenerateReferenceRunPlan } from '../image-models/ImageModelControls';
import type { ApiCostLedger } from '../db/types';

interface RunGenerateAutopilotInput {
    goal: string;
    imageCredential: string;
    getProviderCredential: (provider: Provider) => string | null;
    reasoningModel?: ReasoningModelSlug;
    draft: GenerateDraft;
    referenceImages: File[];
    sessionStore: Pick<GenerateSessionStore, 'loadLineageSource'>;
    lineageStore: Pick<LineageStore, 'save'>;
    createSession?: typeof createAutopilotSession;
    workflow?: Pick<ImageWorkflow, 'generate' | 'serializeReferences'>;
    initialCostLedger?: ApiCostLedger;
    maxIterations?: number;
    satisfactionThreshold?: number;
    onSessionCreated?: (session: ReturnType<typeof createAutopilotSession>) => void;
    onIterationComplete?: (iteration: AutopilotSessionResult['iterations'][number], runningBest: AutopilotSessionResult['iterations'][number]) => void;
    onError?: (error: Error, iterationNumber: number) => void;
}

export interface RunGenerateAutopilotOutcome {
    result: AutopilotSessionResult;
    batch: GenerateBatchSnapshot | null;
}

export async function runGenerateAutopilot(input: RunGenerateAutopilotInput): Promise<RunGenerateAutopilotOutcome> {
    const createSession = input.createSession ?? createAutopilotSession;
    const workflow = input.workflow ?? imageWorkflow;
    const imageModel = getActiveGenerateModel(input.draft);
    imageModel.controls.batchSize = 1;
    const referenceRunPlan = buildImageModelGenerateReferenceRunPlan(input.draft.model, input.referenceImages);
    const usedReferenceImages = referenceRunPlan.providerReferenceImages.slice();
    const session = createSession({
        goal: input.goal,
        initialPrompt: input.draft.prompt,
        settings: {
            ...imageModel,
            style: input.draft.style,
            lighting: input.draft.lighting,
            palette: input.draft.palette,
            referenceImages: usedReferenceImages,
        },
        imageCredential: input.imageCredential,
        getProviderCredential: input.getProviderCredential,
        reasoningModel: input.reasoningModel,
        initialParentStepId: input.sessionStore.loadLineageSource()?.stepId ?? null,
        initialCostLedger: input.initialCostLedger,
        maxIterations: input.maxIterations,
        satisfactionThreshold: input.satisfactionThreshold,
        generate: (request) => generateSingleImage(workflow, request),
        lineageStore: input.lineageStore,
        callbacks: {
            onIterationComplete: input.onIterationComplete,
            onError: input.onError,
        },
    });
    input.onSessionCreated?.(session);
    const result = await session.run();
    let batch: GenerateBatchSnapshot | null = null;

    if (result.bestIteration) {
        const runDraft = structuredClone(input.draft);
        runDraft.prompt = result.bestIteration.prompt;
        runDraft[getImageModelDraftKey(runDraft.model)].batchSize = 1;
        const usedReferences = await workflow.serializeReferences(usedReferenceImages.slice());
        const lineageSource = {
            archiveImageId: result.bestIteration.archiveImageId,
            stepId: result.bestIteration.stepId,
        };
        batch = {
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
            draft: runDraft,
            lineageSource,
        };
    }

    return {
        result,
        batch,
    };
}

async function generateSingleImage(
    workflow: Pick<ImageWorkflow, 'generate'>,
    request: GenerateImageInput,
): Promise<AutopilotGeneratedImage> {
    const results = await workflow.generate(request);
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
