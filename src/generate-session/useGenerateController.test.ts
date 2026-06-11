import { describe, expect, it, vi } from 'vitest';
import { buildImageModelGenerateReferenceRunPlan } from '../image-models/ImageModelControls';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import { DEFAULT_GENERATE_DRAFT, type GenerateDraft } from './GenerateSession';
import {
    buildGenerateResultSlots,
    buildGeneratedArchiveImage,
    buildGeneratedArchiveImageForSave,
    notifyGenerateCompletion,
    shouldStreamGeneratePartials,
    snapshotGeneratedReferenceImages,
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
        })).toMatchObject({
            id: 'generated-openai',
            model: OPENAI_IMAGE_MODEL,
            quality: 'high',
            aspectRatio: '1536x1024',
            background: 'transparent',
            width: 1536,
            height: 1024,
            references: ['data:image/png;base64,ref'],
        });
    });

    it('builds nano-banana-pro archive metadata from shared Image model controls', () => {
        const draft = createDraft({
            model: NANO_BANANA_PRO_IMAGE_MODEL,
            nanoBananaPro: {
                aspectRatio: '16:9',
                imageSize: '4K',
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
            },
            {
                slotIndex: 1,
                status: 'failed',
                error: 'content filter',
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
