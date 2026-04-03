import { dataURLtoFile, fileToDataURL } from '../utils/file';
import {
    openAiImageClient,
    type ImageBackground,
    type ImageQuality,
    type OpenAiImageClient,
} from '../utils/openai';

const VALID_GENERATION_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);

export interface GenerateImageInput {
    apiKey: string;
    prompt: string;
    quality: ImageQuality;
    aspectRatio: string;
    background: ImageBackground;
    style: string;
    lighting: string;
    palette: string;
    referenceImages: File[];
}

export interface EditImageInput {
    apiKey: string;
    prompt: string;
    sourceImage: Blob;
    referenceImages: File[];
    quality?: ImageQuality;
}

export interface ImageWorkflow {
    generate(input: GenerateImageInput): Promise<string>;
    edit(input: EditImageInput): Promise<string>;
    serializeReferences(files: File[]): Promise<string[]>;
    hydrateReferences(dataUrls: string[]): File[];
}

export function createImageWorkflow(client: OpenAiImageClient = openAiImageClient): ImageWorkflow {
    return {
        async generate(input) {
            return requestImageDataUrl(client, {
                apiKey: input.apiKey,
                prompt: buildGenerationPrompt(input),
                quality: input.quality,
                size: sanitizeGenerationSize(input.aspectRatio),
                background: input.background,
                referenceImages: input.referenceImages,
            });
        },

        async edit(input) {
            return requestImageDataUrl(client, {
                apiKey: input.apiKey,
                prompt: input.prompt,
                quality: input.quality ?? 'medium',
                referenceImages: [createEditSourceFile(input.sourceImage), ...input.referenceImages],
            });
        },

        serializeReferences(files) {
            return Promise.all(files.map((file) => fileToDataURL(file)));
        },

        hydrateReferences(dataUrls) {
            return dataUrls.map((dataUrl, index) => dataURLtoFile(dataUrl, `ref-${index}.png`));
        },
    };
}

export const imageWorkflow = createImageWorkflow();

const buildGenerationPrompt = (input: GenerateImageInput) => {
    const modifiers: string[] = [];

    if (input.style !== 'none') modifiers.push(input.style);
    if (input.lighting !== 'none') modifiers.push(input.lighting);
    if (input.palette !== 'none') modifiers.push(`color palette: ${input.palette}`);

    return modifiers.length > 0
        ? `${input.prompt}, ${modifiers.join(', ')}`
        : input.prompt;
};

const sanitizeGenerationSize = (size: string) => {
    return VALID_GENERATION_SIZES.has(size) ? size : '1024x1024';
};

const createEditSourceFile = (sourceImage: Blob) => {
    return new File([sourceImage], 'edit-input.png', {
        type: sourceImage.type || 'image/png',
    });
};

const requestImageDataUrl = async (client: OpenAiImageClient, input: {
    apiKey: string;
    prompt: string;
    quality?: ImageQuality;
    size?: string;
    background?: ImageBackground;
    referenceImages?: File[];
}) => {
    const result = await client.createImage(input);

    if (!result.b64_json) {
        throw new Error('No image data returned from OpenAI');
    }

    return `data:image/png;base64,${result.b64_json}`;
};
