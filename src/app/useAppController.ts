import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useArchiveController } from '../archive/useArchiveController';
import { recoverArchiveMetadataFromManifests } from '../archive/recoverArchiveMetadata';
import type { ArchiveImage } from '../db/types';
import { generateSessionStore } from '../generate-session/GenerateSession';
import { useAppNotifications } from './useAppNotifications';
import { useAppPreferences } from './useAppPreferences';
import { useImageArchive } from '../hooks/useImageArchive';
import { initializeAuraPersistence } from '../db/AuraPersistence';
import { saveEditedImage, type EditorSaveContext } from '../editor/saveEditedImage';
import { lineageStore } from '../lineage/LineageStore';
import { createLineageNavigator } from '../lineage/LineageNavigator';
import type { EditorReplay } from '../lineage/replayLineageStep';
import { browserCompletionNotificationPort, type CompletionNotificationReadiness } from './CompletionNotificationPort';

export function useAppController() {
    const {
        currentView,
        apiKey,
        googleApiKey,
        completionNotificationsEnabled,
        changeView,
        getKey,
        updateApiKey,
        updateGoogleApiKey,
        updateCompletionNotificationsEnabled,
    } = useAppPreferences();
    const { toasts, addToast, removeToast, notifyError } = useAppNotifications();
    const handleArchiveError = useCallback((error: Error, operation: 'load' | 'save' | 'delete') => {
        notifyError(error, `Archive ${operation} failed`);
    }, [notifyError]);
    const { images, addImage, deleteImage, refresh } = useImageArchive({
        onError: handleArchiveError,
    });
    const [editingImage, setEditingImage] = useState<ArchiveImage | null>(null);
    const [editorReplay, setEditorReplay] = useState<EditorReplay | null>(null);
    const [completionNotificationReadiness, setCompletionNotificationReadiness] = useState<CompletionNotificationReadiness>(
        () => browserCompletionNotificationPort.getReadiness(),
    );
    const recoveryStartedRef = useRef(false);

    useEffect(() => {
        initializeAuraPersistence().catch((error) => {
            const nextError = error instanceof Error ? error : new Error('Failed to initialize local storage');
            notifyError(nextError, 'Storage initialization failed');
        });
    }, [notifyError]);

    useEffect(() => {
        if (recoveryStartedRef.current) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const archiveManifestUrl = params.get('archiveManifest');
        if (!archiveManifestUrl) {
            return;
        }

        recoveryStartedRef.current = true;
        const lineageManifestUrl = params.get('lineageManifest');

        const loadManifest = async (url: string) => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load ${url}`);
            }

            return response.json() as Promise<unknown>;
        };

        async function recover() {
            try {
                const [archiveManifest, lineageManifest] = await Promise.all([
                    loadManifest(archiveManifestUrl!),
                    lineageManifestUrl ? loadManifest(lineageManifestUrl) : Promise.resolve(undefined),
                ]);
                const summary = await recoverArchiveMetadataFromManifests(archiveManifest, lineageManifest);

                await refresh();
                addToast(`Recovered metadata for ${summary.restoredImages} archive images`, 'success');
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
            } catch (error) {
                notifyError(error, 'Archive metadata recovery failed');
            }
        }

        void recover();
    }, [addToast, notifyError, refresh]);

    const saveImage = useCallback(async (image: ArchiveImage) => {
        const savedImage = await addImage(image);
        addToast('Image saved to archive', 'success');
        return savedImage;
    }, [addImage, addToast]);

    const changeCompletionNotificationsEnabled = useCallback(async (enabled: boolean) => {
        if (!enabled) {
            updateCompletionNotificationsEnabled(false);
            setCompletionNotificationReadiness(browserCompletionNotificationPort.getReadiness());
            return;
        }

        const readiness = await browserCompletionNotificationPort.requestPermission();
        setCompletionNotificationReadiness(readiness);
        updateCompletionNotificationsEnabled(readiness === 'granted');

        if (readiness !== 'granted') {
            addToast('Browser notifications are not available', 'info');
        }
    }, [addToast, updateCompletionNotificationsEnabled]);

    const deleteImages = useCallback(async (ids: string[]) => {
        for (const id of ids) {
            await deleteImage(id);
        }

        addToast(ids.length === 1 ? 'Image deleted permanently' : `${ids.length} images deleted permanently`, 'info');
    }, [addToast, deleteImage]);

    const toggleFavorite = useCallback(async (image: ArchiveImage) => {
        const nextFavorite = !image.favorite;
        const savedImage = await addImage({
            ...image,
            favorite: nextFavorite ? true : undefined,
        });
        addToast(nextFavorite ? 'Added to favorites' : 'Removed from favorites', 'info');
        return savedImage;
    }, [addImage, addToast]);

    const editImage = useCallback((image: ArchiveImage) => {
        setEditingImage(image);
        setEditorReplay(null);
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
        setEditorReplay(null);
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

    const lineageNavigator = useMemo(() => createLineageNavigator({
        lineageStore,
        sessionStore: generateSessionStore,
        findImage: (archiveImageId) => images.find((entry) => entry.id === archiveImageId) ?? null,
    }), [images]);

    const replayGenerateFromLineageStep = useCallback(async (stepId: string) => {
        try {
            const outcome = await lineageNavigator.replayIntoGenerate(stepId);
            if (outcome.status === 'unavailable') {
                notifyError(new Error(outcome.reason), 'Replay unavailable');
                return;
            }
            changeView('generate');
            addToast('Lineage step loaded into Generate', 'info');
        } catch (error) {
            notifyError(error, 'Failed to replay lineage step');
        }
    }, [addToast, changeView, lineageNavigator, notifyError]);

    const replayEditorFromLineageStep = useCallback(async (stepId: string) => {
        try {
            const outcome = await lineageNavigator.replayIntoEditor(stepId);
            if (outcome.status === 'unavailable') {
                notifyError(new Error(outcome.reason), 'Replay unavailable');
                return;
            }
            setEditingImage(outcome.image);
            setEditorReplay(outcome.replay);
            changeView('editor');
            addToast('Lineage step loaded into Editor', 'info');
        } catch (error) {
            notifyError(error, 'Failed to replay lineage step');
        }
    }, [addToast, changeView, lineageNavigator, notifyError]);

    const forkFromLineageStep = useCallback(async (stepId: string) => {
        try {
            const outcome = await lineageNavigator.fork(stepId);
            if (outcome.status === 'unavailable') {
                notifyError(new Error(outcome.reason), 'Fork unavailable');
                return;
            }
            addToast('Next save will branch from this lineage step', 'info');
        } catch (error) {
            notifyError(error, 'Failed to fork from lineage step');
        }
    }, [addToast, lineageNavigator, notifyError]);

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
        toasts,
        archiveController,
        changeView,
        updateApiKey,
        removeToast,
        replayGenerateFromLineageStep,
        replayEditorFromLineageStep,
        forkFromLineageStep,
        generateViewProps: {
            apiKey,
            getProviderKey: getKey,
            onSaveImage: saveImage,
            completionNotificationsEnabled,
            completionNotificationPort: browserCompletionNotificationPort,
            isDocumentHidden: () => typeof document !== 'undefined' && document.hidden,
        },
        archiveViewProps: {
            images,
            selectedIds: archiveController.selectedIds,
            onDeleteImage: (id: string) => archiveController.requestDelete([id]),
            onEditImage: archiveController.editImage,
            onOpenImage: archiveController.openImage,
            onToggleFavorite: toggleFavorite,
            onToggleSelection: archiveController.toggleSelection,
            onToggleSelectAll: archiveController.toggleSelectAll,
            onClearSelection: archiveController.clearSelection,
            onDeleteSelected: () => archiveController.requestDelete(Array.from(archiveController.selectedIds)),
            onBulkDownloadError: (error: Error) => notifyError(error, 'Failed to export archive ZIP'),
        },
        editorViewProps: {
            image: editingImage,
            replay: editorReplay,
            getProviderKey: getKey,
            onSave: handleSaveEditedImage,
        },
        settingsViewProps: {
            apiKey,
            googleApiKey,
            completionNotificationsEnabled,
            completionNotificationReadiness,
            onApiKeyChange: updateApiKey,
            onGoogleApiKeyChange: updateGoogleApiKey,
            onCompletionNotificationsChange: changeCompletionNotificationsEnabled,
        },
    };
}
