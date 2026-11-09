import { createOpenAiTransformMask } from '../editor/transformMask';
import type { ImageQuality } from '../utils/openai';
import type { ImageProvider, ImageProviderRequest, ImageProviderResponse } from './ImageProvider';

export const openAiImageProvider: ImageProvider = {
    async edit(request) {
        const images = await requestOpenAiImages({
            ...request,
            batchSize: 1,
        });

        return images[0];
    },

    generate(request) {
        return requestOpenAiImages(request);
    },
};

const OPENAI_PARTIAL_IMAGE_COUNT = 3;

async function requestOpenAiImages(request: ImageProviderRequest): Promise<ImageProviderResponse[]> {
    const isEdit = request.referenceImages && request.referenceImages.length > 0;
    const { apiModel, endpoints } = request.model;
    const endpoint = isEdit ? endpoints.edit : endpoints.generate;
    const batchSize = coerceOpenAiBatchSize(request.batchSize);
    const streamPartialImages = Boolean(request.onPartialImage) && batchSize === 1 && request.model.capabilities.partialImageStreaming;

    let body: BodyInit;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${request.credential}`,
    };

    if (isEdit) {
        const formData = new FormData();
        formData.append('model', apiModel);
        formData.append('prompt', request.prompt);
        formData.append('n', String(batchSize));

        request.referenceImages?.forEach((file) => {
            formData.append('image[]', file);
        });

        const sourceImage = request.referenceImages?.[0];
        if (request.maskImage && sourceImage) {
            formData.append('mask', await createOpenAiTransformMask(request.maskImage, sourceImage), 'transform-mask.png');
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
        throw new Error(errorData?.error?.message || `OpenAI API Error: ${response.status}`);
    }

    if (streamPartialImages && isEventStreamResponse(response)) {
        return readOpenAiImageStream(response, request.onPartialImage);
    }

    const data: unknown = await response.json();
    if (!isRecord(data) || (data.data !== undefined && !Array.isArray(data.data))) {
        throw new Error('Malformed response from OpenAI');
    }
    if (!Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('No image data returned from OpenAI');
    }

    const images = data.data;
    return images.map((image) => {
        if (!isRecord(image) || (typeof image.b64_json !== 'string' && typeof image.error !== 'string')) {
            return { error: 'Malformed image result from OpenAI' };
        }
        return {
            ...(typeof image.b64_json === 'string' ? { b64_json: image.b64_json } : {}),
            ...(typeof image.error === 'string' ? { error: image.error } : {}),
            ...(typeof image.revised_prompt === 'string' ? { revised_prompt: image.revised_prompt } : {}),
            ...(typeof image.size === 'string' ? { size: image.size } : typeof data.size === 'string' ? { size: data.size } : {}),
            ...(typeof image.quality === 'string' ? { quality: image.quality } : typeof data.quality === 'string' ? { quality: data.quality } : {}),
            ...(image.usage !== undefined ? { usage: image.usage } : data.usage !== undefined ? {
                usage: data.usage,
                usageScope: images.length > 1 ? 'request' as const : 'result' as const,
                usageImageCount: images.length,
            } : {}),
        };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEventStreamResponse(response: Response) {
    return response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') ?? false;
}

async function readOpenAiImageStream(
    response: Response,
    onPartialImage: ((partial: ImageProviderResponse) => void) | undefined,
): Promise<ImageProviderResponse[]> {
    const reader = response.body?.getReader();

    if (!reader) {
        return parseOpenAiImageEventStream(await response.text(), onPartialImage);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const completed = {
        images: null as ImageProviderResponse[] | null,
    };
    const processBlock = (block: string) => {
        if (completed.images) return;
        const nextImages = parseOpenAiImageEventBlock(block, onPartialImage);
        if (nextImages) {
            completed.images = nextImages;
        }
    };

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (value) {
                buffer += decoder.decode(value, { stream: !done });
                buffer = drainEventStreamBlocks(buffer, processBlock);
            }

            if (completed.images) break;

            if (done) {
                buffer += decoder.decode();
                break;
            }
        }

        if (!completed.images && buffer.trim()) {
            processBlock(buffer);
        }

        const completedImages = completed.images;
        if (!completedImages || completedImages.length === 0) {
            throw new Error('No image data returned from OpenAI');
        }

        return completedImages;
    } finally {
        // A failed transport cleanup must not discard a completed image or replace the read error.
        void reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

function parseOpenAiImageEventStream(
    eventStream: string,
    onPartialImage: ((partial: ImageProviderResponse) => void) | undefined,
) {
    let completedImages: ImageProviderResponse[] | null = null;
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
    onPartialImage: ((partial: ImageProviderResponse) => void) | undefined,
): ImageProviderResponse[] | null {
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
                // Ignore preview callback errors so they do not reject the generation request.
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
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function extractImageResponses(
    value: unknown,
    inheritedParameters: Pick<ImageProviderResponse, 'size' | 'quality' | 'usage' | 'usageScope' | 'usageImageCount'> = {},
): ImageProviderResponse[] {
    if (!isRecord(value)) {
        return [];
    }

    const record = value;
    const actualParameters = {
        size: typeof record.size === 'string' ? record.size : inheritedParameters.size,
        quality: typeof record.quality === 'string' ? record.quality : inheritedParameters.quality,
        usage: record.usage !== undefined ? record.usage : inheritedParameters.usage,
        usageScope: record.usage !== undefined ? 'request' as const : inheritedParameters.usageScope,
        usageImageCount: inheritedParameters.usageImageCount,
    };
    if (Array.isArray(record.data)) {
        const imageCount = record.data.length;
        return record.data.map((item) => extractImageResponses(item, {
            ...actualParameters,
            usageImageCount: imageCount,
        })[0] ?? { error: 'Malformed image result from OpenAI' });
    }

    if (isRecord(record.data)) {
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
                ...(record.usage === undefined && actualParameters.usageImageCount ? { usageImageCount: actualParameters.usageImageCount } : {}),
            } : {}),
        }]
        : [];
}

function extractImageB64Json(value: unknown): string | null {
    if (Array.isArray(value)) {
        return value.map(extractImageB64Json).find((item): item is string => Boolean(item)) ?? null;
    }

    if (!isRecord(value)) {
        return null;
    }

    const record = value;
    for (const key of ['b64_json', 'partial_image_b64', 'image_b64', 'b64']) {
        if (typeof record[key] === 'string') {
            return record[key];
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
