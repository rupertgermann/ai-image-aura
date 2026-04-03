import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { ArchiveImage } from '../db/types';
import { downloadGeneratedImage } from '../download/download';
import { generateSessionStore, type GenerateDraft } from './GenerateSession';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';

interface UseGenerateControllerOptions {
    apiKey: string | null;
    draft: GenerateDraft;
    setDraft: Dispatch<SetStateAction<GenerateDraft>>;
    referenceImages: File[];
    replaceReferences: (dataUrls: string[]) => void;
    serializeReferences: () => Promise<string[]>;
    onSaveImage: (image: ArchiveImage) => void | Promise<void>;
}

const VALID_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);

export function useGenerateController({
    apiKey,
    draft,
    setDraft,
    referenceImages,
    replaceReferences,
    serializeReferences,
    onSaveImage,
}: UseGenerateControllerOptions) {
    const [currentResult, setCurrentResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateDraft = useCallback((patch: Partial<GenerateDraft>) => {
        setDraft((currentDraft) => ({ ...currentDraft, ...patch }));
    }, [setDraft]);

    useEffect(() => {
        generateSessionStore.loadCurrentResult().then((value) => {
            if (value) {
                setCurrentResult(value);
            }
        });

        generateSessionStore.consumeTransferredReferences().then((references) => {
            if (references.length > 0) {
                replaceReferences(references);
            }
        });
    }, [replaceReferences]);

    useEffect(() => {
        if (!VALID_SIZES.has(draft.aspectRatio)) {
            setDraft((currentDraft) => ({ ...currentDraft, aspectRatio: '1024x1024' }));
        }
    }, [draft.aspectRatio, setDraft]);

    const generate = useCallback(async () => {
        if (!apiKey) {
            setError('Please set your OpenAI API Key in Settings first.');
            return;
        }

        if (!draft.prompt.trim()) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const imageUrl = await imageWorkflow.generate({
                apiKey,
                prompt: draft.prompt,
                quality: draft.quality,
                aspectRatio: draft.aspectRatio,
                background: draft.background,
                style: draft.style,
                lighting: draft.lighting,
                palette: draft.palette,
                referenceImages,
            });

            setCurrentResult(imageUrl);
            updateDraft({ isSaved: false });
            await generateSessionStore.saveCurrentResult(imageUrl);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate image');
        } finally {
            setLoading(false);
        }
    }, [apiKey, draft, referenceImages, updateDraft]);

    const save = useCallback(async () => {
        if (!currentResult || draft.isSaved) {
            return;
        }

        const references = await serializeReferences();
        await Promise.resolve(onSaveImage({
            id: crypto.randomUUID(),
            url: currentResult,
            prompt: draft.prompt,
            model: 'gpt-image-1.5',
            timestamp: new Date().toISOString(),
            width: 1024,
            height: 1024,
            quality: draft.quality,
            aspectRatio: draft.aspectRatio,
            background: draft.background,
            style: draft.style,
            lighting: draft.lighting,
            palette: draft.palette,
            references,
        }));
        updateDraft({ isSaved: true });
    }, [currentResult, draft, onSaveImage, serializeReferences, updateDraft]);

    const download = useCallback(() => {
        if (!currentResult) {
            return;
        }

        downloadGeneratedImage(currentResult);
    }, [currentResult]);

    const clear = useCallback(async () => {
        setCurrentResult(null);
        await generateSessionStore.clearCurrentResult();
    }, []);

    return {
        currentResult,
        loading,
        error,
        updateDraft,
        generate,
        save,
        download,
        clear,
    };
}
