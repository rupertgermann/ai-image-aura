import type { ArchiveLayerStack } from '../db/types';
import type { ImageModelSlug } from '../utils/openaiModels';
import {
    insertAiResultLayer,
    planAiTransformTarget,
    type AiTransformTargetPlan,
    type AiTransformTargetMetadata,
    type EditorAdjustments,
    type EditorDraft,
    type LayerBounds,
} from './layers';
import { renderLayerStackToBlob } from './renderLayerStack';

export type AiTransformRenderer = (
    layerStack: ArchiveLayerStack,
    adjustments: EditorAdjustments,
    bounds: LayerBounds,
) => Promise<Blob>;

export interface RenderAiTransformEditInputOptions {
    draft: EditorDraft;
    adjustments: EditorAdjustments;
    referenceImages: File[];
    render?: AiTransformRenderer;
}

export interface RenderedAiTransformEditInput {
    targetPlan: AiTransformTargetPlan;
    sourceImage: Blob;
    compositionContextImage: File | null;
    referenceImages: File[];
}

export interface AppliedAiTransformResult {
    draft: EditorDraft;
    resultLayerId: string;
    resultLayerName: string | null;
    provenance: AiTransformSaveProvenance | null;
}

export interface AiTransformSaveProvenance extends AiTransformTargetMetadata {
    aiEditPrompt: string;
    aiEditModel: ImageModelSlug;
    aiResultLayerId: string;
    aiResultLayerName: string | null;
}

export interface AiTransformProvenanceInput {
    prompt: string;
    model: ImageModelSlug;
}

export async function renderAiTransformEditInput({
    draft,
    adjustments,
    referenceImages,
    render = renderLayerStackToBlob,
}: RenderAiTransformEditInputOptions): Promise<RenderedAiTransformEditInput> {
    const targetPlan = planAiTransformTarget(draft);
    const sourceLayerStack = buildAiTransformSourceLayerStack(draft.layerStack, targetPlan);
    const sourceImage = await render(sourceLayerStack, adjustments, targetPlan.targetBounds);
    const compositionContextImage = targetPlan.requiresCompositionContext
        ? blobToFile(
            await render(draft.layerStack, adjustments, getWholeCompositionBounds(draft.layerStack)),
            'composition-context.png',
        )
        : null;

    return {
        targetPlan,
        sourceImage,
        compositionContextImage,
        referenceImages,
    };
}

export function applyAiTransformResultToDraft(
    draft: EditorDraft,
    targetPlan: AiTransformTargetPlan,
    resultUrl: string,
    makeId: () => string,
    provenanceInput?: AiTransformProvenanceInput,
): AppliedAiTransformResult {
    const result = insertAiResultLayer(draft.layerStack, targetPlan.targetLayerIds, resultUrl, makeId);
    const resultLayer = result.layerStack.layers.find((layer) => layer.id === result.layerId);
    const resultLayerName = resultLayer?.name ?? null;

    return {
        draft: {
            ...draft,
            layerStack: result.layerStack,
            selectedLayerIds: [result.layerId],
            primarySelectedLayerId: result.layerId,
        },
        resultLayerId: result.layerId,
        resultLayerName,
        provenance: provenanceInput
            ? {
                aiEditPrompt: provenanceInput.prompt,
                aiEditModel: provenanceInput.model,
                targetMode: targetPlan.metadata.targetMode,
                targetLayerCount: targetPlan.metadata.targetLayerCount,
                targetIncludesBaseLayer: targetPlan.metadata.targetIncludesBaseLayer,
                aiResultLayerId: result.layerId,
                aiResultLayerName: resultLayerName,
            }
            : null,
    };
}

export function getAiTransformSaveProvenance(
    draft: EditorDraft | null,
    provenance: AiTransformSaveProvenance | null,
): AiTransformSaveProvenance | null {
    if (!draft || !provenance) {
        return null;
    }

    const resultLayer = draft.layerStack.layers.find((layer) => layer.id === provenance.aiResultLayerId);
    if (!resultLayer || resultLayer.kind !== 'ai-result') {
        return null;
    }

    return {
        ...provenance,
        aiResultLayerName: resultLayer.name,
    };
}

function buildAiTransformSourceLayerStack(
    layerStack: ArchiveLayerStack,
    targetPlan: AiTransformTargetPlan,
): ArchiveLayerStack {
    if (targetPlan.mode === 'whole-composition') {
        return layerStack;
    }

    const targetIds = new Set(targetPlan.targetLayerIds);
    return {
        ...layerStack,
        layers: layerStack.layers.filter((layer) => targetIds.has(layer.id)),
    };
}

function getWholeCompositionBounds(layerStack: ArchiveLayerStack): LayerBounds {
    return {
        x: 0,
        y: 0,
        width: layerStack.canvasWidth,
        height: layerStack.canvasHeight,
    };
}

function blobToFile(blob: Blob, name: string) {
    return new File([blob], name, { type: blob.type || 'image/png' });
}
