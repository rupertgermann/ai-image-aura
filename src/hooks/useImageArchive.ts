import { useState, useEffect, useCallback } from 'react';
import { archiveStore, type ArchiveStore } from '../archive/ArchiveStore';
import type { ArchiveImage } from '../db/types';

type ArchiveOperation = 'load' | 'save' | 'delete';

interface UseImageArchiveOptions {
    store?: ArchiveStore;
    onError?: (error: Error, operation: ArchiveOperation) => void;
}

const sortImagesByTimestamp = (images: ArchiveImage[]) => {
    return [...images].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
};

export function useImageArchive(options: UseImageArchiveOptions = {}) {
    const store = options.store ?? archiveStore;
    const onError = options.onError;
    const [images, setImages] = useState<ArchiveImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const loadImages = useCallback(async () => {
        try {
            setLoading(true);
            const data = await store.list();
            setImages(data);
        } catch (err) {
            const nextError = err instanceof Error ? err : new Error('Failed to load images');
            setError(nextError);
            onError?.(nextError, 'load');
        } finally {
            setLoading(false);
        }
    }, [onError, store]);

    const addImage = async (image: ArchiveImage): Promise<ArchiveImage> => {
        try {
            const savedImage = await store.save(image);
            setImages((current) => sortImagesByTimestamp([
                savedImage,
                ...current.filter((entry) => entry.id !== savedImage.id),
            ]));
            return savedImage;
        } catch (err) {
            const nextError = err instanceof Error ? err : new Error('Failed to save image');
            setError(nextError);
            onError?.(nextError, 'save');
            throw err;
        }
    };

    const deleteImage = async (id: string) => {
        try {
            await store.remove(id);
            setImages((current) => current.filter((entry) => entry.id !== id));
        } catch (err) {
            const nextError = err instanceof Error ? err : new Error('Failed to delete image');
            setError(nextError);
            onError?.(nextError, 'delete');
            throw err;
        }
    };

    useEffect(() => {
        loadImages();
    }, [loadImages]);

    return { images, loading, error, addImage, deleteImage, refresh: loadImages };
}
