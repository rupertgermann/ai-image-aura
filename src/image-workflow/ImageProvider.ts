import {
    openAiImageClient,
    type ImageBackground,
    type ImageQuality,
    type OpenAiImageClient,
    type OpenAiImageResponse,
} from '../utils/openai';
import { OPENAI_PROVIDER, type ImageModelConfig, type Provider } from '../utils/openaiModels';

export interface ImageProviderRequest {
    apiKey: string;
    model: ImageModelConfig;
    prompt: string;
    quality?: ImageQuality;
    size?: string;
    background?: ImageBackground;
    referenceImages?: File[];
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
    });

    return {
        generate: createImage,
        edit: createImage,
    };
}

export const openAiImageProvider = createOpenAiImageProvider();

export const imageProviderRegistry: ImageProviderRegistry = {
    [OPENAI_PROVIDER]: openAiImageProvider,
};
