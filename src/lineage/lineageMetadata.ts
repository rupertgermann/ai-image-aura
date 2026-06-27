import { isImageModelSlug, isReasoningModelSlug } from '../utils/openaiModels';
import type { LineageStepType } from './types';
import { sanitizeApiCostLedger } from '../costs/apiCost';

export function parseLineageMetadata(
    stepType: LineageStepType,
    metadata: Record<string, unknown>,
): Record<string, unknown> {
    switch (stepType) {
        case 'generation':
        case 'reference-generation':
            validateGenerateMetadata(metadata);
            return metadata;
        case 'ai-edit':
        case 'manual-edit':
        case 'overwrite':
        case 'save-as-copy':
            validateEditorMetadata(metadata);
            return metadata;
        case 'autopilot-iteration':
            validateAutopilotMetadata(metadata);
            return metadata;
    }
}

function validateGenerateMetadata(metadata: Record<string, unknown>) {
    validateImageModel(metadata.imageModel);
    validateDimensions(metadata.dimensions);
    validateReferenceImages(metadata.referenceImages);
    validateActualParameters(metadata.actualParameters);
    validateCostLedger(metadata.costLedger);
}

function validateEditorMetadata(metadata: Record<string, unknown>) {
    validateArchiveImageFact(metadata.sourceImage);
    validateArchiveImageFact(metadata.outputImage);
    validateEditorSave(metadata.save);
    validateEditorAdjustment(metadata.editorAdjustment);
    validateEditorAiEdit(metadata.aiEdit);
    validateEditorLayers(metadata.layers);
    validateTransformMaskAsset(metadata.transformMaskAsset);
    validateCostLedger(metadata.costLedger);
}

function validateAutopilotMetadata(metadata: Record<string, unknown>) {
    validateStringRecordValue(metadata.goal, 'text');
    validateNumberRecordValue(metadata.iteration, 'number');
    validateEvaluation(metadata.evaluation);
    validateStringRecordValue(metadata.replayImage, 'dataUrl');
    validateStringRecordValue(metadata.run, 'label');
    validateReasoningModel(metadata.reasoningModel);
    validateImageModel(metadata.imageModel);
    validateDimensions(metadata.dimensions);
    validateActualParameters(metadata.actualParameters);
    validateCostLedger(metadata.costLedger);
}

function validateImageModel(value: unknown) {
    if (value === undefined) {
        return;
    }

    const imageModel = requireRecord(value, 'lineage imageModel');
    if (!isImageModelSlug(imageModel.slug)) {
        throw new Error('Invalid lineage imageModel slug');
    }

    if (imageModel.controls !== undefined) {
        requireRecord(imageModel.controls, 'lineage imageModel controls');
    }
}

function validateDimensions(value: unknown) {
    if (value === undefined) {
        return;
    }

    const dimensions = requireRecord(value, 'lineage dimensions');
    requireFiniteNumber(dimensions.width, 'lineage dimensions width');
    requireFiniteNumber(dimensions.height, 'lineage dimensions height');
}

function validateReferenceImages(value: unknown) {
    if (value === undefined) {
        return;
    }

    const referenceImages = requireRecord(value, 'lineage referenceImages');
    requireFiniteNumber(referenceImages.count, 'lineage referenceImages count');
    if (!Array.isArray(referenceImages.ids) || !referenceImages.ids.every((id) => typeof id === 'string')) {
        throw new Error('Invalid lineage referenceImages ids');
    }
}

function validateActualParameters(value: unknown) {
    if (value === undefined) {
        return;
    }

    const actualParameters = requireRecord(value, 'lineage actualParameters');
    if (actualParameters.revisedPrompt !== undefined) {
        requireString(actualParameters.revisedPrompt, 'lineage actualParameters revisedPrompt');
    }
    if (actualParameters.size !== undefined) {
        requireString(actualParameters.size, 'lineage actualParameters size');
    }
    if (actualParameters.quality !== undefined) {
        requireString(actualParameters.quality, 'lineage actualParameters quality');
    }
    if (actualParameters.elapsedMs !== undefined) {
        requireFiniteNumber(actualParameters.elapsedMs, 'lineage actualParameters elapsedMs');
    }
}

function validateCostLedger(value: unknown) {
    if (value === undefined) {
        return;
    }

    if (!sanitizeApiCostLedger(value)) {
        throw new Error('Invalid lineage costLedger');
    }
}

function validateArchiveImageFact(value: unknown) {
    if (value === undefined) {
        return;
    }

    validateStringRecordValue(value, 'archiveImageId');
}

function validateEditorSave(value: unknown) {
    if (value === undefined) {
        return;
    }

    const save = requireRecord(value, 'lineage save');
    requireBoolean(save.overwrite, 'lineage save overwrite');
    requireBoolean(save.copy, 'lineage save copy');
}

function validateEditorAdjustment(value: unknown) {
    if (value === undefined) {
        return;
    }

    const adjustment = requireRecord(value, 'lineage editorAdjustment');
    requireFiniteNumber(adjustment.brightness, 'lineage editorAdjustment brightness');
    requireFiniteNumber(adjustment.contrast, 'lineage editorAdjustment contrast');
    requireFiniteNumber(adjustment.saturation, 'lineage editorAdjustment saturation');
    requireString(adjustment.filter, 'lineage editorAdjustment filter');
}

function validateEditorAiEdit(value: unknown) {
    if (value === undefined || value === null) {
        return;
    }

    const aiEdit = requireRecord(value, 'lineage aiEdit');
    requireString(aiEdit.prompt, 'lineage aiEdit prompt');
    if (aiEdit.imageModel !== undefined && aiEdit.imageModel !== null) {
        const imageModel = requireRecord(aiEdit.imageModel, 'lineage aiEdit imageModel');
        if (!isImageModelSlug(imageModel.slug)) {
            throw new Error('Invalid lineage aiEdit imageModel slug');
        }
    }
    if (aiEdit.referenceImages !== undefined) {
        const referenceImages = requireRecord(aiEdit.referenceImages, 'lineage aiEdit referenceImages');
        requireFiniteNumber(referenceImages.count, 'lineage aiEdit referenceImages count');
    }
    validateEditorTransformTarget(aiEdit.transformTarget);
    validateTransformMaskAsset(aiEdit.transformMask);
}

function validateEditorTransformTarget(value: unknown) {
    if (value === undefined) {
        return;
    }

    const transformTarget = requireRecord(value, 'lineage transformTarget');
    if (
        transformTarget.mode !== null
        && transformTarget.mode !== 'whole-composition'
        && transformTarget.mode !== 'selected-layers'
    ) {
        throw new Error('Invalid lineage transformTarget mode');
    }
    if (transformTarget.layerCount !== null) {
        requireFiniteNumber(transformTarget.layerCount, 'lineage transformTarget layerCount');
    }
    if (transformTarget.includesBaseLayer !== null) {
        requireBoolean(transformTarget.includesBaseLayer, 'lineage transformTarget includesBaseLayer');
    }
}

function validateTransformMaskAsset(value: unknown) {
    if (value === undefined || value === null) {
        return;
    }

    const asset = requireRecord(value, 'lineage transformMask');
    if (asset.assetId !== null) {
        requireString(asset.assetId, 'lineage transformMask assetId');
    }
    if (asset.dataUrl !== undefined) {
        requireString(asset.dataUrl, 'lineage transformMask dataUrl');
    }
    if (asset.fileName !== undefined) {
        requireString(asset.fileName, 'lineage transformMask fileName');
    }
    requireString(asset.mimeType, 'lineage transformMask mimeType');
}

function validateEditorLayers(value: unknown) {
    if (value === undefined) {
        return;
    }

    const layers = requireRecord(value, 'lineage layers');
    requireBoolean(layers.layered, 'lineage layers layered');
    if (layers.count !== null) {
        requireFiniteNumber(layers.count, 'lineage layers count');
    }
    if (layers.visibleCount !== null) {
        requireFiniteNumber(layers.visibleCount, 'lineage layers visibleCount');
    }
    if (layers.aiResultLayer !== null && layers.aiResultLayer !== undefined) {
        const aiResultLayer = requireRecord(layers.aiResultLayer, 'lineage layers aiResultLayer');
        if (aiResultLayer.id !== null) {
            requireString(aiResultLayer.id, 'lineage layers aiResultLayer id');
        }
        if (aiResultLayer.name !== null) {
            requireString(aiResultLayer.name, 'lineage layers aiResultLayer name');
        }
    }
}

function validateEvaluation(value: unknown) {
    if (value === undefined) {
        return;
    }

    const evaluation = requireRecord(value, 'lineage evaluation');
    requireFiniteNumber(evaluation.score, 'lineage evaluation score');
    if (!Array.isArray(evaluation.feedback) || !evaluation.feedback.every((entry) => typeof entry === 'string')) {
        throw new Error('Invalid lineage evaluation feedback');
    }
}

function validateReasoningModel(value: unknown) {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value === 'string' && isReasoningModelSlug(value)) {
        return;
    }

    const reasoningModel = requireRecord(value, 'lineage reasoningModel');
    if (!isReasoningModelSlug(reasoningModel.slug)) {
        throw new Error('Invalid lineage reasoningModel slug');
    }
}

function validateStringRecordValue(value: unknown, key: string) {
    if (value === undefined) {
        return;
    }

    const record = requireRecord(value, `lineage ${key}`);
    requireString(record[key], `lineage ${key}`);
}

function validateNumberRecordValue(value: unknown, key: string) {
    if (value === undefined) {
        return;
    }

    const record = requireRecord(value, `lineage ${key}`);
    requireFiniteNumber(record[key], `lineage ${key}`);
}

function requireRecord(value: unknown, label: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid ${label}`);
    }

    return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
    if (typeof value !== 'string') {
        throw new Error(`Invalid ${label}`);
    }
}

function requireFiniteNumber(value: unknown, label: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Invalid ${label}`);
    }
}

function requireBoolean(value: unknown, label: string) {
    if (typeof value !== 'boolean') {
        throw new Error(`Invalid ${label}`);
    }
}
