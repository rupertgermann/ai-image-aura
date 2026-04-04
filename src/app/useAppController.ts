import { useCallback, useEffect, useState } from 'react';
import { useArchiveController } from '../archive/useArchiveController';
import type { ArchiveImage } from '../db/types';
import { generateSessionStore } from '../generate-session/GenerateSession';
import { useAppNotifications } from './useAppNotifications';
import { useAppPreferences } from './useAppPreferences';
import { useImageArchive } from '../hooks/useImageArchive';
import { initializeAuraPersistence } from '../db/AuraPersistence';

export function useAppController() {
    const { currentView, apiKey, theme, changeView, updateApiKey, toggleTheme } = useAppPreferences();
    const { toasts, addToast, removeToast, notifyError } = useAppNotifications();
    const handleArchiveError = useCallback((error: Error, operation: 'load' | 'save' | 'delete') => {
        notifyError(error, `Archive ${operation} failed`);
    }, [notifyError]);
    const { images, addImage, deleteImage } = useImageArchive({
        onError: handleArchiveError,
    });
    const [editingImage, setEditingImage] = useState<ArchiveImage | null>(null);

    useEffect(() => {
        initializeAuraPersistence().catch((error) => {
            const nextError = error instanceof Error ? error : new Error('Failed to initialize local storage');
            notifyError(nextError, 'Storage initialization failed');
        });
    }, [notifyError]);

    const saveImage = useCallback(async (image: ArchiveImage) => {
        const savedImage = await addImage(image);
        addToast('Image saved to archive', 'success');
        return savedImage;
    }, [addImage, addToast]);

    const deleteImages = useCallback(async (ids: string[]) => {
        for (const id of ids) {
            await deleteImage(id);
        }

        addToast(ids.length === 1 ? 'Image deleted permanently' : `${ids.length} images deleted permanently`, 'info');
    }, [addToast, deleteImage]);

    const editImage = useCallback((image: ArchiveImage) => {
        setEditingImage(image);
        changeView('editor');
    }, [changeView]);

    const saveEditedImage = useCallback(async (updatedUrl: string, isCopy: boolean = false, references?: string[]) => {
        if (!editingImage) {
            return;
        }

        if (isCopy) {
            await addImage({
                ...editingImage,
                id: crypto.randomUUID(),
                url: updatedUrl,
                timestamp: new Date().toISOString(),
                references: references || editingImage.references,
            });
            addToast('Design saved as new copy', 'success');
        } else {
            await addImage({
                ...editingImage,
                url: updatedUrl,
                references: references || editingImage.references,
            });
            addToast('Masterpiece updated', 'success');
        }

        changeView('archive');
        setEditingImage(null);
    }, [addImage, addToast, changeView, editingImage]);

    const createSimilar = useCallback(async (image: ArchiveImage) => {
        try {
            await generateSessionStore.transferFromArchive(image);
            changeView('generate');
            addToast('Settings & references transferred', 'info');
        } catch (error) {
            notifyError(error, 'Failed to transfer image settings');
        }
    }, [addToast, changeView, notifyError]);

    const archiveController = useArchiveController({
        images,
        onDeleteImages: deleteImages,
        onEditImage: editImage,
        onCreateSimilar: createSimilar,
    });

    return {
        currentView,
        apiKey,
        editingImage,
        theme,
        toasts,
        archiveController,
        changeView,
        updateApiKey,
        toggleTheme,
        removeToast,
        generateViewProps: {
            apiKey,
            onSaveImage: saveImage,
        },
        archiveViewProps: {
            images,
            selectedIds: archiveController.selectedIds,
            onDeleteImage: (id: string) => archiveController.requestDelete([id]),
            onEditImage: archiveController.editImage,
            onOpenImage: archiveController.openImage,
            onToggleSelection: archiveController.toggleSelection,
            onToggleSelectAll: archiveController.toggleSelectAll,
            onClearSelection: archiveController.clearSelection,
            onDeleteSelected: () => archiveController.requestDelete(Array.from(archiveController.selectedIds)),
            onBulkDownloadError: (error: Error) => notifyError(error, 'Failed to export archive ZIP'),
        },
        editorViewProps: {
            key: editingImage?.id ?? 'empty-editor',
            image: editingImage,
            apiKey,
            onSave: saveEditedImage,
        },
        settingsViewProps: {
            apiKey,
            onApiKeyChange: updateApiKey,
        },
    };
}
