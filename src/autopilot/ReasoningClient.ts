import { openAiResponsesClient, type OpenAiResponsesClient, type OpenAiResponsesResponse } from '../utils/openai';
import { GEMINI_FLASH_REASONING_MODEL, GOOGLE_PROVIDER, OPENAI_PROVIDER, OPENAI_RESPONSES_MODEL, REASONING_MODEL_REGISTRY, type Provider, type ReasoningModelSlug } from '../utils/openaiModels';

export interface ReasoningClientRequest {
    apiKey: string;
    systemPrompt: string;
    userText: string;
    imageDataUrl?: string;
    responseSchema?: unknown;
}

export type ReasoningClientResponse = OpenAiResponsesResponse;

export interface ReasoningClient {
    provider?: Provider;
    model?: string;
    createResponse(request: ReasoningClientRequest): Promise<ReasoningClientResponse>;
}

export function createOpenAiReasoningClient(client: OpenAiResponsesClient = openAiResponsesClient): ReasoningClient {
    return {
        provider: OPENAI_PROVIDER,
        model: OPENAI_RESPONSES_MODEL,
        createResponse(request) {
            return client.createResponse(request);
        },
    };
}

export function createGeminiReasoningClient(fetchImpl: typeof fetch = fetch): ReasoningClient {
    const config = REASONING_MODEL_REGISTRY[GEMINI_FLASH_REASONING_MODEL];
    return {
        provider: GOOGLE_PROVIDER,
        model: config.apiModel,
        async createResponse(request) {
            const response = await fetchImpl(config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': request.apiKey,
                },
                body: JSON.stringify(buildGeminiReasoningRequest(request)),
            });

            if (!response.ok) {
                const errorData = await response.json().catch((): { error?: { message?: string } } | null => null);
                throw new Error(errorData?.error?.message || `Google Gemini API Error: ${response.status}`);
            }

            const data: unknown = await response.json();
            const outputText = extractGeminiReasoningText(data);
            const usage = extractGeminiReasoningUsage(data);
            if (!outputText) {
                throw new Error('No text response returned from Google Gemini');
            }

            return {
                outputText,
                ...(usage ? { usage } : {}),
            };
        },
    };
}

export const openAiReasoningClient = createOpenAiReasoningClient();
export const geminiReasoningClient = createGeminiReasoningClient();

export function resolveReasoningClient(slug: ReasoningModelSlug): ReasoningClient {
    return slug === OPENAI_RESPONSES_MODEL ? openAiReasoningClient : geminiReasoningClient;
}

export function buildGeminiReasoningRequest(request: ReasoningClientRequest) {
    return {
        systemInstruction: {
            parts: [{ text: request.systemPrompt }],
        },
        contents: [{
            role: 'user',
            parts: [
                { text: request.userText },
                ...(request.imageDataUrl ? [dataUrlToInlineDataPart(request.imageDataUrl)] : []),
            ],
        }],
        generationConfig: {
            ...(request.responseSchema
                ? {
                    responseMimeType: 'application/json',
                    responseSchema: request.responseSchema,
                }
                : {}),
        },
    };
}

export function extractGeminiReasoningText(data: unknown) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const record = data as {
        candidates?: Array<{
            content?: {
                parts?: Array<{ text?: unknown }>;
            };
        }>;
    };

    const text = record.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => typeof part.text === 'string' ? part.text.trim() : '')
        .filter(Boolean)
        .join('\n')
        .trim();

    return text || null;
}

export function extractGeminiReasoningUsage(data: unknown): Record<string, number> | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const usageMetadata = (data as { usageMetadata?: unknown }).usageMetadata;
    if (!usageMetadata || typeof usageMetadata !== 'object' || Array.isArray(usageMetadata)) {
        return null;
    }

    const entries = Object.entries(usageMetadata)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));

    return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function dataUrlToInlineDataPart(dataUrl: string) {
    const [header, data] = dataUrl.split(',');
    const mimeType = header.match(/^data:(.+);base64$/)?.[1] ?? 'image/png';

    return {
        inline_data: {
            mime_type: mimeType,
            data: data ?? dataUrl,
        },
    };
}
