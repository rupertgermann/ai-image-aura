import { describe, expect, it, vi } from 'vitest';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import { createImageWorkflow, type ImageProvider, type ImageProviderRegistry } from './ImageWorkflow';
import { createGoogleImageProvider, extractGoogleImageData } from './ImageProvider';

describe('ImageWorkflow', () => {
    it('routes generate requests through the configured provider for the selected model', async () => {
        const generate = vi.fn(async (input: Parameters<ImageProvider['generate']>[0]) => {
            void input;
            return [{ b64_json: 'generated' }];
        });
        const providers: ImageProviderRegistry = {
            openai: {
                generate,
                edit: vi.fn(),
            },
        };

        const workflow = createImageWorkflow(providers);

        const results = await workflow.generate({
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

        expect(results).toEqual([{
            slotIndex: 0,
            status: 'success',
            imageUrl: 'data:image/png;base64,generated',
            actualParameters: {
                elapsedMs: expect.any(Number),
            },
        }]);
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
            batchSize: 1,
            referenceImages: [],
        }));
    });

    it('returns per-slot batch results and keeps failed slots in place', async () => {
        const generate = vi.fn(async () => [
            { b64_json: 'generated-0' },
            {},
            { b64_json: 'generated-2' },
        ]);
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
        });

        const results = await workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            batchSize: 3,
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(results).toEqual([
            {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,generated-0',
                actualParameters: {
                    elapsedMs: expect.any(Number),
                },
            },
            { slotIndex: 1, status: 'failed', error: 'No image data returned from image provider' },
            {
                slotIndex: 2,
                status: 'success',
                imageUrl: 'data:image/png;base64,generated-2',
                actualParameters: {
                    elapsedMs: expect.any(Number),
                },
            },
        ]);
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            batchSize: 3,
        }));
    });

    it('uses provider slot errors when batch generation partially fails', async () => {
        const generate = vi.fn(async () => [
            { b64_json: 'generated-0' },
            { error: 'Google Gemini API Error: overloaded' },
            { b64_json: 'generated-2' },
        ]);
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
        });

        await expect(workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            batchSize: 3,
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        })).resolves.toEqual([
            {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,generated-0',
                actualParameters: {
                    elapsedMs: expect.any(Number),
                },
            },
            { slotIndex: 1, status: 'failed', error: 'Google Gemini API Error: overloaded' },
            {
                slotIndex: 2,
                status: 'success',
                imageUrl: 'data:image/png;base64,generated-2',
                actualParameters: {
                    elapsedMs: expect.any(Number),
                },
            },
        ]);
    });

    it('attaches actual parameters and elapsed time to successful generated results', async () => {
        const generate = vi.fn(async () => [{
            b64_json: 'generated',
            revised_prompt: 'refined mountain prompt',
            size: '1536x1024',
            quality: 'high',
        }]);
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
        }, {
            now: createNowSequence([1000, 1275]),
        });

        const results = await workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'medium',
            aspectRatio: 'auto',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(results).toEqual([{
            slotIndex: 0,
            status: 'success',
            imageUrl: 'data:image/png;base64,generated',
            actualParameters: {
                revisedPrompt: 'refined mountain prompt',
                size: '1536x1024',
                quality: 'high',
                elapsedMs: 275,
            },
        }]);
    });

    it('forwards single-slot OpenAI partial images as data URLs', async () => {
        const onPartialImage = vi.fn();
        const generate = vi.fn(async (input: Parameters<ImageProvider['generate']>[0]) => {
            input.onPartialImage?.({ b64_json: 'partial' });
            return [{ b64_json: 'generated' }];
        });
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            batchSize: 1,
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
            onPartialImage,
        });

        expect(onPartialImage).toHaveBeenCalledWith('data:image/png;base64,partial');
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            onPartialImage: expect.any(Function),
        }));
    });

    it('does not forward partial image callbacks for batch generation', async () => {
        const onPartialImage = vi.fn();
        const generate = vi.fn(async (input: Parameters<ImageProvider['generate']>[0]) => {
            input.onPartialImage?.({ b64_json: 'partial' });
            return [
                { b64_json: 'generated-0' },
                { b64_json: 'generated-1' },
            ];
        });
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            batchSize: 2,
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
            onPartialImage,
        });

        expect(onPartialImage).not.toHaveBeenCalled();
        expect(generate).toHaveBeenCalledWith(expect.not.objectContaining({
            onPartialImage: expect.any(Function),
        }));
    });

    it('does not forward partial image callbacks for Nano Banana generation', async () => {
        const onPartialImage = vi.fn();
        const generate = vi.fn(async (input: Parameters<ImageProvider['generate']>[0]) => {
            input.onPartialImage?.({ b64_json: 'partial' });
            return [{ b64_json: 'generated' }];
        });
        const workflow = createImageWorkflow({
            openai: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
            google: {
                generate,
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'google-key',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            prompt: 'teapot city',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
            onPartialImage,
        });

        expect(onPartialImage).not.toHaveBeenCalled();
        expect(generate).toHaveBeenCalledWith(expect.not.objectContaining({
            onPartialImage: expect.any(Function),
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
            size: '1024x1024',
            background: 'auto',
        }));
    });

    it('falls back to the default generation size when aspect ratio value is unsupported', async () => {
        const generate = vi.fn(async () => [{ b64_json: 'generated' }]);
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
            google: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: 'unsupported-size',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            size: '1024x1024',
        }));
    });

    it('trims generation dimensions before validating size', async () => {
        const generate = vi.fn(async () => [{ b64_json: 'generated' }]);
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
            google: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: ' 1536x1024 ',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            size: '1536x1024',
        }));
    });

    it('maps landscape generation dimensions to supported Nano Banana aspect ratio', async () => {
        const generate = vi.fn(async () => [{ b64_json: 'generated' }]);
        const workflow = createImageWorkflow({
            openai: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
            google: {
                generate,
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'sk-test',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            prompt: 'teapot city',
            quality: 'high',
            aspectRatio: '1536x1024',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            aspectRatio: '3:2',
        }));
    });

    it('trims Nano Banana generation dimensions before mapping aspect ratio', async () => {
        const generate = vi.fn(async () => [{ b64_json: 'generated' }]);
        const workflow = createImageWorkflow({
            openai: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
            google: {
                generate,
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'sk-test',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            prompt: 'teapot city',
            quality: 'high',
            aspectRatio: ' 1024x1536 ',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            aspectRatio: '2:3',
        }));
    });

    it('surfaces a provider-agnostic error when generation returns no image data', async () => {
        const generate = vi.fn(async () => [{}]);
        const workflow = createImageWorkflow({
            openai: {
                generate,
                edit: vi.fn(),
            },
        });

        await expect(workflow.generate({
            apiKey: 'sk-test',
            prompt: 'blue hour mountain',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        })).rejects.toThrow('No image data returned from image provider');
    });

    it('sends whole-composition edit requests with the editable source before user references', async () => {
        let seenReferenceImages: File[] = [];
        const edit = vi.fn(async (input: Parameters<ImageProvider['edit']>[0]) => {
            seenReferenceImages = input.referenceImages ?? [];
            return { b64_json: 'edited' };
        });
        const providers: ImageProviderRegistry = {
            openai: {
                generate: vi.fn(),
                edit,
            },
        };
        const workflow = createImageWorkflow(providers);
        const sourceImage = new Blob(['whole-composition'], { type: 'image/png' });
        const userReference = new File(['reference'], 'user-reference.png', { type: 'image/png' });

        await workflow.edit({
            apiKey: 'sk-test',
            prompt: 'make it cinematic',
            sourceImage,
            referenceImages: [userReference],
        });

        expect(seenReferenceImages.map((file) => file.name)).toEqual([
            'edit-input.png',
            'user-reference.png',
        ]);
    });

    it('sends selected-layer edit requests with composition context before user references', async () => {
        let seenReferenceImages: File[] = [];
        let seenMaskImage: File | Blob | null | undefined;
        const edit = vi.fn(async (input: Parameters<ImageProvider['edit']>[0]) => {
            seenReferenceImages = input.referenceImages ?? [];
            seenMaskImage = input.maskImage;
            return { b64_json: 'edited' };
        });
        const providers: ImageProviderRegistry = {
            openai: {
                generate: vi.fn(),
                edit,
            },
        };
        const workflow = createImageWorkflow(providers);
        const sourceImage = new Blob(['selected-layer'], { type: 'image/png' });
        const compositionContext = new File(['composition'], 'composition-context.png', { type: 'image/png' });
        const userReference = new File(['reference'], 'user-reference.png', { type: 'image/png' });
        const maskImage = new File(['mask'], 'mask.png', { type: 'image/png' });

        await workflow.edit({
            apiKey: 'sk-test',
            prompt: 'replace the sky',
            sourceImage,
            compositionContextImage: compositionContext,
            referenceImages: [userReference],
            maskImage,
        });

        expect(seenReferenceImages.map((file) => file.name)).toEqual([
            'edit-input.png',
            'composition-context.png',
            'user-reference.png',
        ]);
        expect(seenMaskImage).toBe(maskImage);
    });

    it('maps nano-banana-pro Editor AI transforms with source handling and Reference image limits', async () => {
        const edit = vi.fn(async (request: Parameters<ImageProvider['edit']>[0]) => {
            void request;
            return { b64_json: 'edited-nano' };
        });
        const workflow = createImageWorkflow({
            openai: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
            google: {
                generate: vi.fn(),
                edit,
            },
        });
        const references = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );

        await workflow.edit({
            apiKey: 'google-key',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            prompt: 'make it cinematic',
            sourceImage: new Blob(['source'], { type: 'image/png' }),
            compositionContextImage: new File(['composition'], 'composition-context.png', { type: 'image/png' }),
            referenceImages: references,
        });

        const request = edit.mock.calls[0]?.[0];
        expect(request).toEqual(expect.objectContaining({
            aspectRatio: '1:1',
            imageSize: '1K',
            preserveSourceDimensions: true,
        }));
        expect(request?.referenceImages?.map((file) => file.name)).toEqual([
            'edit-input.png',
            'composition-context.png',
            'ref-0.png',
            'ref-1.png',
            'ref-2.png',
            'ref-3.png',
            'ref-4.png',
            'ref-5.png',
            'ref-6.png',
            'ref-7.png',
            'ref-8.png',
            'ref-9.png',
            'ref-10.png',
            'ref-11.png',
            'ref-12.png',
            'ref-13.png',
        ]);
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
                capabilities: { transformMask: false, partialImageStreaming: false },
            },
            prompt: 'a luminous teapot city',
            aspectRatio: '16:9',
            imageSize: '2K',
            referenceImages: [reference],
        });

        expect(result).toEqual([{ b64_json: 'gemini-image' }]);
        expect(result[0]).not.toHaveProperty('revised_prompt');
        expect(result[0]).not.toHaveProperty('size');
        expect(result[0]).not.toHaveProperty('quality');
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

    it('ignores partial image callbacks for Gemini requests', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            candidates: [{
                content: {
                    parts: [{ inlineData: { data: 'gemini-image' } }],
                },
            }],
        })));
        const provider = createGoogleImageProvider(fetchImpl);
        const onPartialImage = vi.fn();

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
                capabilities: { transformMask: false, partialImageStreaming: false },
            },
            prompt: 'a luminous teapot city',
            onPartialImage,
        });

        expect(result).toEqual([{ b64_json: 'gemini-image' }]);
        expect(onPartialImage).not.toHaveBeenCalled();

        const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));
        expect(JSON.stringify(body)).not.toContain('partial');
        expect(JSON.stringify(body)).not.toContain('stream');
    });

    it('normalizes unsupported Nano Banana aspect ratios to 1:1', async () => {
        const generate = vi.fn(async (input: Parameters<ImageProvider['generate']>[0]) => {
            void input;
            return [{ b64_json: 'generated' }];
        });
        const workflow = createImageWorkflow({
            openai: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
            google: {
                generate,
                edit: vi.fn(),
            },
        });

        await workflow.generate({
            apiKey: 'sk-test',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            prompt: 'teapot city',
            quality: 'high',
            aspectRatio: 'bad-ratio',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: [],
        });

        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            aspectRatio: '1:1',
        }));
    });

    it('uses only the first 14 references for Nano Banana generation requests', async () => {
        const generate = vi.fn(async (input: Parameters<ImageProvider['generate']>[0]) => {
            void input;
            return [{ b64_json: 'generated' }];
        });
        const workflow = createImageWorkflow({
            openai: {
                generate: vi.fn(),
                edit: vi.fn(),
            },
            google: {
                generate,
                edit: vi.fn(),
            },
        });
        const references = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );

        await workflow.generate({
            apiKey: 'sk-test',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            prompt: 'teapot city',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            style: 'none',
            lighting: 'none',
            palette: 'none',
            referenceImages: references,
        });

        const calledWith = generate.mock.calls[0]?.[0] as unknown as { referenceImages: File[] };
        expect(calledWith.referenceImages).toHaveLength(14);
        expect(calledWith.referenceImages.map((file) => file.name)).toEqual([
            'ref-0.png',
            'ref-1.png',
            'ref-2.png',
            'ref-3.png',
            'ref-4.png',
            'ref-5.png',
            'ref-6.png',
            'ref-7.png',
            'ref-8.png',
            'ref-9.png',
            'ref-10.png',
            'ref-11.png',
            'ref-12.png',
            'ref-13.png',
        ]);
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
                capabilities: { transformMask: false, partialImageStreaming: false },
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

    it('extracts image bytes from snake_case Gemini inline data when inlineData is absent', () => {
        expect(extractGoogleImageData({
            candidates: [{
                content: {
                    parts: [{ text: 'ok' }, { inline_data: { data: 'snake123' } }],
                },
            }],
        })).toBe('snake123');
    });

    it('uses default Gemini imageConfig values when values are not provided', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            candidates: [{
                content: {
                    parts: [{ inlineData: { data: 'gemini-image' } }],
                },
            }],
        })));
        const provider = createGoogleImageProvider(fetchImpl);

        await provider.generate({
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
                capabilities: { transformMask: false, partialImageStreaming: false },
            },
            prompt: 'a luminous teapot city',
            referenceImages: [],
        });

        const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body));
        expect(body.generationConfig.imageConfig).toEqual({
            aspectRatio: '1:1',
            imageSize: '1K',
        });
    });

    it('fans out Nano Banana batch generation and keeps failed slots isolated', async () => {
        const pendingResponses: Array<(response: Response) => void> = [];
        const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
            pendingResponses.push(resolve);
        }));
        const provider = createGoogleImageProvider(fetchImpl);

        const resultPromise = provider.generate({
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
                capabilities: { transformMask: false, partialImageStreaming: false },
            },
            prompt: 'a luminous teapot city',
            aspectRatio: '16:9',
            imageSize: '2K',
            batchSize: 3,
            referenceImages: [],
        });

        await Promise.resolve();
        expect(fetchImpl).toHaveBeenCalledTimes(3);

        pendingResponses[0]?.(new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { data: 'gemini-image-0' } }] } }],
        })));
        pendingResponses[1]?.(new Response(JSON.stringify({
            error: { message: 'quota exceeded' },
        }), { status: 429 }));
        pendingResponses[2]?.(new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { data: 'gemini-image-2' } }] } }],
        })));

        await expect(resultPromise).resolves.toEqual([
            { b64_json: 'gemini-image-0' },
            { error: 'quota exceeded' },
            { b64_json: 'gemini-image-2' },
        ]);
    });
});

function createNowSequence(values: number[]) {
    let index = 0;
    return () => values[index++] ?? values.at(-1) ?? 0;
}
