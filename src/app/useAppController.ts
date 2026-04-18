import { useCallback, useEffect, useState } from 'react';
import { useArchiveController } from '../archive/useArchiveController';
import type { ArchiveImage } from '../db/types';
import { generateSessionStore } from '../session/sessionBootstrap';
import { useAppNotifications } from './useAppNotifications';
import { useAppPreferences } from './useAppPreferences';
import { useImageArchive } from '../hooks/useImageArchive';
import { saveEditedImage, type EditorSaveContext } from '../editor/saveEditedImage';
import { lineageStore } from '../lineage/LineageStore';
import { buildGenerateReplay, isEditorReplayable, isGenerateReplayable } from '../lineage/replayLineageStep';
import { useApiKey } from '../session/useApiKey';

export function useAppController() {
    const { currentView, theme, changeView, toggleTheme } = useAppPreferences();
    const { apiKey, setApiKey, lastError: apiKeyError } = useApiKey();
    const { toasts, addToast, removeToast, notifyError } = useAppNotifications();
    const handleArchiveError = useCallback((error: Error, operation: 'load' | 'save' | 'delete') => {
        notifyError(error, `Archive ${operation} failed`);
    }, [notifyError]);
    const { images, addImage, deleteImage } = useImageArchive({
        onError: handleArchiveError,
    });
    const [editingImage, setEditingImage] = useState<ArchiveImage | null>(null);

    useEffect(() => {
        if (apiKeyError) {
            notifyError(apiKeyError.cause, `API key ${apiKeyError.operation} failed`);
        }
    }, [apiKeyError, notifyError]);

    const updateApiKey = useCallback((key: string) => {
        void setApiKey(key);
    }, [setApiKey]);

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

    const handleSaveEditedImage = useCallback(async (updatedUrl: string, context: EditorSaveContext) => {
        if (!editingImage) {
            return;
        }

        const savedImage = await saveEditedImage(editingImage, updatedUrl, context, {
            saveImage: async (image) => addImage(image),
            lineageStore,
            parentStepId: generateSessionStore.loadLineageSource()?.stepId ?? null,
        });

        generateSessionStore.clearLineageSource();

        if (savedImage.id !== editingImage.id) {
            addToast('Design saved as new copy', 'success');
        } else {
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

    const replayGenerateFromLineageStep = useCallback(async (stepId: string) => {
        try {
            const step = await lineageStore.getById(stepId);
            if (!step || !isGenerateReplayable(step)) {
                notifyError(new Error('This step cannot be replayed into Generate'), 'Replay unavailable');
                return;
            }

            const image = images.find((entry) => entry.id === step.archiveImageId) ?? null;
            const replay = buildGenerateReplay(image, step);
            if (image) {
                await generateSessionStore.transferFromArchive(image, replay.lineageSource, replay.draft);
            } else {
                generateSessionStore.writeDraft(replay.draft);
                generateSessionStore.saveLineageSource(replay.lineageSource);
            }
            changeView('generate');
            addToast('Lineage step loaded into Generate', 'info');
        } catch (error) {
            notifyError(error, 'Failed to replay lineage step');
        }
    }, [addToast, changeView, images, notifyError]);

    const replayEditorFromLineageStep = useCallback(async (stepId: string) => {
        try {
            const step = await lineageStore.getById(stepId);
            if (!step || !isEditorReplayable(step)) {
                notifyError(new Error('This step cannot be replayed into Editor'), 'Replay unavailable');
                return;
            }

            const image = images.find((entry) => entry.id === step.archiveImageId);
            if (!image) {
                notifyError(new Error('Selected step image is missing from the local archive'), 'Replay unavailable');
                return;
            }

            generateSessionStore.saveLineageSource({
                archiveImageId: step.archiveImageId,
                stepId: step.id,
            });
            setEditingImage(image);
            changeView('editor');
            addToast('Lineage step loaded into Editor', 'info');
        } catch (error) {
            notifyError(error, 'Failed to replay lineage step');
        }
    }, [addToast, changeView, images, notifyError]);

    const forkFromLineageStep = useCallback(async (stepId: string) => {
        try {
            const step = await lineageStore.getById(stepId);
            if (!step) {
                notifyError(new Error('Selected lineage step no longer exists'), 'Fork unavailable');
                return;
            }

            generateSessionStore.saveLineageSource({
                archiveImageId: step.archiveImageId,
                stepId: step.id,
            });
            addToast('Next save will branch from this lineage step', 'info');
        } catch (error) {
            notifyError(error, 'Failed to fork from lineage step');
        }
    }, [addToast, notifyError]);

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
        replayGenerateFromLineageStep,
        replayEditorFromLineageStep,
        forkFromLineageStep,
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
            onSave: handleSaveEditedImage,
        },
        settingsViewProps: {
            apiKey,
            onApiKeyChange: updateApiKey,
        },
    };
}
