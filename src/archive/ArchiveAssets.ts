import type { ArchiveLayerStack } from '../db/types';

export interface ArchiveBlobPort {
    save(key: string, data: string): Promise<void>;
    load(key: string): Promise<string | null>;
    remove(key: string): Promise<void>;
    listKeys(): Promise<string[]>;
}

interface ArchiveAssetSnapshot {
    image: string | null;
    references: Map<number, string>;
    layers: Map<string, string>;
}

export const getArchiveImageBlobKey = (id: string) => `img_${id}`;

export const getArchiveReferenceBlobKey = (id: string, index: number) => `ref_${id}_${index}`;

export const getArchiveLayerBlobKey = (id: string, layerId: string) => `layer_${id}_${layerId}`;

export const getArchiveImageIdFromBlobKey = (key: string) => {
    if (!key.startsWith('img_') || key.length === 'img_'.length) {
        return null;
    }

    return key.slice('img_'.length);
};

export const getLayerIds = (layerStack?: ArchiveLayerStack) => {
    return layerStack?.layers.map((layer) => layer.id) ?? [];
};

export const getTouchedReferenceIds = (left: number[], right: number[]) => {
    return Array.from(new Set([...left, ...right]));
};

export const getTouchedLayerIds = (left: string[], right: string[]) => {
    return Array.from(new Set([...left, ...right]));
};

export function createDurableLayerStackMetadata(layerStack?: ArchiveLayerStack): ArchiveLayerStack | undefined {
    if (!layerStack) {
        return undefined;
    }

    return {
        ...layerStack,
        layers: layerStack.layers.map((layer) => ({
            ...layer,
            assetUrl: '',
        })),
    };
}

export async function syncReferenceAssets(
    blobs: Pick<ArchiveBlobPort, 'save' | 'remove'>,
    id: string,
    previousReferenceIds: number[],
    nextReferences: string[],
): Promise<void> {
    await Promise.all(nextReferences.map((reference, index) => blobs.save(getArchiveReferenceBlobKey(id, index), reference)));

    const nextReferenceIds = new Set(nextReferences.map((_, index) => index));
    const staleReferenceIds = previousReferenceIds.filter((index) => !nextReferenceIds.has(index));

    await Promise.all(staleReferenceIds.map((index) => blobs.remove(getArchiveReferenceBlobKey(id, index))));
}

export async function syncLayerAssets(
    blobs: Pick<ArchiveBlobPort, 'save' | 'remove'>,
    id: string,
    previousLayerIds: string[],
    nextLayerStack?: ArchiveLayerStack,
): Promise<void> {
    await Promise.all((nextLayerStack?.layers ?? []).map((layer) => blobs.save(getArchiveLayerBlobKey(id, layer.id), layer.assetUrl)));

    const nextLayerIds = new Set(getLayerIds(nextLayerStack));
    const staleLayerIds = previousLayerIds.filter((layerId) => !nextLayerIds.has(layerId));

    await Promise.all(staleLayerIds.map((layerId) => blobs.remove(getArchiveLayerBlobKey(id, layerId))));
}

export async function hydrateLayerStackAssets(
    blobs: Pick<ArchiveBlobPort, 'load'>,
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

export async function captureArchiveAssetSnapshot(
    blobs: Pick<ArchiveBlobPort, 'load'>,
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

export async function restoreArchiveAssetSnapshot(
    blobs: Pick<ArchiveBlobPort, 'save' | 'remove'>,
    id: string,
    snapshot: ArchiveAssetSnapshot,
    touchedReferenceIds: number[],
    touchedLayerIds: string[],
): Promise<void> {
    if (snapshot.image !== null) {
        await blobs.save(getArchiveImageBlobKey(id), snapshot.image);
    } else {
        await blobs.remove(getArchiveImageBlobKey(id));
    }

    const referenceIds = getTouchedReferenceIds(Array.from(snapshot.references.keys()), touchedReferenceIds);
    await Promise.all(referenceIds.map(async (index) => {
        const previousReference = snapshot.references.get(index);
        if (previousReference !== undefined) {
            await blobs.save(getArchiveReferenceBlobKey(id, index), previousReference);
            return;
        }

        await blobs.remove(getArchiveReferenceBlobKey(id, index));
    }));

    const layerIds = getTouchedLayerIds(Array.from(snapshot.layers.keys()), touchedLayerIds);
    await Promise.all(layerIds.map(async (layerId) => {
        const previousLayer = snapshot.layers.get(layerId);
        if (previousLayer !== undefined) {
            await blobs.save(getArchiveLayerBlobKey(id, layerId), previousLayer);
            return;
        }

        await blobs.remove(getArchiveLayerBlobKey(id, layerId));
    }));
}
