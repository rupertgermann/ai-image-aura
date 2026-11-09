import type { ApiCostLedger, ArchiveImage, ArchiveLayerStack } from '../db/types';
import { mergeApiCostLedgers } from '../costs/apiCost';
import { buildEditorLineageMetadata, type EditorLineageTransformMaskAsset } from '../lineage/editorLineageMetadata';
import { buildGenerateLineageMetadata } from '../lineage/generateLineageMetadata';
import { lineageStore, type LineageStore, type SaveLineageStepInput } from '../lineage/LineageStore';
import { archiveStore, type ArchiveStore } from './ArchiveStore';
import type { GenerateRunDraft, GenerateLineageSource } from '../generate-session/GenerateSession';
import type { EditorAdjustments } from '../editor/layers';

export interface EditorSaveContext {
    isCopy: boolean;
    references?: string[];
    adjustments: EditorAdjustments;
    layerStack?: ArchiveLayerStack | null;
    targetMode?: 'whole-composition' | 'selected-layers' | null;
    targetLayerCount?: number | null;
    targetIncludesBaseLayer?: boolean | null;
    aiResultLayerId?: string | null;
    aiResultLayerName?: string | null;
    costLedger?: ApiCostLedger;
    aiEditPrompt?: string | null;
    aiEditModel?: string | null;
    transformMask?: EditorLineageTransformMaskAsset | null;
}

export interface GenerationSaveRequest {
    kind: 'generation';
    image: ArchiveImage;
    source: GenerateLineageSource | null;
    runDraft: GenerateRunDraft | null;
}

export type SaveArchiveImageRequest = GenerationSaveRequest | {
    kind: 'edit';
    sourceImage: ArchiveImage;
    updatedUrl: string;
    context: EditorSaveContext;
    parentStepId?: string | null;
};

interface SaveArchiveImageDeps {
    archive?: Pick<ArchiveStore, 'get' | 'save' | 'remove'>;
    lineage?: Pick<LineageStore, 'getByArchiveImageId' | 'save'>;
    clock?: () => string;
    makeId?: () => string;
}

/** Returns after both writes succeed; attempts archive restoration if lineage rejects. */
export async function saveArchiveImage(
    request: SaveArchiveImageRequest,
    { archive = archiveStore, lineage = lineageStore, clock = () => new Date().toISOString(), makeId = () => crypto.randomUUID() }: SaveArchiveImageDeps = {},
): Promise<ArchiveImage> {
    let image: ArchiveImage;
    let step: SaveLineageStepInput;
    if (request.kind === 'generation') {
        image = request.image;
        const source = request.source;
        const parentStepId = source
            ? source.stepId || (await lineage.getByArchiveImageId(source.archiveImageId)).at(-1)?.id || null
            : null;
        step = {
            archiveImageId: image.id,
            parentStepId,
            stepType: image.references?.length ? 'reference-generation' : 'generation',
            timestamp: image.timestamp,
            metadata: buildGenerateLineageMetadata({ image, sourceArchiveImageId: source?.archiveImageId ?? null, runDraft: request.runDraft }),
        };
    } else {
        const timestamp = clock();
        const { sourceImage, context } = request;
        image = {
            ...sourceImage,
            ...(context.isCopy ? { id: makeId(), timestamp } : {}),
            url: request.updatedUrl,
            references: context.references ?? sourceImage.references,
            costLedger: mergeApiCostLedgers(sourceImage.costLedger, context.costLedger),
            layerStack: context.layerStack
                ? { ...context.layerStack, adjustments: context.adjustments }
                : undefined,
        };
        const parentStepId = request.parentStepId ?? (await lineage.getByArchiveImageId(request.sourceImage.id)).at(-1)?.id ?? null;
        step = {
            archiveImageId: image.id,
            parentStepId,
            stepType: context.aiEditPrompt?.trim() ? 'ai-edit' : context.isCopy ? 'save-as-copy' : 'overwrite',
            timestamp,
            metadata: buildEditorLineageMetadata({ ...context, sourceImage, savedImage: image }),
        };
    }

    const previous = await archive.get(image.id);
    const savedImage = await archive.save(image);
    try {
        await lineage.save(step);
    } catch (error) {
        try {
            if (previous) {
                await archive.save(previous);
            } else {
                await archive.remove(savedImage.id);
            }
        } catch (rollbackError) {
            throw new AggregateError([error, rollbackError],
                `Lineage save failed: ${error instanceof Error ? error.message : String(error)}. Archive restoration also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}.`);
        }
        throw error;
    }
    return savedImage;
}
