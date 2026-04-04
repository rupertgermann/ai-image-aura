import { useMemo, useState } from 'react';
import type { ArchiveImage } from '../db/types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_CONTRAST = 100;
const DEFAULT_SATURATION = 100;
const DEFAULT_FILTER = 'none';

export function useEditorSession(image: ArchiveImage | null) {
    const sessionKey = image?.id ?? 'default';
    const [brightness, setBrightness] = useLocalStorage(`editor_${sessionKey}_brightness`, DEFAULT_BRIGHTNESS);
    const [contrast, setContrast] = useLocalStorage(`editor_${sessionKey}_contrast`, DEFAULT_CONTRAST);
    const [saturation, setSaturation] = useLocalStorage(`editor_${sessionKey}_saturation`, DEFAULT_SATURATION);
    const [filter, setFilter] = useLocalStorage(`editor_${sessionKey}_filter`, DEFAULT_FILTER);
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(() => image?.url ?? null);
    const referenceCollection = useReferenceImageCollection({ initialDataUrls: image?.references });

    const canvasFilter = useMemo(() => {
        return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${filter !== 'none' ? filter : ''}`;
    }, [brightness, contrast, saturation, filter]);

    const resetAdjustments = () => {
        setBrightness(DEFAULT_BRIGHTNESS);
        setContrast(DEFAULT_CONTRAST);
        setSaturation(DEFAULT_SATURATION);
        setFilter(DEFAULT_FILTER);
    };

    const serializeReferences = () => {
        return referenceCollection.serialize();
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
        referenceImages: referenceCollection.files,
        referencePreviews: referenceCollection.previews,
        addReferenceFiles: referenceCollection.addFiles,
        removeReferenceAt: referenceCollection.removeAt,
        resetAdjustments,
        serializeReferences,
    };
}
