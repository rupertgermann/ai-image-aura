import { useState, useEffect, useCallback } from 'react';
import { archiveStore, type ArchiveStore } from '../archive/ArchiveStore';
import type { ArchiveImage } from '../db/types';

const sortImagesByTimestamp = (images: ArchiveImage[]) => {
    return [...images].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
};

export function useImageArchive(store: ArchiveStore = archiveStore) {
    const [images, setImages] = useState<ArchiveImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const loadImages = useCallback(async () => {
        try {
            setLoading(true);
            const data = await store.list();
            setImages(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load images'));
        } finally {
            setLoading(false);
        }
    }, [store]);

    const addImage = async (image: ArchiveImage) => {
        try {
            const savedImage = await store.save(image);
            setImages((current) => sortImagesByTimestamp([
                savedImage,
                ...current.filter((entry) => entry.id !== savedImage.id),
            ]));
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to save image'));
            throw err;
        }
    };

    const deleteImage = async (id: string) => {
        try {
            await store.remove(id);
            setImages((current) => current.filter((entry) => entry.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to delete image'));
            throw err;
        }
    };

    useEffect(() => {
        loadImages();
    }, [loadImages]);

    return { images, loading, error, addImage, deleteImage, refresh: loadImages };
}
