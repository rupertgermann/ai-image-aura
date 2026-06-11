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
    referenceImages?: File[];
    maskImage?: File | Blob | null;
}

export type ImageProviderResponse = OpenAiImageResponse;

export interface ImageProvider {
    generate(request: ImageProviderRequest): Promise<ImageProviderResponse>;
    edit(request: ImageProviderRequest): Promise<ImageProviderResponse>;
}

export type ImageProviderRegistry = Partial<Record<Provider, ImageProvider>>;

export function createOpenAiImageProvider(client: OpenAiImageClient = openAiImageClient): ImageProvider {
    const createImage = (request: ImageProviderRequest) => client.createImage({
        apiKey: request.apiKey,
        apiModel: request.model.apiModel,
        endpoints: request.model.endpoints,
        prompt: request.prompt,
        quality: request.quality,
        size: request.size,
        background: request.background,
        referenceImages: request.referenceImages,
        maskImage: request.maskImage,
    });

    return {
        generate: createImage,
        edit: createImage,
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

        if (!imageData) {
            throw new Error('No image returned from Google Gemini. The response may have been text-only or blocked by safety settings.');
        }

        return { b64_json: imageData };
    };

    return {
        generate: createImage,
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
