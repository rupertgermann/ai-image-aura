import type { ApiCostLedger, ApiCostLineItem, ApiCostPricingSnapshot } from '../db/types';

export const API_COST_PRICING_SNAPSHOT_DATE = '2026-06-27';

const OPENAI_PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
const GEMINI_PRICING_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing';

const GPT_IMAGE_2_PRICING: ApiCostPricingSnapshot = {
    source: OPENAI_PRICING_SOURCE,
    snapshotDate: API_COST_PRICING_SNAPSHOT_DATE,
    unit: 'per_1m_tokens',
    ratesUsdPer1M: {
        inputText: 5,
        inputImage: 8,
        outputImage: 30,
    },
};

const NANO_BANANA_PRO_PRICING: ApiCostPricingSnapshot = {
    source: GEMINI_PRICING_SOURCE,
    snapshotDate: API_COST_PRICING_SNAPSHOT_DATE,
    unit: 'per_1m_tokens',
    ratesUsdPer1M: {
        inputText: 2,
        inputImage: 2,
        outputTextAndThinking: 12,
        outputImage: 120,
    },
};

const GPT_5_4_PRICING: ApiCostPricingSnapshot = {
    source: OPENAI_PRICING_SOURCE,
    snapshotDate: API_COST_PRICING_SNAPSHOT_DATE,
    unit: 'per_1m_tokens',
    ratesUsdPer1M: {
        input: 2.5,
        cachedInput: 0.25,
        output: 15,
    },
};

const GEMINI_FLASH_REASONING_PRICING: ApiCostPricingSnapshot = {
    source: GEMINI_PRICING_SOURCE,
    snapshotDate: API_COST_PRICING_SNAPSHOT_DATE,
    unit: 'per_1m_tokens',
    ratesUsdPer1M: {
        input: 0.3,
        output: 2.5,
    },
};

export interface ApiCostTotals {
    status: 'calculated' | 'partial' | 'unavailable';
    currency: 'USD';
    totalUsd?: number;
    imageGenerationTotalUsd?: number;
    reasoningTotalUsd?: number;
}

export interface BuildImageCostLedgerInput {
    provider: string;
    model: string;
    operation: 'image-generation' | 'image-edit';
    label?: string;
    usage?: unknown;
    usageScope?: 'result' | 'request';
    usageImageCount?: number;
}

export interface BuildReasoningCostLedgerInput {
    provider: string;
    model: string;
    operation: string;
    label: string;
    usage?: unknown;
}

export function buildImageCostLedger(input: BuildImageCostLedgerInput): ApiCostLedger {
    if (input.provider === 'openai') {
        return createLedger([buildOpenAiImageLineItem(input)]);
    }

    if (input.provider === 'google') {
        return createLedger([buildGeminiImageLineItem(input)]);
    }

    return createLedger([
        createUnavailableLineItem({
            kind: input.operation,
            operation: input.operation,
            provider: input.provider,
            model: input.model,
            label: input.label ?? titleizeOperation(input.operation),
            note: 'No pricing calculator is configured for this image provider.',
        }),
    ]);
}

export function buildReasoningCostLedger(input: BuildReasoningCostLedgerInput): ApiCostLedger {
    if (input.provider === 'openai') {
        return createLedger([buildOpenAiReasoningLineItem(input)]);
    }

    if (input.provider === 'google') {
        return createLedger([buildGeminiReasoningLineItem(input)]);
    }

    return createLedger([
        createUnavailableLineItem({
            kind: 'reasoning',
            operation: input.operation,
            provider: input.provider,
            model: input.model,
            label: input.label,
            note: 'No pricing calculator is configured for this reasoning provider.',
        }),
    ]);
}

export function mergeApiCostLedgers(...ledgers: Array<ApiCostLedger | null | undefined>): ApiCostLedger | undefined {
    const items = ledgers.flatMap((ledger) => ledger?.items ?? []);
    return items.length > 0 ? createLedger(items) : undefined;
}

export function calculateApiCostTotals(ledger: ApiCostLedger | null | undefined): ApiCostTotals {
    const items = ledger?.items ?? [];
    if (items.length === 0) {
        return { status: 'unavailable', currency: 'USD' };
    }

    const calculatedItems = items.filter((item) => item.status === 'calculated' && typeof item.amountUsd === 'number' && Number.isFinite(item.amountUsd));
    const unavailableItems = items.filter((item) => item.status !== 'calculated' || typeof item.amountUsd !== 'number' || !Number.isFinite(item.amountUsd));

    if (calculatedItems.length === 0) {
        return { status: 'unavailable', currency: 'USD' };
    }

    const sum = (nextItems: ApiCostLineItem[]) => roundUsd(nextItems.reduce((total, item) => total + (item.amountUsd ?? 0), 0));
    const imageItems = calculatedItems.filter((item) => item.kind === 'image-generation' || item.kind === 'image-edit');
    const reasoningItems = calculatedItems.filter((item) => item.kind === 'reasoning');

    return {
        status: unavailableItems.length > 0 ? 'partial' : 'calculated',
        currency: 'USD',
        totalUsd: sum(calculatedItems),
        ...(imageItems.length > 0 ? { imageGenerationTotalUsd: sum(imageItems) } : {}),
        ...(reasoningItems.length > 0 ? { reasoningTotalUsd: sum(reasoningItems) } : {}),
    };
}

export function formatUsd(amountUsd: number): string {
    if (amountUsd > 0 && amountUsd < 0.01) {
        return `$${amountUsd.toFixed(4)}`;
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amountUsd);
}

export function sanitizeApiCostLedger(value: unknown): ApiCostLedger | undefined {
    if (!isRecord(value) || value.currency !== 'USD' || !Array.isArray(value.items)) {
        return undefined;
    }

    const items = value.items
        .map(sanitizeApiCostLineItem)
        .filter((item): item is ApiCostLineItem => item !== null);

    return items.length > 0 ? createLedger(items) : undefined;
}

function buildOpenAiImageLineItem(input: BuildImageCostLedgerInput): ApiCostLineItem {
    const usage = normalizeOpenAiImageUsage(input.usage);
    const label = input.label ?? titleizeOperation(input.operation);

    if (!usage) {
        return createUnavailableLineItem({
            kind: input.operation,
            operation: input.operation,
            provider: input.provider,
            model: input.model,
            label,
            note: 'OpenAI did not return image usage metadata for this call.',
        });
    }

    const imageCount = input.usageScope === 'request'
        ? Math.max(1, Math.trunc(input.usageImageCount ?? 1))
        : 1;
    const fullAmount = calculateTokenCost([
        [usage.inputTextTokens, GPT_IMAGE_2_PRICING.ratesUsdPer1M.inputText],
        [usage.inputImageTokens, GPT_IMAGE_2_PRICING.ratesUsdPer1M.inputImage],
        [usage.outputImageTokens, GPT_IMAGE_2_PRICING.ratesUsdPer1M.outputImage],
    ]);
    const amountUsd = roundUsd(fullAmount / imageCount);

    return createCalculatedLineItem({
        kind: input.operation,
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        label,
        amountUsd,
        usage: {
            inputTextTokens: usage.inputTextTokens,
            inputImageTokens: usage.inputImageTokens,
            outputImageTokens: usage.outputImageTokens,
            totalTokens: usage.totalTokens,
            ...(imageCount > 1 ? { sharedRequestImageCount: imageCount } : {}),
        },
        pricing: GPT_IMAGE_2_PRICING,
        note: imageCount > 1 ? `Allocated 1/${imageCount} of a shared image-generation request.` : undefined,
    });
}

function buildGeminiImageLineItem(input: BuildImageCostLedgerInput): ApiCostLineItem {
    const usage = normalizeGeminiUsage(input.usage);
    const label = input.label ?? titleizeOperation(input.operation);

    if (!usage) {
        return createUnavailableLineItem({
            kind: input.operation,
            operation: input.operation,
            provider: input.provider,
            model: input.model,
            label,
            note: 'Google did not return Gemini usage metadata for this call.',
        });
    }

    const promptTextTokens = sumModalityTokens(usage.promptTokensDetails, 'TEXT');
    const promptImageTokens = sumModalityTokens(usage.promptTokensDetails, 'IMAGE');
    const promptDetailTokens = promptTextTokens + promptImageTokens;
    const promptFallbackTokens = promptDetailTokens > 0 ? Math.max(0, usage.promptTokenCount - promptDetailTokens) : usage.promptTokenCount;
    const candidateTextTokens = sumModalityTokens(usage.candidatesTokensDetails, 'TEXT');
    const candidateImageTokens = sumModalityTokens(usage.candidatesTokensDetails, 'IMAGE');
    const candidateDetailTokens = candidateTextTokens + candidateImageTokens;
    const outputImageTokens = candidateDetailTokens > 0 ? candidateImageTokens : usage.candidatesTokenCount;
    const outputTextAndThinkingTokens = candidateTextTokens + usage.thoughtsTokenCount;
    const fullAmount = calculateTokenCost([
        [promptTextTokens + promptFallbackTokens, NANO_BANANA_PRO_PRICING.ratesUsdPer1M.inputText],
        [promptImageTokens, NANO_BANANA_PRO_PRICING.ratesUsdPer1M.inputImage],
        [outputTextAndThinkingTokens, NANO_BANANA_PRO_PRICING.ratesUsdPer1M.outputTextAndThinking],
        [outputImageTokens, NANO_BANANA_PRO_PRICING.ratesUsdPer1M.outputImage],
    ]);

    return createCalculatedLineItem({
        kind: input.operation,
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        label,
        amountUsd: roundUsd(fullAmount),
        usage: {
            promptTokenCount: usage.promptTokenCount,
            candidatesTokenCount: usage.candidatesTokenCount,
            thoughtsTokenCount: usage.thoughtsTokenCount,
            outputImageTokens,
            totalTokenCount: usage.totalTokenCount,
        },
        pricing: NANO_BANANA_PRO_PRICING,
        note: 'Gemini image responses expose aggregate prompt and generated-image token counts.',
    });
}

function buildOpenAiReasoningLineItem(input: BuildReasoningCostLedgerInput): ApiCostLineItem {
    const usage = normalizeOpenAiResponsesUsage(input.usage);
    if (!usage) {
        return createUnavailableLineItem({
            kind: 'reasoning',
            operation: input.operation,
            provider: input.provider,
            model: input.model,
            label: input.label,
            note: 'OpenAI did not return reasoning usage metadata for this call.',
        });
    }

    const billableInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    const amountUsd = calculateTokenCost([
        [billableInputTokens, GPT_5_4_PRICING.ratesUsdPer1M.input],
        [usage.cachedInputTokens, GPT_5_4_PRICING.ratesUsdPer1M.cachedInput],
        [usage.outputTokens, GPT_5_4_PRICING.ratesUsdPer1M.output],
    ]);

    return createCalculatedLineItem({
        kind: 'reasoning',
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        label: input.label,
        amountUsd: roundUsd(amountUsd),
        usage: {
            inputTokens: usage.inputTokens,
            cachedInputTokens: usage.cachedInputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
        },
        pricing: GPT_5_4_PRICING,
    });
}

function buildGeminiReasoningLineItem(input: BuildReasoningCostLedgerInput): ApiCostLineItem {
    const usage = normalizeGeminiUsage(input.usage);
    if (!usage) {
        return createUnavailableLineItem({
            kind: 'reasoning',
            operation: input.operation,
            provider: input.provider,
            model: input.model,
            label: input.label,
            note: 'Google did not return Gemini usage metadata for this reasoning call.',
        });
    }

    const outputTokens = usage.candidatesTokenCount + usage.thoughtsTokenCount;
    const amountUsd = calculateTokenCost([
        [usage.promptTokenCount, GEMINI_FLASH_REASONING_PRICING.ratesUsdPer1M.input],
        [outputTokens, GEMINI_FLASH_REASONING_PRICING.ratesUsdPer1M.output],
    ]);

    return createCalculatedLineItem({
        kind: 'reasoning',
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        label: input.label,
        amountUsd: roundUsd(amountUsd),
        usage: {
            promptTokenCount: usage.promptTokenCount,
            candidatesTokenCount: usage.candidatesTokenCount,
            thoughtsTokenCount: usage.thoughtsTokenCount,
            totalTokenCount: usage.totalTokenCount,
        },
        pricing: GEMINI_FLASH_REASONING_PRICING,
    });
}

function normalizeOpenAiImageUsage(value: unknown) {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const inputDetails = asRecord(record.input_tokens_details);
    const outputDetails = asRecord(record.output_tokens_details);
    const inputTextTokens = optionalFiniteNumber(inputDetails?.text_tokens);
    const inputImageTokens = optionalFiniteNumber(inputDetails?.image_tokens);
    const outputImageTokens = optionalFiniteNumber(outputDetails?.image_tokens)
        ?? optionalFiniteNumber(record.output_tokens);
    const totalTokens = optionalFiniteNumber(record.total_tokens);

    if (inputTextTokens === null && inputImageTokens === null && outputImageTokens === null) {
        return null;
    }

    return {
        inputTextTokens: inputTextTokens ?? 0,
        inputImageTokens: inputImageTokens ?? 0,
        outputImageTokens: outputImageTokens ?? 0,
        totalTokens: totalTokens ?? 0,
    };
}

function normalizeOpenAiResponsesUsage(value: unknown) {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const inputTokens = optionalFiniteNumber(record.input_tokens);
    const outputTokens = optionalFiniteNumber(record.output_tokens);
    const totalTokens = optionalFiniteNumber(record.total_tokens);
    const details = asRecord(record.input_tokens_details);
    const cachedInputTokens = optionalFiniteNumber(details?.cached_tokens) ?? 0;

    if (inputTokens === null && outputTokens === null) {
        return null;
    }

    return {
        inputTokens: inputTokens ?? 0,
        cachedInputTokens,
        outputTokens: outputTokens ?? 0,
        totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    };
}

function normalizeGeminiUsage(value: unknown) {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const promptTokenCount = optionalFiniteNumber(record.promptTokenCount);
    const candidatesTokenCount = optionalFiniteNumber(record.candidatesTokenCount);
    const thoughtsTokenCount = optionalFiniteNumber(record.thoughtsTokenCount);
    const totalTokenCount = optionalFiniteNumber(record.totalTokenCount);
    const promptTokensDetails = normalizeModalityTokenDetails(record.promptTokensDetails);
    const candidatesTokensDetails = normalizeModalityTokenDetails(record.candidatesTokensDetails);

    if (
        promptTokenCount === null
        && candidatesTokenCount === null
        && thoughtsTokenCount === null
        && totalTokenCount === null
        && promptTokensDetails.length === 0
        && candidatesTokensDetails.length === 0
    ) {
        return null;
    }

    return {
        promptTokenCount: promptTokenCount ?? 0,
        candidatesTokenCount: candidatesTokenCount ?? 0,
        thoughtsTokenCount: thoughtsTokenCount ?? 0,
        totalTokenCount: totalTokenCount ?? 0,
        promptTokensDetails,
        candidatesTokensDetails,
    };
}

function normalizeModalityTokenDetails(value: unknown): Array<{ modality: string; tokenCount: number }> {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        const record = asRecord(item);
        const tokenCount = optionalFiniteNumber(record?.tokenCount);
        return record && typeof record.modality === 'string' && tokenCount !== null
            ? [{ modality: record.modality, tokenCount }]
            : [];
    });
}

function sumModalityTokens(
    details: Array<{ modality: string; tokenCount: number }>,
    modality: string,
): number {
    return details
        .filter((detail) => detail.modality.toUpperCase() === modality)
        .reduce((total, detail) => total + detail.tokenCount, 0);
}

function createCalculatedLineItem(input: Omit<ApiCostLineItem, 'id' | 'status' | 'currency'>): ApiCostLineItem {
    return {
        id: buildCostLineItemId(input.operation, input.provider, input.model),
        status: 'calculated',
        currency: 'USD',
        ...input,
    };
}

function createUnavailableLineItem(input: Pick<ApiCostLineItem, 'kind' | 'operation' | 'provider' | 'model' | 'label'> & { note: string }): ApiCostLineItem {
    return {
        id: buildCostLineItemId(input.operation, input.provider, input.model),
        kind: input.kind,
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        label: input.label,
        status: 'unavailable',
        currency: 'USD',
        note: input.note,
    };
}

function createLedger(items: ApiCostLineItem[]): ApiCostLedger {
    return {
        version: 1,
        currency: 'USD',
        items: uniquifyLineItemIds(items),
    };
}

function uniquifyLineItemIds(items: ApiCostLineItem[]): ApiCostLineItem[] {
    const used = new Set<string>();
    const nextCounts = new Map<string, number>();

    return items.map((item) => {
        if (!used.has(item.id)) {
            used.add(item.id);
            nextCounts.set(item.id, 2);
            return item;
        }

        let suffix = nextCounts.get(item.id) ?? 2;
        let nextId = `${item.id}:${suffix}`;
        while (used.has(nextId)) {
            suffix += 1;
            nextId = `${item.id}:${suffix}`;
        }
        nextCounts.set(item.id, suffix + 1);
        used.add(nextId);
        return { ...item, id: nextId };
    });
}

function sanitizeApiCostLineItem(value: unknown): ApiCostLineItem | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const kind = record.kind === 'image-generation' || record.kind === 'image-edit' || record.kind === 'reasoning'
        ? record.kind
        : null;
    const status = record.status === 'calculated' || record.status === 'unavailable'
        ? record.status
        : null;
    if (!kind || !status || record.currency !== 'USD') {
        return null;
    }

    return {
        id: typeof record.id === 'string' && record.id ? record.id : buildCostLineItemId(String(record.operation), String(record.provider), String(record.model)),
        kind,
        operation: typeof record.operation === 'string' ? record.operation : kind,
        provider: typeof record.provider === 'string' ? record.provider : 'unknown',
        model: typeof record.model === 'string' ? record.model : 'unknown',
        label: typeof record.label === 'string' ? record.label : titleizeOperation(kind),
        status,
        currency: 'USD',
        ...(optionalFiniteNumber(record.amountUsd) !== null ? { amountUsd: optionalFiniteNumber(record.amountUsd) ?? undefined } : {}),
        ...(isFiniteNumberRecord(record.usage) ? { usage: record.usage } : {}),
        ...(sanitizePricing(record.pricing) ? { pricing: sanitizePricing(record.pricing) } : {}),
        ...(typeof record.note === 'string' ? { note: record.note } : {}),
    };
}

function sanitizePricing(value: unknown): ApiCostPricingSnapshot | undefined {
    const record = asRecord(value);
    if (
        !record
        || typeof record.source !== 'string'
        || typeof record.snapshotDate !== 'string'
        || record.unit !== 'per_1m_tokens'
        || !isFiniteNumberRecord(record.ratesUsdPer1M)
    ) {
        return undefined;
    }

    return {
        source: record.source,
        snapshotDate: record.snapshotDate,
        unit: 'per_1m_tokens',
        ratesUsdPer1M: record.ratesUsdPer1M,
        ...(Array.isArray(record.notes) && record.notes.every((note) => typeof note === 'string')
            ? { notes: record.notes }
            : {}),
    };
}

function calculateTokenCost(entries: Array<[number, number | undefined]>): number {
    return entries.reduce((total, [tokens, rate]) => total + ((rate ?? 0) * tokens / 1_000_000), 0);
}

function roundUsd(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

function buildCostLineItemId(operation: string, provider: string, model: string) {
    return `${operation}:${provider}:${model}`;
}

function titleizeOperation(value: string) {
    return value
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function isFiniteNumberRecord(value: unknown): value is Record<string, number> {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function optionalFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
}
