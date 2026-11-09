import { describe, expect, it, vi } from 'vitest';
import { openAiResponsesClient } from './openai';

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
                model: 'gpt-6-sol',
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

    it('preserves Responses API usage for reasoning cost calculation', async () => {
        const usage = {
            input_tokens: 1000,
            output_tokens: 200,
            total_tokens: 1200,
            input_tokens_details: {
                cached_tokens: 100,
            },
        };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            output_text: 'summary',
            usage,
        })));

        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(openAiResponsesClient.createResponse({
                apiKey: 'res-key',
                systemPrompt: 'act',
                userText: 'describe',
            })).resolves.toEqual({
                outputText: 'summary',
                usage,
            });
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
