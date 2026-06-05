import { describe, expect, it, vi } from 'vitest';
import type { ArchiveLayerStack } from '../db/types';
import type { EditorAdjustments, EditorDraft } from './layers';
import { pushHistory, redoHistory, undoHistory } from './layers';
import { OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import {
    applyAiTransformResultToDraft,
    getAiTransformSaveProvenance,
    renderAiTransformEditInput,
    type AiTransformRenderer,
} from './aiTransform';

const adjustments: EditorAdjustments = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    filter: 'none',
};

describe('Editor AI transforms', () => {
    it('renders selected layers as the editable source and the full composition as context', async () => {
        const layerStack = createLayerStack();
        const userReferences = [
            new File(['user-a'], 'user-a.png', { type: 'image/png' }),
            new File(['user-b'], 'user-b.png', { type: 'image/png' }),
        ];
        const render = createRecordingRenderer();

        const result = await renderAiTransformEditInput({
            draft: createDraft(layerStack, ['layer-1']),
            adjustments,
            referenceImages: userReferences,
            render,
        });

        expect(result.targetPlan.mode).toBe('selected-layers');
        expect(result.referenceImages).toBe(userReferences);
        expect(result.compositionContextImage?.name).toBe('composition-context.png');
        expect(render).toHaveBeenCalledTimes(2);

        const sourceCall = render.mock.calls[0];
        const contextCall = render.mock.calls[1];
        expect(sourceCall?.[0].layers.map((layer) => layer.id)).toEqual(['layer-1']);
        expect(sourceCall?.[2]).toEqual({ x: 100, y: 120, width: 200, height: 220 });
        expect(contextCall?.[0].layers.map((layer) => layer.id)).toEqual(['base', 'layer-1', 'layer-2']);
        expect(contextCall?.[2]).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    });

    it('renders whole-composition edits from the full layer stack without composition context', async () => {
        const layerStack = createLayerStack();
        const render = createRecordingRenderer();

        const result = await renderAiTransformEditInput({
            draft: createDraft(layerStack, ['base']),
            adjustments,
            referenceImages: [],
            render,
        });

        expect(result.targetPlan.mode).toBe('whole-composition');
        expect(result.compositionContextImage).toBeNull();
        expect(render).toHaveBeenCalledTimes(1);
        expect(render.mock.calls[0]?.[0].layers.map((layer) => layer.id)).toEqual(['base', 'layer-1', 'layer-2']);
        expect(render.mock.calls[0]?.[2]).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    });

    it('inserts selected-layer AI results above the topmost target and hides non-base targets', () => {
        const draft = createDraft(createLayerStack(), ['layer-1', 'layer-2']);
        const input = applyAiTransformResultToDraft(
            draft,
            {
                mode: 'selected-layers',
                targetLayerIds: ['layer-1', 'layer-2'],
                targetBounds: { x: 100, y: 120, width: 450, height: 300 },
                requiresCompositionContext: true,
                metadata: {
                    targetMode: 'selected-layers',
                    targetLayerCount: 2,
                    targetIncludesBaseLayer: false,
                },
            },
            'data:image/png;base64,ai',
            () => 'ai-layer',
        );

        expect(input.resultLayerName).toBe('AI result');
        expect(input.draft.selectedLayerIds).toEqual(['ai-layer']);
        expect(input.draft.primarySelectedLayerId).toBe('ai-layer');
        expect(input.draft.layerStack.layers.map((layer) => [layer.id, layer.visible])).toEqual([
            ['base', true],
            ['layer-1', false],
            ['layer-2', false],
            ['ai-layer', true],
        ]);
        expect(input.draft.layerStack.layers.at(-1)).toEqual(expect.objectContaining({
            id: 'ai-layer',
            x: 100,
            y: 120,
            width: 450,
            height: 300,
        }));
    });

    it('inserts whole-composition AI results above visible targets and restores through undo and redo', () => {
        const beforeDraft = createDraft(createLayerStack(), ['base']);
        const after = applyAiTransformResultToDraft(
            beforeDraft,
            {
                mode: 'whole-composition',
                targetLayerIds: ['base', 'layer-1', 'layer-2'],
                targetBounds: { x: 0, y: 0, width: 1000, height: 800 },
                requiresCompositionContext: false,
                metadata: {
                    targetMode: 'whole-composition',
                    targetLayerCount: null,
                    targetIncludesBaseLayer: null,
                },
            },
            'data:image/png;base64,ai',
            () => 'whole-ai-layer',
        );
        const history = pushHistory({ past: [], present: beforeDraft, future: [] }, after.draft);
        const undone = undoHistory(history);
        const redone = redoHistory(undone);

        expect(after.draft.layerStack.layers.map((layer) => [layer.id, layer.visible])).toEqual([
            ['base', true],
            ['layer-1', false],
            ['layer-2', false],
            ['whole-ai-layer', true],
        ]);
        expect(after.draft.selectedLayerIds).toEqual(['whole-ai-layer']);
        expect(undone.present).toEqual(beforeDraft);
        expect(redone.present).toEqual(after.draft);
    });

    it('resolves save provenance only while the AI result layer exists in the present draft', () => {
        const beforeDraft = createDraft(createLayerStack(), ['layer-1']);
        const after = applyAiTransformResultToDraft(
            beforeDraft,
            {
                mode: 'selected-layers',
                targetLayerIds: ['layer-1'],
                targetBounds: { x: 100, y: 120, width: 200, height: 220 },
                requiresCompositionContext: true,
                metadata: {
                    targetMode: 'selected-layers',
                    targetLayerCount: 1,
                    targetIncludesBaseLayer: false,
                },
            },
            'data:image/png;base64,ai',
            () => 'ai-layer',
            {
                prompt: 'replace the jacket',
                model: OPENAI_IMAGE_MODEL,
            },
        );
        const history = pushHistory({ past: [], present: beforeDraft, future: [] }, after.draft);
        const undone = undoHistory(history);
        const redone = redoHistory(undone);

        expect(getAiTransformSaveProvenance(after.draft, after.provenance)).toEqual({
            aiEditPrompt: 'replace the jacket',
            aiEditModel: OPENAI_IMAGE_MODEL,
            targetMode: 'selected-layers',
            targetLayerCount: 1,
            targetIncludesBaseLayer: false,
            aiResultLayerId: 'ai-layer',
            aiResultLayerName: 'AI result',
        });
        expect(getAiTransformSaveProvenance(undone.present, after.provenance)).toBeNull();
        expect(getAiTransformSaveProvenance(redone.present, after.provenance)).toEqual(expect.objectContaining({
            aiEditPrompt: 'replace the jacket',
            aiResultLayerId: 'ai-layer',
        }));
    });
});

function createRecordingRenderer() {
    return vi.fn<AiTransformRenderer>(async (layerStack) =>
        new Blob([layerStack.layers.map((layer) => layer.id).join(',')], { type: 'image/png' }),
    );
}

function createDraft(layerStack: ArchiveLayerStack, selectedLayerIds: string[]): EditorDraft {
    return {
        layerStack,
        adjustments,
        references: [],
        selectedLayerIds,
        primarySelectedLayerId: selectedLayerIds[0] ?? null,
    };
}

function createLayerStack(): ArchiveLayerStack {
    return {
        canvasWidth: 1000,
        canvasHeight: 800,
        layers: [
            {
                id: 'base',
                name: 'Base',
                kind: 'base',
                assetUrl: 'data:image/png;base64,base',
                x: 0,
                y: 0,
                width: 1000,
                height: 800,
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: true,
            },
            {
                id: 'layer-1',
                name: 'Layer 1',
                kind: 'uploaded',
                assetUrl: 'data:image/png;base64,one',
                x: 100,
                y: 120,
                width: 200,
                height: 220,
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: false,
            },
            {
                id: 'layer-2',
                name: 'Layer 2',
                kind: 'uploaded',
                assetUrl: 'data:image/png;base64,two',
                x: 450,
                y: 260,
                width: 100,
                height: 160,
                rotation: 0,
                opacity: 0.8,
                visible: true,
                locked: false,
            },
        ],
    };
}
