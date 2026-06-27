import { isLayerBlendMode, type ActualImageParameters, type ApiCostLedger, type ArchiveLayer, type ArchiveLayerBlendMode, type ArchiveLayerKind, type ArchiveLayerStack } from '../db/types';
import { parseLineageMetadata } from '../lineage/lineageMetadata';
import type { LineageStep } from '../lineage/types';
import { sanitizeApiCostLedger } from '../costs/apiCost';

export const ARCHIVE_MANIFEST_FILE = 'archive-manifest.json';
export const LINEAGE_MANIFEST_FILE = 'lineage-manifest.json';
export const ARCHIVE_MANIFEST_VERSION = 1;
export const LINEAGE_MANIFEST_VERSION = 1;

export interface ArchiveManifestReference {
    fileName: string;
}

export interface ArchiveManifestImage {
    id: string;
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
    actualParameters?: ActualImageParameters;
    costLedger?: ApiCostLedger;
    imageFileName?: string;
    references: ArchiveManifestReference[];
    layerStack?: ArchiveManifestLayerStack;
}

export interface ArchiveManifestLayer extends Omit<ArchiveLayer, 'assetUrl'> {
    assetFileName: string;
}

export interface ArchiveManifestLayerStack extends Omit<ArchiveLayerStack, 'layers'> {
    layers: ArchiveManifestLayer[];
}

export interface ArchiveManifest {
    version: typeof ARCHIVE_MANIFEST_VERSION;
    images: ArchiveManifestImage[];
}

export interface LineageManifest {
    version: typeof LINEAGE_MANIFEST_VERSION;
    steps: LineageStep[];
}

export function createArchiveManifest(images: ArchiveManifestImage[]): ArchiveManifest {
    return parseArchiveManifest({
        version: ARCHIVE_MANIFEST_VERSION,
        images,
    });
}

export function createLineageManifest(steps: LineageStep[]): LineageManifest {
    return parseLineageManifest({
        version: LINEAGE_MANIFEST_VERSION,
        steps,
    });
}

export function createEmptyLineageManifest(): LineageManifest {
    return {
        version: LINEAGE_MANIFEST_VERSION,
        steps: [],
    };
}

export function parseArchiveManifest(value: unknown): ArchiveManifest {
    if (!isRecord(value) || !Array.isArray(value.images)) {
        throw new Error('Invalid archive manifest');
    }
    requireManifestVersion(value.version, ARCHIVE_MANIFEST_VERSION, 'archive manifest');

    return {
        version: ARCHIVE_MANIFEST_VERSION,
        images: value.images.map(parseArchiveManifestImage),
    };
}

export function parseLineageManifest(value: unknown): LineageManifest {
    if (!isRecord(value) || !Array.isArray(value.steps)) {
        throw new Error('Invalid lineage manifest');
    }
    requireManifestVersion(value.version, LINEAGE_MANIFEST_VERSION, 'lineage manifest');

    return {
        version: LINEAGE_MANIFEST_VERSION,
        steps: value.steps.map(parseLineageStep),
    };
}

export function createArchiveManifestLayerStack(
    imageId: string,
    layerStack: ArchiveLayerStack,
    getLayerAssetFileName: (imageId: string, layerId: string) => string,
): ArchiveManifestLayerStack {
    return parseArchiveManifestLayerStack({
        canvasWidth: layerStack.canvasWidth,
        canvasHeight: layerStack.canvasHeight,
        layers: layerStack.layers.map((layer) => ({
            id: layer.id,
            name: layer.name,
            kind: layer.kind,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            rotation: layer.rotation,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            locked: layer.locked,
            assetFileName: getLayerAssetFileName(imageId, layer.id),
        })),
    });
}

export function createLayerStackMetadata(layerStack: ArchiveManifestLayerStack): ArchiveLayerStack {
    return {
        canvasWidth: layerStack.canvasWidth,
        canvasHeight: layerStack.canvasHeight,
        layers: layerStack.layers.map((layer) => ({
            id: layer.id,
            name: layer.name,
            kind: layer.kind,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            rotation: layer.rotation,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            locked: layer.locked,
            assetUrl: '',
        })),
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
        favorite: optionalBoolean(value.favorite),
        style: optionalString(value.style),
        lighting: optionalString(value.lighting),
        palette: optionalString(value.palette),
        actualParameters: optionalActualParameters(value.actualParameters),
        costLedger: sanitizeApiCostLedger(value.costLedger),
        imageFileName: optionalString(value.imageFileName),
        references: Array.isArray(value.references) ? value.references.map(parseArchiveManifestReference) : [],
        layerStack: parseOptionalLayerStack(value.layerStack),
    };
}

function parseArchiveManifestReference(value: unknown): ArchiveManifestReference {
    if (!isRecord(value)) {
        throw new Error('Invalid archive reference manifest entry');
    }

    return {
        fileName: requireString(value.fileName, 'archive reference fileName'),
    };
}

function parseLineageStep(value: unknown): LineageStep {
    if (!isRecord(value)) {
        throw new Error('Invalid lineage step entry');
    }

    const metadata = value.metadata;
    if (!isRecord(metadata)) {
        throw new Error('Invalid lineage metadata');
    }

    const stepType = requireLineageStepType(value.stepType);

    return {
        id: requireString(value.id, 'lineage step id'),
        archiveImageId: requireString(value.archiveImageId, 'lineage archiveImageId'),
        parentStepId: value.parentStepId === null ? null : optionalString(value.parentStepId) ?? null,
        stepType,
        timestamp: requireString(value.timestamp, 'lineage timestamp'),
        metadata: parseLineageMetadata(stepType, metadata),
    };
}

function parseOptionalLayerStack(value: unknown): ArchiveManifestLayerStack | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    return parseArchiveManifestLayerStack(value);
}

function parseArchiveManifestLayerStack(value: unknown): ArchiveManifestLayerStack {
    if (!isRecord(value) || !Array.isArray(value.layers)) {
        throw new Error('Invalid archive layer stack');
    }

    return {
        canvasWidth: requireNumber(value.canvasWidth, 'layer stack canvasWidth'),
        canvasHeight: requireNumber(value.canvasHeight, 'layer stack canvasHeight'),
        layers: value.layers.map(parseArchiveManifestLayer),
    };
}

function parseArchiveManifestLayer(value: unknown): ArchiveManifestLayer {
    if (!isRecord(value)) {
        throw new Error('Invalid archive layer entry');
    }

    return {
        id: requireString(value.id, 'layer id'),
        name: requireString(value.name, 'layer name'),
        kind: requireLayerKind(value.kind),
        assetFileName: requireString(value.assetFileName, 'layer assetFileName'),
        x: requireNumber(value.x, 'layer x'),
        y: requireNumber(value.y, 'layer y'),
        width: requireNumber(value.width, 'layer width'),
        height: requireNumber(value.height, 'layer height'),
        rotation: requireNumber(value.rotation, 'layer rotation'),
        opacity: requireNumber(value.opacity, 'layer opacity'),
        blendMode: optionalLayerBlendMode(value.blendMode),
        visible: requireBoolean(value.visible, 'layer visible'),
        locked: requireBoolean(value.locked, 'layer locked'),
    };
}

function requireManifestVersion(value: unknown, expectedVersion: number, label: string) {
    if (value !== expectedVersion) {
        throw new Error(`Unsupported ${label} version`);
    }
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

function optionalLayerBlendMode(value: unknown): ArchiveLayerBlendMode {
    return isLayerBlendMode(value) ? value : 'normal';
}

function requireLayerKind(value: unknown): ArchiveLayerKind {
    if (value === 'base' || value === 'uploaded' || value === 'ai-result') {
        return value;
    }

    throw new Error('Invalid layer kind');
}

function requireString(value: unknown, label: string) {
    if (typeof value !== 'string') {
        throw new Error(`Invalid ${label}`);
    }

    return value;
}

function requireNumber(value: unknown, label: string) {
    if (typeof value !== 'number') {
        throw new Error(`Invalid ${label}`);
    }

    return value;
}

function requireBoolean(value: unknown, label: string) {
    if (typeof value !== 'boolean') {
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

function optionalBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : undefined;
}

function optionalActualParameters(value: unknown): ActualImageParameters | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const actualParameters: ActualImageParameters = {
        ...(typeof value.revisedPrompt === 'string' ? { revisedPrompt: value.revisedPrompt } : {}),
        ...(typeof value.size === 'string' ? { size: value.size } : {}),
        ...(typeof value.quality === 'string' ? { quality: value.quality } : {}),
        ...(typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) ? { elapsedMs: value.elapsedMs } : {}),
    };

    return Object.keys(actualParameters).length > 0 ? actualParameters : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
