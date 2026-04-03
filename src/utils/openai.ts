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

export interface OpenAiImageClient {
    createImage(request: OpenAiImageRequest): Promise<OpenAiImageResponse>;
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
