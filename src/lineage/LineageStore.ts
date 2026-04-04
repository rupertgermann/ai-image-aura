import { lineageMetadataPort } from '../db/AuraPersistence';
import { SQLiteLineageMetadataPort } from './SQLiteLineageMetadataPort';
import type { LineageStep, SaveLineageStepInput } from './types';

interface LineageMetadataPort {
    init(): Promise<void>;
    save(step: LineageStep): Promise<void>;
    getById(id: string): Promise<LineageStep | null>;
    getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]>;
    getChildren(parentStepId: string): Promise<LineageStep[]>;
    remove(id: string): Promise<void>;
}

interface CreateLineageStoreDeps {
    metadata?: LineageMetadataPort;
    clock?: () => string;
    makeId?: () => string;
}

export interface LineageStore {
    init(): Promise<void>;
    save(input: SaveLineageStepInput): Promise<LineageStep>;
    getById(id: string): Promise<LineageStep | null>;
    getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]>;
    getChildren(parentStepId: string): Promise<LineageStep[]>;
    remove(id: string): Promise<void>;
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

    init(): Promise<void> {
        return this.metadata.init();
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

    remove(id: string): Promise<void> {
        return this.metadata.remove(id);
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

export { SQLiteLineageMetadataPort };
export type { LineageMetadataPort };
export type { LineageStep, SaveLineageStepInput };
