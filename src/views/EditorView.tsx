import React, { useRef, useEffect, useState } from 'react';
import { Undo2, Save, MoveHorizontal, Sliders, Palette, Sparkles, Loader2, X, Upload, Copy } from 'lucide-react';
import { generateImageWithGPTImage15 } from '../utils/openai';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { ArchiveImage } from '../db/types';

interface EditorViewProps {
    image: ArchiveImage | null;
    apiKey: string | null;
    onSave: (updatedUrl: string, isCopy?: boolean) => void;
}

const EditorView: React.FC<EditorViewProps> = ({ image, apiKey, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Persist editor settings globally as requested
    const [brightness, setBrightness] = useLocalStorage('editor_brightness', 100);
    const [contrast, setContrast] = useLocalStorage('editor_contrast', 100);
    const [saturation, setSaturation] = useLocalStorage('editor_saturation', 100);
    const [filter, setFilter] = useLocalStorage('editor_filter', 'none');

    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
    const [refImages, setRefImages] = useState<File[]>([]);
    const [refPreviews, setRefPreviews] = useState<string[]>([]);

    useEffect(() => {
        if (image) {
            setCurrentImageUrl(image.url);
        }

        return () => {
            // Cleanup previews
            refPreviews.forEach((url: string) => URL.revokeObjectURL(url));
        };
    }, [image]);

    useEffect(() => {
        if (!image) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = currentImageUrl || '';
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            applyFilters();
        };
    }, [image, currentImageUrl, brightness, contrast, saturation, filter]);

    const applyFilters = () => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = currentImageUrl || '';
        img.onload = () => {
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${filter !== 'none' ? filter : ''}`;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
    };

    const handleExport = (isCopy: boolean = false) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl, isCopy);
    };

    const handleAiEdit = async () => {
        if (!apiKey || !aiPrompt.trim() || !canvasRef.current || !currentImageUrl) return;

        setAiLoading(true);
        setAiError(null);

        try {
            // 1. Get current canvas as blob
            const canvas = canvasRef.current;
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b: Blob | null) => b ? resolve(b) : reject(new Error('Canvas conversion failed')), 'image/png');
            });

            // 2. Wrap in File object
            const file = new File([blob], 'edit-input.png', { type: 'image/png' });

            // 3. Call OpenAI
            const result = await generateImageWithGPTImage15(apiKey, aiPrompt, {
                referenceImages: [file, ...refImages],
                // Preserve current view settings if possible, though edit might override
                quality: 'medium',
            });

            if (result.b64_json) {
                const newUrl = `data:image/png;base64,${result.b64_json}`;
                setCurrentImageUrl(newUrl);
                setAiPrompt(''); // Clear prompt on success
            }
        } catch (err: any) {
            setAiError(err.message || 'AI Edit failed');
        } finally {
            setAiLoading(false);
        }
    };

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
                                className="ai-prompt-input"
                                disabled={aiLoading || !apiKey}
                            />
                            <button
                                className="ai-edit-btn"
                                onClick={handleAiEdit}
                                disabled={aiLoading || !aiPrompt.trim() || !apiKey}
                            >
                                {aiLoading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                                {aiLoading ? 'AI is thinking...' : 'Transform with AI'}
                            </button>

                            <div className="reference-section mini">
                                <label>ADD VISUAL CONTEXT (OPTIONAL)</label>
                                <div className="reference-grid mini">
                                    {refPreviews.map((url: string, idx: number) => (
                                        <div key={url} className="reference-preview mini glass-panel">
                                            <img src={url} alt="Reference" />
                                            <button
                                                className="remove-ref"
                                                onClick={() => {
                                                    setRefImages((prev: File[]) => prev.filter((_, i) => i !== idx));
                                                    setRefPreviews((prev: string[]) => prev.filter((_, i) => i !== idx));
                                                    URL.revokeObjectURL(url);
                                                }}
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
                                                const files = Array.from(e.target.files || []);
                                                setRefImages((prev: File[]) => [...prev, ...files]);
                                                const newPreviews = files.map(file => URL.createObjectURL(file));
                                                setRefPreviews((prev: string[]) => [...prev, ...newPreviews]);
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
                        <button className="generate-btn" onClick={() => handleExport(false)}>
                            <Save size={18} /> Save Changes
                        </button>
                        <button className="action-btn purple" onClick={() => handleExport(true)}>
                            <Copy size={18} /> Save as Copy
                        </button>
                        <button className="action-btn" onClick={() => {
                            setBrightness(100);
                            setContrast(100);
                            setSaturation(100);
                            setFilter('none');
                        }}>
                            <Undo2 size={18} /> Reset
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default EditorView;
