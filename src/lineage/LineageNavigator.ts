import type { ArchiveImage } from '../db/types';
import type { GenerateSessionStore } from '../generate-session/GenerateSession';
import type { LineageStore } from './LineageStore';
import { buildGenerateReplay, isEditorReplayable, isGenerateReplayable } from './replayLineageStep';

export type ReplayIntoGenerateOutcome =
    | { status: 'replayed' }
    | { status: 'unavailable'; reason: string };

export type ReplayIntoEditorOutcome =
    | { status: 'replayed'; image: ArchiveImage }
    | { status: 'unavailable'; reason: string };

export type ForkOutcome =
    | { status: 'forked' }
    | { status: 'unavailable'; reason: string };

export interface LineageNavigator {
    replayIntoGenerate(stepId: string): Promise<ReplayIntoGenerateOutcome>;
    replayIntoEditor(stepId: string): Promise<ReplayIntoEditorOutcome>;
    fork(stepId: string): Promise<ForkOutcome>;
}

export interface LineageNavigatorDeps {
    lineageStore: Pick<LineageStore, 'getById'>;
    sessionStore: Pick<GenerateSessionStore, 'transferFromArchive' | 'writeDraft' | 'saveLineageSource'>;
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
            const replay = buildGenerateReplay(image, step);
            if (image) {
                await sessionStore.transferFromArchive(image, replay.lineageSource, replay.draft);
            } else {
                sessionStore.writeDraft(replay.draft);
                sessionStore.saveLineageSource(replay.lineageSource);
            }

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

            sessionStore.saveLineageSource({ archiveImageId: step.archiveImageId, stepId: step.id });

            return { status: 'replayed', image };
        },

        async fork(stepId) {
            const step = await lineageStore.getById(stepId);
            if (!step) {
                return { status: 'unavailable', reason: 'Selected lineage step no longer exists' };
            }

            sessionStore.saveLineageSource({ archiveImageId: step.archiveImageId, stepId: step.id });

            return { status: 'forked' };
        },
    };
}
