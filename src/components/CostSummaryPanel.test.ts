import { describe, expect, it } from 'vitest';
import type { ApiCostKind, ApiCostLedger } from '../db/types';
import { buildCostTotalRows } from './CostSummaryPanel';

describe('CostSummaryPanel totals', () => {
    it('shows the full total before image and reasoning subtotals', () => {
        const rows = buildCostTotalRows({
            version: 1,
            currency: 'USD',
            items: [
                createLineItem('image-1', 'image-generation', 0.17),
                createLineItem('evaluation-1', 'reasoning', 0.04),
            ],
        });

        expect(rows.map((row) => [row.label, row.amountUsd])).toEqual([
            ['Total', 0.21],
            ['Image generation', 0.17],
            ['Reasoning', 0.04],
        ]);
    });

    it('keeps compact summaries to the full total only', () => {
        const rows = buildCostTotalRows({
            version: 1,
            currency: 'USD',
            items: [
                createLineItem('image-1', 'image-generation', 0.17),
                createLineItem('evaluation-1', 'reasoning', 0.04),
            ],
        }, { compact: true });

        expect(rows.map((row) => row.label)).toEqual(['Total']);
    });
});

function createLineItem(id: string, kind: ApiCostKind, amountUsd: number): ApiCostLedger['items'][number] {
    return {
        id,
        kind,
        operation: kind,
        provider: 'openai',
        model: 'gpt-image-2',
        label: kind === 'reasoning' ? 'Satisfaction evaluation' : 'Image generation 1',
        status: 'calculated',
        currency: 'USD',
        amountUsd,
    };
}
