import type { ArchiveImage } from '../db/types';
import type { GenerateSessionStore } from '../generate-session/GenerateSession';
import { dataURLtoFile } from '../utils/file';
import type { LineageStore } from './LineageStore';
import { buildEditorReplay, buildGenerateReplay, isEditorReplayable, isGenerateReplayable, type EditorReplay } from './replayLineageStep';

export type ReplayIntoGenerateOutcome =
    | { status: 'replayed' }
    | { status: 'unavailable'; reason: string };

export type ReplayIntoEditorOutcome =
    | { status: 'replayed'; image: ArchiveImage; replay: EditorReplay }
    | { status: 'unavailable'; reason: string };

export type ForkOutcome =
    | { status: 'forked'; destination: 'generate' }
    | { status: 'forked'; destination: 'editor'; image: ArchiveImage }
    | { status: 'unavailable'; reason: string };

export interface LineageNavigator {
    replayIntoGenerate(stepId: string): Promise<ReplayIntoGenerateOutcome>;
    replayIntoEditor(stepId: string): Promise<ReplayIntoEditorOutcome>;
    fork(stepId: string): Promise<ForkOutcome>;
}

export interface LineageNavigatorDeps {
    lineageStore: Pick<LineageStore, 'getById'>;
    sessionStore: Pick<GenerateSessionStore, 'transfer'>;
    findImage: (archiveImageId: string) => ArchiveImage | null;
}

export function createLineageNavigator(deps: LineageNavigatorDeps): LineageNavigator {
    const { lineageStore, sessionStore, findImage } = deps;

    return {
        async replayIntoGenerate(stepId) {
            const step = await lineageStore.getById(stepId);
            if (!step || !isGenerateReplayable(step)) {
                return { status: 'unavailable', reason: 'This step cannot be replayed into Generate' };
            }

            const image = findImage(step.archiveImageId);
            const savedReferences = step.stepType === 'autopilot-iteration' ? step.metadata.references : undefined;
            const referenceImages = step.metadata.referenceImages;
            const referenceCount = referenceImages && typeof referenceImages === 'object' && 'count' in referenceImages
                ? referenceImages.count
                : step.metadata.referenceCount;
            const knownEmpty = step.stepType !== 'autopilot-iteration' && referenceCount === 0;
            const references = savedReferences ?? image?.references ?? (image || knownEmpty ? [] : null);
            if (!Array.isArray(references) || !references.every((reference) => typeof reference === 'string')) {
                return { status: 'unavailable', reason: 'The reference inputs for this step are unavailable' };
            }
            try {
                references.forEach((reference) => dataURLtoFile(reference, 'reference.png'));
            } catch {
                return { status: 'unavailable', reason: 'The reference inputs for this step are unavailable' };
            }
            const replay = buildGenerateReplay(image, step);
            await sessionStore.transfer({ ...replay, references });

            return { status: 'replayed' };
        },

        async replayIntoEditor(stepId) {
            const step = await lineageStore.getById(stepId);
            if (!step || !isEditorReplayable(step)) {
                return { status: 'unavailable', reason: 'This step cannot be replayed into Editor' };
            }

            const image = findImage(step.archiveImageId);
            if (!image) {
                return { status: 'unavailable', reason: 'Selected step image is missing from the local archive' };
            }

            const replay = buildEditorReplay(step);
            if (!replay) {
                return { status: 'unavailable', reason: 'This step cannot be replayed into Editor' };
            }

            return { status: 'replayed', image, replay };
        },

        async fork(stepId) {
            const step = await lineageStore.getById(stepId);
            if (!step) {
                return { status: 'unavailable', reason: 'Selected lineage step no longer exists' };
            }

            if (isGenerateReplayable(step)) {
                return { status: 'forked', destination: 'generate' };
            }
            const image = findImage(step.archiveImageId);
            return image
                ? { status: 'forked', destination: 'editor', image }
                : { status: 'unavailable', reason: 'Selected step image is missing from the local archive' };
        },
    };
}
