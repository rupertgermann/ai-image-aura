import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import type { EditorAdjustments } from '../editor/layers';
import { isImageModelSlug, type ImageModelSlug } from '../utils/openaiModels';

export type EditorLineageTargetMode = 'whole-composition' | 'selected-layers';

export interface EditorLineageArchiveImageFact {
    archiveImageId: string;
}

export interface EditorLineageSaveState {
    overwrite: boolean;
    copy: boolean;
}

export interface EditorLineageAdjustment {
    brightness: number;
    contrast: number;
    saturation: number;
    filter: string;
}

export interface EditorLineageImageModel {
    slug: ImageModelSlug;
}

export interface EditorLineageReferenceImages {
    count: number;
}

export interface EditorLineageAiTransformTarget {
    mode: EditorLineageTargetMode | null;
    layerCount: number | null;
    includesBaseLayer: boolean | null;
}

export interface EditorLineageTransformMaskAsset {
    assetId: string | null;
    dataUrl?: string;
    fileName?: string;
    mimeType: string;
}

export interface EditorLineageAiEdit {
    prompt: string;
    imageModel: EditorLineageImageModel | null;
    referenceImages: EditorLineageReferenceImages;
    transformTarget: EditorLineageAiTransformTarget;
    transformMask?: EditorLineageTransformMaskAsset;
}

export interface EditorLineageAiResultLayerFact {
    id: string | null;
    name: string | null;
}

export interface EditorLineageLayers {
    layered: boolean;
    count: number | null;
    visibleCount: number | null;
    aiResultLayer: EditorLineageAiResultLayerFact | null;
}

export interface EditorLineageMetadata extends Record<string, unknown> {
    sourceImage: EditorLineageArchiveImageFact;
    outputImage: EditorLineageArchiveImageFact;
    save: EditorLineageSaveState;
    editorAdjustment: EditorLineageAdjustment;
    aiEdit: EditorLineageAiEdit | null;
    layers: EditorLineageLayers;
    sourceArchiveImageId: string;
    outputArchiveImageId: string;
    overwrite: boolean;
    editPrompt: string | null;
    model: string | null;
    referenceCount: number;
    editorAdjustments: EditorLineageAdjustment;
    isLayered: boolean;
    layerCount: number | null;
    visibleLayerCount: number | null;
    targetMode: EditorLineageTargetMode | null;
    targetLayerCount: number | null;
    targetIncludesBaseLayer: boolean | null;
    aiResultLayerId: string | null;
    aiResultLayerName: string | null;
    transformMaskAsset?: EditorLineageTransformMaskAsset;
}

export interface EditorTimelineMetadata {
    editPrompt: string | null;
    editorAdjustment: EditorLineageAdjustment | null;
    layers: EditorLineageLayers;
    aiTransformTarget: EditorLineageAiTransformTarget;
}

export function buildEditorLineageMetadata(input: {
    sourceImage: ArchiveImage;
    savedImage: ArchiveImage;
    isCopy: boolean;
    adjustments: EditorAdjustments;
    layerStack?: ArchiveLayerStack | null;
    targetMode?: EditorLineageTargetMode | null;
    targetLayerCount?: number | null;
    targetIncludesBaseLayer?: boolean | null;
    aiResultLayerId?: string | null;
    aiResultLayerName?: string | null;
    aiEditPrompt?: string | null;
    aiEditModel?: string | null;
    transformMask?: EditorLineageTransformMaskAsset | null;
}): EditorLineageMetadata {
    const layerStack = input.layerStack ?? input.savedImage.layerStack;
    const editPrompt = normalizeString(input.aiEditPrompt);
    const model = input.aiEditModel ?? input.sourceImage.model ?? null;
    const referenceCount = input.savedImage.references?.length ?? 0;
    const editorAdjustment = buildEditorAdjustment(input.adjustments);
    const aiTransformTarget = {
        mode: normalizeTargetMode(input.targetMode),
        layerCount: normalizeNullableNumber(input.targetLayerCount),
        includesBaseLayer: normalizeNullableBoolean(input.targetIncludesBaseLayer),
    };
    const layers = buildEditorLayers({
        layerStack,
        aiResultLayerId: input.aiResultLayerId ?? null,
        aiResultLayerName: input.aiResultLayerName ?? null,
    });
    const transformMask = buildEditorTransformMaskAsset(input.transformMask, input.savedImage.id);

    return {
        sourceImage: {
            archiveImageId: input.sourceImage.id,
        },
        outputImage: {
            archiveImageId: input.savedImage.id,
        },
        save: {
            overwrite: !input.isCopy,
            copy: input.isCopy,
        },
        editorAdjustment,
        aiEdit: editPrompt
            ? {
                prompt: editPrompt,
                imageModel: buildEditorLineageImageModel(model),
                referenceImages: {
                    count: referenceCount,
                },
                transformTarget: aiTransformTarget,
                ...(transformMask ? { transformMask } : {}),
            }
            : null,
        layers,
        sourceArchiveImageId: input.sourceImage.id,
        outputArchiveImageId: input.savedImage.id,
        overwrite: !input.isCopy,
        editPrompt,
        model,
        referenceCount,
        editorAdjustments: editorAdjustment,
        isLayered: layers.layered,
        layerCount: layers.count,
        visibleLayerCount: layers.visibleCount,
        targetMode: aiTransformTarget.mode,
        targetLayerCount: aiTransformTarget.layerCount,
        targetIncludesBaseLayer: aiTransformTarget.includesBaseLayer,
        aiResultLayerId: layers.aiResultLayer?.id ?? null,
        aiResultLayerName: layers.aiResultLayer?.name ?? null,
        ...(transformMask ? { transformMaskAsset: transformMask } : {}),
    };
}

export function readEditorTimelineMetadata(metadata: Record<string, unknown>): EditorTimelineMetadata {
    return {
        editPrompt: readEditorLineageEditPrompt(metadata),
        editorAdjustment: readEditorLineageAdjustment(metadata),
        layers: readEditorLineageLayers(metadata),
        aiTransformTarget: readEditorLineageAiTransformTarget(metadata),
    };
}

export function readEditorLineageEditPrompt(metadata: Record<string, unknown>): string | null {
    const aiEdit = asRecord(metadata.aiEdit);

    return normalizeString(aiEdit?.prompt) ?? normalizeString(metadata.editPrompt);
}

export function readEditorLineageAdjustment(metadata: Record<string, unknown>): EditorLineageAdjustment | null {
    return readAdjustment(metadata.editorAdjustment) ?? readAdjustment(metadata.editorAdjustments);
}

export function readEditorLineageImageModel(metadata: Record<string, unknown>): EditorLineageImageModel | null {
    const aiEdit = asRecord(metadata.aiEdit);
    const imageModel = asRecord(aiEdit?.imageModel);
    if (imageModel && isImageModelSlug(imageModel.slug)) {
        return {
            slug: imageModel.slug,
        };
    }

    return isImageModelSlug(metadata.model)
        ? { slug: metadata.model }
        : null;
}

export function readEditorLineageLayers(metadata: Record<string, unknown>): EditorLineageLayers {
    const layers = asRecord(metadata.layers);

    return {
        layered: asBoolean(layers?.layered) ?? metadata.isLayered === true,
        count: asFiniteNumber(layers?.count) ?? asFiniteNumber(metadata.layerCount),
        visibleCount: asFiniteNumber(layers?.visibleCount) ?? asFiniteNumber(metadata.visibleLayerCount),
        aiResultLayer: readAiResultLayer(layers?.aiResultLayer)
            ?? readAiResultLayer({
                id: metadata.aiResultLayerId,
                name: metadata.aiResultLayerName,
            }),
    };
}

export function readEditorLineageAiTransformTarget(metadata: Record<string, unknown>): EditorLineageAiTransformTarget {
    const aiEdit = asRecord(metadata.aiEdit);
    const transformTarget = asRecord(aiEdit?.transformTarget);

    return {
        mode: normalizeTargetMode(transformTarget?.mode) ?? normalizeTargetMode(metadata.targetMode),
        layerCount: asFiniteNumber(transformTarget?.layerCount) ?? asFiniteNumber(metadata.targetLayerCount),
        includesBaseLayer: asBoolean(transformTarget?.includesBaseLayer) ?? asBoolean(metadata.targetIncludesBaseLayer),
    };
}

export function readEditorLineageTransformMask(metadata: Record<string, unknown>): EditorLineageTransformMaskAsset | null {
    const aiEdit = asRecord(metadata.aiEdit);
    return readTransformMaskAsset(aiEdit?.transformMask) ?? readTransformMaskAsset(metadata.transformMaskAsset);
}

function buildEditorAdjustment(adjustments: EditorAdjustments): EditorLineageAdjustment {
    return {
        brightness: adjustments.brightness,
        contrast: adjustments.contrast,
        saturation: adjustments.saturation,
        filter: adjustments.filter,
    };
}

function buildEditorLayers(input: {
    layerStack?: ArchiveLayerStack | null;
    aiResultLayerId: string | null;
    aiResultLayerName: string | null;
}): EditorLineageLayers {
    const aiResultLayer = input.aiResultLayerId || input.aiResultLayerName
        ? {
            id: input.aiResultLayerId,
            name: input.aiResultLayerName,
        }
        : null;

    return {
        layered: !!input.layerStack && input.layerStack.layers.some((layer) => layer.kind !== 'base'),
        count: input.layerStack?.layers.length ?? null,
        visibleCount: input.layerStack?.layers.filter((layer) => layer.visible).length ?? null,
        aiResultLayer,
    };
}

function buildEditorLineageImageModel(model: string | null): EditorLineageImageModel | null {
    return isImageModelSlug(model)
        ? { slug: model }
        : null;
}

function buildEditorTransformMaskAsset(
    transformMask: EditorLineageTransformMaskAsset | null | undefined,
    savedImageId: string,
): EditorLineageTransformMaskAsset | null {
    if (!transformMask?.dataUrl && !transformMask?.fileName) {
        return null;
    }

    return {
        assetId: transformMask.assetId || `${savedImageId}:transform-mask`,
        ...(transformMask.dataUrl ? { dataUrl: transformMask.dataUrl } : {}),
        ...(transformMask.fileName ? { fileName: transformMask.fileName } : {}),
        mimeType: transformMask.mimeType || 'image/png',
    };
}

function readTransformMaskAsset(value: unknown): EditorLineageTransformMaskAsset | null {
    const asset = asRecord(value);
    if (!asset) {
        return null;
    }

    const dataUrl = typeof asset.dataUrl === 'string' ? asset.dataUrl : undefined;
    const fileName = typeof asset.fileName === 'string' ? asset.fileName : undefined;
    const mimeType = typeof asset.mimeType === 'string' ? asset.mimeType : 'image/png';
    const assetId = typeof asset.assetId === 'string' ? asset.assetId : null;

    if (!dataUrl && !fileName) {
        return null;
    }

    return {
        assetId,
        ...(dataUrl ? { dataUrl } : {}),
        ...(fileName ? { fileName } : {}),
        mimeType,
    };
}

function readAdjustment(value: unknown): EditorLineageAdjustment | null {
    const adjustment = asRecord(value);
    if (!adjustment) {
        return null;
    }

    return {
        brightness: asFiniteNumber(adjustment.brightness) ?? 100,
        contrast: asFiniteNumber(adjustment.contrast) ?? 100,
        saturation: asFiniteNumber(adjustment.saturation) ?? 100,
        filter: normalizeString(adjustment.filter) ?? 'none',
    };
}

function readAiResultLayer(value: unknown): EditorLineageAiResultLayerFact | null {
    const layer = asRecord(value);
    if (!layer) {
        return null;
    }

    const id = normalizeString(layer.id);
    const name = normalizeString(layer.name);

    return id || name
        ? { id, name }
        : null;
}

function normalizeString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTargetMode(value: unknown): EditorLineageTargetMode | null {
    return value === 'whole-composition' || value === 'selected-layers' ? value : null;
}

function normalizeNullableNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNullableBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}
