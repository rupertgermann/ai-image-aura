export const generateImageWithGPTImage15 = async (
    apiKey: string,
    prompt: string,
    params: {
        quality?: 'low' | 'medium' | 'high';
        size?: string;
        background?: 'transparent' | 'opaque' | 'auto';
    }
) => {
    const endpoint = 'https://api.openai.com/v1/images/generations';

    const body: any = {
        model: "gpt-image-1.5",
        prompt,
        n: 1,
    };

    // Add optional params only if they are not default 'auto' to avoid 400s if some values are buggy
    if (params.size && params.size !== 'auto') body.size = params.size;
    if (params.quality) body.quality = params.quality;
    if (params.background && params.background !== 'auto') body.background = params.background;

    console.log('OpenAI API Request Body:', JSON.stringify(body, null, 2));

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI Error Response:', errorData);
        throw new Error(errorData.error?.message || `OpenAI API Error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
        throw new Error('No image data returned from OpenAI');
    }

    return data.data[0];
};
