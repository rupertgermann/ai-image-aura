import type { ArchiveImage } from '../db/types';
import type { LineageStore } from '../lineage/LineageStore';
import type { GenerateLineageSource, GenerateSessionStore } from './GenerateSession';

export interface SaveGeneratedImageDeps {
    saveImage: (image: ArchiveImage) => Promise<ArchiveImage>;
    lineageStore: Pick<LineageStore, 'getByArchiveImageId' | 'save'>;
    sessionStore: Pick<GenerateSessionStore, 'loadLineageSource' | 'clearLineageSource'>;
}

export async function saveGeneratedImage(image: ArchiveImage, deps: SaveGeneratedImageDeps): Promise<ArchiveImage> {
    const lineageSource = deps.sessionStore.loadLineageSource();
    const savedImage = await deps.saveImage(image);

    await deps.lineageStore.save({
        archiveImageId: savedImage.id,
        parentStepId: await resolveParentStepId(lineageSource, deps.lineageStore),
        stepType: savedImage.references && savedImage.references.length > 0 ? 'reference-generation' : 'generation',
        timestamp: savedImage.timestamp,
        metadata: buildGenerationMetadata(savedImage, lineageSource),
    });

    deps.sessionStore.clearLineageSource();

    return savedImage;
}

async function resolveParentStepId(
    lineageSource: GenerateLineageSource | null,
    lineageStore: Pick<LineageStore, 'getByArchiveImageId'>,
) {
    if (!lineageSource) {
        return null;
    }

    const sourceSteps = await lineageStore.getByArchiveImageId(lineageSource.archiveImageId);
    return sourceSteps.at(-1)?.id ?? null;
}

function buildGenerationMetadata(image: ArchiveImage, lineageSource: GenerateLineageSource | null) {
    return {
        prompt: image.prompt,
        model: image.model ?? null,
        quality: image.quality,
        aspectRatio: image.aspectRatio,
        background: image.background,
        style: image.style ?? 'none',
        lighting: image.lighting ?? 'none',
        palette: image.palette ?? 'none',
        referenceIds: (image.references ?? []).map((_, index) => createReferenceId(image.id, index)),
        referenceCount: image.references?.length ?? 0,
        sourceArchiveImageId: lineageSource?.archiveImageId ?? null,
    } satisfies Record<string, unknown>;
}

function createReferenceId(archiveImageId: string, index: number) {
    return `${archiveImageId}:reference:${index}`;
}
