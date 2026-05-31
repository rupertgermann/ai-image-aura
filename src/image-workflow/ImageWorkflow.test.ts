import { describe, expect, it, vi } from 'vitest';
import { OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import { createImageWorkflow, type ImageProviderRegistry } from './ImageWorkflow';

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
