import { describe, expect, it, vi } from 'vitest';
import { buildImageModelGenerateReferenceRunPlan } from '../image-models/ImageModelControls';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import { DEFAULT_GENERATE_DRAFT, type GenerateDraft } from './GenerateSession';
import {
    addGeneratedResultAsReference,
    addGeneratedResultAsReferenceFromAction,
    buildGenerateResultSlots,
    buildGeneratedArchiveImage,
    buildGeneratedArchiveImageForSave,
    notifyGenerateCompletion,
    saveGenerateResultSlots,
    shouldStreamGeneratePartials,
    snapshotGeneratedReferenceImages,
    startGeneratePartialPreviewRun,
} from './useGenerateController';

describe('Generate controller Image model archive metadata', () => {
    it('builds gpt-image-2 archive metadata from shared Image model controls', () => {
        const draft = createDraft({
            model: OPENAI_IMAGE_MODEL,
            gptImage2: {
                quality: 'high',
                size: '1536x1024',
                background: 'transparent',
                batchSize: 1,
            },
        });

        expect(buildGeneratedArchiveImage({
            id: 'generated-openai',
            url: 'data:image/png;base64,gpt',
            timestamp: '2026-06-05T12:00:00.000Z',
            draft,
            references: ['data:image/png;base64,ref'],
            actualParameters: {
                revisedPrompt: 'refined prompt',
                size: '1536x1024',
                quality: 'high',
                elapsedMs: 420,
            },
        })).toMatchObject({
            id: 'generated-openai',
            model: OPENAI_IMAGE_MODEL,
            quality: 'high',
            aspectRatio: '1536x1024',
            background: 'transparent',
            width: 1536,
            height: 1024,
            references: ['data:image/png;base64,ref'],
            actualParameters: {
                revisedPrompt: 'refined prompt',
                size: '1536x1024',
                quality: 'high',
                elapsedMs: 420,
            },
        });
    });

    it('builds nano-banana-pro archive metadata from shared Image model controls', () => {
        const draft = createDraft({
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            nanoBananaPro: {
                aspectRatio: '16:9',
                imageSize: '4K',
                batchSize: 1,
            },
        });

        expect(buildGeneratedArchiveImage({
            id: 'generated-nano',
            url: 'data:image/png;base64,nano',
            timestamp: '2026-06-05T12:00:00.000Z',
            draft,
            references: [],
        })).toMatchObject({
            id: 'generated-nano',
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            quality: '4K',
            aspectRatio: '16:9',
            background: 'auto',
            width: 4096,
            height: 2304,
            references: [],
        });
    });
});

describe('Generate controller batch result slots', () => {
    it('keeps successful and failed batch slots independent', () => {
        expect(buildGenerateResultSlots([
            {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,one',
                actualParameters: {
                    elapsedMs: 350,
                    size: '1536x1024',
                },
            },
            {
                slotIndex: 1,
                status: 'failed',
                error: 'content filter',
            },
        ])).toEqual([
            {
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,one',
                isSaved: false,
                actualParameters: {
                    elapsedMs: 350,
                    size: '1536x1024',
                },
            },
            {
                slotIndex: 1,
                status: 'failed',
                error: 'content filter',
            },
        ]);
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
            saveImage: vi.fn(async (image) => {
                savedImages.push(image.id);
                return image;
            }),
            lineageStore: {
                getByArchiveImageId: vi.fn(async () => []),
                save: vi.fn(async (input) => ({
                    id: input.id ?? 'lineage-step',
                    archiveImageId: input.archiveImageId,
                    parentStepId: input.parentStepId ?? null,
                    stepType: input.stepType,
                    timestamp: input.timestamp ?? '2026-06-05T12:00:00.000Z',
                    metadata: input.metadata,
                })),
            },
            sessionStore: {
                loadLineageSource: vi.fn(() => null),
                clearLineageSource: vi.fn(),
            },
            createArchiveImageId: vi.fn()
                .mockReturnValueOnce('archive-0')
                .mockReturnValueOnce('archive-3'),
            now: vi.fn(() => new Date('2026-06-05T12:00:00.000Z')),
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

describe('Generate controller partial preview gating', () => {
    it('streams partial previews only for single-slot GPT Image 2 runs', () => {
        expect(shouldStreamGeneratePartials(createDraft({
            model: OPENAI_IMAGE_MODEL,
            gptImage2: {
                quality: 'high',
                size: '1024x1024',
                background: 'auto',
                batchSize: 1,
            },
        }))).toBe(true);

        expect(shouldStreamGeneratePartials(createDraft({
            model: OPENAI_IMAGE_MODEL,
            gptImage2: {
                quality: 'high',
                size: '1024x1024',
                background: 'auto',
                batchSize: 2,
            },
        }))).toBe(false);

        expect(shouldStreamGeneratePartials(createDraft({
            model: NANO_BANANA_PRO_IMAGE_MODEL,
        }))).toBe(false);
    });

    it('updates and clears partial preview state only for the active run', () => {
        let currentRunId = 0;
        let currentPartialResult: string | null = 'data:image/png;base64,old';
        const setCurrentPartialResult = vi.fn((imageUrl: string | null) => {
            currentPartialResult = imageUrl;
        });

        const firstRun = startGeneratePartialPreviewRun({
            getCurrentRunId: () => currentRunId,
            setCurrentRunId: (runId) => {
                currentRunId = runId;
            },
            setCurrentPartialResult,
        });

        expect(currentPartialResult).toBeNull();

        firstRun.update('data:image/png;base64,partial-1');
        expect(currentPartialResult).toBe('data:image/png;base64,partial-1');

        const secondRun = startGeneratePartialPreviewRun({
            getCurrentRunId: () => currentRunId,
            setCurrentRunId: (runId) => {
                currentRunId = runId;
            },
            setCurrentPartialResult,
        });

        secondRun.update('data:image/png;base64,partial-2');
        firstRun.update('data:image/png;base64,stale-partial');
        firstRun.clear();

        expect(currentPartialResult).toBe('data:image/png;base64,partial-2');

        secondRun.clear();
        expect(currentPartialResult).toBeNull();
    });
});

describe('Generate controller result Reference iteration', () => {
    it('adds a saved generated result as a Reference image and keeps its lineage source', () => {
        const addReferenceFiles = vi.fn();
        const saveLineageSource = vi.fn();
        const clearLineageSource = vi.fn();

        const added = addGeneratedResultAsReference({
            slot: {
                slotIndex: 2,
                status: 'success',
                imageUrl: 'data:image/png;base64,c2F2ZWQtcmVzdWx0',
                isSaved: true,
                archiveImageId: 'archive-image-123',
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
                name: 'generated-result-3.png',
                type: 'image/png',
            }),
        ]);
        expect(saveLineageSource).toHaveBeenCalledWith({ archiveImageId: 'archive-image-123' });
        expect(clearLineageSource).not.toHaveBeenCalled();
    });

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

    it('runs the result Reference action without mutating the draft prompt or controls', () => {
        const draft = createDraft({
            prompt: 'keep this prompt',
            gptImage2: {
                quality: 'high',
                size: '1536x1024',
                background: 'transparent',
                batchSize: 4,
            },
        });
        const draftBeforeAction = structuredClone(draft);
        const addReferenceFiles = vi.fn();
        const saveLineageSource = vi.fn();
        const clearLineageSource = vi.fn();
        const setNotice = vi.fn();

        const added = addGeneratedResultAsReferenceFromAction({
            slot: {
                slotIndex: 1,
                status: 'success',
                imageUrl: 'data:image/png;base64,aXRlcmF0ZQ==',
                isSaved: false,
            },
            addReferenceFiles,
            session: {
                saveLineageSource,
                clearLineageSource,
            },
            capacityMessage: null,
            setNotice,
        });

        expect(added).toBe(true);
        expect(draft).toEqual(draftBeforeAction);
        expect(addReferenceFiles).toHaveBeenCalledTimes(1);
        expect(clearLineageSource).toHaveBeenCalled();
        expect(setNotice).toHaveBeenCalledWith(null);
    });
});

describe('Generate controller Reference image provenance', () => {
    it('saves an over-limit Nano Banana Pro result from the used Reference image snapshot', async () => {
        const draft = createDraft({
            model: NANO_BANANA_PRO_IMAGE_MODEL,
        });
        const selectedReferenceFiles = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );
        const selectedReferenceDataUrls = selectedReferenceFiles.map((file, index) =>
            `data:${file.type};base64,reference-${index}`,
        );
        const changedReferenceDataUrls = [
            'data:image/png;base64,new-reference',
            ...selectedReferenceDataUrls,
        ];
        const referenceRunPlan = buildImageModelGenerateReferenceRunPlan(
            NANO_BANANA_PRO_IMAGE_MODEL,
            selectedReferenceFiles,
        );
        const serializeReferenceFiles = vi.fn(async (files: File[]) =>
            files.map((file) => selectedReferenceDataUrls[selectedReferenceFiles.indexOf(file)]),
        );
        const serializeReferences = vi.fn(async () => changedReferenceDataUrls);

        const usedReferences = await snapshotGeneratedReferenceImages({
            referenceImages: referenceRunPlan.providerReferenceImages,
            serializeReferenceFiles,
        });
        const image = await buildGeneratedArchiveImageForSave({
            id: 'generated-nano-with-refs',
            url: 'data:image/png;base64,nano-result',
            timestamp: '2026-06-05T12:00:00.000Z',
            draft,
            usedReferences,
            serializeReferences,
        });

        expect(serializeReferenceFiles).toHaveBeenCalledWith(selectedReferenceFiles.slice(0, 14));
        expect(serializeReferences).not.toHaveBeenCalled();
        expect(image.references).toEqual(selectedReferenceDataUrls.slice(0, 14));
    });
});

describe('Generate controller completion notifications', () => {
    it('notifies when enabled and the document is hidden', () => {
        const showCompletion = vi.fn();

        notifyGenerateCompletion({
            enabled: true,
            documentHidden: true,
            notificationPort: { showCompletion },
            title: 'Generation complete',
            body: 'Your image is ready.',
        });

        expect(showCompletion).toHaveBeenCalledWith({
            title: 'Generation complete',
            body: 'Your image is ready.',
        });
    });

    it('does not notify when the document is visible or notifications are disabled', () => {
        const showCompletion = vi.fn();

        notifyGenerateCompletion({
            enabled: true,
            documentHidden: false,
            notificationPort: { showCompletion },
            title: 'Generation complete',
            body: 'Your image is ready.',
        });
        notifyGenerateCompletion({
            enabled: false,
            documentHidden: true,
            notificationPort: { showCompletion },
            title: 'Autopilot complete',
            body: 'Your run finished.',
        });

        expect(showCompletion).not.toHaveBeenCalled();
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
        gptImage2: {
            ...DEFAULT_GENERATE_DRAFT.gptImage2,
            ...overrides.gptImage2,
        },
        nanoBananaPro: {
            ...DEFAULT_GENERATE_DRAFT.nanoBananaPro,
            ...overrides.nanoBananaPro,
        },
    };
}
