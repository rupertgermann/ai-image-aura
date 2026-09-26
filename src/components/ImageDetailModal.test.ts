import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiCostKind, ApiCostLedger, ArchiveImage } from '../db/types';
import ImageDetailModal, { getImageDetailRequestedParameters, resolveImageDetailCostLedger } from './ImageDetailModal';

describe('ImageDetailModal cost ledger', () => {
    it.each([
        ['gpt-image-2', 'GPT Image 2 (retired)', 'high'],
        ['gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 'xhigh'],
        ['gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst', 'max'],
    ])('renders stored %s with its original controls', (model, label, quality) => {
        const image: ArchiveImage = { id: 'stored', url: 'data:image/png;base64,AA',
            prompt: 'historical prompt', timestamp: '2026-04-04', model, quality,
            aspectRatio: '1024x1536', background: 'transparent',
        };
        const noop = () => {};
        vi.stubGlobal('window', { localStorage: { getItem: () => null } });
        try {
            const html = renderToStaticMarkup(createElement(ImageDetailModal, {
                image, images: [image], onClose: noop, onEdit: noop, onDelete: noop,
                onCreateSimilar: noop, onToggleFavorite: noop, onReplayGenerate: noop,
                onReplayEditor: noop, onForkFromStep: noop, onNext: noop, onPrevious: noop,
            }));
            for (const value of [label, quality, '1024x1536', 'transparent']) expect(html).toContain(value);
            expect(image.model).toBe(model);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('shows Qwen aspect ratio, resolution and background in image details', () => {
        const image = {
            id: 'qwen', url: 'data:image/png;base64,AA', prompt: 'cut out', timestamp: '2026-09-22',
            model: 'qwen-image-2.1', aspectRatio: '3:4', quality: '2K', background: 'transparent',
        } as ArchiveImage;
        expect(getImageDetailRequestedParameters('qwen-image-2.1', image).map(({ label, value }) => [label, value])).toEqual([
            ['ASPECT', '3:4'], ['RESOLUTION', '2K'], ['BACKGROUND', 'transparent'],
        ]);
    });
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
            imageModelLabel: null,
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
