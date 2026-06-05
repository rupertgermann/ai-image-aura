import { archiveMetadataPort } from '../db/AuraPersistence';
import type { ArchiveLayerStack } from '../db/types';
import { lineageStore, type LineageStore } from '../lineage/LineageStore';
import type { LineageStep } from '../lineage/types';
import { storage, type StorageProvider } from '../services/StorageService';

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
    style?: string;
    lighting?: string;
    palette?: string;
    referenceIds: number[];
    layerStack?: ArchiveLayerStack;
}

interface ArchiveMetadataPort {
    save(record: ArchiveMetadataRecord): Promise<void>;
}

interface ArchiveManifestImage {
    id: string;
    prompt: string;
    quality: string;
    aspectRatio: string;
    background: string;
    timestamp: string;
    model?: string;
    width?: number;
    height?: number;
    style?: string;
    lighting?: string;
    palette?: string;
    references: unknown[];
    layerStack?: ArchiveManifestLayerStack;
}

interface ArchiveManifestLayerStack extends Omit<ArchiveLayerStack, 'layers'> {
    layers: Array<Omit<ArchiveLayerStack['layers'][number], 'assetUrl'> & { assetFileName?: string }>;
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
    const lineageSteps = lineageManifestValue ? parseLineageManifest(lineageManifestValue) : [];
    const skippedMissingImageBlobs: string[] = [];
    let restoredImages = 0;

    for (const image of archiveManifest.images) {
        const imageUrl = await blobs.load(getImageBlobKey(image.id));
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
            style: image.style,
            lighting: image.lighting,
            palette: image.palette,
            referenceIds: image.references.map((_, index) => index),
            layerStack: image.layerStack ? restoreLayerStackMetadata(image.layerStack) : undefined,
        });
        restoredImages += 1;
    }

    for (const step of lineageSteps) {
        await lineage.save(step);
    }

    return {
        restoredImages,
        skippedMissingImageBlobs,
        restoredLineageSteps: lineageSteps.length,
    };
}

const getImageBlobKey = (id: string) => `img_${id}`;

function parseArchiveManifest(value: unknown): { images: ArchiveManifestImage[] } {
    if (!isRecord(value) || !Array.isArray(value.images)) {
        throw new Error('Invalid archive manifest');
    }

    return {
        images: value.images.map(parseArchiveManifestImage),
    };
}

function parseArchiveManifestImage(value: unknown): ArchiveManifestImage {
    if (!isRecord(value)) {
        throw new Error('Invalid archive image manifest entry');
    }

    return {
        id: requireString(value.id, 'archive image id'),
        prompt: requireString(value.prompt, 'archive image prompt'),
        quality: requireString(value.quality, 'archive image quality'),
        aspectRatio: requireString(value.aspectRatio, 'archive image aspectRatio'),
        background: requireString(value.background, 'archive image background'),
        timestamp: requireString(value.timestamp, 'archive image timestamp'),
        model: optionalString(value.model),
        width: optionalNumber(value.width),
        height: optionalNumber(value.height),
        style: optionalString(value.style),
        lighting: optionalString(value.lighting),
        palette: optionalString(value.palette),
        references: Array.isArray(value.references) ? value.references : [],
        layerStack: parseLayerStack(value.layerStack),
    };
}

function parseLineageManifest(value: unknown): LineageStep[] {
    if (!isRecord(value) || !Array.isArray(value.steps)) {
        throw new Error('Invalid lineage manifest');
    }

    return value.steps.map(parseLineageStep);
}

function parseLineageStep(value: unknown): LineageStep {
    if (!isRecord(value) || !isRecord(value.metadata)) {
        throw new Error('Invalid lineage step entry');
    }

    return {
        id: requireString(value.id, 'lineage step id'),
        archiveImageId: requireString(value.archiveImageId, 'lineage archiveImageId'),
        parentStepId: value.parentStepId === null ? null : optionalString(value.parentStepId) ?? null,
        stepType: requireLineageStepType(value.stepType),
        timestamp: requireString(value.timestamp, 'lineage timestamp'),
        metadata: value.metadata,
    };
}

function requireLineageStepType(value: unknown): LineageStep['stepType'] {
    if (
        value === 'generation'
        || value === 'reference-generation'
        || value === 'ai-edit'
        || value === 'manual-edit'
        || value === 'overwrite'
        || value === 'save-as-copy'
        || value === 'autopilot-iteration'
    ) {
        return value;
    }

    throw new Error('Invalid lineage step type');
}

function parseLayerStack(value: unknown): ArchiveManifestLayerStack | undefined {
    if (!isRecord(value) || !Array.isArray(value.layers)) {
        return undefined;
    }

    return value as unknown as ArchiveManifestLayerStack;
}

function restoreLayerStackMetadata(layerStack: ArchiveManifestLayerStack): ArchiveLayerStack {
    return {
        ...layerStack,
        layers: layerStack.layers.map((layer) => ({
            ...layer,
            assetUrl: '',
        })),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string) {
    if (typeof value !== 'string') {
        throw new Error(`Invalid ${label}`);
    }

    return value;
}

function optionalString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown) {
    return typeof value === 'number' ? value : undefined;
}
