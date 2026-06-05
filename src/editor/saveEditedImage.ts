import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import type { LineageStore } from '../lineage/LineageStore';
import type { EditorAdjustments } from './layers';

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
    aiEditPrompt?: string | null;
    aiEditModel?: string | null;
}

export interface SaveEditedImageDeps {
    saveImage: (image: ArchiveImage) => Promise<ArchiveImage>;
    lineageStore: Pick<LineageStore, 'getByArchiveImageId' | 'save'>;
    parentStepId?: string | null;
    clock?: () => string;
    makeId?: () => string;
}

export async function saveEditedImage(
    sourceImage: ArchiveImage,
    updatedUrl: string,
    context: EditorSaveContext,
    deps: SaveEditedImageDeps,
): Promise<ArchiveImage> {
    const timestamp = deps.clock?.() ?? new Date().toISOString();
    const savedImage = await deps.saveImage(buildSavedImage(sourceImage, updatedUrl, context, timestamp, deps.makeId));
    const parentStepId = deps.parentStepId ?? await resolveParentStepId(sourceImage.id, deps.lineageStore);

    await deps.lineageStore.save({
        archiveImageId: savedImage.id,
        parentStepId,
        stepType: resolveStepType(context),
        timestamp,
        metadata: buildMetadata(sourceImage, savedImage, context),
    });

    return savedImage;
}

function buildSavedImage(
    sourceImage: ArchiveImage,
    updatedUrl: string,
    context: EditorSaveContext,
    timestamp: string,
    makeId?: () => string,
): ArchiveImage {
    if (context.isCopy) {
        return {
            ...sourceImage,
            id: makeId?.() ?? crypto.randomUUID(),
            url: updatedUrl,
            timestamp,
            references: context.references ?? sourceImage.references,
            model: context.aiEditModel ?? sourceImage.model,
            layerStack: context.layerStack ?? undefined,
        };
    }

    return {
        ...sourceImage,
        url: updatedUrl,
        references: context.references ?? sourceImage.references,
        model: context.aiEditModel ?? sourceImage.model,
        layerStack: context.layerStack ?? undefined,
    };
}

async function resolveParentStepId(
    archiveImageId: string,
    lineageStore: Pick<LineageStore, 'getByArchiveImageId'>,
) {
    const sourceSteps = await lineageStore.getByArchiveImageId(archiveImageId);
    return sourceSteps.at(-1)?.id ?? null;
}

function resolveStepType(context: EditorSaveContext) {
    if (context.aiEditPrompt?.trim()) {
        return 'ai-edit' as const;
    }

    return context.isCopy ? 'save-as-copy' as const : 'overwrite' as const;
}

function buildMetadata(sourceImage: ArchiveImage, savedImage: ArchiveImage, context: EditorSaveContext) {
    const layerStack = context.layerStack ?? savedImage.layerStack;
    const layerCount = layerStack?.layers.length ?? null;
    const visibleLayerCount = layerStack?.layers.filter((layer) => layer.visible).length ?? null;

    return {
        sourceArchiveImageId: sourceImage.id,
        outputArchiveImageId: savedImage.id,
        overwrite: !context.isCopy,
        editPrompt: context.aiEditPrompt?.trim() || null,
        model: context.aiEditModel ?? sourceImage.model ?? null,
        referenceCount: savedImage.references?.length ?? 0,
        editorAdjustments: {
            brightness: context.adjustments.brightness,
            contrast: context.adjustments.contrast,
            saturation: context.adjustments.saturation,
            filter: context.adjustments.filter,
        },
        isLayered: !!layerStack && layerStack.layers.some((layer) => layer.kind !== 'base'),
        layerCount,
        visibleLayerCount,
        targetMode: context.targetMode ?? null,
        targetLayerCount: context.targetLayerCount ?? null,
        targetIncludesBaseLayer: context.targetIncludesBaseLayer ?? null,
        aiResultLayerId: context.aiResultLayerId ?? null,
        aiResultLayerName: context.aiResultLayerName ?? null,
    } satisfies Record<string, unknown>;
}
