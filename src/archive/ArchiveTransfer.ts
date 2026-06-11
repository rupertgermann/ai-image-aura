import JSZip from 'jszip';
import type { ArchiveStore } from './ArchiveStore';
import type { ArchiveImage, ArchiveLayer, ArchiveLayerStack } from '../db/types';
import type { LineageStep } from '../lineage/types';
import type { LineageStore } from '../lineage/LineageStore';
import {
    ARCHIVE_MANIFEST_FILE,
    LINEAGE_MANIFEST_FILE,
    createArchiveManifest,
    createArchiveManifestLayerStack,
    createEmptyLineageManifest,
    createLineageManifest,
    parseArchiveManifest,
    parseLineageManifest,
    type ArchiveManifestImage,
    type ArchiveManifestLayerStack,
} from './ArchiveManifest';

export {
    ARCHIVE_MANIFEST_FILE,
    ARCHIVE_MANIFEST_VERSION,
    LINEAGE_MANIFEST_FILE,
    LINEAGE_MANIFEST_VERSION,
} from './ArchiveManifest';

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
        const layerStack = image.layerStack ? await addLayerStackToZip(zip, image.id, image.layerStack) : undefined;

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
            favorite: image.favorite ? true : undefined,
            style: image.style,
            lighting: image.lighting,
            palette: image.palette,
            imageFileName,
            references,
            layerStack,
        });
    }

    zip.file(ARCHIVE_MANIFEST_FILE, JSON.stringify(createArchiveManifest(archiveManifestImages), null, 2));

    const lineageSteps = await addLineageAssetsToZip(zip, dedupeLineageSteps(lineageCollections));
    zip.file(LINEAGE_MANIFEST_FILE, JSON.stringify(createLineageManifest(lineageSteps), null, 2));

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
        const imageFileName = image.imageFileName ?? getImageFileName(image.id);
        const imageFile = zip.file(imageFileName);
        if (!imageFile) {
            missingAssetFiles.push(imageFileName);
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
        const layerStack = await importLayerStack(zip, image.layerStack, missingAssetFiles);

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
            favorite: image.favorite,
            style: image.style,
            lighting: image.lighting,
            palette: image.palette,
            references,
            layerStack,
        });
        importedImageIds.push(image.id);
    }

    const stepIds = new Set(lineageManifest.steps.map((step) => step.id));
    const brokenParentReferences = lineageManifest.steps
        .filter((step) => step.parentStepId && !stepIds.has(step.parentStepId))
        .map((step) => ({ stepId: step.id, parentStepId: step.parentStepId! }));

    const importedStepIds: string[] = [];
    for (const step of lineageManifest.steps) {
        const hydratedStep = await hydrateLineageAssetsFromZip(zip, step, missingAssetFiles);
        await deps.lineageStore.save(hydratedStep);
        importedStepIds.push(hydratedStep.id);
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
        return createEmptyLineageManifest();
    }

    return JSON.parse(await file.async('text')) as unknown;
}

function getImageFileName(id: string) {
    return `aura-${id}.png`;
}

function getReferenceFileName(id: string, index: number) {
    return `aura-${id}-reference-${index}.png`;
}

function getLayerFileName(imageId: string, layerId: string) {
    return `aura-${imageId}-layer-${layerId}.png`;
}

function getTransformMaskFileName(stepId: string, mimeType: string) {
    return `aura-${stepId}-transform-mask.${mimeType === 'image/png' ? 'png' : 'bin'}`;
}

async function addLayerStackToZip(zip: JSZip, imageId: string, layerStack: ArchiveLayerStack): Promise<ArchiveManifestLayerStack> {
    await Promise.all(layerStack.layers.map(async (layer) => {
        zip.file(getLayerFileName(imageId, layer.id), await imageUrlToBytes(layer.assetUrl));
    }));

    return createArchiveManifestLayerStack(imageId, layerStack, getLayerFileName);
}

async function addLineageAssetsToZip(zip: JSZip, steps: LineageStep[]): Promise<LineageStep[]> {
    return Promise.all(steps.map(async (step) => {
        const nextStep = cloneLineageStep(step);
        const transformMask = getTransformMaskAsset(nextStep.metadata);

        if (!transformMask?.dataUrl) {
            return nextStep;
        }

        const fileName = getTransformMaskFileName(step.id, transformMask.mimeType);
        zip.file(fileName, await imageUrlToBytes(transformMask.dataUrl));
        setTransformMaskAsset(nextStep.metadata, {
            assetId: transformMask.assetId,
            fileName,
            mimeType: transformMask.mimeType,
        });

        return nextStep;
    }));
}

async function hydrateLineageAssetsFromZip(zip: JSZip, step: LineageStep, missingAssetFiles: string[]): Promise<LineageStep> {
    const nextStep = cloneLineageStep(step);
    const transformMask = getTransformMaskAsset(nextStep.metadata);

    if (!transformMask?.fileName || transformMask.dataUrl) {
        return nextStep;
    }

    const file = zip.file(transformMask.fileName);
    if (!file) {
        missingAssetFiles.push(transformMask.fileName);
        return nextStep;
    }

    setTransformMaskAsset(nextStep.metadata, {
        assetId: transformMask.assetId,
        dataUrl: bytesToDataUrl(await file.async('uint8array'), transformMask.mimeType),
        mimeType: transformMask.mimeType,
    });

    return nextStep;
}

async function importLayerStack(zip: JSZip, layerStack: ArchiveManifestLayerStack | undefined, missingAssetFiles: string[]): Promise<ArchiveLayerStack | undefined> {
    if (!layerStack) {
        return undefined;
    }

    const layers: ArchiveLayer[] = [];
    for (const layer of layerStack.layers) {
        const { assetFileName, ...layerMetadata } = layer;
        const file = zip.file(assetFileName);
        if (!file) {
            missingAssetFiles.push(assetFileName);
            continue;
        }

        layers.push({
            ...layerMetadata,
            assetUrl: await blobToDataUrl(await file.async('blob')),
        });
    }

    return {
        canvasWidth: layerStack.canvasWidth,
        canvasHeight: layerStack.canvasHeight,
        layers,
    };
}

async function blobToDataUrl(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return bytesToDataUrl(bytes, blob.type || 'image/png');
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
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

interface TransferTransformMaskAsset {
    assetId: string | null;
    dataUrl?: string;
    fileName?: string;
    mimeType: string;
}

function cloneLineageStep(step: LineageStep): LineageStep {
    return {
        ...step,
        metadata: JSON.parse(JSON.stringify(step.metadata)) as Record<string, unknown>,
    };
}

function getTransformMaskAsset(metadata: Record<string, unknown>): TransferTransformMaskAsset | null {
    const aiEdit = asRecord(metadata.aiEdit);
    return readTransformMaskAsset(aiEdit?.transformMask) ?? readTransformMaskAsset(metadata.transformMaskAsset);
}

function setTransformMaskAsset(metadata: Record<string, unknown>, asset: TransferTransformMaskAsset) {
    const aiEdit = asRecord(metadata.aiEdit);
    if (aiEdit) {
        aiEdit.transformMask = asset;
    }
    metadata.transformMaskAsset = asset;
}

function readTransformMaskAsset(value: unknown): TransferTransformMaskAsset | null {
    const asset = asRecord(value);
    if (!asset) {
        return null;
    }

    const dataUrl = typeof asset.dataUrl === 'string' ? asset.dataUrl : undefined;
    const fileName = typeof asset.fileName === 'string' ? asset.fileName : undefined;
    if (!dataUrl && !fileName) {
        return null;
    }

    return {
        assetId: typeof asset.assetId === 'string' ? asset.assetId : null,
        ...(dataUrl ? { dataUrl } : {}),
        ...(fileName ? { fileName } : {}),
        mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : 'image/png',
    };
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
