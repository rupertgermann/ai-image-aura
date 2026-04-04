import React from 'react';
import { Undo2, Save, MoveHorizontal, Sliders, Palette, Sparkles, Loader2, X, Upload, Copy } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { useEditorCanvas } from '../editor/useEditorCanvas';
import { useEditorController } from '../editor/useEditorController';
import { useEditorSession } from '../editor/useEditorSession';
import type { EditorSaveContext } from '../editor/saveEditedImage';

interface EditorViewProps {
    image: ArchiveImage | null;
    apiKey: string | null;
    onSave: (updatedUrl: string, context: EditorSaveContext) => void;
}

const EditorView: React.FC<EditorViewProps> = ({ image, apiKey, onSave }) => {
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
        canvasFilter,
        currentImageUrl,
        setCurrentImageUrl,
        referenceImages,
        referencePreviews,
        addReferenceFiles,
        removeReferenceAt,
        resetAdjustments,
        serializeReferences,
    } = useEditorSession(image);
    const { canvasRef, isReady, exportDataUrl, exportBlob } = useEditorCanvas(currentImageUrl, canvasFilter);
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
        apiKey,
        isCanvasReady: isReady,
        currentImageUrl,
        setCurrentImageUrl,
        referenceImages,
        addReferenceFiles,
        serializeReferences,
        exportDataUrl,
        exportBlob,
        adjustments,
        onSave,
    });

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
                <h1 className="gradient-text">Image Lab</h1>
                <p>Refine your masterpiece with professional controls.</p>
            </header>

            <div className="editor-grid">
                <div className="canvas-area glass-panel">
                    <canvas id="editor-canvas" ref={canvasRef} />
                </div>

                <aside className="editor-sidebar glass-panel">
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
                            <textarea
                                placeholder="Describe your transformation... (e.g. 'Make it a sunset', 'Add a dragon in the sky')"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                className="aura-input"
                                style={{ minHeight: '100px', resize: 'vertical' }}
                                disabled={aiLoading || !apiKey || !isCanvasReady}
                            />
                            <button
                                className="aura-btn aura-btn--primary"
                                onClick={() => { void applyAiEdit(); }}
                                disabled={aiLoading || !aiPrompt.trim() || !apiKey || !isCanvasReady}
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
                            {!apiKey && <div className="error-message mini">Set API Key in Settings</div>}
                        </div>
                    </div>

                    <div className="editor-actions">
                        <button className="aura-btn aura-btn--primary" onClick={() => { void save(false); }} disabled={!isCanvasReady}>
                            <Save size={18} /> Save Changes
                        </button>
                        <button className="aura-btn aura-btn--glass" onClick={() => { void save(true); }} disabled={!isCanvasReady}>
                            <Copy size={18} /> Save as Copy
                        </button>
                        <button className="aura-btn aura-btn--glass" onClick={resetAdjustments}>
                            <Undo2 size={18} /> Reset
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default EditorView;
