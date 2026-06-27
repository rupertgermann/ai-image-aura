import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import { storage, type StorageProvider } from '../services/StorageService';
import { archiveMetadataPort } from '../db/AuraPersistence';
import {
    captureArchiveAssetSnapshot,
    createDurableLayerStackMetadata,
    getArchiveImageBlobKey,
    getArchiveImageIdFromBlobKey,
    getArchiveLayerBlobKey,
    getArchiveReferenceBlobKey,
    getLayerIds,
    getTouchedLayerIds,
    getTouchedReferenceIds,
    hydrateLayerStackAssets,
    restoreArchiveAssetSnapshot,
    syncLayerAssets,
    syncReferenceAssets,
    type ArchiveBlobPort,
} from './ArchiveAssets';

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

    listKeys(): Promise<string[]> {
        return this.provider.listKeys();
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
        const recoveredImages = await this.recoverOrphanedImageBlobs(records);
        return [
            ...images.filter((image): image is ArchiveImage => image !== null),
            ...recoveredImages,
        ];
    }

    async save(input: SaveArchiveImageInput): Promise<ArchiveImage> {
        const id = input.id ?? this.makeId();
        const existing = await this.metadata.get(id);
        const timestamp = input.timestamp ?? existing?.timestamp ?? this.clock();
        const referenceIds = input.references?.map((_, index) => index) ?? [];
        const layerIds = getLayerIds(input.layerStack);
        const previousLayerIds = getLayerIds(existing?.layerStack);
        const snapshot = await captureArchiveAssetSnapshot(this.blobs, id, existing?.referenceIds ?? [], previousLayerIds);
        const touchedReferenceIds = getTouchedReferenceIds(existing?.referenceIds ?? [], referenceIds);
        const touchedLayerIds = getTouchedLayerIds(previousLayerIds, layerIds);
        const durableLayerStack = createDurableLayerStackMetadata(input.layerStack);
        const favoriteMetadata = input.favorite ? { favorite: true } : {};

        try {
            await this.blobs.save(getArchiveImageBlobKey(id), input.url);
            await syncReferenceAssets(this.blobs, id, existing?.referenceIds ?? [], input.references ?? []);
            await syncLayerAssets(this.blobs, id, previousLayerIds, input.layerStack);

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
            await this.restoreMetadata(id, existing);
            await restoreArchiveAssetSnapshot(this.blobs, id, snapshot, touchedReferenceIds, touchedLayerIds);
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

    async remove(id: string): Promise<void> {
        const existing = await this.metadata.get(id);
        const previousLayerIds = getLayerIds(existing?.layerStack);
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
            await this.restoreMetadata(id, existing);
            await restoreArchiveAssetSnapshot(this.blobs, id, snapshot, touchedReferenceIds, touchedLayerIds);
            throw error;
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

        const recoveredImage: ArchiveImage = {
            id,
            url,
            prompt: 'Recovered image',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: this.clock(),
            width: 1024,
            height: 1024,
            references: [],
        };

        await this.metadata.save({
            id,
            storedUrl: id,
            prompt: recoveredImage.prompt,
            quality: recoveredImage.quality,
            aspectRatio: recoveredImage.aspectRatio,
            background: recoveredImage.background,
            timestamp: recoveredImage.timestamp,
            width: recoveredImage.width,
            height: recoveredImage.height,
            referenceIds: [],
        });

        return recoveredImage;
    }
}

export function createArchiveStore(deps: CreateArchiveStoreDeps = {}): ArchiveStore {
    return new LocalArchiveStore(
        deps.metadata ?? archiveMetadataPort,
        deps.blobs ?? new StorageArchiveBlobPort(storage),
        deps.clock ?? (() => new Date().toISOString()),
        deps.makeId ?? (() => crypto.randomUUID()),
    );
}

export const archiveStore = createArchiveStore();
