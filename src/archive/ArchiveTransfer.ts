import JSZip from 'jszip';
import type { ArchiveStore } from './ArchiveStore';
import type { ArchiveImage } from '../db/types';
import type { LineageStep } from '../lineage/types';
import type { LineageStore } from '../lineage/LineageStore';

export const ARCHIVE_MANIFEST_FILE = 'archive-manifest.json';
export const LINEAGE_MANIFEST_FILE = 'lineage-manifest.json';
export const ARCHIVE_MANIFEST_VERSION = 1;
export const LINEAGE_MANIFEST_VERSION = 1;

interface ArchiveManifestReference {
    fileName: string;
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
    imageFileName: string;
    references: ArchiveManifestReference[];
}

interface ArchiveManifest {
    version: number;
    images: ArchiveManifestImage[];
}

interface LineageManifest {
    version: number;
    steps: LineageStep[];
}

interface BuildArchiveZipDeps {
    lineageStore: Pick<LineageStore, 'getByArchiveImageId'>;
    createZip?: () => JSZip;
}

interface ImportArchiveZipDeps {
    archiveStore: Pick<ArchiveStore, 'save'>;
    lineageStore: Pick<LineageStore, 'save'>;
    loadZip?: (input: Blob | Uint8Array | ArrayBuffer) => Promise<JSZip>;
}

export interface ArchiveImportSummary {
    importedImageIds: string[];
    importedStepIds: string[];
    brokenParentReferences: Array<{ stepId: string; parentStepId: string }>;
    missingAssetFiles: string[];
}

export async function buildArchiveZip(images: ArchiveImage[], deps: BuildArchiveZipDeps): Promise<Uint8Array> {
    const zip = deps.createZip?.() ?? new JSZip();
    const lineageCollections = await Promise.all(images.map((image) => deps.lineageStore.getByArchiveImageId(image.id)));
    const archiveManifestImages: ArchiveManifestImage[] = [];

    for (const image of images) {
        const imageFileName = getImageFileName(image.id);
        zip.file(imageFileName, await imageUrlToBytes(image.url));

        const references = await Promise.all((image.references ?? []).map(async (reference, index) => {
            const fileName = getReferenceFileName(image.id, index);
            zip.file(fileName, await imageUrlToBytes(reference));
            return { fileName };
        }));

        archiveManifestImages.push({
            id: image.id,
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
            imageFileName,
            references,
        });
    }

    zip.file(ARCHIVE_MANIFEST_FILE, JSON.stringify({
        version: ARCHIVE_MANIFEST_VERSION,
        images: archiveManifestImages,
    }, null, 2));

    zip.file(LINEAGE_MANIFEST_FILE, JSON.stringify({
        version: LINEAGE_MANIFEST_VERSION,
        steps: dedupeLineageSteps(lineageCollections),
    }, null, 2));

    return zip.generateAsync({ type: 'uint8array' });
}

export async function importArchiveZip(zipInput: Blob | Uint8Array | ArrayBuffer, deps: ImportArchiveZipDeps): Promise<ArchiveImportSummary> {
    const normalizedZipInput = zipInput instanceof Blob ? await zipInput.arrayBuffer() : zipInput;
    const zip = await (deps.loadZip?.(normalizedZipInput) ?? JSZip.loadAsync(normalizedZipInput));
    const archiveManifest = parseArchiveManifest(await readJsonFile(zip, ARCHIVE_MANIFEST_FILE));
    const lineageManifest = parseLineageManifest(await readOptionalJsonFile(zip, LINEAGE_MANIFEST_FILE));
    const missingAssetFiles: string[] = [];
    const importedImageIds: string[] = [];

    for (const image of archiveManifest.images) {
        const imageFile = zip.file(image.imageFileName);
        if (!imageFile) {
            missingAssetFiles.push(image.imageFileName);
            continue;
        }

        const imageUrl = await blobToDataUrl(await imageFile.async('blob'));
        const references: string[] = [];

        for (const reference of image.references) {
            const referenceFile = zip.file(reference.fileName);
            if (!referenceFile) {
                missingAssetFiles.push(reference.fileName);
                continue;
            }

            references.push(await blobToDataUrl(await referenceFile.async('blob')));
        }

        await deps.archiveStore.save({
            id: image.id,
            url: imageUrl,
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
            references,
        });
        importedImageIds.push(image.id);
    }

    const stepIds = new Set(lineageManifest.steps.map((step) => step.id));
    const brokenParentReferences = lineageManifest.steps
        .filter((step) => step.parentStepId && !stepIds.has(step.parentStepId))
        .map((step) => ({ stepId: step.id, parentStepId: step.parentStepId! }));

    const importedStepIds: string[] = [];
    for (const step of lineageManifest.steps) {
        await deps.lineageStore.save(step);
        importedStepIds.push(step.id);
    }

    return {
        importedImageIds,
        importedStepIds,
        brokenParentReferences,
        missingAssetFiles,
    };
}

function dedupeLineageSteps(stepCollections: LineageStep[][]) {
    const stepsById = new Map<string, LineageStep>();

    for (const collection of stepCollections) {
        for (const step of collection) {
            stepsById.set(step.id, step);
        }
    }

    return Array.from(stepsById.values()).sort(compareLineageSteps);
}

function compareLineageSteps(left: LineageStep, right: LineageStep) {
    return left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id);
}

async function readJsonFile(zip: JSZip, fileName: string): Promise<unknown> {
    const file = zip.file(fileName);
    if (!file) {
        throw new Error(`Missing ${fileName} in archive ZIP`);
    }

    return JSON.parse(await file.async('text')) as unknown;
}

async function readOptionalJsonFile(zip: JSZip, fileName: string): Promise<unknown> {
    const file = zip.file(fileName);
    if (!file) {
        return { version: LINEAGE_MANIFEST_VERSION, steps: [] };
    }

    return JSON.parse(await file.async('text')) as unknown;
}

function parseArchiveManifest(value: unknown): ArchiveManifest {
    if (!isRecord(value) || !Array.isArray(value.images) || typeof value.version !== 'number') {
        throw new Error('Invalid archive manifest');
    }

    return {
        version: value.version,
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
        imageFileName: requireString(value.imageFileName, 'archive image fileName'),
        references: Array.isArray(value.references) ? value.references.map(parseArchiveManifestReference) : [],
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

function parseLineageManifest(value: unknown): LineageManifest {
    if (!isRecord(value) || !Array.isArray(value.steps) || typeof value.version !== 'number') {
        throw new Error('Invalid lineage manifest');
    }

    return {
        version: value.version,
        steps: value.steps.map(parseLineageStep),
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

    return {
        id: requireString(value.id, 'lineage step id'),
        archiveImageId: requireString(value.archiveImageId, 'lineage archiveImageId'),
        parentStepId: value.parentStepId === null ? null : optionalString(value.parentStepId) ?? null,
        stepType: requireLineageStepType(value.stepType),
        timestamp: requireString(value.timestamp, 'lineage timestamp'),
        metadata,
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getImageFileName(id: string) {
    return `aura-${id}.png`;
}

function getReferenceFileName(id: string, index: number) {
    return `aura-${id}-reference-${index}.png`;
}

async function blobToDataUrl(blob: Blob) {
    const mimeType = blob.type || 'image/png';
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return `data:${mimeType};base64,${btoa(binary)}`;
}

async function imageUrlToBytes(url: string) {
    if (!url.startsWith('data:')) {
        const response = await fetch(url);
        return new Uint8Array(await response.arrayBuffer());
    }

    const [metadata, base64Data] = url.split(',', 2);
    if (!metadata || !base64Data) {
        throw new Error('Invalid image data URL');
    }

    const binary = atob(base64Data);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
