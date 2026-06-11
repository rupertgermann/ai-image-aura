import { IMAGE_MODEL_REGISTRY, OPENAI_IMAGE_MODEL, OPENAI_RESPONSES_MODEL } from './openaiModels';

export type ImageQuality = 'low' | 'medium' | 'high';

export type ImageBackground = 'transparent' | 'opaque' | 'auto';

export interface OpenAiImageRequest {
    apiKey: string;
    model?: string;
    apiModel?: string;
    endpoints?: {
        generate: string;
        edit: string;
    };
    prompt: string;
    quality?: ImageQuality;
    size?: string;
    background?: ImageBackground;
    batchSize?: number;
    referenceImages?: File[];
    maskImage?: File | Blob | null;
}

export interface OpenAiImageResponse {
    b64_json?: string;
    revised_prompt?: string;
    size?: string;
    quality?: string;
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
    createImages(request: OpenAiImageRequest): Promise<OpenAiImageResponse[]>;
}

export interface OpenAiResponsesClient {
    createResponse(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse>;
}

export const openAiImageClient: OpenAiImageClient = {
    async createImage(request) {
        const images = await requestOpenAiImages({
            ...request,
            batchSize: 1,
        });

        return images[0];
    },

    createImages(request) {
        return requestOpenAiImages(request);
    },
};

async function requestOpenAiImages(request: OpenAiImageRequest): Promise<OpenAiImageResponse[]> {
    const isEdit = request.referenceImages && request.referenceImages.length > 0;
    const apiModel = request.apiModel ?? request.model ?? OPENAI_IMAGE_MODEL;
    const endpoints = request.endpoints ?? IMAGE_MODEL_REGISTRY[OPENAI_IMAGE_MODEL].endpoints;
    const endpoint = isEdit ? endpoints.edit : endpoints.generate;
    const batchSize = coerceOpenAiBatchSize(request.batchSize);

    let body: BodyInit;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${request.apiKey}`,
    };

    if (isEdit) {
        const formData = new FormData();
        formData.append('model', apiModel);
        formData.append('prompt', request.prompt);
        formData.append('n', String(batchSize));

        request.referenceImages?.forEach((file) => {
            formData.append('image[]', file);
        });

        if (request.maskImage) {
            formData.append('mask', request.maskImage);
        }

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
            model: apiModel,
            prompt: request.prompt,
            n: batchSize,
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

    const data: {
        data?: OpenAiImageResponse[];
        size?: string;
        quality?: string;
    } = await response.json();

    if (!data.data || data.data.length === 0) {
        throw new Error('No image data returned from OpenAI');
    }

    return data.data.map((image) => ({
        ...image,
        ...(image.size === undefined && data.size !== undefined ? { size: data.size } : {}),
        ...(image.quality === undefined && data.quality !== undefined ? { quality: data.quality } : {}),
    }));
}

function coerceOpenAiBatchSize(value: unknown): number {
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string'
            ? Number(value.trim())
            : NaN;

    if (!Number.isFinite(parsed)) {
        return 1;
    }

    return Math.min(4, Math.max(1, Math.trunc(parsed)));
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
