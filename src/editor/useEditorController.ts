import { useCallback, useState } from 'react';
import type { ArchiveLayerStack } from '../db/types';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import type { ImageModelSlug } from '../utils/openaiModels';
import { applyAiTransformResultToDraft, renderAiTransformEditInput } from './aiTransform';
import {
    hasDurableLayerStack,
    type EditorAdjustments,
    type EditorDraft,
} from './layers';
import type { EditorSaveContext } from './saveEditedImage';

interface UseEditorControllerOptions {
    apiKey: string | null;
    model: ImageModelSlug;
    isCanvasReady: boolean;
    draft: EditorDraft | null;
    layerStack: ArchiveLayerStack | null;
    selectedLayerIds: string[];
    commitDraft: (draft: EditorDraft, recordHistory?: boolean) => void;
    referenceImages: File[];
    addReferenceFiles: (files: File[]) => void;
    serializeReferences: () => Promise<string[]>;
    exportDataUrl: () => Promise<string>;
    adjustments: EditorAdjustments;
    onSave: (updatedUrl: string, context: EditorSaveContext) => void | Promise<void>;
}

export function useEditorController({
    apiKey,
    model,
    isCanvasReady,
    draft,
    layerStack,
    commitDraft,
    referenceImages,
    addReferenceFiles,
    serializeReferences,
    exportDataUrl,
    adjustments,
    onSave,
}: UseEditorControllerOptions) {
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [lastAiEditPrompt, setLastAiEditPrompt] = useState<string | null>(null);
    const [lastAiEditModel, setLastAiEditModel] = useState<ImageModelSlug | null>(null);
    const [lastAiTargetMode, setLastAiTargetMode] = useState<'whole-composition' | 'selected-layers' | null>(null);
    const [lastAiTargetLayerCount, setLastAiTargetLayerCount] = useState<number | null>(null);
    const [lastAiTargetIncludesBaseLayer, setLastAiTargetIncludesBaseLayer] = useState<boolean | null>(null);
    const [lastAiResultLayerId, setLastAiResultLayerId] = useState<string | null>(null);
    const [lastAiResultLayerName, setLastAiResultLayerName] = useState<string | null>(null);

    const save = useCallback(async (isCopy: boolean = false) => {
        if (!isCanvasReady) {
            return;
        }

        try {
            const dataUrl = await exportDataUrl();
            const references = await serializeReferences();
            await Promise.resolve(onSave(dataUrl, {
                isCopy,
                references,
                adjustments,
                layerStack: layerStack && hasDurableLayerStack(layerStack) ? layerStack : null,
                aiEditPrompt: lastAiEditPrompt,
                aiEditModel: lastAiEditModel,
                targetMode: lastAiEditPrompt ? lastAiTargetMode : null,
                targetLayerCount: lastAiTargetLayerCount,
                targetIncludesBaseLayer: lastAiTargetIncludesBaseLayer,
                aiResultLayerId: lastAiResultLayerId,
                aiResultLayerName: lastAiResultLayerName,
            }));
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'Failed to save image');
        }
    }, [
        adjustments,
        exportDataUrl,
        isCanvasReady,
        lastAiEditModel,
        lastAiEditPrompt,
        lastAiResultLayerId,
        lastAiResultLayerName,
        lastAiTargetIncludesBaseLayer,
        lastAiTargetLayerCount,
        lastAiTargetMode,
        layerStack,
        onSave,
        serializeReferences,
    ]);

    const applyAiEdit = useCallback(async () => {
        if (!apiKey || !aiPrompt.trim() || !draft || !layerStack || !isCanvasReady) {
            return;
        }

        setAiLoading(true);
        setAiError(null);

        try {
            const editInput = await renderAiTransformEditInput({
                draft,
                adjustments,
                referenceImages,
            });
            const resultUrl = await imageWorkflow.edit({
                apiKey,
                model,
                prompt: aiPrompt,
                sourceImage: editInput.sourceImage,
                compositionContextImage: editInput.compositionContextImage,
                referenceImages: editInput.referenceImages,
                quality: 'medium',
            });
            const result = applyAiTransformResultToDraft(
                draft,
                editInput.targetPlan,
                resultUrl,
                () => crypto.randomUUID(),
            );

            commitDraft(result.draft);
            setLastAiEditPrompt(aiPrompt.trim());
            setLastAiEditModel(model);
            setLastAiTargetMode(editInput.targetPlan.metadata.targetMode);
            setLastAiTargetLayerCount(editInput.targetPlan.metadata.targetLayerCount);
            setLastAiTargetIncludesBaseLayer(editInput.targetPlan.metadata.targetIncludesBaseLayer);
            setLastAiResultLayerId(result.resultLayerId);
            setLastAiResultLayerName(result.resultLayerName);
            setAiPrompt('');
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'AI Edit failed');
        } finally {
            setAiLoading(false);
        }
    }, [adjustments, aiPrompt, apiKey, commitDraft, draft, isCanvasReady, layerStack, model, referenceImages]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
        if (files.length > 0) {
            addReferenceFiles(files);
        }
    }, [addReferenceFiles]);

    return {
        aiPrompt,
        setAiPrompt,
        aiLoading,
        aiError,
        isDragging,
        isCanvasReady,
        save,
        applyAiEdit,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}
