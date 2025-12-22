import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import SettingsView from './views/SettingsView'
import GenerateView from './views/GenerateView'
import ArchiveView from './views/ArchiveView'
import EditorView from './views/EditorView'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useImageArchive } from './hooks/useImageArchive'
import type { ArchiveImage } from './db/types'
import type { AppView } from './types'

function App() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate')
    const { images, addImage, deleteImage } = useImageArchive()
    const [apiKey, setApiKey] = useLocalStorage<string>('aura_openapi_key', '')
    const [editingImage, setEditingImage] = useState<ArchiveImage | null>(null)

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
    }

    const handleDeleteImage = async (id: string) => {
        if (confirm('Are you sure you want to delete this image?')) {
            await deleteImage(id)
        }
    }

    const handleEditImage = (image: ArchiveImage) => {
        setEditingImage(image)
        setCurrentView('editor')
    }

    const handleSaveEditedImage = async (updatedUrl: string) => {
        if (!editingImage) return

        const updatedImage = { ...editingImage, url: updatedUrl }
        await addImage(updatedImage) // SQLiteAdapter's saveImage uses INSERT OR REPLACE

        setCurrentView('archive')
        setEditingImage(null)
    }

    const renderView = () => {
        switch (currentView) {
            case 'generate':
                return <GenerateView apiKey={apiKey} onSaveImage={handleSaveImage} />;
            case 'archive':
                return <ArchiveView images={images} onDeleteImage={handleDeleteImage} onEditImage={handleEditImage} />;
            case 'editor':
                return <EditorView image={editingImage} onSave={handleSaveEditedImage} />;
            case 'settings':
                return <SettingsView apiKey={apiKey} onApiKeyChange={handleApiKeyChange} />;
            default:
                return <div>View not found</div>;
        }
    }

    return (
        <div className="app-container">
            <Sidebar currentView={currentView} onViewChange={handleViewChange} />
            <main className="main-content">
                <div className="view-wrapper">
                    {renderView()}
                </div>
            </main>
        </div>
    )
}

export default App
