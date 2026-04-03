import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import SettingsView from './views/SettingsView'
import GenerateView from './views/GenerateView'
import ArchiveView from './views/ArchiveView'
import EditorView from './views/EditorView'
import ImageDetailModal from './components/ImageDetailModal'
import Toast from './components/Toast'
import type { ToastType } from './components/Toast'
import ConfirmModal from './components/ConfirmModal'
import { useArchiveController } from './archive/useArchiveController'
import { generateSessionStore } from './generate-session/GenerateSession'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useImageArchive } from './hooks/useImageArchive'
import type { ArchiveImage } from './db/types'
import type { AppView } from './types'

function App() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate')
    const { images, addImage, deleteImage } = useImageArchive()
    const [apiKey, setApiKey] = useLocalStorage<string>('aura_openapi_key', '')
    const [editingImage, setEditingImage] = useState<ArchiveImage | null>(null)
    const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType }[]>([])
    const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('aura_theme', 'dark')

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])

    const addToast = (message: string, type: ToastType = 'info') => {
        const id = crypto.randomUUID()
        setToasts(prev => [...prev, { id, message, type }])
    }

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }

    // Migration for legacy API keys
    useEffect(() => {
        if (!apiKey) {
            const legacyKey = localStorage.getItem('openai_api_key');
            if (legacyKey) {
                setApiKey(legacyKey);
                // We leave the legacy key for safety but the app now uses aura_openapi_key
            }
        }
    }, [apiKey, setApiKey]);

    const handleViewChange = (view: AppView) => {
        setCurrentView(view)
    }

    const handleApiKeyChange = (key: string) => {
        setApiKey(key)
    }

    const handleSaveImage = async (image: ArchiveImage) => {
        await addImage(image)
        addToast('Image saved to archive', 'success')
    }

    const handleDeleteImage = async (id: string) => {
        await deleteImage(id)
    }

    const handleDeleteImages = async (ids: string[]) => {
        for (const id of ids) {
            await handleDeleteImage(id)
        }

        addToast(ids.length === 1 ? 'Image deleted permanently' : `${ids.length} images deleted permanently`, 'info')
    }

    const handleEditImage = (image: ArchiveImage) => {
        setEditingImage(image)
        setCurrentView('editor')
    }

    const handleSaveEditedImage = async (updatedUrl: string, isCopy: boolean = false, references?: string[]) => {
        if (!editingImage) return

        if (isCopy) {
            const newImage = {
                ...editingImage,
                id: crypto.randomUUID(),
                url: updatedUrl,
                timestamp: new Date().toISOString(),
                references: references || editingImage.references
            }
            await addImage(newImage)
            addToast('Design saved as new copy', 'success')
        } else {
            const updatedImage = {
                ...editingImage,
                url: updatedUrl,
                references: references || editingImage.references
            }
            await addImage(updatedImage)
            addToast('Masterpiece updated', 'success')
        }

        setCurrentView('archive')
        setEditingImage(null)
    }

    const handleCreateSimilar = async (image: ArchiveImage) => {
        await generateSessionStore.transferFromArchive(image)
        setCurrentView('generate')
        addToast('Settings & references transferred', 'info')
    }

    const archiveController = useArchiveController({
        images,
        onDeleteImages: handleDeleteImages,
        onEditImage: handleEditImage,
        onCreateSimilar: handleCreateSimilar,
    })

    const renderView = () => {
        switch (currentView) {
            case 'generate':
                return <GenerateView apiKey={apiKey} onSaveImage={handleSaveImage} />;
            case 'archive':
                return <ArchiveView
                    images={images}
                    selectedIds={archiveController.selectedIds}
                    onDeleteImage={(id) => archiveController.requestDelete([id])}
                    onEditImage={archiveController.editImage}
                    onOpenImage={archiveController.openImage}
                    onToggleSelection={archiveController.toggleSelection}
                    onToggleSelectAll={archiveController.toggleSelectAll}
                    onClearSelection={archiveController.clearSelection}
                    onDeleteSelected={() => archiveController.requestDelete(Array.from(archiveController.selectedIds))}
                />;
            case 'editor':
                return <EditorView key={editingImage?.id ?? 'empty-editor'} image={editingImage} apiKey={apiKey} onSave={handleSaveEditedImage} />;
            case 'settings':
                return <SettingsView apiKey={apiKey} onApiKeyChange={handleApiKeyChange} />;
            default:
                return <div>View not found</div>;
        }
    }

    return (
        <div className="app-container">
            <Sidebar
                currentView={currentView}
                onViewChange={handleViewChange}
                theme={theme}
                onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            />
            <main className="main-content">
                <div className="view-wrapper">
                    {renderView()}
                </div>
            </main>

            {archiveController.selectedImage && (
                <ImageDetailModal
                    image={archiveController.selectedImage}
                    onClose={archiveController.closeImage}
                    onEdit={() => archiveController.selectedImage && archiveController.editImage(archiveController.selectedImage)}
                    onDelete={() => archiveController.selectedImage && archiveController.requestDelete([archiveController.selectedImage.id])}
                    onCreateSimilar={archiveController.createSimilar}
                    onNext={archiveController.showNextImage}
                    onPrevious={archiveController.showPreviousImage}
                />
            )}

            <ConfirmModal
                isOpen={archiveController.pendingDeleteIds.length > 0}
                title={archiveController.pendingDeleteIds.length === 1 ? 'Delete Masterpiece?' : `Delete ${archiveController.pendingDeleteIds.length} Masterpieces?`}
                message={archiveController.pendingDeleteIds.length === 1
                    ? 'This will permanently remove the image and its binary data from your local storage. This action cannot be undone.'
                    : `You are about to permanently remove ${archiveController.pendingDeleteIds.length} images and their binary data. This action cannot be reversed.`}
                confirmText={archiveController.pendingDeleteIds.length === 1 ? 'Delete' : 'Delete All'}
                type="danger"
                onConfirm={archiveController.confirmDelete}
                onCancel={archiveController.cancelDelete}
            />

            <div className="toast-container">
                {toasts.map(toast => (
                    <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </div>
    )
}

export default App
