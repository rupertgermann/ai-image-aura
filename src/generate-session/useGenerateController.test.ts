import { describe, expect, it, vi } from 'vitest';
import { createAutopilotSession } from '../autopilot/AutopilotSession';
import { saveArchiveImage, type GenerationSaveRequest } from '../archive/saveArchiveImage';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NANO_BANANA_PRO_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL } from '../utils/openaiModels';
import { DEFAULT_GENERATE_DRAFT, type GenerateBatchSnapshot, type GenerateDraft } from './GenerateSession';
import type { SaveLineageStepInput } from '../lineage/LineageStore';
import {
    addGeneratedResultAsReference,
    addGeneratedResultAsReferenceFromAction,
    buildGenerateResultSlots,
    saveGenerateResultSlots,
    useGenerateController,
} from './useGenerateController';

describe('Autopilot preflight cancellation', () => {
    it('honors Stop while references are read and allows the next run', async () => {
        const controller: { current: ReturnType<typeof useGenerateController> | null } = { current: null };
        const generate = vi.fn(async () => [{ slotIndex: 0, status: 'success' as const, imageUrl: 'data:image/png;base64,result' }]);
        let stopDuringRead = true;
        renderToStaticMarkup(createElement(() => {
            controller.current = useGenerateController({
                imageCredential: 'key', getProviderCredential: () => 'key',
                draft: { ...DEFAULT_GENERATE_DRAFT, prompt: 'portrait' }, setDraft: vi.fn(),
                referenceImages: [], replaceReferences: vi.fn(), serializeReferences: async () => [],
                onSaveImage: async (request) => request.image,
                session: {
                    loadCurrentBatch: async () => null, saveCurrentBatch: async () => {},
                    clearCurrentResult: async () => {}, consumeTransferredReferences: async () => [],
                    loadLineageSource: () => null, saveLineageSource: vi.fn(), clearLineageSource: vi.fn(),
                },
                lineage: { getByArchiveImageId: async () => [], save: async (step) => ({ ...step, id: 'step' }) },
                workflow: { generate, serializeReferences: async () => {
                    if (stopDuringRead) controller.current?.cancelAutopilot();
                    return [];
                } },
                createAutopilot: (input) => createAutopilotSession(input, { reasoningClient: {
                    createResponse: async () => ({ outputText: JSON.stringify({ score: 95, feedback: ['Matches the goal.'] }) }),
                } }),
            });
            return null;
        }));
        if (!controller.current) throw new Error('Missing controller');
        const cancelled = await controller.current.runAutopilot({ goal: 'portrait' });
        expect(cancelled?.status).toBe('cancelled');
        expect(generate).not.toHaveBeenCalled();
        stopDuringRead = false;
        expect((await controller.current.runAutopilot({ goal: 'portrait' }))?.status).toBe('satisfied');
        expect(generate).toHaveBeenCalledTimes(1);
    });
});

describe('Generate controller batch result slots', () => {
    it('retains successful saves when a later slot fails, so retry does not duplicate them', async () => {
        let results = buildGenerateResultSlots([
            { slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,one' },
            { slotIndex: 1, status: 'success', imageUrl: 'data:image/png;base64,two' },
        ]);
        const saveImage = vi.fn(async (image) => image);
        saveImage.mockImplementationOnce(async (image) => image).mockRejectedValueOnce(new Error('Disk full'));
        const input = {
            draft: createDraft({}),
            runDraft: null,
            usedReferences: [],
            runLineageSource: null,
            serializeReferences: vi.fn(async () => []),
            saveImage: (request: GenerationSaveRequest) => saveArchiveImage(request, { archive: { get: async () => null, save: saveImage, remove: vi.fn() }, lineage: { getByArchiveImageId: vi.fn(async () => []), save: vi.fn(async (step) => ({ ...step, id: 'step' })) } }),
            onSaved: (nextResults: typeof results) => { results = nextResults; }
        };
        await expect(saveGenerateResultSlots({ ...input, results })).rejects.toThrow('Disk full');
        expect(results[0]).toMatchObject({ isSaved: true });
        await saveGenerateResultSlots({ ...input, results });
        expect(saveImage.mock.calls.map(([image]) => image.url)).toEqual([
            'data:image/png;base64,one', 'data:image/png;base64,two', 'data:image/png;base64,two',
        ]);
    });

    it.each([
        { usedReferences: null, expected: ['data:image/png;base64,current-reference'] },
        { usedReferences: [], expected: [] },
    ])('uses current references only for a legacy unknown snapshot: $usedReferences', async ({ usedReferences, expected }) => {
        const saveImage = vi.fn(async (request: GenerationSaveRequest) => request.image);
        await saveGenerateResultSlots({
            results: buildGenerateResultSlots([{ slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,result' }]),
            draft: createDraft({}), runDraft: null, usedReferences, runLineageSource: null,
            serializeReferences: async () => ['data:image/png;base64,current-reference'],
            saveImage,
        });
        expect(saveImage.mock.calls[0]?.[0].image.references).toEqual(expected);
    });

    it('save-all archives each unsaved successful slot without duplicating saved or failed slots', async () => {
        const savedImages: string[] = [];
        const nextResults = await saveGenerateResultSlots({
            results: [
                {
                    slotIndex: 0,
                    status: 'success',
                    imageUrl: 'data:image/png;base64,one',
                    isSaved: false,
                },
                {
                    slotIndex: 1,
                    status: 'success',
                    imageUrl: 'data:image/png;base64,two',
                    isSaved: true,
                    archiveImageId: 'already-saved',
                },
                {
                    slotIndex: 2,
                    status: 'failed',
                    error: 'content filter',
                },
                {
                    slotIndex: 3,
                    status: 'success',
                    imageUrl: 'data:image/png;base64,four',
                    isSaved: false,
                },
            ],
            draft: createDraft({ prompt: 'batch prompt' }),
            runDraft: null,
            usedReferences: [],
            runLineageSource: null,
            serializeReferences: vi.fn(async () => []),
            saveImage: (request: GenerationSaveRequest) => saveArchiveImage(request, { archive: { get: async () => null, save: vi.fn(async (image) => {
                savedImages.push(image.id);
                return image;
            }), remove: vi.fn() }, lineage: {
                getByArchiveImageId: vi.fn(async () => []),
                save: vi.fn(async (input) => ({
                    id: input.id ?? 'lineage-step',
                    archiveImageId: input.archiveImageId,
                    parentStepId: input.parentStepId ?? null,
                    stepType: input.stepType,
                    timestamp: input.timestamp ?? '2026-06-05T12:00:00.000Z',
                    metadata: input.metadata,
                })),
            } }),
            createArchiveImageId: vi.fn()
                .mockReturnValueOnce('archive-0')
                .mockReturnValueOnce('archive-3'),
            now: vi.fn(() => new Date('2026-06-05T12:00:00.000Z'))
        });

        expect(savedImages).toEqual(['archive-0', 'archive-3']);
        expect(nextResults).toEqual([
            {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,one',
                isSaved: true,
                archiveImageId: 'archive-0',
            },
            {
                slotIndex: 1,
                status: 'success',
                imageUrl: 'data:image/png;base64,two',
                isSaved: true,
                archiveImageId: 'already-saved',
            },
            {
                slotIndex: 2,
                status: 'failed',
                error: 'content filter',
            },
            {
                slotIndex: 3,
                status: 'success',
                imageUrl: 'data:image/png;base64,four',
                isSaved: true,
                archiveImageId: 'archive-3',
            },
        ]);
    });
});

describe('Generate controller result Reference iteration', () => {
    it('adds an unsaved generated result as a Reference image without carrying a lineage source', () => {
        const addReferenceFiles = vi.fn();
        const saveLineageSource = vi.fn();
        const clearLineageSource = vi.fn();

        const added = addGeneratedResultAsReference({
            slot: {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,dW5zYXZlZC1yZXN1bHQ=',
                isSaved: false,
            },
            addReferenceFiles,
            session: {
                saveLineageSource,
                clearLineageSource,
            },
        });

        expect(added).toBe(true);
        expect(addReferenceFiles).toHaveBeenCalledWith([
            expect.objectContaining({
                name: 'generated-result-1.png',
                type: 'image/png',
            }),
        ]);
        expect(saveLineageSource).not.toHaveBeenCalled();
        expect(clearLineageSource).toHaveBeenCalled();
    });

    it('keeps lineage when adding an unsaved autopilot result as a Reference image', () => {
        const addReferenceFiles = vi.fn();
        const saveLineageSource = vi.fn();
        const clearLineageSource = vi.fn();

        const added = addGeneratedResultAsReference({
            slot: {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,YXV0b3BpbG90',
                isSaved: false,
                archiveImageId: 'autopilot:run:iteration:1',
            },
            addReferenceFiles,
            session: {
                saveLineageSource,
                clearLineageSource,
            },
        });

        expect(added).toBe(true);
        expect(addReferenceFiles).toHaveBeenCalledWith([
            expect.objectContaining({
                name: 'generated-result-1.png',
                type: 'image/png',
            }),
        ]);
        expect(saveLineageSource).toHaveBeenCalledWith({ archiveImageId: 'autopilot:run:iteration:1' });
        expect(clearLineageSource).not.toHaveBeenCalled();
    });

    it('blocks result Reference iteration at model capacity without changing session lineage', () => {
        const addReferenceFiles = vi.fn();
        const saveLineageSource = vi.fn();
        const clearLineageSource = vi.fn();
        const setNotice = vi.fn();

        const added = addGeneratedResultAsReferenceFromAction({
            slot: {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,Y2FwYWNpdHk=',
                isSaved: true,
                archiveImageId: 'archive-at-capacity',
            },
            addReferenceFiles,
            session: {
                saveLineageSource,
                clearLineageSource,
            },
            capacityMessage: 'Nano Banana Pro already has 14 reference images for generation. Remove one before adding another.',
            setNotice,
        });

        expect(added).toBe(false);
        expect(addReferenceFiles).not.toHaveBeenCalled();
        expect(saveLineageSource).not.toHaveBeenCalled();
        expect(clearLineageSource).not.toHaveBeenCalled();
        expect(setNotice).toHaveBeenCalledWith(
            'Nano Banana Pro already has 14 reference images for generation. Remove one before adding another.',
        );
    });

});

describe('Generate controller Reference image provenance', () => {
    it.each([
        { model: QWEN_IMAGE_2_1_IMAGE_MODEL, limit: 10 },
        { model: NANO_BANANA_PRO_IMAGE_MODEL, limit: 14 },
    ] as const)('saves only the $model run references after the selection changes', async ({ model, limit }) => {
        const selectedFiles = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `reference-${index}.png`, { type: 'image/png' }),
        );
        const selectedDataUrls = selectedFiles.map((_, index) => `data:image/png;base64,reference-${index}`);
        const serializeReferenceFiles = vi.fn(async (files: File[]) =>
            files.map((file) => selectedDataUrls[selectedFiles.indexOf(file)]),
        );
        const generate = vi.fn(async () => [{
            slotIndex: 0,
            status: 'success' as const,
            imageUrl: 'data:image/png;base64,result',
        }]);
        const saveCurrentBatch = vi.fn(async (batch: GenerateBatchSnapshot) => { void batch; });
        const draft = createDraft({ model });
        const controller: { current: ReturnType<typeof useGenerateController> | null } = { current: null };

        renderToStaticMarkup(createElement(() => {
            controller.current = useGenerateController({
                imageCredential: 'http://127.0.0.1:1234',
                draft,
                getProviderCredential: () => null,
                setDraft: vi.fn(),
                referenceImages: selectedFiles,
                replaceReferences: vi.fn(),
                serializeReferences: vi.fn(async () => selectedDataUrls),
                onSaveImage: vi.fn(async (request) => request.image),
                session: {
                    loadCurrentBatch: vi.fn(async () => null),
                    saveCurrentBatch,
                    clearCurrentResult: vi.fn(async () => undefined),
                    consumeTransferredReferences: vi.fn(async () => []),
                    loadLineageSource: vi.fn(() => null),
                    saveLineageSource: vi.fn(),
                    clearLineageSource: vi.fn(),
                },
                workflow: { generate, serializeReferences: serializeReferenceFiles },
            });
            return null;
        }));
        await controller.current!.generate();

        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            referenceImages: selectedFiles.slice(0, limit),
        }));
        expect(serializeReferenceFiles).toHaveBeenCalledWith(selectedFiles.slice(0, limit));
        const snapshot = saveCurrentBatch.mock.calls[0]?.[0];
        expect(snapshot?.references).toEqual(selectedDataUrls.slice(0, limit));

        selectedFiles.length = 0;
        const serializeCurrentReferences = vi.fn(async () => ['data:image/png;base64,changed']);
        const saveImage = vi.fn(async (image) => image);
        const saveLineage = vi.fn(async (step: SaveLineageStepInput) => ({ ...step, id: 'step-1' }));
        await saveGenerateResultSlots({
            results: snapshot!.results,
            draft,
            runDraft: snapshot!.draft,
            usedReferences: snapshot!.references,
            runLineageSource: snapshot!.lineageSource,
            serializeReferences: serializeCurrentReferences,
            saveImage: (request: GenerationSaveRequest) => saveArchiveImage(request, { archive: { get: async () => null, save: saveImage, remove: vi.fn() }, lineage: { getByArchiveImageId: vi.fn(async () => []), save: saveLineage } }),
            createArchiveImageId: () => 'reference-archive'
        });

        expect(serializeCurrentReferences).not.toHaveBeenCalled();
        expect(saveImage.mock.calls[0]?.[0].references).toEqual(selectedDataUrls.slice(0, limit));
        expect(saveLineage).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                referenceCount: limit,
                referenceImages: expect.objectContaining({ count: limit }),
            }),
        }));
    });
});

describe('Generate controller Autopilot archive controls', () => {
    it('saves a Qwen best result with the one-image controls used by Autopilot', async () => {
        const draft = createDraft({
            model: QWEN_IMAGE_2_1_IMAGE_MODEL,
            prompt: 'paper crane',
            qwenImage2_1: { aspectRatio: '16:9', imageSize: '2K', background: 'transparent', batchSize: 4 },
        });
        const saveCurrentBatch = vi.fn(async (batch: GenerateBatchSnapshot) => { void batch; });
        const saveImage = vi.fn(async (image) => image);
        let nextStep = 0;
        const saveLineage = vi.fn(async (step: SaveLineageStepInput) => ({
            ...step,
            id: `step-${++nextStep}`,
        }));
        const controller: { current: ReturnType<typeof useGenerateController> | null } = { current: null };

        renderToStaticMarkup(createElement(() => {
            controller.current = useGenerateController({
                imageCredential: 'http://127.0.0.1:1234',
                getProviderCredential: () => 'hosted-reasoning-key',
                draft,
                setDraft: vi.fn(),
                referenceImages: [],
                replaceReferences: vi.fn(),
                serializeReferences: vi.fn(async () => []),
                onSaveImage: async (request) => saveImage(request.image),
                session: {
                    loadCurrentBatch: vi.fn(async () => null),
                    saveCurrentBatch,
                    clearCurrentResult: vi.fn(async () => undefined),
                    consumeTransferredReferences: vi.fn(async () => []),
                    loadLineageSource: vi.fn(() => null),
                    saveLineageSource: vi.fn(),
                    clearLineageSource: vi.fn(),
                },
                lineage: { getByArchiveImageId: vi.fn(async () => []), save: saveLineage },
                workflow: {
                    generate: vi.fn(async () => [{
                        slotIndex: 0,
                        status: 'success' as const,
                        imageUrl: 'data:image/png;base64,best',
                    }]),
                    serializeReferences: vi.fn(async () => []),
                },
                createAutopilot: (input) => createAutopilotSession(input, { reasoningClient: {
                    createResponse: vi.fn(async () => ({ outputText: JSON.stringify({ score: 95, feedback: ['Good.'] }) })),
                } }),
            });
            return null;
        }));

        await controller.current!.runAutopilot({ goal: 'A paper crane', maxIterations: 1 });
        expect(saveCurrentBatch).toHaveBeenCalledTimes(1);
        const finalSnapshot = saveCurrentBatch.mock.calls.at(-1)?.[0];
        expect(finalSnapshot?.draft).toMatchObject({
            prompt: 'paper crane',
            qwenImage2_1: { aspectRatio: '16:9', imageSize: '2K', background: 'transparent', batchSize: 1 },
        });

        await saveGenerateResultSlots({
            results: finalSnapshot!.results,
            draft,
            runDraft: finalSnapshot!.draft,
            usedReferences: finalSnapshot!.references,
            runLineageSource: finalSnapshot!.lineageSource,
            serializeReferences: vi.fn(async () => []),
            saveImage: (request: GenerationSaveRequest) => saveArchiveImage(request, { archive: { get: async () => null, save: saveImage, remove: vi.fn() }, lineage: { getByArchiveImageId: vi.fn(async () => []), save: saveLineage } }),
            createArchiveImageId: () => 'saved-best'
        });

        expect(saveImage.mock.calls[0]?.[0]).toMatchObject({
            model: QWEN_IMAGE_2_1_IMAGE_MODEL,
            quality: '2K',
            aspectRatio: '16:9',
            background: 'transparent',
        });
        expect(saveLineage.mock.calls.at(-1)?.[0].metadata).toMatchObject({
            imageModel: {
                slug: QWEN_IMAGE_2_1_IMAGE_MODEL,
                controls: { aspectRatio: '16:9', imageSize: '2K', background: 'transparent', batchSize: 1 },
            },
        });
    });
});

function createDraft(overrides: Partial<GenerateDraft>): GenerateDraft {
    return {
        ...DEFAULT_GENERATE_DRAFT,
        prompt: 'studio prompt',
        style: 'none',
        lighting: 'none',
        palette: 'none',
        ...overrides,
        gptImage: {
            ...DEFAULT_GENERATE_DRAFT.gptImage,
            ...overrides.gptImage,
        },
        nanoBananaPro: {
            ...DEFAULT_GENERATE_DRAFT.nanoBananaPro,
            ...overrides.nanoBananaPro,
        },
    };
}
