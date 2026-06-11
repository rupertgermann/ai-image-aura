import type { ActualImageParameters, ArchiveImage } from '../db/types';
import { getActiveGenerateArchiveFields, type GenerateDraft } from './GenerateSession';

export interface RequestedImageParameters {
    size?: string;
    quality?: string;
}

export interface ActualParameterRow {
    label: string;
    requested?: string;
    actual: string;
    changed: boolean;
}

export interface ActualParameterDetails {
    rows: ActualParameterRow[];
    revisedPrompt?: string;
    elapsedLabel?: string;
}

export function getRequestedGenerateParameters(draft: GenerateDraft): RequestedImageParameters {
    const fields = getActiveGenerateArchiveFields(draft);

    return {
        size: fields.aspectRatio,
        quality: fields.quality,
    };
}

export function getRequestedArchiveParameters(image: ArchiveImage): RequestedImageParameters {
    return {
        size: image.aspectRatio,
        quality: image.quality,
    };
}

export function buildActualParameterDetails(input: {
    actualParameters?: ActualImageParameters;
    requestedParameters?: RequestedImageParameters;
}): ActualParameterDetails {
    const actualParameters = input.actualParameters;
    if (!actualParameters) {
        return { rows: [] };
    }

    const rows: ActualParameterRow[] = [];
    if (actualParameters.size) {
        rows.push(buildRow('Size', input.requestedParameters?.size, actualParameters.size));
    }
    if (actualParameters.quality) {
        rows.push(buildRow('Quality', input.requestedParameters?.quality, actualParameters.quality));
    }

    return {
        rows,
        ...(actualParameters.revisedPrompt ? { revisedPrompt: actualParameters.revisedPrompt } : {}),
        ...(typeof actualParameters.elapsedMs === 'number' && Number.isFinite(actualParameters.elapsedMs)
            ? { elapsedLabel: formatElapsedMs(actualParameters.elapsedMs) }
            : {}),
    };
}

export function hasActualParameterDetails(details: ActualParameterDetails) {
    return details.rows.length > 0 || Boolean(details.revisedPrompt) || Boolean(details.elapsedLabel);
}

function buildRow(label: string, requested: string | undefined, actual: string): ActualParameterRow {
    return {
        label,
        requested,
        actual,
        changed: Boolean(requested && requested !== actual),
    };
}

function formatElapsedMs(elapsedMs: number) {
    if (elapsedMs < 1000) {
        return `${Math.round(elapsedMs)} ms`;
    }

    return `${(elapsedMs / 1000).toFixed(1)} s`;
}
