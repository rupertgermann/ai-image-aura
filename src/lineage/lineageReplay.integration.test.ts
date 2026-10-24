import { expect, it, vi } from 'vitest';
import { createLineageNavigator } from './LineageNavigator';
import { createGenerateSessionStore, DEFAULT_GENERATE_DRAFT, getActiveGenerateModel } from '../generate-session/GenerateSession';
import { createAutopilotSession } from '../autopilot/AutopilotSession';
import { createImageWorkflow } from '../image-workflow/ImageWorkflow';
import { imageProviderRegistry, type ImageProviderRequest } from '../image-workflow/ImageProvider';
import type { LineageStep } from './LineageStore';
import { OPENAI_IMAGE_MODEL } from '../utils/openaiModels';

function setup() {
    const blobs = new Map<string, string>();
    const local = new Map<string, string>();
    const session = createGenerateSessionStore({
        blobStorage: { save: async (k, v) => { blobs.set(k, v); }, load: async k => blobs.get(k) ?? null, remove: async k => { blobs.delete(k); }, listKeys: async () => [...blobs.keys()] },
        localStorage: { length: 0, key: () => null, clear: () => local.clear(), getItem: k => local.get(k) ?? null, setItem: (k, v) => { local.set(k, v); }, removeItem: k => { local.delete(k); } },
    });
    return { session, blobs, local };
}

it.each([false, true])('restores the exact Autopilot provider inputs and clears old output (references=%s)', async (withReferences) => {
    const { session } = setup();
    await session.saveCurrentBatch({ results: [{ slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,T0xE', isSaved: false }], references: ['data:image/png;base64,T0xE'], draft: DEFAULT_GENERATE_DRAFT, lineageSource: null });
    let step: LineageStep | null = null;
    const references = withReferences ? [new File(['original reference'], 'reference.png', { type: 'image/png' })] : [];
    const generate = vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,TkVX' }));
    const result = await createAutopilotSession({
        goal: 'replay goal', initialPrompt: 'intermediate prompt', imageCredential: 'synthetic', getProviderCredential: () => 'synthetic',
        settings: { model: OPENAI_IMAGE_MODEL, controls: { quality: 'high', size: '1536x1024', background: 'transparent', batchSize: 1 }, style: 'none', lighting: 'none', palette: 'none', referenceImages: references },
        generate, maxIterations: 1,
        lineageStore: { save: async input => { step = { ...input, id: 'intermediate' }; return step; } },
    }, { reasoningClient: { createResponse: async () => ({ outputText: '{"score":95,"feedback":[]}' }) } }).run();
    expect(result.status).toBe('max-iterations');
    const navigator = createLineageNavigator({ sessionStore: session, lineageStore: { getById: async () => step }, findImage: () => null });
    expect(await navigator.replayIntoGenerate('intermediate')).toEqual({ status: 'replayed' });
    expect(await session.loadCurrentBatch()).toBeNull();
    const providerGenerate = vi.fn(async (_request: ImageProviderRequest) => [{ b64_json: 'TkVX' }]);
    const workflow = createImageWorkflow({ ...imageProviderRegistry, openai: { edit: vi.fn(), generate: providerGenerate } });
    const restoredReferences = workflow.hydrateReferences(await session.consumeTransferredReferences());
    const draft = session.readDraft();
    await workflow.generate({ ...getActiveGenerateModel(draft), credential: 'synthetic', prompt: draft.prompt, style: draft.style, lighting: draft.lighting, palette: draft.palette, referenceImages: restoredReferences });
    const request = providerGenerate.mock.calls[0]?.[0];
    expect(request).toMatchObject({ prompt: 'intermediate prompt', quality: 'high', size: '1536x1024', background: 'transparent' });
    expect(await Promise.all((request?.referenceImages ?? []).map((file: File) => file.text()))).toEqual(withReferences ? ['original reference'] : []);
});

it('refuses legacy intermediate inputs before mutating the existing session', async () => {
    const { session, blobs, local } = setup();
    session.writeDraft({ ...DEFAULT_GENERATE_DRAFT, prompt: 'keep draft' });
    session.saveLineageSource({ archiveImageId: 'keep source' });
    await session.saveCurrentBatch({ results: [{ slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,T0xE', isSaved: false }], references: [], draft: DEFAULT_GENERATE_DRAFT, lineageSource: null });
    const before = { blobs: [...blobs], local: [...local] };
    const navigator = createLineageNavigator({ sessionStore: session, findImage: () => null, lineageStore: { getById: async () => ({ id: 'legacy', archiveImageId: 'missing', parentStepId: null, timestamp: '2026-10-24', stepType: 'autopilot-iteration', metadata: { prompt: 'legacy' } }) } });
    expect(await navigator.replayIntoGenerate('legacy')).toMatchObject({ status: 'unavailable' });
    expect({ blobs: [...blobs], local: [...local] }).toEqual(before);
});
