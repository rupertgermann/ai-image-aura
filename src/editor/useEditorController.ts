import { useCallback, useState } from 'react';
import { imageWorkflow, type EditImageInput, type EditImageResult } from '../image-workflow/ImageWorkflow';
import type { ImageModelSlug } from '../utils/openaiModels';
import {
    applyAiTransformResultToDraft,
    blobToTransformMaskAsset,
    getAiTransformSaveProvenance,
    renderAiTransformEditInput,
    type AiTransformRenderer,
    type AiTransformSaveProvenance,
} from './aiTransform';
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
    commitDraft: (draft: EditorDraft, recordHistory?: boolean) => void;
    referenceImages: File[];
    maskImage?: File | Blob | null;
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
    commitDraft,
    referenceImages,
    maskImage,
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
    const [aiTransformProvenance, setAiTransformProvenance] = useState<AiTransformSaveProvenance | null>(null);

    const save = useCallback(async (isCopy: boolean = false) => {
        if (!isCanvasReady) {
            return;
        }

        try {
            const dataUrl = await exportDataUrl();
            const references = await serializeReferences();
            await Promise.resolve(onSave(dataUrl, buildEditorSaveContext({
                isCopy,
                references,
                adjustments,
                draft,
                aiTransformProvenance,
            })));
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'Failed to save image');
        }
    }, [
        adjustments,
        aiTransformProvenance,
        draft,
        exportDataUrl,
        isCanvasReady,
        onSave,
        serializeReferences,
    ]);

    const applyAiEdit = useCallback(async () => {
        if (!apiKey || !aiPrompt.trim() || !draft || !isCanvasReady) {
            return;
        }

        setAiLoading(true);
        setAiError(null);

        try {
            const result = await runEditorAiTransform({
                apiKey,
                model,
                prompt: aiPrompt,
                draft,
                adjustments,
                referenceImages,
                maskImage,
                makeId: () => crypto.randomUUID(),
            });

            commitDraft(result.draft);
            setAiTransformProvenance(result.provenance);
            setAiPrompt('');
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'AI Edit failed');
        } finally {
            setAiLoading(false);
        }
    }, [adjustments, aiPrompt, apiKey, commitDraft, draft, isCanvasReady, maskImage, model, referenceImages]);

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

type EditImage = (input: EditImageInput) => Promise<string | EditImageResult>;

export interface RunEditorAiTransformOptions {
    apiKey: string;
    model: ImageModelSlug;
    prompt: string;
    draft: EditorDraft;
    adjustments: EditorAdjustments;
    referenceImages: File[];
    maskImage?: File | Blob | null;
    makeId: () => string;
    editImage?: EditImage;
    render?: AiTransformRenderer;
}

export async function runEditorAiTransform({
    apiKey,
    model,
    prompt,
    draft,
    adjustments,
    referenceImages,
    maskImage,
    makeId,
    editImage = imageWorkflow.edit,
    render,
}: RunEditorAiTransformOptions) {
    const trimmedPrompt = prompt.trim();
    const editInput = await renderAiTransformEditInput({
        draft,
        adjustments,
        referenceImages,
        render,
    });
    const editResult = normalizeEditImageResult(await editImage({
        apiKey,
        model,
        prompt: trimmedPrompt,
        sourceImage: editInput.sourceImage,
        compositionContextImage: editInput.compositionContextImage,
        referenceImages: editInput.referenceImages,
        maskImage,
        quality: 'medium',
    }));
    const transformMask = maskImage
        ? await blobToTransformMaskAsset(maskImage)
        : null;

    return applyAiTransformResultToDraft(
        draft,
        editInput.targetPlan,
        editResult.imageUrl,
        makeId,
        {
            prompt: trimmedPrompt,
            model,
            costLedger: editResult.costLedger,
            transformMask,
        },
    );
}

export interface BuildEditorSaveContextOptions {
    isCopy: boolean;
    references: string[];
    adjustments: EditorAdjustments;
    draft: EditorDraft | null;
    aiTransformProvenance: AiTransformSaveProvenance | null;
}

export function buildEditorSaveContext({
    isCopy,
    references,
    adjustments,
    draft,
    aiTransformProvenance,
}: BuildEditorSaveContextOptions): EditorSaveContext {
    const saveProvenance = getAiTransformSaveProvenance(draft, aiTransformProvenance);

    return {
        isCopy,
        references,
        adjustments,
        layerStack: draft && hasDurableLayerStack(draft.layerStack) ? draft.layerStack : null,
        aiEditPrompt: saveProvenance?.aiEditPrompt,
        aiEditModel: saveProvenance?.aiEditModel,
        costLedger: saveProvenance?.costLedger,
        transformMask: saveProvenance?.transformMask ?? undefined,
        targetMode: saveProvenance?.targetMode,
        targetLayerCount: saveProvenance?.targetLayerCount,
        targetIncludesBaseLayer: saveProvenance?.targetIncludesBaseLayer,
        aiResultLayerId: saveProvenance?.aiResultLayerId,
        aiResultLayerName: saveProvenance?.aiResultLayerName,
    };
}

function normalizeEditImageResult(result: string | EditImageResult): EditImageResult {
    return typeof result === 'string'
        ? { imageUrl: result }
        : result;
}
