import { describe, expect, it } from 'vitest';
import type { ApiCostKind, ApiCostLedger } from '../db/types';
import { buildLineageCostLedger } from './lineageCostLedger';

describe('lineageCostLedger', () => {
    it('sums recorded generation and edit step costs', () => {
        const ledger = buildLineageCostLedger([
            createEntry('step-1', 'generation', 'Generated', createCostLedger('generation', 'image-generation', 0.05)),
            createEntry('step-2', 'ai-edit', 'AI Edit', createCostLedger('edit', 'image-edit', 0.04)),
        ]);

        expect(ledger?.items.map((item) => [item.id, item.amountUsd])).toEqual([
            ['generation', 0.05],
            ['edit', 0.04],
        ]);
    });

    it('marks missing charged lineage step costs as unavailable when another step cost was recorded', () => {
        const ledger = buildLineageCostLedger([
            createEntry('step-1', 'generation', 'Generated', createCostLedger('generation', 'image-generation', 0.05)),
            createEntry('step-2', 'ai-edit', 'AI Edit', null),
        ]);

        expect(ledger?.items).toEqual([
            expect.objectContaining({
                id: 'generation',
                status: 'calculated',
                amountUsd: 0.05,
            }),
            expect.objectContaining({
                id: 'ai-edit:step-2:cost-unavailable',
                kind: 'image-edit',
                label: 'AI Edit',
                status: 'unavailable',
            }),
        ]);
    });

    it('uses the archive image ledger when no lineage step costs were recorded', () => {
        const fallbackLedger = createCostLedger('archive-total', 'image-generation', 0.05);

        expect(buildLineageCostLedger([
            createEntry('step-1', 'generation', 'Generated', null),
            createEntry('step-2', 'ai-edit', 'AI Edit', null),
        ], fallbackLedger)).toBe(fallbackLedger);
    });
});

function createEntry(
    id: string,
    stepType: 'generation' | 'ai-edit',
    label: string,
    costLedger: ApiCostLedger | null,
) {
    return {
        id,
        archiveImageId: 'image-1',
        stepType,
        label,
        summary: label,
        timestamp: '2026-04-04T09:00:00.000Z',
        goalText: null,
        iterationNumber: null,
        evaluatorScore: null,
        evaluatorFeedback: [],
        costLedger,
        replayImageDataUrl: null,
        runLabel: null,
    };
}

function createCostLedger(id: string, kind: ApiCostKind, amountUsd: number): ApiCostLedger {
    return {
        version: 1,
        currency: 'USD',
        items: [{
            id,
            kind,
            operation: kind,
            provider: 'openai',
            model: 'gpt-image-2',
            label: kind === 'image-edit' ? 'AI edit' : 'Image generation 1',
            status: 'calculated',
            currency: 'USD',
            amountUsd,
        }],
    };
}
