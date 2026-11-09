import { OPENAI_RESPONSES_MODEL } from './openaiModels';

export type ImageQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto';

export type ImageBackground = 'transparent' | 'opaque' | 'auto';

export interface OpenAiResponsesRequest {
    apiKey: string;
    systemPrompt: string;
    userText: string;
    imageDataUrl?: string;
}

export interface OpenAiResponsesResponse {
    outputText: string;
    usage?: unknown;
}

export interface OpenAiResponsesClient {
    createResponse(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse>;
}

export const openAiResponsesClient: OpenAiResponsesClient = {
    async createResponse(request) {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${request.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: OPENAI_RESPONSES_MODEL,
                input: [
                    {
                        role: 'system',
                        content: [{ type: 'input_text', text: request.systemPrompt }],
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'input_text', text: request.userText },
                            ...(request.imageDataUrl
                                ? [{ type: 'input_image', image_url: request.imageDataUrl }]
                                : []),
                        ],
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch((): { error?: { message?: string } } | null => null);
            throw new Error(errorData?.error?.message || `OpenAI API Error: ${response.status}`);
        }

        const data: unknown = await response.json();
        const outputText = extractResponseOutputText(data);

        if (!outputText) {
            throw new Error('No text response returned from OpenAI');
        }

        const usage = extractResponseUsage(data);
        return {
            outputText,
            ...(usage !== undefined ? { usage } : {}),
        };
    },
};

function extractResponseUsage(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
        return undefined;
    }

    return (data as { usage?: unknown }).usage;
}

function extractResponseOutputText(data: unknown) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const record = data as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
    };

    if (typeof record.output_text === 'string' && record.output_text.trim()) {
        return record.output_text;
    }

    const textParts = record.output
        ?.flatMap((item) => item.content ?? [])
        .filter((content): content is { type: 'output_text'; text: string } => content.type === 'output_text' && typeof content.text === 'string')
        .map((content) => content.text.trim())
        .filter(Boolean);

    return textParts && textParts.length > 0 ? textParts.join('\n').trim() : null;
}
