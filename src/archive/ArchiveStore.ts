import type { ArchiveImage } from '../db/types';
import { SQLiteArchiveMetadataPort } from '../db/SQLiteAdapter';
import { storage, type StorageProvider } from '../services/StorageService';

export type SaveArchiveImageInput = Omit<ArchiveImage, 'id' | 'timestamp'> & {
    id?: string;
    timestamp?: string;
};

export interface ArchiveStore {
    list(): Promise<ArchiveImage[]>;
    save(input: SaveArchiveImageInput): Promise<ArchiveImage>;
    remove(id: string): Promise<void>;
}

type ArchiveMetadataRecord = Omit<ArchiveImage, 'url' | 'references'> & {
    storedUrl: string;
    referenceIds: number[];
};

interface ArchiveMetadataPort {
    list(): Promise<ArchiveMetadataRecord[]>;
    get(id: string): Promise<ArchiveMetadataRecord | null>;
    save(record: ArchiveMetadataRecord): Promise<void>;
    remove(id: string): Promise<void>;
}

interface ArchiveBlobPort {
    save(key: string, data: string): Promise<void>;
    load(key: string): Promise<string | null>;
    remove(key: string): Promise<void>;
}

interface CreateArchiveStoreDeps {
    metadata?: ArchiveMetadataPort;
    blobs?: ArchiveBlobPort;
    clock?: () => string;
    makeId?: () => string;
}

class StorageArchiveBlobPort implements ArchiveBlobPort {
    private readonly provider: StorageProvider;

    constructor(provider: StorageProvider) {
        this.provider = provider;
    }

    save(key: string, data: string): Promise<void> {
        return this.provider.save(key, data);
    }

    load(key: string): Promise<string | null> {
        return this.provider.load(key);
    }

    remove(key: string): Promise<void> {
        return this.provider.remove(key);
    }
}

class LocalArchiveStore implements ArchiveStore {
    private readonly metadata: ArchiveMetadataPort;
    private readonly blobs: ArchiveBlobPort;
    private readonly clock: () => string;
    private readonly makeId: () => string;

    constructor(
        metadata: ArchiveMetadataPort,
        blobs: ArchiveBlobPort,
        clock: () => string,
        makeId: () => string,
    ) {
        this.metadata = metadata;
        this.blobs = blobs;
        this.clock = clock;
        this.makeId = makeId;
    }

    async list(): Promise<ArchiveImage[]> {
        const records = await this.metadata.list();
        return Promise.all(records.map((record) => this.hydrate(record)));
    }

    async save(input: SaveArchiveImageInput): Promise<ArchiveImage> {
        const id = input.id ?? this.makeId();
        const existing = await this.metadata.get(id);
        const timestamp = input.timestamp ?? existing?.timestamp ?? this.clock();
        const referenceIds = input.references?.map((_, index) => index) ?? [];

        await this.blobs.save(getImageBlobKey(id), input.url);
        await this.syncReferences(id, existing?.referenceIds ?? [], input.references ?? []);

        await this.metadata.save({
            id,
            storedUrl: id,
            prompt: input.prompt,
            quality: input.quality,
            aspectRatio: input.aspectRatio,
            background: input.background,
            timestamp,
            model: input.model,
            width: input.width,
            height: input.height,
            style: input.style,
            lighting: input.lighting,
            palette: input.palette,
            referenceIds,
        });

        return {
            id,
            url: input.url,
            prompt: input.prompt,
            quality: input.quality,
            aspectRatio: input.aspectRatio,
            background: input.background,
            timestamp,
            model: input.model,
            width: input.width,
            height: input.height,
            references: input.references,
            style: input.style,
            lighting: input.lighting,
            palette: input.palette,
        };
    }

    async remove(id: string): Promise<void> {
        const existing = await this.metadata.get(id);

        await this.blobs.remove(getImageBlobKey(id));
        await Promise.all((existing?.referenceIds ?? []).map((index) => this.blobs.remove(getReferenceBlobKey(id, index))));
        await this.metadata.remove(id);
    }

    private async hydrate(record: ArchiveMetadataRecord): Promise<ArchiveImage> {
        const [imageUrl, references] = await Promise.all([
            this.blobs.load(getImageBlobKey(record.id)),
            Promise.all(record.referenceIds.map((index) => this.blobs.load(getReferenceBlobKey(record.id, index)))),
        ]);

        return {
            id: record.id,
            url: imageUrl ?? (record.storedUrl.startsWith('data:') ? record.storedUrl : ''),
            prompt: record.prompt,
            quality: record.quality,
            aspectRatio: record.aspectRatio,
            background: record.background,
            timestamp: record.timestamp,
            model: record.model,
            width: record.width,
            height: record.height,
            references: references.filter((reference): reference is string => reference !== null),
            style: record.style,
            lighting: record.lighting,
            palette: record.palette,
        };
    }

    private async syncReferences(id: string, previousReferenceIds: number[], nextReferences: string[]): Promise<void> {
        await Promise.all(nextReferences.map((reference, index) => this.blobs.save(getReferenceBlobKey(id, index), reference)));

        const nextReferenceIds = new Set(nextReferences.map((_, index) => index));
        const staleReferenceIds = previousReferenceIds.filter((index) => !nextReferenceIds.has(index));

        await Promise.all(staleReferenceIds.map((index) => this.blobs.remove(getReferenceBlobKey(id, index))));
    }
}

const getImageBlobKey = (id: string) => `img_${id}`;

const getReferenceBlobKey = (id: string, index: number) => `ref_${id}_${index}`;

export function createArchiveStore(deps: CreateArchiveStoreDeps = {}): ArchiveStore {
    return new LocalArchiveStore(
        deps.metadata ?? new SQLiteArchiveMetadataPort(),
        deps.blobs ?? new StorageArchiveBlobPort(storage),
        deps.clock ?? (() => new Date().toISOString()),
        deps.makeId ?? (() => crypto.randomUUID()),
    );
}

export const archiveStore = createArchiveStore();
