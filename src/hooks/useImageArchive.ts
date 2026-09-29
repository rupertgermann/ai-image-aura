import { useState, useEffect, useCallback } from 'react';
import { archiveStore, type ArchiveStore } from '../archive/ArchiveStore';
import type { ArchiveImage } from '../db/types';

type ArchiveOperation = 'load' | 'save' | 'delete';

interface UseImageArchiveOptions {
    store?: ArchiveStore;
    onError?: (error: Error, operation: ArchiveOperation) => void;
}

export const sortImagesByTimestamp = (images: ArchiveImage[]) => {
    return [...images].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
};

export function filterArchiveImages(
    images: ArchiveImage[],
    options: { search: string; favoritesOnly: boolean },
) {
    const search = options.search.trim().toLowerCase();

    return images.filter((image) => {
        if (options.favoritesOnly && !image.favorite) {
            return false;
        }

        return search.length === 0 || image.prompt.toLowerCase().includes(search);
    });
}

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
            setError(null);
            setImages(sortImagesByTimestamp(data));
        } catch (err) {
            const nextError = err instanceof Error ? err : new Error('Failed to load images');
            setError(nextError);
            onError?.(nextError, 'load');
        } finally {
            setLoading(false);
        }
    }, [onError, store]);

    const publishSavedImage = useCallback((image: ArchiveImage) => {
        setError(null);
        setImages((current) => sortImagesByTimestamp([
            image,
            ...current.filter((entry) => entry.id !== image.id),
        ]));
    }, []);

    const setFavorite = async (id: string, favorite: boolean): Promise<void> => {
        try {
            setError(null);
            await store.setFavorite(id, favorite);
            setImages((current) => current.map((image) => image.id === id
                ? { ...image, favorite: favorite ? true : undefined }
                : image));
        } catch (err) {
            const nextError = err instanceof Error ? err : new Error('Failed to save image');
            setError(nextError);
            onError?.(nextError, 'save');
            throw err;
        }
    };

    const deleteImage = async (id: string) => {
        try {
            setError(null);
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

    return { images, loading, error, setFavorite, publishSavedImage, deleteImage, refresh: loadImages };
}
