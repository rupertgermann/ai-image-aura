import { useCallback, useEffect, useRef, useState } from 'react';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';

interface UseReferenceImageCollectionOptions {
    initialDataUrls?: string[];
}

export function useReferenceImageCollection(options: UseReferenceImageCollectionOptions = {}) {
    const initialDataUrls = options.initialDataUrls ?? [];
    const [files, setFiles] = useState<File[]>(() => imageWorkflow.hydrateReferences(initialDataUrls));
    const [previews, setPreviews] = useState<string[]>(() => initialDataUrls);
    const previewsRef = useRef(previews);

    useEffect(() => {
        previewsRef.current = previews;
    }, [previews]);

    useEffect(() => {
        return () => {
            previewsRef.current.forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, []);

    const addFiles = useCallback((nextFiles: File[]) => {
        if (nextFiles.length === 0) {
            return;
        }

        setFiles((currentFiles) => [...currentFiles, ...nextFiles]);
        setPreviews((currentPreviews) => [
            ...currentPreviews,
            ...nextFiles.map((file) => URL.createObjectURL(file)),
        ]);
    }, []);

    const removeAt = useCallback((index: number) => {
        setFiles((currentFiles) => currentFiles.filter((_, currentIndex) => currentIndex !== index));
        setPreviews((currentPreviews) => {
            const previewToRemove = currentPreviews[index];
            if (previewToRemove?.startsWith('blob:')) {
                URL.revokeObjectURL(previewToRemove);
            }

            return currentPreviews.filter((_, currentIndex) => currentIndex !== index);
        });
    }, []);

    const replaceWithDataUrls = useCallback((dataUrls: string[]) => {
        previewsRef.current.forEach((url) => {
            if (url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });

        setFiles(imageWorkflow.hydrateReferences(dataUrls));
        setPreviews(dataUrls);
    }, []);

    const serialize = useCallback(() => {
        return imageWorkflow.serializeReferences(files);
    }, [files]);

    return {
        files,
        previews,
        addFiles,
        removeAt,
        replaceWithDataUrls,
        serialize,
    };
}
