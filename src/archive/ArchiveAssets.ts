import type { ArchiveLayerStack } from '../db/types';

export const getArchiveImageBlobKey = (id: string) => `img_${id}`;

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
