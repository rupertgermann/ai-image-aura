import Modal from '../components/Modal';
import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Save, MoveHorizontal, Sliders, Palette, Sparkles, Loader2, X, Upload, Copy, Layers, RotateCcw, ChevronDown, ChevronRight, Paintbrush, Eraser } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { EditorCanvas, type EditorCanvasHandle } from '../editor/EditorCanvas';
import { LayerPanel } from '../editor/LayerPanel';
import { resolveEditorShortcut } from '../editor/shortcuts';
import { useEditorController } from '../editor/useEditorController';
import { useEditorSession } from '../editor/useEditorSession';
import type { EditorSaveContext } from '../editor/saveEditedImage';
import { LOCAL_PROVIDER, OPENAI_IMAGE_MODEL, getProviderLabel, isImageModelSlug, resolveImageModelConfig, type ImageModelSlug, type Provider } from '../utils/openaiModels';
import { getImageModelUiChoices, imageModelSupportsTransformMask } from '../image-models/ImageModelControls';
import { getImageFilesFromClipboard } from '../references/clipboard';
import { getAiTransformReferenceWarning, renderAiTransformEditInput } from '../editor/aiTransform';
import { classifyTransformMaskCoverage } from '../editor/transformMask';
import type { EditorReplay } from '../lineage/replayLineageStep';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface EditorViewProps {
    isActive: boolean;
    onBusyChange: (busy: boolean) => void;
    onOpenArchive: () => void;
    onOpenSettings: () => void;
    image: ArchiveImage | null;
    replay?: EditorReplay | null;
    getProviderCredential: (provider: Provider) => string | null;
    onSave: (updatedUrl: string, context: EditorSaveContext) => void;
}

const EditorView: React.FC<EditorViewProps> = ({ isActive, onBusyChange, image, replay, getProviderCredential, onSave, onOpenArchive, onOpenSettings }) => {
    const defaultModel = image && isImageModelSlug(image.model) ? image.model : OPENAI_IMAGE_MODEL;
    const [aiEditModel, setAiEditModel] = useState<ImageModelSlug>(defaultModel);
    const [adjustmentsOpen, setAdjustmentsOpen] = useLocalStorage('editor_adjustments_open', true);
    const [filtersOpen, setFiltersOpen] = useLocalStorage('editor_filters_open', true);
    const [maskEditorOpen, setMaskEditorOpen] = useState(false);
    const [maskTargetUrl, setMaskTargetUrl] = useState<string | null>(null);
    const [maskLoading, setMaskLoading] = useState(false);
    const [maskError, setMaskError] = useState<string | null>(null);
    const [maskTool, setMaskTool] = useState<'brush' | 'eraser'>('brush');
    const [maskBrushSize, setMaskBrushSize] = useState(32);
    const [transformMaskFile, setTransformMaskFile] = useState<File | null>(null);
    const canvasRef = useRef<EditorCanvasHandle>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const paintingMaskRef = useRef(false);
    const activeModel = resolveImageModelConfig(aiEditModel);
    const imageCredential = getProviderCredential(activeModel.provider);
    const supportsTransformMask = imageModelSupportsTransformMask(aiEditModel);
    const {
        draftLoading,
        draftError,
        beginAdjustment,
        endAdjustment,
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
        clearSelection,
        renameLayer,
        setLayerVisible,
        setLayerOpacity,
        setLayerLocked,
        setLayerBlendMode,
        reorderLayerTo,
        nudgeSelectedLayers,
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
    const isReady = !!layerStack && !draftLoading;
    const {
        aiPrompt,
        setAiPrompt,
        aiLoading,
        saving,
        aiError,
        isDragging,
        isCanvasReady,
        save,
        applyAiEdit,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    } = useEditorController({
        imageCredential,
        model: aiEditModel,
        isCanvasReady: isReady,
        draft,
        maskImage: supportsTransformMask ? transformMaskFile : null,
        commitDraft,
        referenceImages,
        addReferenceFiles,
        serializeReferences,
        exportDataUrl: async () => {
            if (!canvasRef.current) throw new Error('Canvas not ready');
            return canvasRef.current.exportDataUrl();
        },
        adjustments,
        onSave,
    });
    const aiReferenceWarning = getAiTransformReferenceWarning(aiEditModel, referenceImages.length, draft);
    useEffect(() => { onBusyChange(aiLoading || saving); }, [aiLoading, saving, onBusyChange]);

    useEffect(() => {
        if (!replay) {
            return;
        }

        if (replay.model) {
            setAiEditModel(replay.model);
        }
        if (replay.prompt) {
            setAiPrompt(replay.prompt);
        }
        setTransformMaskFile(replay.maskImage ?? null);
    }, [replay, setAiPrompt]);

    useEffect(() => {
        if (!supportsTransformMask) {
            setTransformMaskFile(null);
            setMaskEditorOpen(false);
        }
    }, [supportsTransformMask]);

    useEffect(() => () => {
        if (maskTargetUrl) {
            URL.revokeObjectURL(maskTargetUrl);
        }
    }, [maskTargetUrl]);

    const openMaskEditor = async () => {
        if (!draft) {
            return;
        }

        setMaskEditorOpen(true);
        setMaskLoading(true);
        setMaskError(null);
        try {
            const input = await renderAiTransformEditInput({
                draft,
                adjustments,
                referenceImages: [],
            });
            const url = URL.createObjectURL(input.sourceImage);
            setMaskTargetUrl((previousUrl) => {
                if (previousUrl) URL.revokeObjectURL(previousUrl);
                return url;
            });
        } catch (error) {
            setMaskError(error instanceof Error ? error.message : 'Failed to render transform target');
        } finally {
            setMaskLoading(false);
        }
    };

    const handleMaskTargetLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const canvas = maskCanvasRef.current;
        if (!canvas) return;

        const imageElement = event.currentTarget;
        canvas.width = imageElement.naturalWidth;
        canvas.height = imageElement.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!transformMaskFile) return;

        const maskUrl = URL.createObjectURL(transformMaskFile);
        const maskImage = new Image();
        maskImage.onload = () => {
            context.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(maskUrl);
        };
        maskImage.onerror = () => URL.revokeObjectURL(maskUrl);
        maskImage.src = maskUrl;
    };

    const paintMaskAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = maskCanvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);

        context.save();
        context.globalCompositeOperation = maskTool === 'eraser' ? 'destination-out' : 'source-over';
        context.fillStyle = 'rgba(255, 255, 255, 1)';
        context.beginPath();
        context.arc(x, y, maskBrushSize / 2, 0, Math.PI * 2);
        context.fill();
        context.restore();
    };

    const handleMaskPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        paintingMaskRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        paintMaskAt(event);
    };

    const stopMaskPainting = () => {
        paintingMaskRef.current = false;
    };

    const handleMaskPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (paintingMaskRef.current) {
            paintMaskAt(event);
        }
    };

    const clearTransformMask = () => {
        const canvas = maskCanvasRef.current;
        const context = canvas?.getContext('2d');
        if (canvas && context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
        setTransformMaskFile(null);
        setMaskError(null);
    };

    const applyTransformMask = async () => {
        const canvas = maskCanvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) {
            setMaskError('Mask editor is not ready.');
            return;
        }

        const maskData = context.getImageData(0, 0, canvas.width, canvas.height);
        if (classifyTransformMaskCoverage(maskData) === 'empty') {
            setMaskError('Paint a mask before applying it.');
            return;
        }

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
            setMaskError('Failed to create mask image.');
            return;
        }

        setTransformMaskFile(new File([blob], 'transform-mask.png', { type: 'image/png' }));
        setMaskEditorOpen(false);
        setMaskError(null);
    };

    const handleReferencePaste = (event: React.ClipboardEvent) => {
        const files = getImageFilesFromClipboard(event);
        if (files.length === 0) {
            return;
        }

        event.preventDefault();
        addReferenceFiles(files);
    };

    useEffect(() => {
        const isTextInput = (target: EventTarget | null) => {
            const element = target as HTMLElement | null;
            return !!element?.closest('input, textarea, select, [contenteditable="true"]');
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isActive || draftLoading || aiLoading || saving || document.querySelector('dialog[open]')) return;
            const shortcut = resolveEditorShortcut({
                key: event.key,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                isTextInput: isTextInput(event.target),
            });
            if (!shortcut) {
                return;
            }

            event.preventDefault();
            if (shortcut === 'save') {
                void save(false);
            } else if (shortcut === 'undo') {
                undo();
            } else if (shortcut === 'redo') {
                redo();
            } else if (shortcut === 'duplicate') {
                duplicateSelectedLayers();
            } else if (shortcut === 'delete') {
                deleteSelectedLayers();
            } else if (shortcut === 'clear-selection') {
                clearSelection();
            } else if (shortcut.startsWith('nudge-')) {
                const step = event.shiftKey ? 10 : 1;
                const [dx, dy] = shortcut === 'nudge-up'
                    ? [0, -step]
                    : shortcut === 'nudge-down'
                        ? [0, step]
                        : shortcut === 'nudge-left'
                            ? [-step, 0]
                            : [step, 0];
                nudgeSelectedLayers(dx, dy);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, draftLoading, aiLoading, saving, clearSelection, deleteSelectedLayers, duplicateSelectedLayers, nudgeSelectedLayers, redo, save, undo]);

    if (!image) {
        return (
            <div className="empty-archive">
                <div className="empty-state glass-panel">
                    <Palette size={48} className="dim-icon" />
                    <h1>Editor</h1>
                    <p>Choose an image from your archive to start editing.</p>
                    <button className="btn-primary" onClick={onOpenArchive}>Open Archive</button>
                </div>
            </div>
        );
    }

    return (
        <div className="editor-container">
            <header className="view-header">
                <div className="header-flex">
                    <div><h1>Editor</h1><p>{draftLoading ? 'Restoring your draft…' : saving ? 'Saving your image…' : isDirty ? 'Changes not yet saved to archive' : 'Your image is up to date'}</p></div>
                    <div className="editor-toolbar">
                        <button className="btn-ghost btn-icon" onClick={undo} disabled={!canUndo || aiLoading || saving} aria-label="Undo" title="Undo (⌘/Ctrl Z)"><Undo2 size={18} /></button>
                        <button className="btn-ghost btn-icon" onClick={redo} disabled={!canRedo || aiLoading || saving} aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)"><Redo2 size={18} /></button>
                        <button className="btn-ghost" onClick={() => { void save(true); }} disabled={!isCanvasReady || aiLoading || saving}><Copy size={18} /> Save as copy</button>
                        <button className="btn-amber" onClick={() => { void save(false); }} disabled={!isCanvasReady || !isDirty || aiLoading || saving}><Save size={18} /> {saving ? 'Saving…' : 'Save changes'}</button>
                    </div>
                </div>
                {draftError && <div className="error-message" role="alert">{draftError}</div>}
                {aiError && <div className="error-message" role="alert">{aiError}</div>}
            </header>

            <div className="editor-grid">
                <div className="canvas-area glass-panel" inert={draftLoading || aiLoading || saving}>
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

                <fieldset className="editor-sidebar glass-panel" disabled={draftLoading || aiLoading || saving}>
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
                                    className="file-input-overlay"
                                    aria-label="Add image layers"
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
                                onSetLocked={setLayerLocked}
                                onSetBlendMode={setLayerBlendMode}
                                onReorder={reorderLayerTo}
                                onDuplicate={duplicateSelectedLayers}
                                onDelete={deleteSelectedLayers}
                                onMove={moveSelectedLayer}
                            />
                        </div>
                    )}

                    <div className="sidebar-group">
                        <button
                            className="section-title section-toggle"
                            type="button"
                            aria-expanded={adjustmentsOpen}
                            aria-controls="editor-adjustments-panel"
                            onClick={() => setAdjustmentsOpen((open) => !open)}
                        >
                            <Sliders size={18} className="icon-purple" />
                            <span className="section-heading">Adjustments</span>
                            {adjustmentsOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>

                        <div id="editor-adjustments-panel" className="collapsible-section-body" hidden={!adjustmentsOpen}>
                            <div className="slider-group">
                                <div className="slider-label">
                                    <span>Brightness</span>
                                    <span>{brightness}%</span>
                                </div>
                                <input
                                    aria-label="Brightness" aria-valuetext={`${brightness}%`}
                                    type="range" min="0" max="200" value={brightness}
                                    onChange={(e) => setBrightness(Number(e.target.value))}
                                    className="editor-slider"
                                    onPointerDown={beginAdjustment}
                                    onPointerUp={endAdjustment}
                                    onPointerCancel={endAdjustment}
                                    onBlur={endAdjustment}
                                />
                            </div>

                            <div className="slider-group">
                                <div className="slider-label">
                                    <span>Contrast</span>
                                    <span>{contrast}%</span>
                                </div>
                                <input
                                    aria-label="Contrast" aria-valuetext={`${contrast}%`}
                                    type="range" min="0" max="200" value={contrast}
                                    onChange={(e) => setContrast(Number(e.target.value))}
                                    className="editor-slider"
                                    onPointerDown={beginAdjustment}
                                    onPointerUp={endAdjustment}
                                    onPointerCancel={endAdjustment}
                                    onBlur={endAdjustment}
                                />
                            </div>

                            <div className="slider-group">
                                <div className="slider-label">
                                    <span>Saturation</span>
                                    <span>{saturation}%</span>
                                </div>
                                <input
                                    aria-label="Saturation" aria-valuetext={`${saturation}%`}
                                    type="range" min="0" max="200" value={saturation}
                                    onChange={(e) => setSaturation(Number(e.target.value))}
                                    className="editor-slider"
                                    onPointerDown={beginAdjustment}
                                    onPointerUp={endAdjustment}
                                    onPointerCancel={endAdjustment}
                                    onBlur={endAdjustment}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="sidebar-group">
                        <button
                            className="section-title section-toggle"
                            type="button"
                            aria-expanded={filtersOpen}
                            aria-controls="editor-filters-panel"
                            onClick={() => setFiltersOpen((open) => !open)}
                        >
                            <MoveHorizontal size={18} className="icon-purple" />
                            <span className="section-heading">Filters</span>
                            {filtersOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <div id="editor-filters-panel" className="collapsible-section-body" hidden={!filtersOpen}>
                            <div className="filter-grid">
                                <button
                                    className={`filter-btn ${filter === 'none' ? 'active' : ''}`}
                                    aria-pressed={filter === 'none'}
                                    onClick={() => setFilter('none')}
                                >Normal</button>
                                <button
                                    className={`filter-btn ${filter === 'grayscale(100%)' ? 'active' : ''}`}
                                    aria-pressed={filter === 'grayscale(100%)'}
                                    onClick={() => setFilter('grayscale(100%)')}
                                >B&W</button>
                                <button
                                    className={`filter-btn ${filter === 'sepia(100%)' ? 'active' : ''}`}
                                    aria-pressed={filter === 'sepia(100%)'}
                                    onClick={() => setFilter('sepia(100%)')}
                                >Sepia</button>
                                <button
                                    className={`filter-btn ${filter === 'blur(5px)' ? 'active' : ''}`}
                                    aria-pressed={filter === 'blur(5px)'}
                                    onClick={() => setFilter('blur(5px)')}
                                >Soft</button>
                            </div>
                        </div>
                    </div>

                    <details className="sidebar-group ai-edit-section" open={!!replay?.prompt}>
                        <summary>AI transform</summary>
                        <div className="ai-edit-box">
                            <div className="option-group">
                                <label htmlFor="editor-image-model">Image model</label>
                                <select id="editor-image-model" value={aiEditModel} onChange={(event) => {
                                    if (isImageModelSlug(event.target.value)) setAiEditModel(event.target.value);
                                }}>
                                    {getImageModelUiChoices().map((choice) => <option key={choice.slug} value={choice.slug}>{choice.label}</option>)}
                                </select>
                            </div>

                            <textarea
                                aria-label="AI transformation prompt"
                                placeholder="Describe your transformation... (e.g. 'Make it a sunset', 'Add a dragon in the sky')"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                className="aura-input"
                                style={{ minHeight: '100px', resize: 'vertical' }}
                                disabled={aiLoading || !imageCredential || !isCanvasReady}
                            />
                            {supportsTransformMask && (
                                <div className="transform-mask-controls">
                                    <button
                                        className={`btn-ghost ${transformMaskFile ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => { void openMaskEditor(); }}
                                        disabled={aiLoading || !isCanvasReady || !draft}
                                    >
                                        <Paintbrush size={16} /> {transformMaskFile ? 'Edit Mask' : 'Mask'}
                                    </button>
                                    {transformMaskFile && (
                                        <button
                                            className="btn-ghost"
                                            type="button"
                                            onClick={clearTransformMask}
                                            disabled={aiLoading}
                                        >
                                            <X size={16} /> Clear Mask
                                        </button>
                                    )}
                                </div>
                            )}
                            <button
                                className="btn-amber"
                                onClick={() => { void applyAiEdit(); }}
                                disabled={aiLoading || !aiPrompt.trim() || !imageCredential || !isCanvasReady}
                                style={{ width: '100%' }}
                            >
                                {aiLoading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                                {aiLoading ? 'Transforming image...' : 'Transform with AI'}
                            </button>

                            <div
                                className={`reference-section mini ${isDragging ? 'dragging' : ''}`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onPaste={handleReferencePaste}
                                tabIndex={0}
                            >
                                <label>ADD VISUAL CONTEXT (OPTIONAL) {isDragging && '- DROP TO UPLOAD'}</label>
                                <div className="reference-grid mini">
                                    {referencePreviews.map((url: string, idx: number) => (
                                        <div key={url} className="reference-preview mini glass-panel">
                                            <img src={url} alt="Reference" />
                                            <button
                                                className="remove-ref"
                                                aria-label={`Remove reference ${idx + 1}`}
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
                                                e.currentTarget.value = '';
                                            }}
                                            className="file-input-overlay"
                                            aria-label="Add reference images"
                                        />
                                        <Upload size={16} />
                                        <span>Add</span>
                                    </label>
                                </div>
                            </div>

                            {aiReferenceWarning && <div className="info-message mini">{aiReferenceWarning}</div>}
                            {!imageCredential && <div className="error-message mini">{activeModel.provider === LOCAL_PROVIDER
                                ? 'Set Local server URL in Settings'
                                : `Set ${getProviderLabel(activeModel.provider)} API key in Settings`} <button className="inline-link" onClick={onOpenSettings}>Open Settings</button></div>}
                        </div>
                    </details>

                    <div className="editor-actions">
                        <button className="btn-ghost" onClick={resetAdjustments} disabled={brightness === 100 && contrast === 100 && saturation === 100 && filter === 'none'}><RotateCcw size={18} /> Reset adjustments</button>
                        <button className="btn-ghost" onClick={revertDraft} disabled={!isDirty}><Undo2 size={18} /> Revert to saved image</button>
                    </div>
                </fieldset>
            </div>
            {maskEditorOpen && (
                <Modal label="Transform mask" className="transform-mask-modal" onClose={() => setMaskEditorOpen(false)}>
                    <div className="modal-content transform-mask-dialog">
                        <div className="transform-mask-toolbar">
                            <div className="section-title">
                                <Paintbrush size={18} className="icon-purple" />
                                <h3>Transform Mask</h3>
                            </div>
                            <button className="modal-close" onClick={() => setMaskEditorOpen(false)} aria-label="Close mask editor">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="transform-mask-body">
                            {maskLoading && (
                                <div className="empty-state">
                                    <Loader2 className="spin" size={28} />
                                </div>
                            )}
                            {!maskLoading && maskTargetUrl && (
                                <div className="transform-mask-stage">
                                    <img
                                        src={maskTargetUrl}
                                        alt="AI transform target"
                                        className="transform-mask-target"
                                        onLoad={handleMaskTargetLoad}
                                    />
                                    <canvas
                                        ref={maskCanvasRef}
                                        className="transform-mask-canvas"
                                        onPointerDown={handleMaskPointerDown}
                                        onPointerMove={handleMaskPointerMove}
                                        onPointerUp={stopMaskPainting}
                                        onPointerCancel={stopMaskPainting}
                                        onPointerLeave={stopMaskPainting}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="transform-mask-actions">
                            <div className="toggle-group mask-tool-toggle">
                                <button
                                    className={maskTool === 'brush' ? 'active' : ''}
                                    aria-pressed={maskTool === 'brush'}
                                    onClick={() => setMaskTool('brush')}
                                    type="button"
                                    title="Brush"
                                >
                                    <Paintbrush size={16} />
                                </button>
                                <button
                                    className={maskTool === 'eraser' ? 'active' : ''}
                                    aria-pressed={maskTool === 'eraser'}
                                    onClick={() => setMaskTool('eraser')}
                                    type="button"
                                    title="Eraser"
                                >
                                    <Eraser size={16} />
                                </button>
                            </div>
                            <label className="mask-size-control">
                                <span>Size</span>
                                <input
                                    type="range"
                                    min={8}
                                    max={96}
                                    value={maskBrushSize}
                                    onChange={(event) => setMaskBrushSize(Number(event.target.value))}
                                />
                                <span>{maskBrushSize}</span>
                            </label>
                            <button className="btn-ghost" type="button" onClick={clearTransformMask}>
                                <RotateCcw size={16} /> Clear
                            </button>
                            <button className="btn-amber" type="button" onClick={() => { void applyTransformMask(); }}>
                                <Save size={16} /> Apply Mask
                            </button>
                        </div>
                        {maskError && <div className="error-message mini">{maskError}</div>}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default EditorView;
