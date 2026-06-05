import { describe, expect, it, vi } from 'vitest';
import type { ArchiveLayerStack } from '../db/types';
import type { EditImageInput } from '../image-workflow/ImageWorkflow';
import { OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import type { AiTransformRenderer } from './aiTransform';
import type { EditorAdjustments, EditorDraft } from './layers';
import { pushHistory, redoHistory, undoHistory, updateLayer } from './layers';
import { buildEditorSaveContext, runEditorAiTransform } from './useEditorController';

const adjustments: EditorAdjustments = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    filter: 'none',
};

describe('Editor controller AI transform flow', () => {
    it('runs an end-to-end selected-layer transform and builds save-after-transform provenance', async () => {
        const draft = createDraft(createLayerStack(), ['layer-1']);
        const referenceImages = [
            new File(['reference'], 'reference.png', { type: 'image/png' }),
        ];
        const render = createRecordingRenderer();
        const editImage = vi.fn(async (_input: EditImageInput) => 'data:image/png;base64,ai-result');

        const result = await runEditorAiTransform({
            apiKey: 'sk-test',
            model: OPENAI_IMAGE_MODEL,
            prompt: '  replace the jacket  ',
            draft,
            adjustments,
            referenceImages,
            makeId: () => 'ai-layer',
            editImage,
            render,
        });

        expect(render).toHaveBeenCalledTimes(2);
        expect(editImage).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'sk-test',
            model: OPENAI_IMAGE_MODEL,
            prompt: 'replace the jacket',
            sourceImage: expect.any(Blob),
            compositionContextImage: expect.any(File),
            referenceImages,
            quality: 'medium',
        }));
        expect(result.draft.layerStack.layers.map((layer) => [layer.id, layer.visible])).toEqual([
            ['base', true],
            ['layer-1', false],
            ['ai-layer', true],
            ['layer-2', true],
        ]);

        const context = buildEditorSaveContext({
            isCopy: false,
            references: ['data:image/png;base64,reference'],
            adjustments,
            draft: result.draft,
            aiTransformProvenance: result.provenance,
        });

        expect(context).toEqual(expect.objectContaining({
            isCopy: false,
            aiEditPrompt: 'replace the jacket',
            aiEditModel: OPENAI_IMAGE_MODEL,
            targetMode: 'selected-layers',
            targetLayerCount: 1,
            targetIncludesBaseLayer: false,
            aiResultLayerId: 'ai-layer',
            aiResultLayerName: 'AI result',
        }));
        expect(context.layerStack?.layers.map((layer) => [layer.id, layer.visible])).toEqual([
            ['base', true],
            ['layer-1', false],
            ['ai-layer', true],
            ['layer-2', true],
        ]);
    });

    it('drops stale save provenance after undoing the AI result layer', async () => {
        const draft = createDraft(createLayerStack(), ['layer-1']);
        const result = await runTransform(draft);
        const history = pushHistory({ past: [], present: draft, future: [] }, result.draft);
        const undone = undoHistory(history);

        const context = buildEditorSaveContext({
            isCopy: false,
            references: [],
            adjustments,
            draft: undone.present,
            aiTransformProvenance: result.provenance,
        });

        expect(context.aiEditPrompt).toBeUndefined();
        expect(context.aiEditModel).toBeUndefined();
        expect(context.targetMode).toBeUndefined();
        expect(context.aiResultLayerId).toBeUndefined();
        expect(context.layerStack?.layers.map((layer) => layer.id)).toEqual(['base', 'layer-1', 'layer-2']);
    });

    it('restores save provenance after redoing the AI result layer', async () => {
        const draft = createDraft(createLayerStack(), ['layer-1']);
        const result = await runTransform(draft);
        const history = pushHistory({ past: [], present: draft, future: [] }, result.draft);
        const redone = redoHistory(undoHistory(history));

        const context = buildEditorSaveContext({
            isCopy: false,
            references: [],
            adjustments,
            draft: redone.present,
            aiTransformProvenance: result.provenance,
        });

        expect(context).toEqual(expect.objectContaining({
            aiEditPrompt: 'replace the jacket',
            aiEditModel: OPENAI_IMAGE_MODEL,
            targetMode: 'selected-layers',
            targetLayerCount: 1,
            targetIncludesBaseLayer: false,
            aiResultLayerId: 'ai-layer',
            aiResultLayerName: 'AI result',
        }));
    });

    it('uses the present editor draft for layered save metadata after manual layer changes', async () => {
        const result = await runTransform(createDraft(createLayerStack(), ['layer-1']));
        const renamedLayerStack = updateLayer(result.draft.layerStack, 'ai-layer', { name: 'Retouched jacket' });
        const changedDraft = {
            ...result.draft,
            layerStack: renamedLayerStack,
        };

        const context = buildEditorSaveContext({
            isCopy: true,
            references: [],
            adjustments,
            draft: changedDraft,
            aiTransformProvenance: result.provenance,
        });

        expect(context.aiResultLayerName).toBe('Retouched jacket');
        expect(context.layerStack?.layers.find((layer) => layer.id === 'ai-layer')?.name).toBe('Retouched jacket');
    });
});

async function runTransform(draft: EditorDraft) {
    return runEditorAiTransform({
        apiKey: 'sk-test',
        model: OPENAI_IMAGE_MODEL,
        prompt: 'replace the jacket',
        draft,
        adjustments,
        referenceImages: [],
        makeId: () => 'ai-layer',
        editImage: vi.fn(async () => 'data:image/png;base64,ai-result'),
        render: createRecordingRenderer(),
    });
}

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
