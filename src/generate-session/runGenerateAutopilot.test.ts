import { describe, expect, it, vi } from 'vitest';
import { runGenerateAutopilot } from './runGenerateAutopilot';
import { createAutopilotSession } from '../autopilot/AutopilotSession';
import { NANO_BANANA_PRO_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL } from '../utils/openaiModels';
import type { GenerateImageInput } from '../image-workflow/ImageWorkflow';
import { createLineageStore, type LineageStep, type SaveLineageStepInput } from '../lineage/LineageStore';
import type { ApiCostLedger } from '../db/types';
import { calculateApiCostTotals } from '../costs/apiCost';
import { saveGenerateResultSlots } from './useGenerateController';
import { saveArchiveImage } from '../archive/saveArchiveImage';
import { loadLineageTimeline } from '../lineage/loadLineageTimeline';
import { createGenerateSessionStore, DEFAULT_GENERATE_DRAFT } from './GenerateSession';

describe('runGenerateAutopilot', () => {
    it.each(['archive', 'explicit', 'root'])('keeps %s ancestry through Autopilot and final archive save', async (sourceKind) => {
        const steps = new Map<string, LineageStep>();
        const lineage = createLineageStore({ metadata: {
            save: async (step) => { steps.set(step.id, step); },
            getById: async (id) => steps.get(id) ?? null,
            getByArchiveImageId: async (id) => [...steps.values()].filter((step) => step.archiveImageId === id),
            getChildren: async (id) => [...steps.values()].filter((step) => step.parentStepId === id),
        } });
        const original = await lineage.save({ archiveImageId: 'source', stepType: 'generation', metadata: {} });
        const latest = await lineage.save({ archiveImageId: 'source', parentStepId: original.id, stepType: 'overwrite', metadata: {} });
        const blobs = new Map<string, string>();
        const session = createGenerateSessionStore({ blobStorage: {
            save: async (key, value) => { blobs.set(key, value); }, load: async (key) => blobs.get(key) ?? null,
            remove: async (key) => { blobs.delete(key); }, listKeys: async () => [...blobs.keys()],
        } });
        if (sourceKind !== 'root') {
            await session.transferFromArchive({
                id: 'source', url: 'source-image', prompt: 'original', quality: 'high',
                aspectRatio: '1024x1024', background: 'auto', timestamp: '2026-10-24',
            }, sourceKind === 'explicit' ? { archiveImageId: 'source', stepId: original.id } : undefined);
        }
        const outcome = await runGenerateAutopilot({
            goal: 'portrait', imageCredential: 'key', getProviderCredential: () => 'reasoning-key',
            draft: { ...DEFAULT_GENERATE_DRAFT, prompt: 'portrait' }, referenceImages: [],
            sessionStore: session, lineageStore: lineage,
            workflow: { generate: async () => [{ slotIndex: 0, status: 'success', imageUrl: 'data:image/png;base64,new' }], serializeReferences: async () => [] },
            createSession: (input) => createAutopilotSession(input, { reasoningClient: {
                createResponse: async () => ({ outputText: JSON.stringify({ score: 95, feedback: [] }) }),
            } }),
        });
        const iteration = outcome.result.iterations[0];
        const expectedParent = sourceKind === 'archive' ? latest.id : sourceKind === 'explicit' ? original.id : null;
        expect(steps.get(iteration.stepId ?? '')?.parentStepId).toBe(expectedParent);
        const batch = outcome.batch;
        if (!batch?.draft) throw new Error('Missing candidate');
        await saveGenerateResultSlots({
            results: batch.results, draft: batch.draft, runDraft: batch.draft,
            usedReferences: batch.references, runLineageSource: batch.lineageSource,
            serializeReferences: async () => [], createArchiveImageId: () => 'final',
            saveImage: (request) => saveArchiveImage(request, { lineage, archive: {
                get: async () => null, save: async (image) => image, remove: async () => {},
            } }),
        });
        const timeline = await loadLineageTimeline('final', lineage);
        expect(timeline.entries.some((entry) => entry.id === original.id)).toBe(sourceKind !== 'root');
        expect(timeline.entries.some((entry) => entry.id === latest.id)).toBe(sourceKind === 'archive');
    });

    it.each([1, 2])('retains and saves the paid candidate when lineage fails on iteration %i', async (failedIteration) => {
        let imageNumber = 0;
        let stepNumber = 0;
        const failure = new Error('lineage storage full');
        const createResponse = vi.fn()
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 80, feedback: ['Improve light.'] }) })
            .mockResolvedValueOnce({ outputText: 'refined prompt' })
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 20, feedback: ['Still dark.'] }) });
        const onIterationComplete = vi.fn();
        const outcome = await runGenerateAutopilot({
            goal: 'portrait', imageCredential: 'key', getProviderCredential: () => 'reasoning-key',
            draft: { ...DEFAULT_GENERATE_DRAFT, prompt: 'original prompt' },
            referenceImages: [new File(['reference'], 'reference.png')],
            sessionStore: { loadLineageSource: () => ({ archiveImageId: 'original', stepId: 'original-step' }) },
            lineageStore: { getByArchiveImageId: async () => [], save: async (step) => {
                if (++stepNumber === failedIteration) throw failure;
                return { ...step, id: `step-${stepNumber}` };
            } },
            workflow: {
                generate: async () => [{
                    slotIndex: 0, status: 'success', imageUrl: `data:image/png;base64,image-${++imageNumber}`,
                    actualParameters: { size: '1024x1024', revisedPrompt: `actual-${imageNumber}` },
                    costLedger: { version: 1, currency: 'USD', items: [{
                        id: `image-${imageNumber}`, kind: 'image-generation', operation: 'image-generation',
                        provider: 'openai', model: DEFAULT_GENERATE_DRAFT.model, label: 'Image generation',
                        status: 'calculated', currency: 'USD', amountUsd: 0.04,
                    }] },
                }],
                serializeReferences: async () => ['data:image/png;base64,reference'],
            },
            createSession: (input) => createAutopilotSession(input, { reasoningClient: { createResponse } }),
            onIterationComplete,
        });
        expect(outcome.result.status).toBe('failed');
        expect(outcome.result.error).toBe(failure);
        expect(imageNumber).toBe(failedIteration);
        expect(createResponse).toHaveBeenCalledTimes(failedIteration * 2 - 1);
        expect(outcome.result.iterations).toHaveLength(failedIteration);
        expect(outcome.result.iterations.at(-1)?.stepId).toBeNull();
        expect(onIterationComplete).toHaveBeenCalledTimes(failedIteration);
        const batch = outcome.batch;
        expect(batch).not.toBeNull();
        if (!batch?.draft) throw new Error('Missing retained batch');
        expect(batch.draft.prompt).toBe(failedIteration === 1 ? 'original prompt' : 'refined prompt');
        expect(batch.references).toEqual(['data:image/png;base64,reference']);
        expect(batch.results[0]).toMatchObject({
            imageUrl: `data:image/png;base64,image-${failedIteration}`,
            actualParameters: { revisedPrompt: `actual-${failedIteration}` },
        });
        expect(batch.lineageSource?.stepId).toBe(failedIteration === 1 ? 'original-step' : 'step-1');
        const saveImage = vi.fn(async (request: Parameters<Parameters<typeof saveGenerateResultSlots>[0]['saveImage']>[0]) => request.image);
        const saved = await saveGenerateResultSlots({
            results: batch.results, draft: batch.draft, runDraft: batch.draft,
            usedReferences: batch.references, runLineageSource: batch.lineageSource,
            serializeReferences: async () => [], saveImage,
        });
        expect(saved[0]).toMatchObject({ status: 'success', isSaved: true });
        expect(saveImage.mock.calls[0][0]).toMatchObject({
            source: batch.lineageSource,
            image: { prompt: batch.draft.prompt, references: batch.references },
        });
        expect(calculateApiCostTotals(saveImage.mock.calls[0][0].image.costLedger).imageGenerationTotalUsd).toBeCloseTo(0.04 * failedIteration);
    });

    it('fails reference serialization before spending on generation', async () => {
        const generate = vi.fn();
        await expect(runGenerateAutopilot({
            goal: 'portrait', imageCredential: 'key', getProviderCredential: () => 'reasoning-key',
            draft: DEFAULT_GENERATE_DRAFT, referenceImages: [],
            sessionStore: { loadLineageSource: () => null },
            lineageStore: { getByArchiveImageId: async () => [], save: vi.fn() },
            workflow: { generate, serializeReferences: async () => { throw new Error('reference read failed'); } },
            createSession: (input) => createAutopilotSession(input, { reasoningClient: { createResponse: vi.fn() } }),
        })).rejects.toThrow('reference read failed');
        expect(generate).not.toHaveBeenCalled();
    });

    it('limits and returns the provider-used Reference image snapshot for Nano Banana Pro runs', async () => {
        const selectedReferenceFiles = Array.from({ length: 15 }, (_, index) =>
            new File([`reference-${index}`], `ref-${index}.png`, { type: 'image/png' }),
        );
        const expectedProviderReferenceFiles = selectedReferenceFiles.slice(0, 14);
        const expectedProviderReferenceNames = expectedProviderReferenceFiles.map((file) => file.name);
        const selectedReferenceDataUrls = selectedReferenceFiles.map((file, index) =>
            `data:${file.type};base64,reference-${index}`,
        );
        const referenceDataUrlByFile = new Map<File, string>(
            selectedReferenceFiles.map((file, index) => [file, selectedReferenceDataUrls[index]]),
        );
        const seenReferenceNames: string[][] = [];
        const generate = vi.fn(async (input: GenerateImageInput) => {
            seenReferenceNames.push(input.referenceImages.map((file) => file.name));
            input.referenceImages.push(new File(['request-mutation'], `request-mutated-${seenReferenceNames.length}.png`, { type: 'image/png' }));
            selectedReferenceFiles.unshift(new File(['new-reference'], `new-ref-${seenReferenceNames.length}.png`, { type: 'image/png' }));

            return [{
                slotIndex: 0,
                status: 'success' as const,
                imageUrl: `data:image/png;base64,iteration-${seenReferenceNames.length}`,
                actualParameters: {
                    elapsedMs: seenReferenceNames.length * 100,
                    size: '4096x2304',
                },
            }];
        });
        const serializeReferences = vi.fn(async (files: File[]) =>
            files.map((file) => referenceDataUrlByFile.get(file) ?? 'data:image/png;base64,unknown'),
        );
        let nextStep = 0;
        const saveLineageStep = vi.fn(async (step: SaveLineageStepInput): Promise<LineageStep> => {
            nextStep += 1;
            return {
                id: `step-${nextStep}`,
                archiveImageId: step.archiveImageId,
                parentStepId: step.parentStepId ?? null,
                stepType: step.stepType,
                timestamp: step.timestamp ?? '2026-06-05T12:00:00.000Z',
                metadata: step.metadata,
            };
        });

        const outcome = await runGenerateAutopilot({
            goal: 'A cinematic portrait',
            imageCredential: 'key',
            getProviderCredential: () => 'reasoning-key',
            draft: {
                model: NANO_BANANA_PRO_IMAGE_MODEL,
                prompt: 'prompt 1',
                style: 'risograph poster',
                lighting: 'golden hour',
                palette: 'copper + teal + cream',
                gptImage: {
                    quality: 'high',
                    size: '1024x1024',
                    background: 'transparent',
                    batchSize: 1,
                },
                nanoBananaPro: {
                    aspectRatio: '16:9',
                    imageSize: '4K',
                    batchSize: 1,
                },
                qwenImage2_1: DEFAULT_GENERATE_DRAFT.qwenImage2_1,
                flux2Klein4b: DEFAULT_GENERATE_DRAFT.flux2Klein4b,
                isSaved: false,
            },
            referenceImages: selectedReferenceFiles,
            sessionStore: {
                loadLineageSource: () => null,
            },
            lineageStore: {
                getByArchiveImageId: async () => [],
                save: saveLineageStep,
            },
            workflow: {
                generate,
                serializeReferences,
            },
            createSession: (input) => createAutopilotSession(input, { reasoningClient: {
                createResponse: vi.fn()
                    .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 45, feedback: ['Needs stronger lighting.'] }) })
                    .mockResolvedValueOnce({ outputText: 'best prompt' })
                    .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 88, feedback: ['Best so far.'] }) }),
            } }),
            maxIterations: 2,
            satisfactionThreshold: 90,
        });

        expect(seenReferenceNames).toEqual([
            expectedProviderReferenceNames,
            expectedProviderReferenceNames,
        ]);
        expect(serializeReferences).toHaveBeenCalledWith(expectedProviderReferenceFiles);
        expect(outcome.batch).toEqual({
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,iteration-2',
                isSaved: false,
                costLedger: expect.any(Object),
                actualParameters: {
                    elapsedMs: 200,
                    size: '4096x2304',
                },
                archiveImageId: expect.stringMatching(/^autopilot:/),
            }],
            references: selectedReferenceDataUrls.slice(0, 14),
            draft: expect.objectContaining({
                model: NANO_BANANA_PRO_IMAGE_MODEL,
                prompt: 'best prompt',
                nanoBananaPro: expect.objectContaining({ batchSize: 1 }),
            }),
            lineageSource: {
                archiveImageId: expect.stringMatching(/^autopilot:/),
                stepId: 'step-2',
            },
        });
    });

    it('keeps the latest failed-evaluation candidate saveable with its own prompt and lineage', async () => {
        let imageNumber = 0;
        let stepNumber = 0;
        const createResponse = vi.fn()
            .mockResolvedValueOnce({ outputText: JSON.stringify({ score: 80, feedback: ['Improve light.'] }) })
            .mockResolvedValueOnce({ outputText: 'refined prompt' })
            .mockRejectedValueOnce(new Error('evaluation quota exceeded'));
        const outcome = await runGenerateAutopilot({
            goal: 'portrait', imageCredential: 'key', getProviderCredential: () => 'reasoning-key',
            draft: { ...DEFAULT_GENERATE_DRAFT, prompt: 'original prompt' },
            referenceImages: [], sessionStore: { loadLineageSource: () => null },
            lineageStore: { getByArchiveImageId: async () => [], save: async (step) => ({ ...step, id: `step-${++stepNumber}` }) },
            workflow: {
                generate: async () => [{
                    slotIndex: 0, status: 'success', imageUrl: `data:image/png;base64,image-${++imageNumber}`,
                    costLedger: { version: 1, currency: 'USD', items: [{
                        id: `image-${imageNumber}`, kind: 'image-generation', operation: 'image-generation',
                        provider: 'openai', model: DEFAULT_GENERATE_DRAFT.model, label: 'Image generation',
                        status: 'calculated', currency: 'USD', amountUsd: 0.04,
                    }] },
                }],
                serializeReferences: async () => [],
            },
            createSession: (input) => createAutopilotSession(input, { reasoningClient: { createResponse } }),
        });

        expect(outcome.result.status).toBe('failed');
        expect(outcome.result.bestIteration?.iterationNumber).toBe(1);
        expect(outcome.batch?.draft?.prompt).toBe('refined prompt');
        expect(outcome.batch?.results[0]).toMatchObject({
            status: 'success', imageUrl: 'data:image/png;base64,image-2',
            archiveImageId: outcome.result.iterations[1].archiveImageId,
        });
        expect(outcome.batch?.lineageSource?.stepId).toBe('step-2');
        const slot = outcome.batch?.results[0];
        expect(calculateApiCostTotals(slot?.status === 'success' ? slot.costLedger : undefined).imageGenerationTotalUsd).toBeCloseTo(0.08);
    });

    it('runs Qwen images with hosted reasoning and charges only for reasoning', async () => {
        const imageCost: ApiCostLedger = {
            version: 1,
            currency: 'USD',
            items: [{
                id: 'local-image',
                kind: 'image-generation',
                operation: 'image-generation',
                provider: 'local',
                model: QWEN_IMAGE_2_1_IMAGE_MODEL,
                label: 'Image generation',
                status: 'calculated',
                currency: 'USD',
                amountUsd: 0,
                note: 'Local inference — no API charge.',
            }],
        };
        const generate = vi.fn(async () => [{
            slotIndex: 0,
            status: 'success' as const,
            imageUrl: 'data:image/png;base64,qwen-result',
            costLedger: imageCost,
        }]);
        const createResponse = vi.fn(async () => ({
            outputText: JSON.stringify({ score: 95, feedback: ['Good.'] }),
            usage: { input_tokens: 600, output_tokens: 100 },
        }));
        const save = vi.fn(async (step: SaveLineageStepInput): Promise<LineageStep> => ({
            ...step,
            id: 'qwen-step',
        }));

        const outcome = await runGenerateAutopilot({
            goal: 'A paper crane',
            imageCredential: 'http://127.0.0.1:1234',
            getProviderCredential: () => 'hosted-reasoning-key',
            reasoningModel: 'gpt-6-sol',
            draft: {
                ...DEFAULT_GENERATE_DRAFT,
                model: QWEN_IMAGE_2_1_IMAGE_MODEL,
                prompt: 'paper crane',
                qwenImage2_1: {
                    aspectRatio: '16:9',
                    imageSize: '2K',
                    background: 'transparent',
                    batchSize: 4,
                },
            },
            referenceImages: [],
            sessionStore: {
                loadLineageSource: () => null,
            },
            lineageStore: { getByArchiveImageId: async () => [], save },
            workflow: { generate, serializeReferences: vi.fn(async () => []) },
            createSession: (input) => createAutopilotSession(input, { reasoningClient: { createResponse } }),
            maxIterations: 1,
            satisfactionThreshold: 90,
        });

        expect(generate).toHaveBeenCalledWith(expect.objectContaining({
            credential: 'http://127.0.0.1:1234',
            model: QWEN_IMAGE_2_1_IMAGE_MODEL,
            controls: { aspectRatio: '16:9', imageSize: '2K', background: 'transparent', batchSize: 1 },
        }));
        expect(createResponse).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'hosted-reasoning-key' }));
        expect(save).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                imageModel: {
                    slug: QWEN_IMAGE_2_1_IMAGE_MODEL,
                    controls: {
                        aspectRatio: '16:9',
                        imageSize: '2K',
                        background: 'transparent',
                        batchSize: 1,
                    },
                },
            }),
        }));
        expect(calculateApiCostTotals(outcome.result.bestIteration?.costLedger)).toMatchObject({
            totalUsd: 0.003,
            imageGenerationTotalUsd: 0,
            reasoningTotalUsd: 0.003,
        });
        expect(outcome.batch).toEqual(expect.objectContaining({
            draft: expect.objectContaining({
                prompt: 'paper crane',
                qwenImage2_1: expect.objectContaining({
                    aspectRatio: '16:9', imageSize: '2K', background: 'transparent', batchSize: 1,
                }),
            }),
            results: [expect.objectContaining({ costLedger: expect.objectContaining({
                items: expect.arrayContaining([
                    expect.objectContaining({ provider: 'local', amountUsd: 0 }),
                    expect.objectContaining({ provider: 'openai', amountUsd: 0.003 }),
                ]),
            }) })],
        }));
    });
});
