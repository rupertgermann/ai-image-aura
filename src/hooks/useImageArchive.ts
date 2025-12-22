import { useState, useEffect, useCallback } from 'react';
import { db } from '../db/SQLiteAdapter';
import type { ArchiveImage } from '../db/types';

export function useImageArchive() {
    const [images, setImages] = useState<ArchiveImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const loadImages = useCallback(async () => {
        try {
            setLoading(true);
            const data = await db.getImages();
            setImages(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load images'));
        } finally {
            setLoading(false);
        }
    }, []);

    const addImage = async (image: ArchiveImage) => {
        try {
            await db.saveImage(image);
            await loadImages();
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to save image'));
            throw err;
        }
    };

    const deleteImage = async (id: string) => {
        try {
            await db.deleteImage(id);
            await loadImages();
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
