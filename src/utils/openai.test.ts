import { describe, expect, it, vi } from 'vitest';
import { openAiImageClient } from './openai';
import { openAiResponsesClient } from './openai';
import { OPENAI_IMAGE_MODEL } from './openaiModels';
import { OPENAI_RESPONSES_MODEL } from './openaiModels';

describe('openAiImageClient', () => {
    it('posts image generation requests to the OpenAI image generation endpoint', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            data: [{ b64_json: 'generated' }],
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await openAiImageClient.createImage({
                apiKey: 'sk-test',
                prompt: 'a cat in a hat',
                size: '1024x1024',
                quality: 'high',
                background: 'transparent',
            });

            expect(result).toEqual({ b64_json: 'generated' });

            const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            expect(url).toBe('https://api.openai.com/v1/images/generations');
            expect(request.method).toBe('POST');

            const headers = request.headers as Record<string, string>;
            expect(headers.Authorization).toBe('Bearer sk-test');
            expect(headers['Content-Type']).toBe('application/json');

            const body = JSON.parse(String(request.body));
            expect(body).toEqual({
                model: OPENAI_IMAGE_MODEL,
                prompt: 'a cat in a hat',
                n: 1,
                size: '1024x1024',
                quality: 'high',
                background: 'transparent',
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('extracts revised prompt and actual parameters from image responses', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            size: '1536x1024',
            quality: 'high',
            data: [{ b64_json: 'generated', revised_prompt: 'a refined cat prompt' }],
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await openAiImageClient.createImage({
                apiKey: 'sk-test',
                prompt: 'a cat',
                size: 'auto',
                quality: 'medium',
            });

            expect(result).toEqual({
                b64_json: 'generated',
                revised_prompt: 'a refined cat prompt',
                size: '1536x1024',
                quality: 'high',
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('posts batched image generation requests with native n and returns every image payload', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            data: [
                { b64_json: 'generated-0' },
                { b64_json: 'generated-1' },
                { b64_json: 'generated-2' },
            ],
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await openAiImageClient.createImages({
                apiKey: 'sk-test',
                prompt: 'three cats',
                batchSize: 3,
            });

            expect(result).toEqual([
                { b64_json: 'generated-0' },
                { b64_json: 'generated-1' },
                { b64_json: 'generated-2' },
            ]);

            const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            const body = JSON.parse(String(request.body));
            expect(body).toMatchObject({
                n: 3,
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('streams partial image events and resolves with the completed image', async () => {
        const fetchMock = vi.fn(async () => createSseResponse([
            'event: image_generation.partial_image\ndata: {"type":"image_generation.partial_image","b64_json":"partial-0"}\n\n',
            'event: image_generation.partial_image\ndata: {"type":"image_generation.partial_image","partial_image":{"b64_json":"partial-1"}}\n\n',
            'event: image_generation.completed\ndata: {"type":"image_generation.completed","size":"1536x1024","quality":"high","data":[{"b64_json":"final","revised_prompt":"a refined slow cat"}]}\n\n',
        ]));
        const partials: Array<{ b64_json?: string }> = [];

        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await openAiImageClient.createImage({
                apiKey: 'sk-test',
                prompt: 'a cat appearing slowly',
                onPartialImage: (partial) => partials.push(partial),
            });

            expect(result).toEqual({
                b64_json: 'final',
                revised_prompt: 'a refined slow cat',
                size: '1536x1024',
                quality: 'high',
            });
            expect(partials).toEqual([
                { b64_json: 'partial-0' },
                { b64_json: 'partial-1' },
            ]);

            const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            const body = JSON.parse(String(request.body));
            expect(body).toMatchObject({
                stream: true,
                partial_images: 3,
                n: 1,
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('falls back to the normal JSON response when streaming is requested but SSE is not returned', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            data: [{ b64_json: 'generated' }],
        }), {
            headers: { 'Content-Type': 'application/json' },
        }));
        const onPartialImage = vi.fn();

        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await openAiImageClient.createImage({
                apiKey: 'sk-test',
                prompt: 'a cat in a hat',
                onPartialImage,
            });

            expect(result).toEqual({ b64_json: 'generated' });
            expect(onPartialImage).not.toHaveBeenCalled();

            const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            const body = JSON.parse(String(request.body));
            expect(body.stream).toBe(true);
            expect(body.partial_images).toBe(3);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not request streaming for batched image generation', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            data: [
                { b64_json: 'generated-0' },
                { b64_json: 'generated-1' },
            ],
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            await openAiImageClient.createImages({
                apiKey: 'sk-test',
                prompt: 'two cats',
                batchSize: 2,
                onPartialImage: vi.fn(),
            });

            const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            const body = JSON.parse(String(request.body));
            expect(body.stream).toBeUndefined();
            expect(body.partial_images).toBeUndefined();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('posts image edit requests with multipart form data to the edit endpoint', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            data: [{ b64_json: 'edited' }],
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            const referenceImage = new File(['source image'], 'source.png', { type: 'image/png' });
            const maskImage = new File(['mask image'], 'mask.png', { type: 'image/png' });
            const result = await openAiImageClient.createImage({
                apiKey: 'sk-test',
                prompt: 'replace the cat',
                referenceImages: [referenceImage],
                maskImage,
                model: OPENAI_IMAGE_MODEL,
                quality: 'low',
                size: '1024x1024',
                background: 'opaque',
            });

            expect(result).toEqual({ b64_json: 'edited' });
            expect(fetchMock).toHaveBeenCalledTimes(1);

            const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            expect(url).toBe('https://api.openai.com/v1/images/edits');
            expect(request.method).toBe('POST');

            const headers = request.headers as Record<string, string>;
            expect(headers.Authorization).toBe('Bearer sk-test');
            expect(headers['Content-Type']).toBeUndefined();

            const form = request.body as FormData;
            const formEntries = Array.from(form.entries());
            const fileValues = formEntries.filter(([name]) => name === 'image[]');

            expect(form.get('model')).toBe(OPENAI_IMAGE_MODEL);
            expect(form.get('prompt')).toBe('replace the cat');
            expect(form.get('n')).toBe('1');
            expect(form.get('quality')).toBe('low');
            expect(form.get('background')).toBe('opaque');
            expect(form.get('size')).toBe('1024x1024');
            expect(form.get('mask')).toBe(maskImage);
            expect(fileValues).toHaveLength(1);
            expect(fileValues[0]?.[1]).toBeInstanceOf(File);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('throws a formatted error when OpenAI responds with an error payload', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            error: { message: 'rate limit exceeded' },
        }), { status: 429 }));

        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(openAiImageClient.createImage({
                apiKey: 'sk-test',
                prompt: 'a cat in a hat',
            })).rejects.toThrow('rate limit exceeded');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('throws when OpenAI returns no image payload', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({})));

        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(openAiImageClient.createImage({
                apiKey: 'sk-test',
                prompt: 'a cat in a hat',
            })).rejects.toThrow('No image data returned from OpenAI');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

function createSseResponse(chunks: string[]) {
    const encoder = new TextEncoder();

    return new Response(new ReadableStream({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
            controller.close();
        },
    }), {
        headers: { 'Content-Type': 'text/event-stream' },
    });
}

describe('openAiResponsesClient', () => {
    it('posts image reasoning requests to the responses endpoint', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            output_text: 'summary of image',
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await openAiResponsesClient.createResponse({
                apiKey: 'res-key',
                systemPrompt: 'act as a concise critic',
                userText: 'what is in this image?',
                imageDataUrl: 'data:image/png;base64,abc123',
            });

            expect(result).toEqual({ outputText: 'summary of image' });

            const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            expect(url).toBe('https://api.openai.com/v1/responses');
            expect(request.method).toBe('POST');

            const headers = request.headers as Record<string, string>;
            expect(headers.Authorization).toBe('Bearer res-key');
            expect(headers['Content-Type']).toBe('application/json');

            const body = JSON.parse(String(request.body));
            expect(body).toEqual({
                model: OPENAI_RESPONSES_MODEL,
                input: [
                    {
                        role: 'system',
                        content: [{ type: 'input_text', text: 'act as a concise critic' }],
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'input_text', text: 'what is in this image?' },
                            { type: 'input_image', image_url: 'data:image/png;base64,abc123' },
                        ],
                    },
                ],
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('falls back to output content extraction when output_text is missing', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            output: [{ content: [{ type: 'output_text', text: 'fallback text' }] }],
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await openAiResponsesClient.createResponse({
                apiKey: 'res-key',
                systemPrompt: 'analyze this',
                userText: 'describe',
            });

            expect(result).toEqual({ outputText: 'fallback text' });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('throws a formatted error when responses endpoint returns an error payload', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            error: { message: 'invalid schema' },
        }), { status: 400 }));

        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(openAiResponsesClient.createResponse({
                apiKey: 'res-key',
                systemPrompt: 'act',
                userText: 'broken',
            })).rejects.toThrow('invalid schema');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('throws when responses payload has no text output', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            output: [{ content: [{ type: 'text', text: 'none' }] }],
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(openAiResponsesClient.createResponse({
                apiKey: 'res-key',
                systemPrompt: 'act',
                userText: 'none',
            })).rejects.toThrow('No text response returned from OpenAI');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('omits the image input when imageDataUrl is not provided', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            output_text: 'no image',
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            await openAiResponsesClient.createResponse({
                apiKey: 'res-key',
                systemPrompt: 'act',
                userText: 'just text please',
            });

            const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            const body = JSON.parse(String(request.body));
            const userContent = body.input[1].content;

            expect(userContent).toEqual([
                { type: 'input_text', text: 'just text please' },
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
