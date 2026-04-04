import { useCallback, useState } from 'react';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import type { EditorAdjustments, EditorSaveContext } from './saveEditedImage';

interface UseEditorControllerOptions {
    apiKey: string | null;
    isCanvasReady: boolean;
    currentImageUrl: string | null;
    setCurrentImageUrl: (url: string) => void;
    referenceImages: File[];
    addReferenceFiles: (files: File[]) => void;
    serializeReferences: () => Promise<string[]>;
    exportDataUrl: () => string;
    exportBlob: () => Promise<Blob>;
    adjustments: EditorAdjustments;
    onSave: (updatedUrl: string, context: EditorSaveContext) => void | Promise<void>;
}

export function useEditorController({
    apiKey,
    isCanvasReady,
    currentImageUrl,
    setCurrentImageUrl,
    referenceImages,
    addReferenceFiles,
    serializeReferences,
    exportDataUrl,
    exportBlob,
    adjustments,
    onSave,
}: UseEditorControllerOptions) {
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [lastAiEditPrompt, setLastAiEditPrompt] = useState<string | null>(null);

    const save = useCallback(async (isCopy: boolean = false) => {
        if (!isCanvasReady) {
            return;
        }

        try {
            const dataUrl = exportDataUrl();
            const references = await serializeReferences();
            await Promise.resolve(onSave(dataUrl, {
                isCopy,
                references,
                adjustments,
                aiEditPrompt: lastAiEditPrompt,
            }));
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'Failed to save image');
        }
    }, [adjustments, exportDataUrl, isCanvasReady, lastAiEditPrompt, onSave, serializeReferences]);

    const applyAiEdit = useCallback(async () => {
        if (!apiKey || !aiPrompt.trim() || !currentImageUrl || !isCanvasReady) {
            return;
        }

        setAiLoading(true);
        setAiError(null);

        try {
            const blob = await exportBlob();
            const newUrl = await imageWorkflow.edit({
                apiKey,
                prompt: aiPrompt,
                sourceImage: blob,
                referenceImages,
                quality: 'medium',
            });

            setCurrentImageUrl(newUrl);
            setLastAiEditPrompt(aiPrompt.trim());
            setAiPrompt('');
        } catch (err: unknown) {
            setAiError(err instanceof Error ? err.message : 'AI Edit failed');
        } finally {
            setAiLoading(false);
        }
    }, [aiPrompt, apiKey, currentImageUrl, exportBlob, isCanvasReady, referenceImages, setCurrentImageUrl]);

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
