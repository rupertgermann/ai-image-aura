import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Save, MoveHorizontal, Sliders, Palette, Sparkles, Loader2, X, Upload, Copy, Layers, RotateCcw } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { EditorCanvas, type EditorCanvasHandle } from '../editor/EditorCanvas';
import { LayerPanel } from '../editor/LayerPanel';
import { useEditorController } from '../editor/useEditorController';
import { useEditorSession } from '../editor/useEditorSession';
import type { EditorSaveContext } from '../editor/saveEditedImage';
import { IMAGE_MODEL_REGISTRY, OPENAI_IMAGE_MODEL, isImageModelSlug, resolveImageModelConfig, type ImageModelSlug, type Provider } from '../utils/openaiModels';

interface EditorViewProps {
    image: ArchiveImage | null;
    getProviderKey: (provider: Provider) => string | null;
    onSave: (updatedUrl: string, context: EditorSaveContext) => void;
}

const EditorView: React.FC<EditorViewProps> = ({ image, getProviderKey, onSave }) => {
    const defaultModel = image && isImageModelSlug(image.model) ? image.model : OPENAI_IMAGE_MODEL;
    const [aiEditModel, setAiEditModel] = useState<ImageModelSlug>(defaultModel);
    const canvasRef = useRef<EditorCanvasHandle>(null);
    const activeModel = resolveImageModelConfig(aiEditModel);
    const activeApiKey = getProviderKey(activeModel.provider);
    const {
        brightness,
        setBrightness,
        contrast,
        setContrast,
        saturation,
        setSaturation,
        filter,
        setFilter,
        adjustments,
        draft,
        layerStack,
        selectedLayerIds,
        primarySelectedLayerId,
        referenceImages,
        referencePreviews,
        addReferenceFiles,
        removeReferenceAt,
        addLayerFiles,
        selectLayer,
        renameLayer,
        setLayerVisible,
        setLayerOpacity,
        updateLayerTransform,
        duplicateSelectedLayers,
        deleteSelectedLayers,
        moveSelectedLayer,
        commitDraft,
        undo,
        redo,
        canUndo,
        canRedo,
        isDirty,
        revertDraft,
        resetAdjustments,
        serializeReferences,
    } = useEditorSession(image);
    const isReady = !!layerStack;
    const {
        aiPrompt,
        setAiPrompt,
        aiLoading,
        aiError,
        isDragging,
        isCanvasReady,
        save,
        applyAiEdit,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    } = useEditorController({
        apiKey: activeApiKey,
        model: aiEditModel,
        isCanvasReady: isReady,
        draft,
        layerStack,
        selectedLayerIds,
        commitDraft,
        referenceImages,
        addReferenceFiles,
        serializeReferences,
        exportDataUrl: async () => {
            if (!canvasRef.current) throw new Error('Canvas not ready');
            return canvasRef.current.exportDataUrl();
        },
        exportBlob: async () => {
            if (!canvasRef.current) throw new Error('Canvas not ready');
            return canvasRef.current.exportBlob();
        },
        adjustments,
        onSave,
    });

    useEffect(() => {
        const isTextInput = (target: EventTarget | null) => {
            const element = target as HTMLElement | null;
            return !!element?.closest('input, textarea, select, [contenteditable="true"]');
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isTextInput(event.target)) {
                return;
            }

            const modifier = event.metaKey || event.ctrlKey;
            if (modifier && event.key.toLowerCase() === 's') {
                event.preventDefault();
                void save(false);
                return;
            }
            if (modifier && event.key.toLowerCase() === 'z' && event.shiftKey) {
                event.preventDefault();
                redo();
                return;
            }
            if (modifier && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                undo();
                return;
            }
            if (modifier && event.key.toLowerCase() === 'y') {
                event.preventDefault();
                redo();
                return;
            }
            if (modifier && event.key.toLowerCase() === 'd') {
                event.preventDefault();
                duplicateSelectedLayers();
                return;
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                deleteSelectedLayers();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                selectLayer('base');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteSelectedLayers, duplicateSelectedLayers, redo, save, selectLayer, undo]);

    if (!image) {
        return (
            <div className="empty-archive">
                <div className="empty-state glass-panel">
                    <Palette size={48} className="dim-icon" />
                    <h3>No Image Selected</h3>
                    <p>Go to the Archive and click Edit on an image to start.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="editor-container">
            <header className="view-header">
                <h1>Image Lab</h1>
                <p>Refine your masterpiece with professional controls.</p>
            </header>

            <div className="editor-grid">
                <div className="canvas-area glass-panel">
                    {layerStack && (
                        <EditorCanvas
                            ref={canvasRef}
                            layerStack={layerStack}
                            adjustments={adjustments}
                            selectedLayerIds={selectedLayerIds}
                            primarySelectedLayerId={primarySelectedLayerId}
                            onSelectLayer={selectLayer}
                            onTransformLayer={updateLayerTransform}
                        />
                    )}
                </div>

                <aside className="editor-sidebar glass-panel">
                    {layerStack && (
                        <div className="sidebar-group">
                            <div className="section-title">
                                <Layers size={18} className="icon-purple" />
                                <h3>Layers</h3>
                            </div>
                            <label className="upload-layer">
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => {
                                        void addLayerFiles(Array.from(e.target.files || []));
                                        e.currentTarget.value = '';
                                    }}
                                    style={{ display: 'none' }}
                                />
                                <Upload size={16} />
                                Add image layer
                            </label>
                            <LayerPanel
                                layerStack={layerStack}
                                selectedLayerIds={selectedLayerIds}
                                primarySelectedLayerId={primarySelectedLayerId}
                                onSelectLayer={selectLayer}
                                onRenameLayer={renameLayer}
                                onSetVisible={setLayerVisible}
                                onSetOpacity={setLayerOpacity}
                                onDuplicate={duplicateSelectedLayers}
                                onDelete={deleteSelectedLayers}
                                onMove={moveSelectedLayer}
                            />
                        </div>
                    )}

                    <div className="sidebar-group">
                        <div className="section-title">
                            <Sliders size={18} className="icon-purple" />
                            <h3>Adjustments</h3>
                        </div>

                        <div className="slider-group">
                            <div className="slider-label">
                                <span>Brightness</span>
                                <span>{brightness}%</span>
                            </div>
                            <input
                                type="range" min="0" max="200" value={brightness}
                                onChange={(e) => setBrightness(Number(e.target.value))}
                                className="editor-slider"
                            />
                        </div>

                        <div className="slider-group">
                            <div className="slider-label">
                                <span>Contrast</span>
                                <span>{contrast}%</span>
                            </div>
                            <input
                                type="range" min="0" max="200" value={contrast}
                                onChange={(e) => setContrast(Number(e.target.value))}
                                className="editor-slider"
                            />
                        </div>

                        <div className="slider-group">
                            <div className="slider-label">
                                <span>Saturation</span>
                                <span>{saturation}%</span>
                            </div>
                            <input
                                type="range" min="0" max="200" value={saturation}
                                onChange={(e) => setSaturation(Number(e.target.value))}
                                className="editor-slider"
                            />
                        </div>
                    </div>

                    <div className="sidebar-group">
                        <div className="section-title">
                            <MoveHorizontal size={18} className="icon-purple" />
                            <h3>Filters</h3>
                        </div>
                        <div className="filter-grid">
                            <button
                                className={`filter-btn ${filter === 'none' ? 'active' : ''}`}
                                onClick={() => setFilter('none')}
                            >Normal</button>
                            <button
                                className={`filter-btn ${filter === 'grayscale(100%)' ? 'active' : ''}`}
                                onClick={() => setFilter('grayscale(100%)')}
                            >B&W</button>
                            <button
                                className={`filter-btn ${filter === 'sepia(100%)' ? 'active' : ''}`}
                                onClick={() => setFilter('sepia(100%)')}
                            >Sepia</button>
                            <button
                                className={`filter-btn ${filter === 'blur(5px)' ? 'active' : ''}`}
                                onClick={() => setFilter('blur(5px)')}
                            >Soft</button>
                        </div>
                    </div>

                    <div className="sidebar-group">
                        <div className="section-title">
                            <Sparkles size={18} className="icon-purple" />
                            <h3>AI Superpowers</h3>
                        </div>
                        <div className="ai-edit-box">
                            <div className="option-group">
                                <label>MODEL</label>
                                <div className="toggle-group">
                                    {(Object.keys(IMAGE_MODEL_REGISTRY) as ImageModelSlug[]).map((modelSlug) => {
                                        const config = resolveImageModelConfig(modelSlug);
                                        const hasKey = !!getProviderKey(config.provider);
                                        return (
                                            <button
                                                key={modelSlug}
                                                className={aiEditModel === modelSlug ? 'active' : ''}
                                                onClick={() => setAiEditModel(modelSlug)}
                                                disabled={!hasKey}
                                                title={hasKey ? config.label : `Add a ${config.provider === 'google' ? 'Google' : 'OpenAI'} API key in Settings`}
                                            >
                                                {config.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <textarea
                                placeholder="Describe your transformation... (e.g. 'Make it a sunset', 'Add a dragon in the sky')"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                className="aura-input"
                                style={{ minHeight: '100px', resize: 'vertical' }}
                                disabled={aiLoading || !activeApiKey || !isCanvasReady}
                            />
                            <button
                                className="btn-amber"
                                onClick={() => { void applyAiEdit(); }}
                                disabled={aiLoading || !aiPrompt.trim() || !activeApiKey || !isCanvasReady}
                                style={{ width: '100%' }}
                            >
                                {aiLoading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                                {aiLoading ? 'AI is thinking...' : 'Transform with AI'}
                            </button>

                            <div
                                className={`reference-section mini ${isDragging ? 'dragging' : ''}`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <label>ADD VISUAL CONTEXT (OPTIONAL) {isDragging && '- DROP TO UPLOAD'}</label>
                                <div className="reference-grid mini">
                                    {referencePreviews.map((url: string, idx: number) => (
                                        <div key={url} className="reference-preview mini glass-panel">
                                            <img src={url} alt="Reference" />
                                            <button
                                                className="remove-ref"
                                                onClick={() => removeReferenceAt(idx)}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    <label className="upload-ref mini glass-panel">
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*"
                                            onChange={(e) => {
                                                addReferenceFiles(Array.from(e.target.files || []));
                                            }}
                                            style={{ display: 'none' }}
                                        />
                                        <Upload size={16} />
                                        <span>Add</span>
                                    </label>
                                </div>
                            </div>

                            {aiError && <div className="error-message mini">{aiError}</div>}
                            {!activeApiKey && <div className="error-message mini">Set {activeModel.label} API key in Settings</div>}
                        </div>
                    </div>

                    <div className="editor-actions">
                        <button className="btn-amber" onClick={() => { void save(false); }} disabled={!isCanvasReady}>
                            <Save size={18} /> Save Changes
                        </button>
                        <button className="btn-ghost" onClick={() => { void save(true); }} disabled={!isCanvasReady}>
                            <Copy size={18} /> Save as Copy
                        </button>
                        <button className="btn-ghost" onClick={resetAdjustments}>
                            <RotateCcw size={18} /> Reset Adjustments
                        </button>
                        <button className="btn-ghost" onClick={revertDraft}>
                            <Undo2 size={18} /> {isDirty ? 'Revert Draft' : 'Draft Saved'}
                        </button>
                        <div className="history-actions">
                            <button className="btn-ghost" onClick={undo} disabled={!canUndo}>
                                <Undo2 size={18} /> Undo
                            </button>
                            <button className="btn-ghost" onClick={redo} disabled={!canRedo}>
                                <Redo2 size={18} /> Redo
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default EditorView;
