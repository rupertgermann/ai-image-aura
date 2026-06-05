import type { LineageStore, LineageStep } from './LineageStore';
import { readAutopilotTimelineMetadata, type AutopilotTimelineMetadata } from './autopilotLineageMetadata';
import { readGenerateLineageReferenceCount } from './generateLineageMetadata';

export interface LineageTimelineEntry {
    id: string;
    archiveImageId: string;
    stepType: LineageStep['stepType'];
    label: string;
    summary: string;
    timestamp: string;
    goalText: string | null;
    iterationNumber: number | null;
    evaluatorScore: number | null;
    evaluatorFeedback: string[];
    replayImageDataUrl: string | null;
    runLabel: string | null;
}

export interface LineageTimelineParent {
    label: string;
    archiveImageId: string | null;
    missing: boolean;
}

export interface LineageTimelineData {
    entries: LineageTimelineEntry[];
    parent: LineageTimelineParent | null;
    descendantCount: number;
}

interface TimelineStore {
    getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]>;
    getById(id: string): Promise<LineageStep | null>;
    getChildren(parentStepId: string): Promise<LineageStep[]>;
}

export async function loadLineageTimeline(
    archiveImageId: string,
    store: TimelineStore,
): Promise<LineageTimelineData> {
    const directSteps = await store.getByArchiveImageId(archiveImageId);
    const steps = await expandWithAncestors(directSteps, store);
    const [parent, descendantCount] = await Promise.all([
        loadParent(directSteps, store),
        countDescendants(directSteps, store),
    ]);

    return {
        entries: steps.map(toTimelineEntry),
        parent,
        descendantCount,
    };
}

async function expandWithAncestors(steps: LineageStep[], store: Pick<LineageStore, 'getById'>) {
    const orderedSteps = [...steps];
    const seen = new Set(orderedSteps.map((step) => step.id));
    let parentStepId = orderedSteps[0]?.parentStepId ?? null;

    while (parentStepId) {
        const parentStep = await store.getById(parentStepId);
        if (!parentStep || seen.has(parentStep.id)) {
            break;
        }

        orderedSteps.unshift(parentStep);
        seen.add(parentStep.id);
        parentStepId = parentStep.parentStepId;
    }

    return orderedSteps;
}

async function loadParent(steps: LineageStep[], store: Pick<LineageStore, 'getById'>): Promise<LineageTimelineParent | null> {
    const parentStepId = steps[0]?.parentStepId;
    if (!parentStepId) {
        return null;
    }

    const parentStep = await store.getById(parentStepId);
    if (!parentStep) {
        return {
            label: 'Origin unknown',
            archiveImageId: null,
            missing: true,
        };
    }

    return {
        label: summarizeParent(parentStep),
        archiveImageId: parentStep.archiveImageId,
        missing: false,
    };
}

async function countDescendants(steps: LineageStep[], store: Pick<LineageStore, 'getChildren'>) {
    const childCollections = await Promise.all(steps.map((step) => store.getChildren(step.id)));
    return new Set(childCollections.flat().map((child) => child.id)).size;
}

function toTimelineEntry(step: LineageStep): LineageTimelineEntry {
    const autopilotMetadata = getAutopilotTimelineMetadata(step);

    return {
        id: step.id,
        archiveImageId: step.archiveImageId,
        stepType: step.stepType,
        label: getStepLabel(step),
        summary: getStepSummary(step),
        timestamp: step.timestamp,
        goalText: autopilotMetadata?.goalText ?? null,
        iterationNumber: autopilotMetadata?.iterationNumber ?? null,
        evaluatorScore: autopilotMetadata?.evaluatorScore ?? null,
        evaluatorFeedback: autopilotMetadata?.evaluatorFeedback ?? [],
        replayImageDataUrl: autopilotMetadata?.replayImageDataUrl ?? null,
        runLabel: autopilotMetadata?.runLabel ?? null,
    };
}

function getAutopilotTimelineMetadata(step: LineageStep): AutopilotTimelineMetadata | null {
    return step.stepType === 'autopilot-iteration'
        ? readAutopilotTimelineMetadata(step.metadata)
        : null;
}

function summarizeParent(step: LineageStep) {
    const summary = getStepSummary(step);
    return summary === 'No details recorded' ? getStepLabel(step) : summary;
}

function getStepLabel(step: LineageStep) {
    switch (step.stepType) {
        case 'generation':
            return 'Generated';
        case 'reference-generation':
            return 'Reference Generation';
        case 'ai-edit':
            return 'AI Edit';
        case 'manual-edit':
            return 'Manual Edit';
        case 'overwrite':
            return 'Overwrite Save';
        case 'save-as-copy':
            return 'Saved as Copy';
        case 'autopilot-iteration':
            return 'Autopilot Iteration';
    }
}

function getStepSummary(step: LineageStep) {
    const metadata = step.metadata;
    const prompt = excerpt(asString(metadata.prompt));
    const editPrompt = excerpt(asString(metadata.editPrompt));
    const referenceCount = readGenerateLineageReferenceCount(metadata);

    switch (step.stepType) {
        case 'generation':
            return prompt ? `Prompt: ${prompt}` : 'Generated from saved settings';
        case 'reference-generation':
            if (prompt && referenceCount > 0) {
                return `Prompt: ${prompt} with ${referenceCount} reference${referenceCount === 1 ? '' : 's'}`;
            }

            return prompt ? `Prompt: ${prompt}` : 'Generated from saved references';
        case 'ai-edit':
            return summarizeLayeredAiEdit(metadata, editPrompt);
        case 'manual-edit':
            return summarizeAdjustments(metadata.editorAdjustments) ?? 'Manual adjustments applied';
        case 'overwrite':
            return summarizeLayeredSave(metadata, 'Saved layered image') ?? summarizeAdjustments(metadata.editorAdjustments) ?? 'Saved over current image';
        case 'save-as-copy':
            return summarizeLayeredSave(metadata, 'Saved layered copy') ?? summarizeAdjustments(metadata.editorAdjustments) ?? 'Branched from previous version';
        case 'autopilot-iteration':
            return summarizeAutopilot(readAutopilotTimelineMetadata(metadata));
    }
}

function summarizeLayeredAiEdit(metadata: Record<string, unknown>, editPrompt: string | null) {
    const base = editPrompt ? `AI edit: ${editPrompt}` : 'AI edit applied';
    if (metadata.isLayered !== true) {
        return base;
    }

    const targetMode = asString(metadata.targetMode);
    const targetLayerCount = asNumberOrNull(metadata.targetLayerCount);
    const aiResultLayerName = excerpt(asString(metadata.aiResultLayerName), 32);
    const parts = [
        base,
        targetMode === 'selected-layers' && targetLayerCount !== null ? `targeted ${targetLayerCount} layer${targetLayerCount === 1 ? '' : 's'}` : 'whole composition',
        aiResultLayerName ? `result: ${aiResultLayerName}` : null,
    ].filter(Boolean);

    return parts.join(' · ');
}

function summarizeLayeredSave(metadata: Record<string, unknown>, fallback: string) {
    if (metadata.isLayered !== true) {
        return null;
    }

    const layerCount = asNumberOrNull(metadata.layerCount);
    const visibleLayerCount = asNumberOrNull(metadata.visibleLayerCount);
    const parts = [
        fallback,
        layerCount !== null ? `${layerCount} layer${layerCount === 1 ? '' : 's'}` : null,
        visibleLayerCount !== null ? `${visibleLayerCount} visible` : null,
    ].filter(Boolean);

    return parts.length > 1 ? parts.join(' · ') : fallback;
}

function summarizeAutopilot(metadata: AutopilotTimelineMetadata) {
    const goalText = excerpt(metadata.goalText, 56);
    const parts = [
        metadata.iterationNumber !== null ? `Iteration ${metadata.iterationNumber}` : null,
        metadata.evaluatorScore !== null ? `score ${metadata.evaluatorScore}` : null,
        goalText ? `goal: ${goalText}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : 'Autopilot iteration recorded';
}

function summarizeAdjustments(value: unknown) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const adjustments = value as Record<string, unknown>;
    const changed: string[] = [];

    if (adjustments.brightness !== 100) {
        changed.push('brightness');
    }
    if (adjustments.contrast !== 100) {
        changed.push('contrast');
    }
    if (adjustments.saturation !== 100) {
        changed.push('saturation');
    }
    if (adjustments.filter && adjustments.filter !== 'none') {
        changed.push('filter');
    }

    if (changed.length === 0) {
        return null;
    }

    return `Adjusted ${changed.join(', ')}`;
}

function excerpt(value: string | null, maxLength: number = 72) {
    if (!value) {
        return null;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}...`;
}

function asString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
}

function asNumberOrNull(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
