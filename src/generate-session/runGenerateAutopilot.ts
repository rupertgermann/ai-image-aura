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
    lineageStore: Pick<LineageStore, 'save' | 'getByArchiveImageId'>;
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
    const runDraft = structuredClone(input.draft);
    runDraft[getImageModelDraftKey(runDraft.model)].batchSize = 1;
    const imageModel = getActiveGenerateModel(runDraft);
    const referenceRunPlan = buildImageModelGenerateReferenceRunPlan(runDraft.model, input.referenceImages);
    const usedReferenceImages = referenceRunPlan.providerReferenceImages.slice();
    const usedReferences = await workflow.serializeReferences(usedReferenceImages.slice());
    const source = input.sessionStore.loadLineageSource();
    const originalSource = source ? {
        ...source,
        stepId: source.stepId ?? (await input.lineageStore.getByArchiveImageId(source.archiveImageId)).at(-1)?.id ?? null,
    } : null;
    const session = createSession({
        goal: input.goal,
        references: usedReferences,
        initialPrompt: runDraft.prompt,
        settings: {
            ...imageModel,
            style: runDraft.style,
            lighting: runDraft.lighting,
            palette: runDraft.palette,
            referenceImages: usedReferenceImages,
        },
        imageCredential: input.imageCredential,
        getProviderCredential: input.getProviderCredential,
        reasoningModel: input.reasoningModel,
        initialParentStepId: originalSource?.stepId ?? null,
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
    const selectedIteration = result.status === 'failed'
        ? result.iterations.at(-1) ?? result.bestIteration
        : result.bestIteration;
    let batch: GenerateBatchSnapshot | null = null;

    if (selectedIteration) {
        runDraft.prompt = selectedIteration.prompt;
        const durableIteration = selectedIteration.stepId
            ? selectedIteration
            : result.iterations.filter((iteration) => iteration.stepId !== null).at(-1);
        const lineageSource = durableIteration ? {
            archiveImageId: durableIteration.archiveImageId,
            stepId: durableIteration.stepId,
        } : originalSource;
        batch = {
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: selectedIteration.imageDataUrl,
                isSaved: false,
                actualParameters: selectedIteration.actualParameters,
                costLedger: result.bestIteration?.costLedger ?? selectedIteration.costLedger,
                ...(selectedIteration.stepId ? { archiveImageId: selectedIteration.archiveImageId } : {}),
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
