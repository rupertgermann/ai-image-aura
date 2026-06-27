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
    onPartialImage?: (partial: OpenAiImageResponse) => void;
}

export interface OpenAiImageResponse {
    b64_json?: string;
    error?: string;
    revised_prompt?: string;
    size?: string;
    quality?: string;
    usage?: unknown;
    usageScope?: 'result' | 'request';
    usageImageCount?: number;
}

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

const OPENAI_PARTIAL_IMAGE_COUNT = 3;

async function requestOpenAiImages(request: OpenAiImageRequest): Promise<OpenAiImageResponse[]> {
    const isEdit = request.referenceImages && request.referenceImages.length > 0;
    const apiModel = request.apiModel ?? request.model ?? OPENAI_IMAGE_MODEL;
    const endpoints = request.endpoints ?? IMAGE_MODEL_REGISTRY[OPENAI_IMAGE_MODEL].endpoints;
    const endpoint = isEdit ? endpoints.edit : endpoints.generate;
    const batchSize = coerceOpenAiBatchSize(request.batchSize);
    const streamPartialImages = Boolean(request.onPartialImage) && batchSize === 1 && supportsOpenAiImageStreaming(apiModel);

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
        if (streamPartialImages) {
            formData.append('stream', 'true');
            formData.append('partial_images', String(OPENAI_PARTIAL_IMAGE_COUNT));
        }

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
            stream?: boolean;
            partial_images?: number;
        } = {
            model: apiModel,
            prompt: request.prompt,
            n: batchSize,
        };
        if (request.size && request.size !== 'auto') jsonBody.size = request.size;
        if (request.quality) jsonBody.quality = request.quality;
        if (request.background && request.background !== 'auto') jsonBody.background = request.background;
        if (streamPartialImages) {
            jsonBody.stream = true;
            jsonBody.partial_images = OPENAI_PARTIAL_IMAGE_COUNT;
        }

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

    if (streamPartialImages && isEventStreamResponse(response)) {
        return readOpenAiImageStream(response, request.onPartialImage);
    }

    const data: {
        data?: OpenAiImageResponse[];
        size?: string;
        quality?: string;
        usage?: unknown;
    } = await response.json();

    if (!data.data || data.data.length === 0) {
        throw new Error('No image data returned from OpenAI');
    }

    return data.data.map((image) => ({
        ...image,
        ...(image.size === undefined && data.size !== undefined ? { size: data.size } : {}),
        ...(image.quality === undefined && data.quality !== undefined ? { quality: data.quality } : {}),
        ...(image.usage === undefined && data.usage !== undefined ? {
            usage: data.usage,
            usageScope: data.data && data.data.length > 1 ? 'request' as const : 'result' as const,
            usageImageCount: data.data?.length ?? 1,
        } : {}),
    }));
}

function supportsOpenAiImageStreaming(apiModel: string) {
    return apiModel === OPENAI_IMAGE_MODEL;
}

function isEventStreamResponse(response: Response) {
    return response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') ?? false;
}

async function readOpenAiImageStream(
    response: Response,
    onPartialImage: ((partial: OpenAiImageResponse) => void) | undefined,
): Promise<OpenAiImageResponse[]> {
    const reader = response.body?.getReader();

    if (!reader) {
        return parseOpenAiImageEventStream(await response.text(), onPartialImage);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const completed = {
        images: null as OpenAiImageResponse[] | null,
    };
    const processBlock = (block: string) => {
        const nextImages = parseOpenAiImageEventBlock(block, onPartialImage);
        if (nextImages) {
            completed.images = nextImages;
        }
    };

    while (true) {
        const { value, done } = await reader.read();
        if (value) {
            buffer += decoder.decode(value, { stream: !done });
            buffer = drainEventStreamBlocks(buffer, processBlock);
        }

        if (done) {
            buffer += decoder.decode();
            break;
        }
    }

    if (buffer.trim()) {
        processBlock(buffer);
    }

    const completedImages = completed.images;
    if (!completedImages || completedImages.length === 0) {
        throw new Error('No image data returned from OpenAI');
    }

    return completedImages;
}

function parseOpenAiImageEventStream(
    eventStream: string,
    onPartialImage: ((partial: OpenAiImageResponse) => void) | undefined,
) {
    let completedImages: OpenAiImageResponse[] | null = null;
    const buffer = drainEventStreamBlocks(eventStream, (block) => {
        const nextImages = parseOpenAiImageEventBlock(block, onPartialImage);
        if (nextImages) {
            completedImages = nextImages;
        }
    });

    if (buffer.trim()) {
        const nextImages = parseOpenAiImageEventBlock(buffer, onPartialImage);
        if (nextImages) {
            completedImages = nextImages;
        }
    }

    if (!completedImages || completedImages.length === 0) {
        throw new Error('No image data returned from OpenAI');
    }

    return completedImages;
}

function drainEventStreamBlocks(buffer: string, onBlock: (block: string) => void) {
    let remaining = buffer;

    while (true) {
        const separator = remaining.match(/\r?\n\r?\n/);
        if (!separator || separator.index === undefined) {
            return remaining;
        }

        const block = remaining.slice(0, separator.index);
        remaining = remaining.slice(separator.index + separator[0].length);
        if (block.trim()) {
            onBlock(block);
        }
    }
}

function parseOpenAiImageEventBlock(
    block: string,
    onPartialImage: ((partial: OpenAiImageResponse) => void) | undefined,
): OpenAiImageResponse[] | null {
    const event = parseServerSentEvent(block);
    if (!event.data || event.data === '[DONE]') {
        return null;
    }

    const payload = parseJsonRecord(event.data);
    if (!payload) {
        return null;
    }

    const eventType = [
        event.name,
        typeof payload.type === 'string' ? payload.type : '',
        typeof payload.event === 'string' ? payload.event : '',
    ].join(' ').toLowerCase();

    if (eventType.includes('partial_image')) {
        const b64Json = extractImageB64Json(payload);
        if (b64Json && onPartialImage) {
            try {
                onPartialImage({ b64_json: b64Json });
            } catch {
                // Partial previews are opportunistic; the final generation should still resolve.
            }
        }
        return null;
    }

    const images = extractImageResponses(payload);
    if (images.length > 0 && (eventType.includes('completed') || eventType.includes('complete') || !event.name)) {
        return images;
    }

    return null;
}

function parseServerSentEvent(block: string) {
    const dataLines: string[] = [];
    let name = '';

    block.split(/\r?\n/).forEach((line) => {
        if (line.startsWith('event:')) {
            name = line.slice('event:'.length).trim();
            return;
        }

        if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trimStart());
        }
    });

    return {
        name,
        data: dataLines.join('\n').trim(),
    };
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function extractImageResponses(
    value: unknown,
    inheritedParameters: Pick<OpenAiImageResponse, 'size' | 'quality' | 'usage' | 'usageScope' | 'usageImageCount'> = {},
): OpenAiImageResponse[] {
    if (typeof value !== 'object' || value === null) {
        return [];
    }

    const record = value as Record<string, unknown>;
    const actualParameters = {
        size: typeof record.size === 'string' ? record.size : inheritedParameters.size,
        quality: typeof record.quality === 'string' ? record.quality : inheritedParameters.quality,
        usage: record.usage !== undefined ? record.usage : inheritedParameters.usage,
        usageScope: record.usage !== undefined ? 'request' as const : inheritedParameters.usageScope,
        usageImageCount: inheritedParameters.usageImageCount,
    };
    if (Array.isArray(record.data)) {
        const images = record.data.flatMap((item) => extractImageResponses(item, actualParameters));
        if (record.usage !== undefined) {
            return images.map((image) => ({
                ...image,
                usage: image.usage ?? record.usage,
                usageScope: 'request',
                usageImageCount: images.length,
            }));
        }

        return images;
    }

    if (typeof record.data === 'object' && record.data !== null) {
        return extractImageResponses(record.data, actualParameters);
    }

    const b64Json = extractImageB64Json(record);
    return b64Json
        ? [{
            b64_json: b64Json,
            ...(typeof record.revised_prompt === 'string' ? { revised_prompt: record.revised_prompt } : {}),
            ...(actualParameters.size ? { size: actualParameters.size } : {}),
            ...(actualParameters.quality ? { quality: actualParameters.quality } : {}),
            ...(record.usage !== undefined || actualParameters.usage !== undefined ? {
                usage: record.usage ?? actualParameters.usage,
                usageScope: record.usage !== undefined ? 'result' : actualParameters.usageScope,
                ...(actualParameters.usageImageCount ? { usageImageCount: actualParameters.usageImageCount } : {}),
            } : {}),
        }]
        : [];
}

function extractImageB64Json(value: unknown): string | null {
    if (Array.isArray(value)) {
        return value.map(extractImageB64Json).find((item): item is string => Boolean(item)) ?? null;
    }

    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['b64_json', 'partial_image_b64', 'image_b64', 'b64']) {
        if (typeof record[key] === 'string') {
            return record[key] as string;
        }
    }

    return extractImageB64Json(record.partial_image)
        ?? extractImageB64Json(record.image)
        ?? extractImageB64Json(record.data);
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

        return {
            outputText,
            ...(extractResponseUsage(data) !== undefined ? { usage: extractResponseUsage(data) } : {}),
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
