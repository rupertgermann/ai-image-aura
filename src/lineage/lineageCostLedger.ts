import { mergeApiCostLedgers } from '../costs/apiCost';
import type { ApiCostKind, ApiCostLedger, ApiCostLineItem } from '../db/types';
import type { LineageStepType } from './types';

interface LineageCostEntry {
    id: string;
    stepType: LineageStepType;
    label: string;
    costLedger: ApiCostLedger | null;
}

export function buildLineageCostLedger(
    entries: LineageCostEntry[],
    fallbackLedger?: ApiCostLedger,
): ApiCostLedger | undefined {
    const hasRecordedStepCost = entries.some((entry) => entry.costLedger);
    if (!hasRecordedStepCost) {
        return fallbackLedger;
    }

    const stepLedgers = entries
        .map((entry) => entry.costLedger ?? buildMissingStepCostLedger(entry))
        .filter((ledger): ledger is ApiCostLedger => ledger !== null);
    const timelineLedger = mergeApiCostLedgers(...stepLedgers);

    return timelineLedger && (!fallbackLedger || timelineLedger.items.length >= fallbackLedger.items.length)
        ? timelineLedger
        : fallbackLedger;
}

function buildMissingStepCostLedger(entry: LineageCostEntry): ApiCostLedger | null {
    const kind = getChargeableStepCostKind(entry.stepType);
    if (!kind) {
        return null;
    }

    return {
        version: 1,
        currency: 'USD',
        items: [createUnavailableLineItem(entry, kind)],
    };
}

function getChargeableStepCostKind(stepType: LineageStepType): ApiCostKind | null {
    switch (stepType) {
        case 'generation':
        case 'reference-generation':
            return 'image-generation';
        case 'ai-edit':
            return 'image-edit';
        default:
            return null;
    }
}

function createUnavailableLineItem(entry: LineageCostEntry, kind: ApiCostKind): ApiCostLineItem {
    return {
        id: `${entry.stepType}:${entry.id}:cost-unavailable`,
        kind,
        operation: kind,
        provider: 'unknown',
        model: 'unknown',
        label: entry.label,
        status: 'unavailable',
        currency: 'USD',
        note: 'No API usage metadata was recorded for this lineage step.',
    };
}
