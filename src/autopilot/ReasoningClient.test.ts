import { describe, expect, it, vi } from 'vitest';
import {
    buildGeminiReasoningRequest,
    createGeminiReasoningClient,
    createOpenAiReasoningClient,
    extractGeminiReasoningText,
} from './ReasoningClient';

describe('ReasoningClient', () => {
    it('wraps the OpenAI responses client', async () => {
        const createResponse = vi.fn(async () => ({ outputText: 'translated prompt' }));
        const client = createOpenAiReasoningClient({ createResponse });

        await expect(client.createResponse({
            apiKey: 'sk-test',
            systemPrompt: 'system',
            userText: 'user',
        })).resolves.toEqual({ outputText: 'translated prompt' });

        expect(createResponse).toHaveBeenCalledWith({
            apiKey: 'sk-test',
            systemPrompt: 'system',
            userText: 'user',
        });
    });

    it('builds a Gemini reasoning request with vision input and JSON schema', () => {
        const body = buildGeminiReasoningRequest({
            apiKey: 'google-key',
            systemPrompt: 'return json',
            userText: 'evaluate this',
            imageDataUrl: 'data:image/png;base64,abc123',
            responseSchema: {
                type: 'object',
                properties: { score: { type: 'number' } },
            },
        });

        expect(body.systemInstruction.parts[0]).toEqual({ text: 'return json' });
        expect(body.contents[0].parts).toEqual([
            { text: 'evaluate this' },
            {
                inline_data: {
                    mime_type: 'image/png',
                    data: 'abc123',
                },
            },
        ]);
        expect(body.generationConfig).toEqual({
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: { score: { type: 'number' } },
            },
        });
    });

    it('posts Gemini reasoning requests and extracts text', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            candidates: [{
                content: {
                    parts: [{ text: '{"score":92,"feedback":["close"]}' }],
                },
            }],
        })));
        const client = createGeminiReasoningClient(fetchImpl);

        await expect(client.createResponse({
            apiKey: 'google-key',
            systemPrompt: 'system',
            userText: 'user',
        })).resolves.toEqual({ outputText: '{"score":92,"feedback":["close"]}' });

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': 'google-key',
                },
            }),
        );
    });

    it('extracts text from Gemini response parts', () => {
        expect(extractGeminiReasoningText({
            candidates: [{
                content: { parts: [{ text: 'first' }, { text: 'second' }] },
            }],
        })).toBe('first\nsecond');
        expect(extractGeminiReasoningText({ candidates: [{ content: { parts: [] } }] })).toBeNull();
    });
});
