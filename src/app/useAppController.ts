import { useCallback, useEffect, useState } from 'react';
import { useArchiveController } from '../archive/useArchiveController';
import type { ArchiveImage } from '../db/types';
import { generateSessionStore } from '../generate-session/GenerateSession';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useImageArchive } from '../hooks/useImageArchive';
import type { ToastType } from '../components/Toast';
import type { AppView } from '../types';

interface AppToast {
    id: string;
    message: string;
    type: ToastType;
}

export function useAppController() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate');
    const { images, addImage, deleteImage } = useImageArchive();
    const [apiKey, setApiKey] = useLocalStorage<string>('aura_openapi_key', '');
    const [editingImage, setEditingImage] = useState<ArchiveImage | null>(null);
    const [toasts, setToasts] = useState<AppToast[]>([]);
    const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('aura_theme', 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        if (!apiKey) {
            const legacyKey = localStorage.getItem('openai_api_key');
            if (legacyKey) {
                setApiKey(legacyKey);
            }
        }
    }, [apiKey, setApiKey]);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = crypto.randomUUID();
        setToasts((currentToasts) => [...currentToasts, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, []);

    const changeView = useCallback((view: AppView) => {
        setCurrentView(view);
    }, [setCurrentView]);

    const updateApiKey = useCallback((key: string) => {
        setApiKey(key);
    }, [setApiKey]);

    const saveImage = useCallback(async (image: ArchiveImage) => {
        await addImage(image);
        addToast('Image saved to archive', 'success');
    }, [addImage, addToast]);

    const deleteImages = useCallback(async (ids: string[]) => {
        for (const id of ids) {
            await deleteImage(id);
        }

        addToast(ids.length === 1 ? 'Image deleted permanently' : `${ids.length} images deleted permanently`, 'info');
    }, [addToast, deleteImage]);

    const editImage = useCallback((image: ArchiveImage) => {
        setEditingImage(image);
        setCurrentView('editor');
    }, [setCurrentView]);

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

        setCurrentView('archive');
        setEditingImage(null);
    }, [addImage, addToast, editingImage, setCurrentView]);

    const createSimilar = useCallback(async (image: ArchiveImage) => {
        await generateSessionStore.transferFromArchive(image);
        setCurrentView('generate');
        addToast('Settings & references transferred', 'info');
    }, [addToast, setCurrentView]);

    const toggleTheme = useCallback(() => {
        setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');
    }, [setTheme]);

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
