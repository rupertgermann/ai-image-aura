export const generateImageWithGPTImage15 = async (
    apiKey: string,
    prompt: string,
    params: {
        quality?: 'low' | 'medium' | 'high';
        size?: string;
        background?: 'transparent' | 'opaque' | 'auto';
        referenceImages?: File[];
    }
) : Promise<{ b64_json?: string }> => {
    const isEdit = params.referenceImages && params.referenceImages.length > 0;
    const endpoint = isEdit
        ? 'https://api.openai.com/v1/images/edits'
        : 'https://api.openai.com/v1/images/generations';

    let body: BodyInit;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
    };

    if (isEdit) {
        // multipart/form-data for edits/references
        const formData = new FormData();
        formData.append('model', 'gpt-image-1.5');
        formData.append('prompt', prompt);
        formData.append('n', '1');

        params.referenceImages?.forEach(file => {
            formData.append('image[]', file);
        });

        if (params.size && params.size !== 'auto') formData.append('size', params.size);
        if (params.quality) formData.append('quality', params.quality);
        if (params.background && params.background !== 'auto') formData.append('background', params.background);

        body = formData;
        // Do NOT set Content-Type header when using FormData; fetch sets it automatically with the boundary
    } else {
        // JSON for standard generations
        headers['Content-Type'] = 'application/json';
        const jsonBody: {
            model: string;
            prompt: string;
            n: number;
            size?: string;
            quality?: 'low' | 'medium' | 'high';
            background?: 'transparent' | 'opaque';
        } = {
            model: "gpt-image-1.5",
            prompt,
            n: 1,
        };
        if (params.size && params.size !== 'auto') jsonBody.size = params.size;
        if (params.quality) jsonBody.quality = params.quality;
        if (params.background && params.background !== 'auto') jsonBody.background = params.background;

        body = JSON.stringify(jsonBody);
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body
    });

    if (!response.ok) {
        const errorData = await response.json().catch((): { error?: { message?: string } } | null => null);
        throw new Error(errorData.error?.message || `OpenAI API Error: ${response.status}`);
    }

    const data: { data?: Array<{ b64_json?: string }> } = await response.json();

    if (!data.data || data.data.length === 0) {
        throw new Error('No image data returned from OpenAI');
    }

    return data.data[0];
};
