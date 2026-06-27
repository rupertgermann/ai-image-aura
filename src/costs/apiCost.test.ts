import { describe, expect, it } from 'vitest';
import {
    buildImageCostLedger,
    buildReasoningCostLedger,
    calculateApiCostTotals,
    formatUsd,
    mergeApiCostLedgers,
    sanitizeApiCostLedger,
} from './apiCost';

describe('apiCost', () => {
    it('calculates GPT Image cost from image usage tokens', () => {
        const ledger = buildImageCostLedger({
            provider: 'openai',
            model: 'gpt-image-2',
            operation: 'image-generation',
            usage: {
                input_tokens: 120,
                output_tokens: 1600,
                total_tokens: 1720,
                input_tokens_details: {
                    text_tokens: 100,
                    image_tokens: 20,
                },
                output_tokens_details: {
                    image_tokens: 1600,
                },
            },
        });

        expect(ledger.items[0]).toMatchObject({
            status: 'calculated',
            amountUsd: 0.04866,
            usage: {
                inputTextTokens: 100,
                inputImageTokens: 20,
                outputImageTokens: 1600,
                totalTokens: 1720,
            },
        });
        expect(calculateApiCostTotals(ledger)).toMatchObject({
            status: 'calculated',
            totalUsd: 0.04866,
            imageGenerationTotalUsd: 0.04866,
        });
    });

    it('allocates shared OpenAI image request cost across returned images', () => {
        const ledger = buildImageCostLedger({
            provider: 'openai',
            model: 'gpt-image-2',
            operation: 'image-generation',
            usageScope: 'request',
            usageImageCount: 2,
            usage: {
                input_tokens_details: {
                    text_tokens: 100,
                    image_tokens: 0,
                },
                output_tokens_details: {
                    image_tokens: 2000,
                },
            },
        });

        expect(ledger.items[0]).toMatchObject({
            amountUsd: 0.03025,
            usage: expect.objectContaining({
                sharedRequestImageCount: 2,
            }),
            note: 'Allocated 1/2 of a shared image-generation request.',
        });
    });

    it('creates unavailable line items when usage metadata is missing', () => {
        const ledger = buildImageCostLedger({
            provider: 'google',
            model: 'gemini-3-pro-image-preview',
            operation: 'image-generation',
        });

        expect(ledger.items[0]).toMatchObject({
            status: 'unavailable',
        });
        expect(ledger.items[0]).not.toHaveProperty('amountUsd');
        expect(calculateApiCostTotals(ledger)).toEqual({
            status: 'unavailable',
            currency: 'USD',
        });
    });

    it('calculates reasoning and image subtotals from a merged ledger', () => {
        const imageLedger = buildImageCostLedger({
            provider: 'google',
            model: 'gemini-3-pro-image-preview',
            operation: 'image-generation',
            usage: {
                promptTokenCount: 1000,
                candidatesTokenCount: 1290,
                candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }],
                totalTokenCount: 2290,
            },
        });
        const reasoningLedger = buildReasoningCostLedger({
            provider: 'openai',
            model: 'gpt-5.4',
            operation: 'satisfaction-evaluation',
            label: 'Satisfaction evaluation',
            usage: {
                input_tokens: 1000,
                output_tokens: 200,
                total_tokens: 1200,
                input_tokens_details: {
                    cached_tokens: 100,
                },
            },
        });

        const totals = calculateApiCostTotals(mergeApiCostLedgers(imageLedger, reasoningLedger));

        expect(totals).toMatchObject({
            status: 'calculated',
            imageGenerationTotalUsd: 0.1568,
            reasoningTotalUsd: 0.005275,
            totalUsd: 0.162075,
        });
    });

    it('sanitizes persisted cost ledgers and drops invalid line items', () => {
        expect(sanitizeApiCostLedger({
            currency: 'USD',
            items: [
                {
                    id: 'known',
                    kind: 'reasoning',
                    operation: 'prompt-refinement',
                    provider: 'openai',
                    model: 'gpt-5.4',
                    label: 'Prompt refinement',
                    status: 'calculated',
                    currency: 'USD',
                    amountUsd: 0.01,
                    usage: { inputTokens: 10 },
                    pricing: {
                        source: 'https://example.test',
                        snapshotDate: '2026-06-27',
                        unit: 'per_1m_tokens',
                        ratesUsdPer1M: { input: 1 },
                    },
                },
                { status: 'calculated' },
            ],
        })).toEqual({
            version: 1,
            currency: 'USD',
            items: [expect.objectContaining({
                id: 'known',
                amountUsd: 0.01,
            })],
        });
    });

    it('formats sub-cent costs without rounding them to zero', () => {
        expect(formatUsd(0.0042)).toBe('$0.0042');
        expect(formatUsd(1.2)).toBe('$1.20');
    });
});
