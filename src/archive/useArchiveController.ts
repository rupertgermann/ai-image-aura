import { useMemo, useState } from 'react';
import type { ArchiveImage } from '../db/types';

interface UseArchiveControllerOptions {
    images: ArchiveImage[];
    onDeleteImages: (ids: string[]) => Promise<void>;
    onEditImage: (image: ArchiveImage) => void;
    onCreateSimilar: (image: ArchiveImage) => Promise<void> | void;
}

export function useArchiveController({
    images,
    onDeleteImages,
    onEditImage,
    onCreateSimilar,
}: UseArchiveControllerOptions) {
    const [selectedIdsState, setSelectedIdsState] = useState<Set<string>>(new Set());
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
    const imageIds = useMemo(() => new Set(images.map((image) => image.id)), [images]);

    const selectedIds = useMemo(
        () => new Set(Array.from(selectedIdsState).filter((id) => imageIds.has(id))),
        [imageIds, selectedIdsState],
    );

    const selectedImage = useMemo(
        () => images.find((image) => image.id === selectedImageId) ?? null,
        [images, selectedImageId],
    );

    const toggleSelection = (id: string) => {
        setSelectedIdsState((currentSelectedIds) => {
            const nextSelectedIds = new Set(currentSelectedIds);

            if (nextSelectedIds.has(id)) {
                nextSelectedIds.delete(id);
            } else {
                nextSelectedIds.add(id);
            }

            return nextSelectedIds;
        });
    };

    const clearSelection = () => {
        setSelectedIdsState(new Set());
    };

    const toggleSelectAll = (ids: string[]) => {
        const nextIds = ids.filter(Boolean);
        if (nextIds.length === 0) {
            return;
        }

        setSelectedIdsState((currentSelectedIds) => {
            const areAllSelected = nextIds.every((id) => currentSelectedIds.has(id));

            if (areAllSelected) {
                const remainingSelectedIds = new Set(currentSelectedIds);
                nextIds.forEach((id) => remainingSelectedIds.delete(id));
                return remainingSelectedIds;
            }

            const mergedSelectedIds = new Set(currentSelectedIds);
            nextIds.forEach((id) => mergedSelectedIds.add(id));
            return mergedSelectedIds;
        });
    };

    const openImage = (image: ArchiveImage) => {
        setSelectedImageId(image.id);
    };

    const closeImage = () => {
        setSelectedImageId(null);
    };

    const editImage = (image: ArchiveImage) => {
        setSelectedImageId(null);
        onEditImage(image);
    };

    const createSimilar = async () => {
        if (!selectedImage) {
            return;
        }

        setSelectedImageId(null);
        await onCreateSimilar(selectedImage);
    };

    const requestDelete = (ids: string[]) => {
        const nextIds = Array.from(new Set(ids.filter(Boolean)));
        if (nextIds.length === 0) {
            return;
        }

        setPendingDeleteIds(nextIds);
    };

    const confirmDelete = async () => {
        if (pendingDeleteIds.length === 0) {
            return;
        }

        const idsToDelete = pendingDeleteIds;
        await onDeleteImages(idsToDelete);

        setPendingDeleteIds([]);
        setSelectedIdsState((currentSelectedIds) => {
            const remainingSelectedIds = new Set(currentSelectedIds);
            idsToDelete.forEach((id) => remainingSelectedIds.delete(id));
            return remainingSelectedIds;
        });

        if (selectedImageId && idsToDelete.includes(selectedImageId)) {
            setSelectedImageId(null);
        }
    };

    const cancelDelete = () => {
        setPendingDeleteIds([]);
    };

    const showPreviousImage = () => {
        if (!selectedImage) {
            return;
        }

        const currentIndex = images.findIndex((image) => image.id === selectedImage.id);
        if (currentIndex > 0) {
            setSelectedImageId(images[currentIndex - 1].id);
        }
    };

    const showNextImage = () => {
        if (!selectedImage) {
            return;
        }

        const currentIndex = images.findIndex((image) => image.id === selectedImage.id);
        if (currentIndex >= 0 && currentIndex < images.length - 1) {
            setSelectedImageId(images[currentIndex + 1].id);
        }
    };

    return {
        selectedIds,
        selectedImage,
        pendingDeleteIds,
        toggleSelection,
        clearSelection,
        toggleSelectAll,
        openImage,
        closeImage,
        editImage,
        createSimilar,
        requestDelete,
        confirmDelete,
        cancelDelete,
        showPreviousImage,
        showNextImage,
    };
}
