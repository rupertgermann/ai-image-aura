import { describe, expect, it, vi } from 'vitest';
import { createImageWorkflow, type GenerateImageInput } from './ImageWorkflow';
import { createLocalImageProvider, testLocalServerConnection } from './LocalImageProvider';

const SERVER_URL = 'http://127.0.0.1:1234';
const imageResponse = (images = ['image']) => new Response(JSON.stringify({
    data: images.map((b64_json) => ({ b64_json })),
}));

function generateInput(overrides: Partial<GenerateImageInput> = {}): GenerateImageInput {
    return {
        credential: SERVER_URL,
        model: 'qwen-image-2.1',
        prompt: 'a fox',
        quality: 'medium',
        aspectRatio: '1:1',
        background: 'auto',
        imageSize: '1K',
        style: 'none',
        lighting: 'none',
        palette: 'none',
        referenceImages: [],
        ...overrides,
    };
}

describe('local image workflow', () => {
    it('maps all four images from a local batch to separate zero-cost results', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse(['one', 'two', 'three', 'four']));
        const workflow = createImageWorkflow({ local: createLocalImageProvider(fetchImpl) });
        const results = await workflow.generate(generateInput({ batchSize: 4 }));
        const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(String(request.body)).n).toBe(4);
        expect(results.map((result) => result.status === 'success' && result.imageUrl)).toEqual([
            'data:image/png;base64,one',
            'data:image/png;base64,two',
            'data:image/png;base64,three',
            'data:image/png;base64,four',
        ]);
        expect(results.every((result) => result.status === 'success' && result.costLedger?.items[0]?.amountUsd === 0)).toBe(true);
    });

    it.each([
        [new Response(JSON.stringify({ error: 'missing vision weights' }), { status: 400 }), 'missing vision weights'],
        [new Response(JSON.stringify({ error: { message: 'bad size' } }), { status: 422 }), 'bad size'],
        [new Response('internal failure', { status: 500 }), 'Local image server error: 500'],
    ])('shows local server HTTP errors', async (response, message) => {
        const workflow = createImageWorkflow({ local: createLocalImageProvider(vi.fn<typeof fetch>(async () => response.clone())) });
        await expect(workflow.generate(generateInput())).rejects.toThrow(message);
    });

    it('reports unreachable servers and marks every failed batch slot', async () => {
        const unreachable = createImageWorkflow({
            local: createLocalImageProvider(vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch'); })),
        });
        await expect(unreachable.generate(generateInput())).rejects.toThrow(`Could not reach the local image server at ${SERVER_URL}.`);

        const failed = createImageWorkflow({
            local: createLocalImageProvider(vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: 'server busy' }), { status: 503 }))),
        });
        await expect(failed.generate(generateInput({ batchSize: 3 }))).resolves.toEqual([
            { slotIndex: 0, status: 'failed', error: 'server busy' },
            { slotIndex: 1, status: 'failed', error: 'server busy' },
            { slotIndex: 2, status: 'failed', error: 'server busy' },
        ]);
    });

    it('reports an empty successful response as missing image data', async () => {
        const workflow = createImageWorkflow({
            local: createLocalImageProvider(vi.fn<typeof fetch>(async () => imageResponse([]))),
        });
        await expect(workflow.generate(generateInput())).rejects.toThrow('No image data returned from image provider');
    });

    it('edits the target first, then context and references, without sending the mask', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse(['edited']));
        const workflow = createImageWorkflow({ local: createLocalImageProvider(fetchImpl) });
        const references = Array.from({ length: 11 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }));

        const result = await workflow.edit({
            credential: SERVER_URL,
            model: 'qwen-image-2.1',
            prompt: 'replace the fox with a cat',
            sourceImage: new Blob(['source'], { type: 'image/png' }),
            sourceDimensions: { width: 2048, height: 2048 },
            compositionContextImage: new File(['context'], 'context.png', { type: 'image/png' }),
            referenceImages: references,
            maskImage: new File(['mask'], 'mask.png', { type: 'image/png' }),
        });

        expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${SERVER_URL}/v1/images/edits`);
        const form = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as FormData;
        expect(form.get('n')).toBe('1');
        expect(form.get('size')).toBe('1024x1024');
        expect(form.getAll('image[]').map((image) => (image as File).name)).toEqual([
            'edit-input.png', 'context.png', ...references.slice(0, 8).map((file) => file.name),
        ]);
        expect(form.has('mask')).toBe(false);
        expect(String(form.get('prompt'))).toBe('replace the fox with a cat <sd_cpp_extra_args>{"init_image":null}</sd_cpp_extra_args>');
        expect(result).toMatchObject({
            imageUrl: 'data:image/png;base64,edited',
            costLedger: { items: [{ status: 'calculated', amountUsd: 0 }] },
        });
    });

    it('omits edit size when target dimensions are unavailable', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse());
        const workflow = createImageWorkflow({ local: createLocalImageProvider(fetchImpl) });
        await workflow.edit({
            credential: SERVER_URL,
            model: 'qwen-image-2.1',
            prompt: 'change the color',
            sourceImage: new Blob(['source'], { type: 'image/png' }),
            referenceImages: [],
        });
        const form = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as FormData;
        expect(form.has('size')).toBe(false);
    });

    it('sends ordered reference images as edits, caps them at ten, and clears the init image', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse(['first', 'second']));
        const workflow = createImageWorkflow({ local: createLocalImageProvider(fetchImpl) });
        const references = Array.from({ length: 12 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }));

        const results = await workflow.generate(generateInput({
            prompt: 'a fox',
            background: 'transparent',
            batchSize: 2,
            referenceImages: references,
        }));

        expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${SERVER_URL}/v1/images/edits`);
        const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        expect(request.headers).toBeUndefined();
        const form = request.body as FormData;
        expect(form.get('model')).toBe('qwen-image-2.1');
        expect(form.get('n')).toBe('2');
        expect(form.get('size')).toBe('1024x1024');
        expect(form.get('output_format')).toBe('png');
        expect(form.getAll('image[]').map((file) => (file as File).name)).toEqual(references.slice(0, 10).map((file) => file.name));
        expect(form.has('mask')).toBe(false);
        const requestPrompt = String(form.get('prompt'));
        expect(requestPrompt).toBe('This is an RGBA image with transparency. a fox. The image has alpha channel and the background is transparent. <sd_cpp_extra_args>{"init_image":null}</sd_cpp_extra_args>');
        expect(requestPrompt.match(/<sd_cpp_extra_args>/g)).toHaveLength(1);
        expect(results.map((result) => result.status)).toEqual(['success', 'success']);
        expect(results.map((result) => result.status === 'success' && result.imageUrl)).toEqual([
            'data:image/png;base64,first',
            'data:image/png;base64,second',
        ]);
    });

    it('adds the RGBA request template after modifiers while keeping the user prompt untouched', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse());
        const workflow = createImageWorkflow({ local: createLocalImageProvider(fetchImpl) });
        const input = generateInput({
            prompt: 'A red fox!!!',
            background: 'transparent',
            style: 'paper cutout',
            lighting: 'soft',
        });

        await workflow.generate(input);

        const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(request.body));
        expect(body.prompt).toBe('This is an RGBA image with transparency. A red fox, paper cutout, soft. The image has alpha channel and the background is transparent.');
        expect(body.prompt).not.toContain('sd_cpp_extra_args');
        expect(input.prompt).toBe('A red fox!!!');
    });

    it.each([
        ['1:1', '1K', '1024x1024'], ['1:1', '2K', '2048x2048'],
        ['4:3', '1K', '1152x864'], ['4:3', '2K', '2400x1792'],
        ['3:4', '1K', '864x1152'], ['3:4', '2K', '1792x2400'],
        ['3:2', '1K', '1248x832'], ['3:2', '2K', '2528x1696'],
        ['2:3', '1K', '832x1248'], ['2:3', '2K', '1696x2528'],
        ['16:9', '1K', '1376x768'], ['16:9', '2K', '2752x1536'],
        ['9:16', '1K', '768x1376'], ['9:16', '2K', '1536x2752'],
    ])('requests Qwen %s at %s as %s', async (aspectRatio, imageSize, size) => {
        const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse());
        const workflow = createImageWorkflow({ local: createLocalImageProvider(fetchImpl) });
        await workflow.generate(generateInput({ aspectRatio, imageSize: imageSize as '1K' | '2K' }));

        const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(String(request.body)).size).toBe(size);
    });

    it('reports the connection, HTTP status, or unreachable URL', async () => {
        const connected = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            data: [{ id: 'qwen-image-2.1' }, { id: 'another-local-model' }],
        })));
        expect(await testLocalServerConnection(`${SERVER_URL}/`, connected)).toEqual({
            status: 'connected',
            modelIds: ['qwen-image-2.1', 'another-local-model'],
        });
        expect(connected).toHaveBeenCalledWith(`${SERVER_URL}/v1/models`);

        expect(await testLocalServerConnection(SERVER_URL, vi.fn<typeof fetch>(async () => new Response('', { status: 503 })))).toEqual({
            status: 'http-error',
            httpStatus: 503,
        });
        expect(await testLocalServerConnection(SERVER_URL, vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch'); }))).toEqual({
            status: 'unreachable',
            url: SERVER_URL,
        });
    });

    it('generates PNG images through the local server with no hosted credentials or parameters', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => imageResponse());
        const workflow = createImageWorkflow({ local: createLocalImageProvider(fetchImpl) }, {
            now: (() => {
                const times = [100, 375];
                return () => times.shift() ?? 375;
            })(),
        });

        const results = await workflow.generate(generateInput({
            credential: `${SERVER_URL}/`,
            style: 'watercolor',
            lighting: 'golden hour',
            palette: 'warm',
        }));

        expect(fetchImpl).toHaveBeenCalledWith(`${SERVER_URL}/v1/images/generations`, expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }));
        const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(String(request.body))).toEqual({
            model: 'qwen-image-2.1',
            prompt: 'a fox, watercolor, golden hour, color palette: warm',
            n: 1,
            size: '1024x1024',
            output_format: 'png',
        });
        expect(results).toMatchObject([{
            status: 'success',
            imageUrl: 'data:image/png;base64,image',
            actualParameters: { elapsedMs: 275 },
            costLedger: { items: [{ status: 'calculated', amountUsd: 0, note: 'Local inference — no API charge.' }] },
        }]);
        expect(results[0]).not.toHaveProperty('actualParameters.size');
        expect(results[0]).not.toHaveProperty('actualParameters.quality');
    });
});
