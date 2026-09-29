import { lineageMetadataPort } from '../db/AuraPersistence';
import type { LineageStep, SaveLineageStepInput } from './types';

interface LineageMetadataPort {
    save(step: LineageStep): Promise<void>;
    getById(id: string): Promise<LineageStep | null>;
    getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]>;
    getChildren(parentStepId: string): Promise<LineageStep[]>;
}

interface CreateLineageStoreDeps {
    metadata?: LineageMetadataPort;
    clock?: () => string;
    makeId?: () => string;
}

export interface LineageStore {
    save(input: SaveLineageStepInput): Promise<LineageStep>;
    getById(id: string): Promise<LineageStep | null>;
    getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]>;
    getChildren(parentStepId: string): Promise<LineageStep[]>;
}

class LocalLineageStore implements LineageStore {
    private readonly metadata: LineageMetadataPort;
    private readonly clock: () => string;
    private readonly makeId: () => string;

    constructor(metadata: LineageMetadataPort, clock: () => string, makeId: () => string) {
        this.metadata = metadata;
        this.clock = clock;
        this.makeId = makeId;
    }

    async save(input: SaveLineageStepInput): Promise<LineageStep> {
        const step: LineageStep = {
            id: input.id ?? this.makeId(),
            archiveImageId: input.archiveImageId,
            parentStepId: input.parentStepId ?? null,
            stepType: input.stepType,
            timestamp: input.timestamp ?? this.clock(),
            metadata: input.metadata,
        };

        await this.metadata.save(step);

        return step;
    }

    getById(id: string): Promise<LineageStep | null> {
        return this.metadata.getById(id);
    }

    getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]> {
        return this.metadata.getByArchiveImageId(archiveImageId);
    }

    getChildren(parentStepId: string): Promise<LineageStep[]> {
        return this.metadata.getChildren(parentStepId);
    }
}

export function createLineageStore(deps: CreateLineageStoreDeps = {}): LineageStore {
    return new LocalLineageStore(
        deps.metadata ?? lineageMetadataPort,
        deps.clock ?? (() => new Date().toISOString()),
        deps.makeId ?? (() => crypto.randomUUID()),
    );
}

export const lineageStore = createLineageStore();

export type { LineageMetadataPort };
export type { LineageStep, SaveLineageStepInput };
