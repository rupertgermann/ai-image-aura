import { useEffect, useMemo, useState } from 'react';
import type { ArchiveImage } from '../db/types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_CONTRAST = 100;
const DEFAULT_SATURATION = 100;
const DEFAULT_FILTER = 'none';

export function useEditorSession(image: ArchiveImage | null) {
    const [brightness, setBrightness] = useLocalStorage('editor_brightness', DEFAULT_BRIGHTNESS);
    const [contrast, setContrast] = useLocalStorage('editor_contrast', DEFAULT_CONTRAST);
    const [saturation, setSaturation] = useLocalStorage('editor_saturation', DEFAULT_SATURATION);
    const [filter, setFilter] = useLocalStorage('editor_filter', DEFAULT_FILTER);
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(() => image?.url ?? null);
    const [referenceImages, setReferenceImages] = useState<File[]>(() => {
        return image?.references ? imageWorkflow.hydrateReferences(image.references) : [];
    });
    const [referencePreviews, setReferencePreviews] = useState<string[]>(() => image?.references ?? []);

    useEffect(() => {
        return () => {
            referencePreviews.forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, [referencePreviews]);

    const canvasFilter = useMemo(() => {
        return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${filter !== 'none' ? filter : ''}`;
    }, [brightness, contrast, saturation, filter]);

    const addReferenceFiles = (files: File[]) => {
        if (files.length === 0) {
            return;
        }

        setReferenceImages((currentImages) => [...currentImages, ...files]);
        setReferencePreviews((currentPreviews) => [
            ...currentPreviews,
            ...files.map((file) => URL.createObjectURL(file)),
        ]);
    };

    const removeReferenceAt = (index: number) => {
        setReferenceImages((currentImages) => currentImages.filter((_, currentIndex) => currentIndex !== index));
        setReferencePreviews((currentPreviews) => {
            const previewToRemove = currentPreviews[index];
            if (previewToRemove?.startsWith('blob:')) {
                URL.revokeObjectURL(previewToRemove);
            }

            return currentPreviews.filter((_, currentIndex) => currentIndex !== index);
        });
    };

    const resetAdjustments = () => {
        setBrightness(DEFAULT_BRIGHTNESS);
        setContrast(DEFAULT_CONTRAST);
        setSaturation(DEFAULT_SATURATION);
        setFilter(DEFAULT_FILTER);
    };

    const serializeReferences = () => {
        return imageWorkflow.serializeReferences(referenceImages);
    };

    return {
        brightness,
        setBrightness,
        contrast,
        setContrast,
        saturation,
        setSaturation,
        filter,
        setFilter,
        canvasFilter,
        currentImageUrl,
        setCurrentImageUrl,
        referenceImages,
        referencePreviews,
        addReferenceFiles,
        removeReferenceAt,
        resetAdjustments,
        serializeReferences,
    };
}
