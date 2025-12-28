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
import { storage } from './services/StorageService'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useImageArchive } from './hooks/useImageArchive'
import type { ArchiveImage } from './db/types'
import type { AppView } from './types'

function App() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate')
    const { images, addImage, deleteImage } = useImageArchive()
    const [apiKey, setApiKey] = useLocalStorage<string>('aura_openapi_key', '')
    const [editingImage, setEditingImage] = useState<ArchiveImage | null>(null)
    const [selectedImage, setSelectedImage] = useState<ArchiveImage | null>(null)
    const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType }[]>([])
    const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; type?: 'danger' | 'info' }>({
        isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'info'
    })
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
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Masterpiece?',
            message: 'This will permanently remove the image and its binary data from your local storage. This action cannot be undone.',
            type: 'danger',
            onConfirm: async () => {
                await deleteImage(id)
                setConfirmConfig(prev => ({ ...prev, isOpen: false }))
                addToast('Image deleted permanently', 'info')
                if (selectedImage?.id === id) setSelectedImage(null)
            }
        })
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
            await addImage(updatedImage) // SQLiteAdapter's saveImage uses INSERT OR REPLACE
            addToast('Masterpiece updated', 'success')
        }

        setCurrentView('archive')
        setEditingImage(null)
    }

    const handleCreateSimilar = async (image: ArchiveImage) => {
        localStorage.setItem('aura_generate_prompt', JSON.stringify(image.prompt))
        localStorage.setItem('aura_generate_quality', JSON.stringify(image.quality))
        localStorage.setItem('aura_generate_aspect_ratio', JSON.stringify(image.aspectRatio))
        localStorage.setItem('aura_generate_background', JSON.stringify(image.background || 'auto'))
        localStorage.setItem('aura_generate_style', JSON.stringify(image.style || 'none'))
        localStorage.setItem('aura_generate_is_saved', JSON.stringify(false))

        if (image.references && image.references.length > 0) {
            await storage.save('generate_transferred_references', JSON.stringify(image.references));
        } else {
            await storage.remove('generate_transferred_references');
        }

        setSelectedImage(null)
        setCurrentView('generate')
        addToast('Settings & references transferred', 'info')
    }

    const handleNextImage = () => {
        if (!selectedImage) return
        const currentIndex = images.findIndex(img => img.id === selectedImage.id)
        if (currentIndex < images.length - 1) {
            setSelectedImage(images[currentIndex + 1])
        }
    }

    const handlePreviousImage = () => {
        if (!selectedImage) return
        const currentIndex = images.findIndex(img => img.id === selectedImage.id)
        if (currentIndex > 0) {
            setSelectedImage(images[currentIndex - 1])
        }
    }

    const renderView = () => {
        switch (currentView) {
            case 'generate':
                return <GenerateView apiKey={apiKey} onSaveImage={handleSaveImage} />;
            case 'archive':
                return <ArchiveView
                    images={images}
                    onDeleteImage={handleDeleteImage}
                    onEditImage={handleEditImage}
                    onSelectImage={setSelectedImage}
                />;
            case 'editor':
                return <EditorView image={editingImage} apiKey={apiKey} onSave={handleSaveEditedImage} />;
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

            {selectedImage && (
                <ImageDetailModal
                    image={selectedImage}
                    onClose={() => setSelectedImage(null)}
                    onEdit={handleEditImage}
                    onDelete={handleDeleteImage}
                    onCreateSimilar={() => handleCreateSimilar(selectedImage)}
                    onNext={handleNextImage}
                    onPrevious={handlePreviousImage}
                />
            )}

            <ConfirmModal
                {...confirmConfig}
                onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
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
