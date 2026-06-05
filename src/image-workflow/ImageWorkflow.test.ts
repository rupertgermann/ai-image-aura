import { describe, expect, it, vi } from 'vitest';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import { createImageWorkflow, type ImageProviderRegistry } from './ImageWorkflow';
import { createGoogleImageProvider, extractGoogleImageData } from './ImageProvider';

describe('ImageWorkflow', () => {
    it('routes generate requests through the configured provider for the selected model', async () => {
        const generate = vi.fn(async () => ({ b64_json: 'generated' }));
        const providers: ImageProviderRegistry = {
            openai: {
                generate,
                edit: vi.fn(),
            },
        };

        const workflow = createImageWorkflow(providers);

        const dataUrl = await workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(dataUrl).toBe('data:image/png;base64,generated');
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'sk-test',
            model: expect.objectContaining({
                slug: OPENAI_IMAGE_MODEL,
                provider: 'openai',
                apiModel: OPENAI_IMAGE_MODEL,
            }),
            prompt: 'blue hour mountain',
            quality: 'high',
            size: '1024x1024',
            background: 'transparent',
            referenceImages: [],
        }));
    });

    it('routes edit requests through the configured provider for the default model', async () => {
        const edit = vi.fn(async () => ({ b64_json: 'edited' }));
        const providers: ImageProviderRegistry = {
            openai: {
                generate: vi.fn(),
                edit,
            },
        };
        const workflow = createImageWorkflow(providers);
        const sourceImage = new Blob(['source'], { type: 'image/png' });

        const dataUrl = await workflow.edit({
            apiKey: 'sk-test',
            prompt: 'make it cinematic',
            sourceImage,
            referenceImages: [],
        });

        expect(dataUrl).toBe('data:image/png;base64,edited');
        expect(edit).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'sk-test',
            model: expect.objectContaining({
                slug: OPENAI_IMAGE_MODEL,
                provider: 'openai',
            }),
            prompt: 'make it cinematic',
            quality: 'medium',
        }));
    });
});

describe('googleImageProvider', () => {
    it('builds a Gemini image request with prompt, references, and image config', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            candidates: [{
                content: {
                    parts: [{ inlineData: { data: 'gemini-image' } }],
                },
            }],
        })));
        const provider = createGoogleImageProvider(fetchImpl);
        const reference = new File(['reference'], 'reference.png', { type: 'image/png' });

        const result = await provider.generate({
            apiKey: 'google-key',
            model: {
                slug: NANO_BANANA_PRO_IMAGE_MODEL,
                provider: 'google',
                apiModel: 'gemini-3-pro-image-preview',
                label: 'Nano Banana Pro',
                endpoints: {
                    generate: 'https://example.test/generate',
                    edit: 'https://example.test/generate',
                },
                parameters: {},
            },
            prompt: 'a luminous teapot city',
            aspectRatio: '16:9',
            imageSize: '2K',
            referenceImages: [reference],
        });

        expect(result).toEqual({ b64_json: 'gemini-image' });
        expect(fetchImpl).toHaveBeenCalledWith('https://example.test/generate', expect.objectContaining({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': 'google-key',
            },
        }));

        const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));
        expect(body.contents[0].parts[0]).toEqual({ text: 'a luminous teapot city' });
        expect(body.contents[0].parts[1].inline_data).toMatchObject({
            mime_type: 'image/png',
        });
        expect(body.generationConfig.imageConfig).toEqual({
            aspectRatio: '16:9',
            imageSize: '2K',
        });
    });

    it('omits imageConfig for preserve-source-dimensions edits', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            candidates: [{
                content: {
                    parts: [{ inlineData: { data: 'edited-image' } }],
                },
            }],
        })));
        const provider = createGoogleImageProvider(fetchImpl);

        await provider.edit({
            apiKey: 'google-key',
            model: {
                slug: NANO_BANANA_PRO_IMAGE_MODEL,
                provider: 'google',
                apiModel: 'gemini-3-pro-image-preview',
                label: 'Nano Banana Pro',
                endpoints: {
                    generate: 'https://example.test/generate',
                    edit: 'https://example.test/generate',
                },
                parameters: {},
            },
            prompt: 'make it cinematic',
            preserveSourceDimensions: true,
            referenceImages: [new File(['source'], 'source.png', { type: 'image/png' })],
        });

        const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));
        expect(body.generationConfig.imageConfig).toBeUndefined();
    });

    it('extracts image bytes from Gemini response parts', () => {
        expect(extractGoogleImageData({
            candidates: [{
                content: {
                    parts: [{ text: 'ok' }, { inlineData: { data: 'abc123' } }],
                },
            }],
        })).toBe('abc123');
        expect(extractGoogleImageData({ candidates: [{ content: { parts: [{ text: 'blocked' }] } }] })).toBeNull();
    });
});
