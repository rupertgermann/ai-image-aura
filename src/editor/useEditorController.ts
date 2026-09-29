import { useCallback, useRef, useState } from 'react';
import type { ArchiveImage } from '../db/types';
import { imageWorkflow, type ImageWorkflow } from '../image-workflow/ImageWorkflow';
import type { ImageModelSlug } from '../utils/openaiModels';
import { useEditorSession } from './useEditorSession';
import { renderLayerStackToDataUrl } from './renderLayerStack';
import {
    applyAiTransformResultToDraft,
    blobToTransformMaskAsset,
    getAiTransformSaveProvenance,
    renderAiTransformEditInput,
    type AiTransformRenderer,
} from './aiTransform';
import {
    hasDurableLayerStack,
    type EditorAdjustments,
    type EditorDraft,
} from './layers';
import type { EditorSaveContext } from '../archive/saveArchiveImage';

interface UseEditorControllerOptions {
    image: ArchiveImage | null;
    imageCredential: string | null;
    model: ImageModelSlug;
    maskImage?: File | Blob | null;
    onSave: (updatedUrl: string, context: EditorSaveContext) => void | Promise<void>;
}

export function useEditorController({
    image,
    imageCredential,
    model,
    maskImage,
    onSave,
}: UseEditorControllerOptions) {
    const { commitDraft, ...session } = useEditorSession(image);
    const { draft, draftLoading, adjustments, referenceImages, addReferenceFiles } = session;
    const isCanvasReady = !!draft && !draftLoading;
    const operationInProgress = useRef(false);
    const [saving, setSaving] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const save = useCallback(async (isCopy: boolean = false) => {
        if (!draft || draftLoading || operationInProgress.current) {
            return;
        }

        operationInProgress.current = true;
        setSaving(true);
        setAiError(null);
        try {
            const dataUrl = await renderLayerStackToDataUrl(draft.layerStack, draft.adjustments);
            await onSave(dataUrl, buildEditorSaveContext({ isCopy, draft }));
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'Failed to save image');
        } finally {
            operationInProgress.current = false;
            setSaving(false);
        }
    }, [
        draft,
        draftLoading,
        onSave,
    ]);

    const applyAiEdit = useCallback(async () => {
        if (!imageCredential || !aiPrompt.trim() || !draft || !isCanvasReady || operationInProgress.current) {
            return;
        }

        operationInProgress.current = true;
        setAiLoading(true);
        setAiError(null);

        try {
            const nextDraft = await runEditorAiTransform({
                imageCredential,
                model,
                prompt: aiPrompt,
                draft,
                adjustments,
                referenceImages,
                maskImage,
                makeId: () => crypto.randomUUID(),
            });

            commitDraft(nextDraft);
            setAiPrompt('');
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'AI Edit failed');
        } finally {
            operationInProgress.current = false;
            setAiLoading(false);
        }
    }, [adjustments, aiPrompt, imageCredential, commitDraft, draft, isCanvasReady, maskImage, model, referenceImages]);

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
        ...session,
        saving,
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

export interface RunEditorAiTransformOptions {
    imageCredential: string;
    model: ImageModelSlug;
    prompt: string;
    draft: EditorDraft;
    adjustments: EditorAdjustments;
    referenceImages: File[];
    maskImage?: File | Blob | null;
    makeId: () => string;
    editImage?: ImageWorkflow['edit'];
    render?: AiTransformRenderer;
}

export async function runEditorAiTransform({
    imageCredential,
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
    const editResult = await editImage({
        credential: imageCredential,
        model,
        prompt: trimmedPrompt,
        sourceImage: editInput.sourceImage,
        sourceDimensions: {
            width: editInput.targetPlan.targetBounds.width,
            height: editInput.targetPlan.targetBounds.height,
        },
        compositionContextImage: editInput.compositionContextImage,
        referenceImages: editInput.referenceImages,
        maskImage,
        quality: 'medium',
    });
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
    draft: EditorDraft;
}

export function buildEditorSaveContext({
    isCopy,
    draft,
}: BuildEditorSaveContextOptions): EditorSaveContext {
    const saveProvenance = getAiTransformSaveProvenance(draft);

    return {
        isCopy,
        references: draft.references,
        adjustments: draft.adjustments,
        layerStack: hasDurableLayerStack(draft.layerStack) ? draft.layerStack : null,
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
