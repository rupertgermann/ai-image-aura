import type { ArchiveImage } from '../db/types';
import type { LineageStore } from '../lineage/LineageStore';

export interface EditorAdjustments {
    brightness: number;
    contrast: number;
    saturation: number;
    filter: string;
}

export interface EditorSaveContext {
    isCopy: boolean;
    references?: string[];
    adjustments: EditorAdjustments;
    aiEditPrompt?: string | null;
}

export interface SaveEditedImageDeps {
    saveImage: (image: ArchiveImage) => Promise<ArchiveImage>;
    lineageStore: Pick<LineageStore, 'getByArchiveImageId' | 'save'>;
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
    const parentStepId = await resolveParentStepId(sourceImage.id, deps.lineageStore);

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
        };
    }

    return {
        ...sourceImage,
        url: updatedUrl,
        references: context.references ?? sourceImage.references,
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
    return {
        sourceArchiveImageId: sourceImage.id,
        outputArchiveImageId: savedImage.id,
        overwrite: !context.isCopy,
        editPrompt: context.aiEditPrompt?.trim() || null,
        referenceCount: savedImage.references?.length ?? 0,
        editorAdjustments: {
            brightness: context.adjustments.brightness,
            contrast: context.adjustments.contrast,
            saturation: context.adjustments.saturation,
            filter: context.adjustments.filter,
        },
    } satisfies Record<string, unknown>;
}
