export type ImageQuality = 'low' | 'medium' | 'high';

export type ImageBackground = 'transparent' | 'opaque' | 'auto';

export interface OpenAiImageRequest {
    apiKey: string;
    prompt: string;
    quality?: ImageQuality;
    size?: string;
    background?: ImageBackground;
    referenceImages?: File[];
}

export interface OpenAiImageResponse {
    b64_json?: string;
}

export interface OpenAiResponsesRequest {
    apiKey: string;
    systemPrompt: string;
    userText: string;
    imageDataUrl?: string;
}

export interface OpenAiResponsesResponse {
    outputText: string;
}

export interface OpenAiImageClient {
    createImage(request: OpenAiImageRequest): Promise<OpenAiImageResponse>;
}

export interface OpenAiResponsesClient {
    createResponse(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse>;
}

export const openAiImageClient: OpenAiImageClient = {
    async createImage(request) {
        const isEdit = request.referenceImages && request.referenceImages.length > 0;
        const endpoint = isEdit
            ? 'https://api.openai.com/v1/images/edits'
            : 'https://api.openai.com/v1/images/generations';

        let body: BodyInit;
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${request.apiKey}`,
        };

        if (isEdit) {
            const formData = new FormData();
            formData.append('model', 'gpt-image-1.5');
            formData.append('prompt', request.prompt);
            formData.append('n', '1');

            request.referenceImages?.forEach((file) => {
                formData.append('image[]', file);
            });

            if (request.size && request.size !== 'auto') formData.append('size', request.size);
            if (request.quality) formData.append('quality', request.quality);
            if (request.background && request.background !== 'auto') formData.append('background', request.background);

            body = formData;
        } else {
            headers['Content-Type'] = 'application/json';
            const jsonBody: {
                model: string;
                prompt: string;
                n: number;
                size?: string;
                quality?: ImageQuality;
                background?: 'transparent' | 'opaque';
            } = {
                model: 'gpt-image-1.5',
                prompt: request.prompt,
                n: 1,
            };
            if (request.size && request.size !== 'auto') jsonBody.size = request.size;
            if (request.quality) jsonBody.quality = request.quality;
            if (request.background && request.background !== 'auto') jsonBody.background = request.background;

            body = JSON.stringify(jsonBody);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body,
        });

        if (!response.ok) {
            const errorData = await response.json().catch((): { error?: { message?: string } } | null => null);
            throw new Error(errorData.error?.message || `OpenAI API Error: ${response.status}`);
        }

        const data: { data?: OpenAiImageResponse[] } = await response.json();

        if (!data.data || data.data.length === 0) {
            throw new Error('No image data returned from OpenAI');
        }

        return data.data[0];
    },
};

export const openAiResponsesClient: OpenAiResponsesClient = {
    async createResponse(request) {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${request.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o',
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

        return { outputText };
    },
};

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
