import Sidebar from './components/Sidebar'
import SettingsView from './views/SettingsView'
import GenerateView from './views/GenerateView'
import ArchiveView from './views/ArchiveView'
import EditorView from './views/EditorView'
import ImageDetailModal from './components/ImageDetailModal'
import Toast from './components/Toast'
import ConfirmModal from './components/ConfirmModal'
import { useAppController } from './app/useAppController'

function App() {
    const {
        currentView,
        theme,
        toasts,
        archiveController,
        changeView,
        toggleTheme,
        removeToast,
        generateViewProps,
        archiveViewProps,
        editorViewProps,
        settingsViewProps,
    } = useAppController()

    const renderView = () => {
        switch (currentView) {
            case 'generate':
                return <GenerateView {...generateViewProps} />;
            case 'archive':
                return <ArchiveView {...archiveViewProps} />;
            case 'editor':
                return <EditorView {...editorViewProps} />;
            case 'settings':
                return <SettingsView {...settingsViewProps} />;
            default:
                return <div>View not found</div>;
        }
    }

    return (
        <div className="app-container">
            <Sidebar
                currentView={currentView}
                onViewChange={changeView}
                theme={theme}
                onThemeToggle={toggleTheme}
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
