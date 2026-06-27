import { describe, expect, it, vi } from 'vitest';
import { runGenerateAutopilot } from './runGenerateAutopilot';
import { NANO_BANANA_PRO_IMAGE_MODEL } from '../utils/openaiModels';
import type { GenerateImageInput } from '../image-workflow/ImageWorkflow';
import type { LineageStep, SaveLineageStepInput } from '../lineage/LineageStore';

describe('runGenerateAutopilot', () => {
    it('delegates to AutopilotSession and persists the best result', async () => {
        const initialCostLedger = {
            version: 1 as const,
            currency: 'USD' as const,
            items: [{
                id: 'goal-translation',
                kind: 'reasoning' as const,
                operation: 'goal-translation',
                provider: 'openai' as const,
                model: 'gpt-5.4',
                label: 'Goal translation',
                status: 'calculated' as const,
                currency: 'USD' as const,
                amountUsd: 0.00055,
            }],
        };
        const run = vi.fn(async () => ({
            status: 'satisfied' as const,
            error: null,
            iterations: [
                {
                    stepId: 'step-1',
                    archiveImageId: 'autopilot:run:iteration:1',
                    iterationNumber: 1,
                    prompt: 'refined prompt',
                    imageDataUrl: 'data:image/png;base64,best',
                    actualParameters: { elapsedMs: 123, size: '1536x1024' },
                    score: 97,
                    feedback: ['Great match.'],
                },
            ],
            bestIteration: {
                stepId: 'step-1',
                archiveImageId: 'autopilot:run:iteration:1',
                iterationNumber: 1,
                prompt: 'refined prompt',
                imageDataUrl: 'data:image/png;base64,best',
                actualParameters: { elapsedMs: 123, size: '1536x1024' },
                score: 97,
                feedback: ['Great match.'],
            },
        }));
        const cancel = vi.fn();
        const createSession = vi.fn(() => ({ run, cancel }));
        const saveCurrentBatch = vi.fn(async () => undefined);
        const saveLineageSource = vi.fn();
        const onSessionCreated = vi.fn();

        const outcome = await runGenerateAutopilot({
            goal: 'A cinematic portrait',
            apiKey: 'key',
            reasoningApiKey: 'reasoning-key',
            reasoningModel: 'gemini-2.5-flash',
            draft: {
                model: 'gpt-image-2',
                prompt: 'prompt 1',
                style: 'risograph poster',
                lighting: 'golden hour',
                palette: 'copper + teal + cream',
                gptImage2: {
                    quality: 'high',
                    size: '1024x1024',
                    background: 'transparent',
                    batchSize: 1,
                },
                nanoBananaPro: {
                    aspectRatio: '1:1',
                    imageSize: '1K',
                    batchSize: 1,
                },
                isSaved: false,
            },
            referenceImages: [],
            sessionStore: {
                loadLineageSource: () => ({ archiveImageId: 'source-image', stepId: 'step-parent' }),
                saveCurrentBatch,
                saveLineageSource,
            },
            lineageStore: {
                save: vi.fn(),
            },
            createSession,
            initialCostLedger,
            onSessionCreated,
        });

        expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'A cinematic portrait',
            initialPrompt: 'prompt 1',
            reasoningApiKey: 'reasoning-key',
            reasoningModel: 'gemini-2.5-flash',
            initialParentStepId: 'step-parent',
            initialCostLedger,
        }));
        expect(run).toHaveBeenCalledOnce();
        expect(onSessionCreated).toHaveBeenCalledWith(expect.objectContaining({ run, cancel }));
        expect(saveCurrentBatch).toHaveBeenCalledWith({
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,best',
                isSaved: false,
                actualParameters: { elapsedMs: 123, size: '1536x1024' },
                archiveImageId: 'autopilot:run:iteration:1',
            }],
            references: [],
            draft: null,
            lineageSource: { archiveImageId: 'autopilot:run:iteration:1', stepId: 'step-1' },
        });
        expect(saveLineageSource).toHaveBeenCalledWith({ archiveImageId: 'autopilot:run:iteration:1', stepId: 'step-1' });
        expect(outcome.session.cancel).toBe(cancel);
    });

    it('limits and persists the provider-used Reference image snapshot for Nano Banana Pro runs', async () => {
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
        const saveCurrentBatch = vi.fn(async () => undefined);
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
            apiKey: 'key',
            reasoningApiKey: 'reasoning-key',
            draft: {
                model: NANO_BANANA_PRO_IMAGE_MODEL,
                prompt: 'prompt 1',
                style: 'risograph poster',
                lighting: 'golden hour',
                palette: 'copper + teal + cream',
                gptImage2: {
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
                isSaved: false,
            },
            referenceImages: selectedReferenceFiles,
            sessionStore: {
                loadLineageSource: () => null,
                saveCurrentBatch,
                saveLineageSource: vi.fn(),
            },
            lineageStore: {
                save: saveLineageStep,
            },
            workflow: {
                generate,
                serializeReferences,
            },
            evaluate: vi.fn()
                .mockResolvedValueOnce({ score: 45, feedback: ['Needs stronger lighting.'] })
                .mockResolvedValueOnce({ score: 88, feedback: ['Best so far.'] }),
            refine: vi.fn().mockResolvedValueOnce('best prompt'),
            maxIterations: 2,
            satisfactionThreshold: 90,
        });

        expect(seenReferenceNames).toEqual([
            expectedProviderReferenceNames,
            expectedProviderReferenceNames,
        ]);
        expect(serializeReferences).toHaveBeenCalledWith(expectedProviderReferenceFiles);
        expect(saveCurrentBatch).toHaveBeenCalledWith({
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: 'data:image/png;base64,iteration-2',
                isSaved: false,
                actualParameters: {
                    elapsedMs: 200,
                    size: '4096x2304',
                },
                archiveImageId: expect.stringMatching(/^autopilot:/),
            }],
            references: selectedReferenceDataUrls.slice(0, 14),
            draft: null,
            lineageSource: {
                archiveImageId: expect.stringMatching(/^autopilot:/),
                stepId: 'step-2',
            },
        });
        expect(outcome.usedReferenceImages.map((file) => file.name)).toEqual(
            expectedProviderReferenceNames,
        );
        expect(outcome.usedReferences).toEqual(selectedReferenceDataUrls.slice(0, 14));
    });
});
