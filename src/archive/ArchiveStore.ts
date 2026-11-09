import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import { storage, type StorageProvider } from '../services/StorageService';
import { archiveMetadataPort } from '../db/AuraPersistence';
import { createDurableLayerStackMetadata, getArchiveImageBlobKey } from './ArchiveAssets';

export type SaveArchiveImageInput = Omit<ArchiveImage, 'id' | 'timestamp'> & {
    id?: string;
    timestamp?: string;
};

export interface ArchiveStore {
    list(): Promise<ArchiveImage[]>;
    get(id: string): Promise<ArchiveImage | null>;
    save(input: SaveArchiveImageInput): Promise<ArchiveImage>;
    setFavorite(id: string, favorite: boolean): Promise<void>;
    remove(id: string): Promise<void>;
}

export type ArchiveMetadataRecord = Omit<ArchiveImage, 'url' | 'references'> & {
    storedUrl: string;
    referenceIds: number[];
};

interface ArchiveMetadataPort {
    list(): Promise<ArchiveMetadataRecord[]>;
    get(id: string): Promise<ArchiveMetadataRecord | null>;
    save(record: ArchiveMetadataRecord): Promise<void>;
    insertIfAbsent(record: ArchiveMetadataRecord): Promise<void>;
    setFavorite(id: string, favorite: boolean): Promise<void>;
    remove(id: string): Promise<void>;
}

interface CreateArchiveStoreDeps {
    metadata?: ArchiveMetadataPort;
    blobs?: StorageProvider;
    clock?: () => string;
    makeId?: () => string;
}

class LocalArchiveStore implements ArchiveStore {
    private readonly metadata: ArchiveMetadataPort;
    private readonly blobs: StorageProvider;
    private readonly clock: () => string;
    private readonly makeId: () => string;

    constructor(
        metadata: ArchiveMetadataPort,
        blobs: StorageProvider,
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
        const recoveredImages = await this.recoverOrphanedImageBlobs(records);
        return [
            ...images.filter((image): image is ArchiveImage => image !== null),
            ...recoveredImages,
        ];
    }

    async get(id: string): Promise<ArchiveImage | null> {
        const record = await this.metadata.get(id);
        return record ? this.hydrate(record) : null;
    }

    async save(input: SaveArchiveImageInput): Promise<ArchiveImage> {
        const id = input.id ?? this.makeId();
        const existing = await this.metadata.get(id);
        const timestamp = input.timestamp ?? existing?.timestamp ?? this.clock();
        const referenceIds = input.references?.map((_, index) => index) ?? [];
        const layerIds = new Set(input.layerStack?.layers.map((layer) => layer.id) ?? []);
        const previousLayerIds = existing?.layerStack?.layers.map((layer) => layer.id) ?? [];
        const snapshot = await captureArchiveAssetSnapshot(this.blobs, id, existing?.referenceIds ?? [], previousLayerIds);
        const touchedReferenceIds = [...new Set([...(existing?.referenceIds ?? []), ...referenceIds])];
        const touchedLayerIds = [...new Set([...previousLayerIds, ...layerIds])];
        const durableLayerStack = createDurableLayerStackMetadata(input.layerStack);
        const favoriteMetadata = input.favorite ? { favorite: true } : {};

        try {
            await this.blobs.save(getArchiveImageBlobKey(id), input.url);
            await Promise.all((input.references ?? []).map((reference, index) => this.blobs.save(getArchiveReferenceBlobKey(id, index), reference)));
            const nextReferenceIds = new Set(referenceIds);
            const staleReferenceIds = (existing?.referenceIds ?? []).filter((index) => !nextReferenceIds.has(index));
            await Promise.all(staleReferenceIds.map((index) => this.blobs.remove(getArchiveReferenceBlobKey(id, index))));

            await Promise.all((input.layerStack?.layers ?? []).map((layer) => this.blobs.save(getArchiveLayerBlobKey(id, layer.id), layer.assetUrl)));
            const staleLayerIds = previousLayerIds.filter((layerId) => !layerIds.has(layerId));
            await Promise.all(staleLayerIds.map((layerId) => this.blobs.remove(getArchiveLayerBlobKey(id, layerId))));

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
                ...favoriteMetadata,
                style: input.style,
                lighting: input.lighting,
                palette: input.palette,
                actualParameters: input.actualParameters,
                costLedger: input.costLedger,
                referenceIds,
                layerStack: durableLayerStack,
            });
        } catch (error) {
            await restoreAfterFailure(error, [
                this.restoreMetadata(id, existing),
                restoreArchiveAssetSnapshot(this.blobs, id, snapshot, touchedReferenceIds, touchedLayerIds),
            ]);
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
            ...favoriteMetadata,
            references: input.references,
            style: input.style,
            lighting: input.lighting,
            palette: input.palette,
            actualParameters: input.actualParameters,
            costLedger: input.costLedger,
            layerStack: input.layerStack,
        };
    }

    async setFavorite(id: string, favorite: boolean): Promise<void> {
        await this.metadata.setFavorite(id, favorite);
    }

    async remove(id: string): Promise<void> {
        const existing = await this.metadata.get(id);
        const previousLayerIds = existing?.layerStack?.layers.map((layer) => layer.id) ?? [];
        const snapshot = await captureArchiveAssetSnapshot(
            this.blobs,
            id,
            existing?.referenceIds ?? [],
            previousLayerIds,
        );
        const touchedReferenceIds = existing?.referenceIds ?? [];
        const touchedLayerIds = previousLayerIds;

        try {
            await this.blobs.remove(getArchiveImageBlobKey(id));
            await Promise.all(touchedReferenceIds.map((index) => this.blobs.remove(getArchiveReferenceBlobKey(id, index))));
            await Promise.all(touchedLayerIds.map((layerId) => this.blobs.remove(getArchiveLayerBlobKey(id, layerId))));
            await this.metadata.remove(id);
        } catch (error) {
            await restoreAfterFailure(error, [
                this.restoreMetadata(id, existing),
                restoreArchiveAssetSnapshot(this.blobs, id, snapshot, touchedReferenceIds, touchedLayerIds),
            ]);
        }
    }

    private async hydrate(record: ArchiveMetadataRecord): Promise<ArchiveImage | null> {
        const [imageUrl, references, layerStack] = await Promise.all([
            this.blobs.load(getArchiveImageBlobKey(record.id)),
            Promise.all(record.referenceIds.map((index) => this.blobs.load(getArchiveReferenceBlobKey(record.id, index)))),
            hydrateLayerStackAssets(this.blobs, record.id, record.layerStack),
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
            ...(record.favorite ? { favorite: true } : {}),
            references: references.filter((reference): reference is string => reference !== null),
            style: record.style,
            lighting: record.lighting,
            palette: record.palette,
            actualParameters: record.actualParameters,
            costLedger: record.costLedger,
            layerStack,
        };
    }

    private async restoreMetadata(id: string, record: ArchiveMetadataRecord | null) {
        if (record) {
            await this.metadata.save(record);
            return;
        }

        await this.metadata.remove(id);
    }

    private async recoverOrphanedImageBlobs(records: ArchiveMetadataRecord[]): Promise<ArchiveImage[]> {
        const knownImageIds = new Set(records.map((record) => record.id));
        const imageIds = (await this.blobs.listKeys())
            .map(getArchiveImageIdFromBlobKey)
            .filter((id): id is string => id !== null && !knownImageIds.has(id))
            .sort();

        const recoveredImages = await Promise.all(imageIds.map((id) => this.recoverOrphanedImageBlob(id)));
        return recoveredImages.filter((image): image is ArchiveImage => image !== null);
    }

    private async recoverOrphanedImageBlob(id: string): Promise<ArchiveImage | null> {
        const url = await this.blobs.load(getArchiveImageBlobKey(id));
        if (!url) {
            return null;
        }

        await this.metadata.insertIfAbsent({
            id,
            storedUrl: id,
            prompt: 'Recovered image',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: this.clock(),
            width: 1024,
            height: 1024,
            referenceIds: [],
        });

        return this.get(id);
    }
}

interface ArchiveAssetSnapshot {
    image: string | null;
    references: Map<number, string>;
    layers: Map<string, string>;
}

const getArchiveReferenceBlobKey = (id: string, index: number) => `ref_${id}_${index}`;

const getArchiveLayerBlobKey = (id: string, layerId: string) => `layer_${id}_${layerId}`;

const getArchiveImageIdFromBlobKey = (key: string) => {
    if (!key.startsWith('img_') || key.length === 'img_'.length) {
        return null;
    }

    return key.slice('img_'.length);
};

async function hydrateLayerStackAssets(
    blobs: Pick<StorageProvider, 'load'>,
    id: string,
    layerStack?: ArchiveLayerStack,
): Promise<ArchiveLayerStack | undefined> {
    if (!layerStack) {
        return undefined;
    }

    const layers = await Promise.all(layerStack.layers.map(async (layer) => ({
        ...layer,
        assetUrl: await blobs.load(getArchiveLayerBlobKey(id, layer.id)) ?? layer.assetUrl,
    })));

    return { ...layerStack, layers };
}

async function captureArchiveAssetSnapshot(
    blobs: Pick<StorageProvider, 'load'>,
    id: string,
    referenceIds: number[],
    layerIds: string[],
): Promise<ArchiveAssetSnapshot> {
    const [image, references, layers] = await Promise.all([
        blobs.load(getArchiveImageBlobKey(id)),
        Promise.all(referenceIds.map(async (index) => [index, await blobs.load(getArchiveReferenceBlobKey(id, index))] as const)),
        Promise.all(layerIds.map(async (layerId) => [layerId, await blobs.load(getArchiveLayerBlobKey(id, layerId))] as const)),
    ]);

    return {
        image,
        references: new Map(references.filter((entry): entry is readonly [number, string] => entry[1] !== null)),
        layers: new Map(layers.filter((entry): entry is readonly [string, string] => entry[1] !== null)),
    };
}

async function restoreArchiveAssetSnapshot(
    blobs: Pick<StorageProvider, 'save' | 'remove'>,
    id: string,
    snapshot: ArchiveAssetSnapshot,
    touchedReferenceIds: number[],
    touchedLayerIds: string[],
): Promise<void> {
    const referenceIds = [...new Set([...snapshot.references.keys(), ...touchedReferenceIds])];
    const layerIds = [...new Set([...snapshot.layers.keys(), ...touchedLayerIds])];
    const restorations = await Promise.allSettled([
        snapshot.image !== null
            ? blobs.save(getArchiveImageBlobKey(id), snapshot.image)
            : blobs.remove(getArchiveImageBlobKey(id)),
        ...referenceIds.map(async (index) => {
            const previousReference = snapshot.references.get(index);
            if (previousReference !== undefined) {
                await blobs.save(getArchiveReferenceBlobKey(id, index), previousReference);
                return;
            }

            await blobs.remove(getArchiveReferenceBlobKey(id, index));
        }),
        ...layerIds.map(async (layerId) => {
            const previousLayer = snapshot.layers.get(layerId);
            if (previousLayer !== undefined) {
                await blobs.save(getArchiveLayerBlobKey(id, layerId), previousLayer);
                return;
            }

            await blobs.remove(getArchiveLayerBlobKey(id, layerId));
        }),
    ]);
    const failures = restorations.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length === 1) {
        throw failures[0];
    }
    if (failures.length > 1) {
        const details = failures.map((error) => error instanceof Error ? error.message : String(error)).join('; ');
        throw new AggregateError(failures, `Archive asset restoration failed: ${details}`);
    }
}

async function restoreAfterFailure(error: unknown, restorations: Promise<void>[]): Promise<never> {
    const results = await Promise.allSettled(restorations);
    const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length) {
        const errors = [error, ...failures];
        throw new AggregateError(errors, `Archive operation and restoration failed: ${errors.map((cause) => cause instanceof Error ? cause.message : String(cause)).join('; ')}`);
    }
    throw error;
}

export function createArchiveStore(deps: CreateArchiveStoreDeps = {}): ArchiveStore {
    return new LocalArchiveStore(
        deps.metadata ?? archiveMetadataPort,
        deps.blobs ?? storage,
        deps.clock ?? (() => new Date().toISOString()),
        deps.makeId ?? (() => crypto.randomUUID()),
    );
}

export const archiveStore = createArchiveStore();
