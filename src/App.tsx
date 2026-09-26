import { lazy, Suspense, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import SettingsView from './views/SettingsView'
import GenerateView from './views/GenerateView'
import ArchiveView from './views/ArchiveView'
const EditorView = lazy(() => import('./views/EditorView'))
import ImageDetailModal from './components/ImageDetailModal'
import Toast from './components/Toast'
import ConfirmModal from './components/ConfirmModal'
import { useAppController } from './app/useAppController'

function App() {
    const {
        currentView,
        generateTransferKey,
        toasts,
        archiveController,
        changeView,
        removeToast,
        generateViewProps,
        archiveViewProps,
        editorViewProps,
        settingsViewProps,
        replayGenerateFromLineageStep,
        replayEditorFromLineageStep,
        forkFromLineageStep,
    } = useAppController()

    const mainRef = useRef<HTMLElement>(null)
    useEffect(() => {
        mainRef.current?.scrollTo(0, 0)
        mainRef.current?.focus()
    }, [currentView])

    const renderView = () => {
        switch (currentView) {
            case 'generate':
                return null;
            case 'archive':
                return <ArchiveView {...archiveViewProps} />;
            case 'editor':
                return null;
            case 'settings':
                return <SettingsView {...settingsViewProps} />;
            default:
                return <div>View not found</div>;
        }
    }

    return (
        <div className="app-container">
            <a className="skip-link" href="#main-content">Skip to content</a>
            <Sidebar
                currentView={currentView}
                onViewChange={changeView}
            />
            <main id="main-content" ref={mainRef} className="main-content" tabIndex={-1}>
                <div className="view-wrapper">
                    <div hidden={currentView !== 'generate'}>
                        <GenerateView key={generateTransferKey} {...generateViewProps} />
                    </div>
                    {(currentView === 'editor' || editorViewProps.image) && <div hidden={currentView !== 'editor'}>
                        <Suspense fallback={<p role="status">Loading editor…</p>}>
                            <EditorView key={editorViewProps.image?.id ?? 'empty-editor'} isActive={currentView === 'editor'} {...editorViewProps} />
                        </Suspense>
                    </div>}
                    {renderView()}
                </div>
            </main>

            {archiveController.selectedImage && (
                <ImageDetailModal
                    image={archiveController.selectedImage}
                    images={archiveViewProps.images}
                    hasPrevious={archiveController.hasPreviousImage}
                    hasNext={archiveController.hasNextImage}
                    onClose={archiveController.closeImage}
                    onEdit={() => archiveController.selectedImage && archiveController.editImage(archiveController.selectedImage)}
                    onDelete={() => archiveController.selectedImage && archiveController.requestDelete([archiveController.selectedImage.id])}
                    onCreateSimilar={archiveController.createSimilar}
                    onToggleFavorite={() => {
                        if (archiveController.selectedImage) {
                            void archiveViewProps.onToggleFavorite(archiveController.selectedImage)
                        }
                    }}
                    onReplayGenerate={(stepId) => {
                        archiveController.closeImage()
                        void replayGenerateFromLineageStep(stepId)
                    }}
                    onReplayEditor={(stepId) => {
                        archiveController.closeImage()
                        void replayEditorFromLineageStep(stepId)
                    }}
                    onForkFromStep={(stepId) => {
                        void forkFromLineageStep(stepId)
                    }}
                    onNext={archiveController.showNextImage}
                    onPrevious={archiveController.showPreviousImage}
                />
            )}

            <ConfirmModal
                isOpen={archiveController.pendingDeleteIds.length > 0}
                title={archiveController.pendingDeleteIds.length === 1 ? 'Delete image?' : `Delete ${archiveController.pendingDeleteIds.length} images?`}
                message={archiveController.pendingDeleteIds.length === 1
                    ? 'This will permanently remove this image from your archive. This action cannot be undone.'
                    : `You are about to permanently remove ${archiveController.pendingDeleteIds.length} images from your archive. This action cannot be reversed.`}
                confirmText={archiveController.pendingDeleteIds.length === 1 ? 'Delete image' : `Delete ${archiveController.pendingDeleteIds.length} images`}
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
