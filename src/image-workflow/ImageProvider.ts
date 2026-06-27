import {
    openAiImageClient,
    type ImageBackground,
    type ImageQuality,
    type OpenAiImageClient,
    type OpenAiImageResponse,
} from '../utils/openai';
import { GOOGLE_PROVIDER, OPENAI_PROVIDER, type ImageModelConfig, type NanoBananaAspectRatio, type NanoBananaImageSize, type Provider } from '../utils/openaiModels';

export interface ImageProviderRequest {
    apiKey: string;
    model: ImageModelConfig;
    prompt: string;
    quality?: ImageQuality;
    size?: string;
    background?: ImageBackground;
    aspectRatio?: NanoBananaAspectRatio;
    imageSize?: NanoBananaImageSize;
    preserveSourceDimensions?: boolean;
    batchSize?: number;
    referenceImages?: File[];
    maskImage?: File | Blob | null;
    onPartialImage?: (partial: ImageProviderResponse) => void;
}

export type ImageProviderResponse = OpenAiImageResponse;

export interface ImageProvider {
    generate(request: ImageProviderRequest): Promise<ImageProviderResponse[]>;
    edit(request: ImageProviderRequest): Promise<ImageProviderResponse>;
}

export type ImageProviderRegistry = Partial<Record<Provider, ImageProvider>>;

export function createOpenAiImageProvider(client: OpenAiImageClient = openAiImageClient): ImageProvider {
    const toOpenAiRequest = (request: ImageProviderRequest) => ({
        apiKey: request.apiKey,
        apiModel: request.model.apiModel,
        endpoints: request.model.endpoints,
        prompt: request.prompt,
        quality: request.quality,
        size: request.size,
        background: request.background,
        batchSize: request.batchSize,
        referenceImages: request.referenceImages,
        maskImage: request.maskImage,
        onPartialImage: request.onPartialImage,
    });

    return {
        generate: (request) => client.createImages(toOpenAiRequest(request)),
        edit: (request) => client.createImage(toOpenAiRequest(request)),
    };
}

export const openAiImageProvider = createOpenAiImageProvider();

export function createGoogleImageProvider(fetchImpl: typeof fetch = fetch): ImageProvider {
    const createImage = async (request: ImageProviderRequest): Promise<ImageProviderResponse> => {
        const response = await fetchImpl(request.model.endpoints.generate, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': request.apiKey,
            },
            body: JSON.stringify(await buildGoogleImageRequest(request)),
        });

        if (!response.ok) {
            const errorData = await response.json().catch((): { error?: { message?: string } } | null => null);
            throw new Error(errorData?.error?.message || `Google Gemini API Error: ${response.status}`);
        }

        const data: unknown = await response.json();
        const imageData = extractGoogleImageData(data);
        const usage = extractGoogleUsageMetadata(data);

        if (!imageData) {
            throw new Error('No image returned from Google Gemini. The response may have been text-only or blocked by safety settings.');
        }

        return {
            b64_json: imageData,
            ...(usage ? { usage } : {}),
        };
    };

    return {
        async generate(request) {
            const batchSize = coerceProviderBatchSize(request.batchSize);

            if (batchSize === 1) {
                return [await createImage(request)];
            }

            return Promise.all(Array.from({ length: batchSize }, async () => {
                try {
                    return await createImage({
                        ...request,
                        batchSize: 1,
                    });
                } catch (error) {
                    return {
                        error: error instanceof Error ? error.message : 'Google Gemini image generation failed',
                    };
                }
            }));
        },
        edit: createImage,
    };
}

export const googleImageProvider = createGoogleImageProvider();

export const imageProviderRegistry: ImageProviderRegistry = {
    [OPENAI_PROVIDER]: openAiImageProvider,
    [GOOGLE_PROVIDER]: googleImageProvider,
};

async function buildGoogleImageRequest(request: ImageProviderRequest) {
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
        { text: request.prompt },
    ];

    for (const file of request.referenceImages ?? []) {
        parts.push({
            inline_data: {
                mime_type: file.type || 'image/png',
                data: await fileToBase64(file),
            },
        });
    }

    return {
        contents: [{ parts }],
        generationConfig: {
            responseModalities: ['IMAGE'],
            ...(!request.preserveSourceDimensions
                ? {
                    imageConfig: {
                        aspectRatio: request.aspectRatio ?? '1:1',
                        imageSize: request.imageSize ?? '1K',
                    },
                }
                : {}),
        },
    };
}

async function fileToBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function coerceProviderBatchSize(value: unknown): number {
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

export function extractGoogleImageData(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const record = data as {
        candidates?: Array<{
            content?: {
                parts?: Array<{
                    inlineData?: { data?: unknown };
                    inline_data?: { data?: unknown };
                }>;
            };
        }>;
    };

    const parts = record.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
    const imagePart = parts.find((part) => (
        typeof part.inlineData?.data === 'string' ||
        typeof part.inline_data?.data === 'string'
    ));

    return (imagePart?.inlineData?.data ?? imagePart?.inline_data?.data ?? null) as string | null;
}

export function extractGoogleUsageMetadata(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const usageMetadata = (data as { usageMetadata?: unknown }).usageMetadata;
    if (!usageMetadata || typeof usageMetadata !== 'object' || Array.isArray(usageMetadata)) {
        return null;
    }

    const usage: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(usageMetadata)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            usage[key] = value;
            continue;
        }

        if (key === 'promptTokensDetails' || key === 'candidatesTokensDetails') {
            const details = extractGoogleModalityTokenDetails(value);
            if (details.length > 0) {
                usage[key] = details;
            }
        }
    }

    return Object.keys(usage).length > 0 ? usage : null;
}

function extractGoogleModalityTokenDetails(value: unknown): Array<{ modality: string; tokenCount: number }> {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return [];
        }

        const record = item as { modality?: unknown; tokenCount?: unknown };
        return typeof record.modality === 'string'
            && typeof record.tokenCount === 'number'
            && Number.isFinite(record.tokenCount)
            ? [{ modality: record.modality, tokenCount: record.tokenCount }]
            : [];
    });
}
