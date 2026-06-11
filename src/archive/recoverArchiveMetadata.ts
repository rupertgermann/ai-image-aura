import { archiveMetadataPort } from '../db/AuraPersistence';
import type { ArchiveLayerStack } from '../db/types';
import { lineageStore, type LineageStore } from '../lineage/LineageStore';
import { storage, type StorageProvider } from '../services/StorageService';
import { getArchiveImageBlobKey } from './ArchiveAssets';
import {
    createEmptyLineageManifest,
    createLayerStackMetadata,
    parseArchiveManifest,
    parseLineageManifest,
} from './ArchiveManifest';

interface ArchiveMetadataRecord {
    id: string;
    storedUrl: string;
    prompt: string;
    quality: string;
    aspectRatio: string;
    background: string;
    timestamp: string;
    model?: string;
    width?: number;
    height?: number;
    favorite?: boolean;
    style?: string;
    lighting?: string;
    palette?: string;
    referenceIds: number[];
    layerStack?: ArchiveLayerStack;
}

interface ArchiveMetadataPort {
    save(record: ArchiveMetadataRecord): Promise<void>;
}

interface RecoveryDeps {
    metadata?: ArchiveMetadataPort;
    blobs?: Pick<StorageProvider, 'load'>;
    lineage?: Pick<LineageStore, 'save'>;
}

export interface ArchiveManifestRecoverySummary {
    restoredImages: number;
    skippedMissingImageBlobs: string[];
    restoredLineageSteps: number;
}

export async function recoverArchiveMetadataFromManifests(
    archiveManifestValue: unknown,
    lineageManifestValue?: unknown,
    deps: RecoveryDeps = {},
): Promise<ArchiveManifestRecoverySummary> {
    const metadata = deps.metadata ?? archiveMetadataPort;
    const blobs = deps.blobs ?? storage;
    const lineage = deps.lineage ?? lineageStore;
    const archiveManifest = parseArchiveManifest(archiveManifestValue);
    const lineageManifest = lineageManifestValue ? parseLineageManifest(lineageManifestValue) : createEmptyLineageManifest();
    const skippedMissingImageBlobs: string[] = [];
    let restoredImages = 0;

    for (const image of archiveManifest.images) {
        const imageUrl = await blobs.load(getArchiveImageBlobKey(image.id));
        if (!imageUrl) {
            skippedMissingImageBlobs.push(image.id);
            continue;
        }

        await metadata.save({
            id: image.id,
            storedUrl: image.id,
            prompt: image.prompt,
            quality: image.quality,
            aspectRatio: image.aspectRatio,
            background: image.background,
            timestamp: image.timestamp,
            model: image.model,
            width: image.width,
            height: image.height,
            favorite: image.favorite,
            style: image.style,
            lighting: image.lighting,
            palette: image.palette,
            referenceIds: image.references.map((_, index) => index),
            layerStack: image.layerStack ? createLayerStackMetadata(image.layerStack) : undefined,
        });
        restoredImages += 1;
    }

    for (const step of lineageManifest.steps) {
        await lineage.save(step);
    }

    return {
        restoredImages,
        skippedMissingImageBlobs,
        restoredLineageSteps: lineageManifest.steps.length,
    };
}
