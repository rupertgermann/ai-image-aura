import { openAiResponsesClient, type OpenAiResponsesClient, type OpenAiResponsesResponse } from '../utils/openai';
import { GEMINI_FLASH_REASONING_MODEL, OPENAI_RESPONSES_MODEL, REASONING_MODEL_REGISTRY, type ReasoningModelSlug } from '../utils/openaiModels';

export interface ReasoningClientRequest {
    apiKey: string;
    systemPrompt: string;
    userText: string;
    imageDataUrl?: string;
    responseSchema?: unknown;
}

export type ReasoningClientResponse = OpenAiResponsesResponse;

export interface ReasoningClient {
    createResponse(request: ReasoningClientRequest): Promise<ReasoningClientResponse>;
}

export function createOpenAiReasoningClient(client: OpenAiResponsesClient = openAiResponsesClient): ReasoningClient {
    return {
        createResponse(request) {
            return client.createResponse(request);
        },
    };
}

export function createGeminiReasoningClient(fetchImpl: typeof fetch = fetch): ReasoningClient {
    const config = REASONING_MODEL_REGISTRY[GEMINI_FLASH_REASONING_MODEL];
    return {
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
            if (!outputText) {
                throw new Error('No text response returned from Google Gemini');
            }

            return { outputText };
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
