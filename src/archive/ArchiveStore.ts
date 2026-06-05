import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import { storage, type StorageProvider } from '../services/StorageService';
import { archiveMetadataPort } from '../db/AuraPersistence';

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
    layerStack?: ArchiveLayerStack;
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
        const images = await Promise.all(records.map((record) => this.hydrate(record)));
        return images.filter((image): image is ArchiveImage => image !== null);
    }

    async save(input: SaveArchiveImageInput): Promise<ArchiveImage> {
        const id = input.id ?? this.makeId();
        const existing = await this.metadata.get(id);
        const timestamp = input.timestamp ?? existing?.timestamp ?? this.clock();
        const referenceIds = input.references?.map((_, index) => index) ?? [];
        const layerIds = input.layerStack?.layers.map((layer) => layer.id) ?? [];
        const snapshot = await this.captureSnapshot(id, existing?.referenceIds ?? [], existing?.layerStack?.layers.map((layer) => layer.id) ?? []);
        const touchedReferenceIds = getTouchedReferenceIds(existing?.referenceIds ?? [], referenceIds);
        const touchedLayerIds = getTouchedLayerIds(existing?.layerStack?.layers.map((layer) => layer.id) ?? [], layerIds);

        try {
            await this.blobs.save(getImageBlobKey(id), input.url);
            await this.syncReferences(id, existing?.referenceIds ?? [], input.references ?? []);
            await this.syncLayers(id, existing?.layerStack?.layers.map((layer) => layer.id) ?? [], input.layerStack);

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
                layerStack: input.layerStack,
            });
        } catch (error) {
            await this.restoreMetadata(id, existing);
            await this.restoreSnapshot(id, snapshot, touchedReferenceIds, touchedLayerIds);
            throw error;
        }

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
            layerStack: input.layerStack,
        };
    }

    async remove(id: string): Promise<void> {
        const existing = await this.metadata.get(id);
        const snapshot = await this.captureSnapshot(
            id,
            existing?.referenceIds ?? [],
            existing?.layerStack?.layers.map((layer) => layer.id) ?? [],
        );
        const touchedReferenceIds = existing?.referenceIds ?? [];
        const touchedLayerIds = existing?.layerStack?.layers.map((layer) => layer.id) ?? [];

        try {
            await this.blobs.remove(getImageBlobKey(id));
            await Promise.all(touchedReferenceIds.map((index) => this.blobs.remove(getReferenceBlobKey(id, index))));
            await Promise.all(touchedLayerIds.map((layerId) => this.blobs.remove(getLayerBlobKey(id, layerId))));
            await this.metadata.remove(id);
        } catch (error) {
            await this.restoreMetadata(id, existing);
            await this.restoreSnapshot(id, snapshot, touchedReferenceIds, touchedLayerIds);
            throw error;
        }
    }

    private async hydrate(record: ArchiveMetadataRecord): Promise<ArchiveImage | null> {
        const [imageUrl, references, layerStack] = await Promise.all([
            this.blobs.load(getImageBlobKey(record.id)),
            Promise.all(record.referenceIds.map((index) => this.blobs.load(getReferenceBlobKey(record.id, index)))),
            this.hydrateLayerStack(record.id, record.layerStack),
        ]);

        const resolvedImageUrl = imageUrl ?? (record.storedUrl.startsWith('data:') ? record.storedUrl : null);
        if (!resolvedImageUrl) {
            return null;
        }

        return {
            id: record.id,
            url: resolvedImageUrl,
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
            layerStack,
        };
    }

    private async captureSnapshot(id: string, referenceIds: number[], layerIds: string[]) {
        const [image, references, layers] = await Promise.all([
            this.blobs.load(getImageBlobKey(id)),
            Promise.all(referenceIds.map(async (index) => [index, await this.blobs.load(getReferenceBlobKey(id, index))] as const)),
            Promise.all(layerIds.map(async (layerId) => [layerId, await this.blobs.load(getLayerBlobKey(id, layerId))] as const)),
        ]);

        return {
            image,
            references: new Map(references.filter((entry): entry is readonly [number, string] => entry[1] !== null)),
            layers: new Map(layers.filter((entry): entry is readonly [string, string] => entry[1] !== null)),
        };
    }

    private async restoreSnapshot(
        id: string,
        snapshot: { image: string | null; references: Map<number, string>; layers: Map<string, string> },
        touchedReferenceIds: number[],
        touchedLayerIds: string[],
    ) {
        if (snapshot.image !== null) {
            await this.blobs.save(getImageBlobKey(id), snapshot.image);
        } else {
            await this.blobs.remove(getImageBlobKey(id));
        }

        const referenceIds = getTouchedReferenceIds(Array.from(snapshot.references.keys()), touchedReferenceIds);
        await Promise.all(referenceIds.map(async (index) => {
            const previousReference = snapshot.references.get(index);
            if (previousReference !== undefined) {
                await this.blobs.save(getReferenceBlobKey(id, index), previousReference);
                return;
            }

            await this.blobs.remove(getReferenceBlobKey(id, index));
        }));

        const layerIds = getTouchedLayerIds(Array.from(snapshot.layers.keys()), touchedLayerIds);
        await Promise.all(layerIds.map(async (layerId) => {
            const previousLayer = snapshot.layers.get(layerId);
            if (previousLayer !== undefined) {
                await this.blobs.save(getLayerBlobKey(id, layerId), previousLayer);
                return;
            }

            await this.blobs.remove(getLayerBlobKey(id, layerId));
        }));
    }

    private async restoreMetadata(id: string, record: ArchiveMetadataRecord | null) {
        if (record) {
            await this.metadata.save(record);
            return;
        }

        await this.metadata.remove(id);
    }

    private async syncReferences(id: string, previousReferenceIds: number[], nextReferences: string[]): Promise<void> {
        await Promise.all(nextReferences.map((reference, index) => this.blobs.save(getReferenceBlobKey(id, index), reference)));

        const nextReferenceIds = new Set(nextReferences.map((_, index) => index));
        const staleReferenceIds = previousReferenceIds.filter((index) => !nextReferenceIds.has(index));

        await Promise.all(staleReferenceIds.map((index) => this.blobs.remove(getReferenceBlobKey(id, index))));
    }

    private async syncLayers(id: string, previousLayerIds: string[], nextLayerStack?: ArchiveLayerStack): Promise<void> {
        await Promise.all((nextLayerStack?.layers ?? []).map((layer) => this.blobs.save(getLayerBlobKey(id, layer.id), layer.assetUrl)));

        const nextLayerIds = new Set((nextLayerStack?.layers ?? []).map((layer) => layer.id));
        const staleLayerIds = previousLayerIds.filter((layerId) => !nextLayerIds.has(layerId));

        await Promise.all(staleLayerIds.map((layerId) => this.blobs.remove(getLayerBlobKey(id, layerId))));
    }

    private async hydrateLayerStack(id: string, layerStack?: ArchiveLayerStack): Promise<ArchiveLayerStack | undefined> {
        if (!layerStack) {
            return undefined;
        }

        const layers = await Promise.all(layerStack.layers.map(async (layer) => ({
            ...layer,
            assetUrl: await this.blobs.load(getLayerBlobKey(id, layer.id)) ?? layer.assetUrl,
        })));

        return { ...layerStack, layers };
    }
}

const getImageBlobKey = (id: string) => `img_${id}`;

const getReferenceBlobKey = (id: string, index: number) => `ref_${id}_${index}`;

const getLayerBlobKey = (id: string, layerId: string) => `layer_${id}_${layerId}`;

const getTouchedReferenceIds = (left: number[], right: number[]) => {
    return Array.from(new Set([...left, ...right]));
};

const getTouchedLayerIds = (left: string[], right: string[]) => {
    return Array.from(new Set([...left, ...right]));
};

export function createArchiveStore(deps: CreateArchiveStoreDeps = {}): ArchiveStore {
    return new LocalArchiveStore(
        deps.metadata ?? archiveMetadataPort,
        deps.blobs ?? new StorageArchiveBlobPort(storage),
        deps.clock ?? (() => new Date().toISOString()),
        deps.makeId ?? (() => crypto.randomUUID()),
    );
}

export const archiveStore = createArchiveStore();
