import { describe, expect, it } from 'vitest';
import type { ApiCostKind, ApiCostLedger } from '../db/types';
import { resolveImageDetailCostLedger } from './ImageDetailModal';

describe('ImageDetailModal cost ledger', () => {
    it('prefers the archived image full ledger over lineage step ledgers', () => {
        const imageLedger = createCostLedger('archive-total', 'reasoning', 0.21);
        const stepLedger = createCostLedger('lineage-step', 'image-generation', 0.04);

        const resolved = resolveImageDetailCostLedger(imageLedger, [{
            id: 'step-1',
            archiveImageId: 'image-1',
            stepType: 'autopilot-iteration',
            label: 'Autopilot Iteration',
            summary: 'Iteration 1',
            timestamp: '2026-06-28T10:00:00.000Z',
            goalText: null,
            iterationNumber: 1,
            evaluatorScore: 80,
            evaluatorFeedback: [],
            costLedger: stepLedger,
            replayImageDataUrl: null,
            runLabel: null,
        }]);

        expect(resolved).toBe(imageLedger);
    });
});

function createCostLedger(id: string, kind: ApiCostKind, amountUsd: number): ApiCostLedger {
    return {
        version: 1,
        currency: 'USD',
        items: [{
            id,
            kind,
            operation: kind,
            provider: 'openai',
            model: kind === 'reasoning' ? 'gpt-5.4' : 'gpt-image-2',
            label: kind === 'reasoning' ? 'Autopilot API total' : 'Image generation 1',
            status: 'calculated',
            currency: 'USD',
            amountUsd,
        }],
    };
}
