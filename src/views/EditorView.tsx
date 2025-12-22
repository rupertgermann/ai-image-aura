import React, { useRef, useEffect } from 'react';
import { Undo2, Save, MoveHorizontal, Sliders, Palette } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { ArchiveImage } from '../db/types';

interface EditorViewProps {
    image: ArchiveImage | null;
    onSave: (updatedUrl: string) => void;
}

const EditorView: React.FC<EditorViewProps> = ({ image, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Persist editor settings globally as requested
    const [brightness, setBrightness] = useLocalStorage('editor_brightness', 100);
    const [contrast, setContrast] = useLocalStorage('editor_contrast', 100);
    const [saturation, setSaturation] = useLocalStorage('editor_saturation', 100);
    const [filter, setFilter] = useLocalStorage('editor_filter', 'none');

    useEffect(() => {
        if (!image) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = image.url;
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            applyFilters();
        };
    }, [image, brightness, contrast, saturation, filter]);

    const applyFilters = () => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.src = image.url;
        img.onload = () => {
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${filter !== 'none' ? filter : ''}`;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
    };

    const handleExport = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl);
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

                    <div className="editor-actions">
                        <button className="generate-btn" onClick={handleExport}>
                            <Save size={18} /> Save Changes
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
