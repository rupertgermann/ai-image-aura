import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Download, Archive, Trash2, Upload, X } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storage } from '../services/StorageService';
import type { ArchiveImage } from '../db/types';
import { imageWorkflow } from '../image-workflow/ImageWorkflow';
import ReferenceImageModal from '../components/ReferenceImageModal';

interface GenerateViewProps {
    apiKey: string | null;
    onSaveImage: (image: ArchiveImage) => void;
}

const VALID_SIZES = ['1024x1024', '1536x1024', '1024x1536', 'auto'];

const EXAMPLE_PROMPTS = [
    "a lobster piloting a vintage scooter",
    "a raccoon librarian in a tiny art-deco library",
    "a glass whale floating above a desert",
    "a moss-covered robot tending a bonsai garden",
    "a candlelit map room with impossible staircases",
    "a retro-futurist diner on the moon at dusk",
    "a hummingbird made of stained glass",
    "a porcelain teapot city in the clouds",
    "a midnight train station built inside a giant clock",
    "a tiny submarine exploring a glowing kelp forest",
    "a baroque observatory with brass telescopes and fog",
    "a koi pond shaped like a circuit board",
];

const STYLES = [
    "ultra-detailed studio photo",
    "35mm film still",
    "risograph poster",
    "oil painting on linen",
    "watercolor with ink linework",
    "isometric diorama",
    "mid-century editorial illustration",
    "high-end product shot",
    "artistic style, painterly, creative interpretation",
    "anime style, manga art, Japanese animation style",
    "cyberpunk style, neon lights, futuristic, sci-fi aesthetic",
    "vintage style, retro aesthetic, aged look",
];

const LIGHTING_OPTIONS = [
    "softbox lighting",
    "golden hour",
    "neon rim light",
    "overcast diffuse light",
    "candlelight with deep shadows",
    "dramatic chiaroscuro",
];

const PALETTES = [
    "copper + teal + cream",
    "cobalt + vermilion + bone",
    "sage + sand + charcoal",
    "magenta + midnight blue + silver",
];

const GenerateView: React.FC<GenerateViewProps> = ({ apiKey, onSaveImage }) => {
    const [prompt, setPrompt] = useLocalStorage('aura_generate_prompt', '');
    const [quality, setQuality] = useLocalStorage<'low' | 'medium' | 'high'>('aura_generate_quality', 'medium');
    const [aspectRatio, setAspectRatio] = useLocalStorage('aura_generate_aspect_ratio', '1024x1024');
    const [background, setBackground] = useLocalStorage<'opaque' | 'transparent' | 'auto'>('aura_generate_background', 'auto');
    const [style, setStyle] = useLocalStorage('aura_generate_style', 'none');
    const [lighting, setLighting] = useLocalStorage('aura_generate_lighting', 'none');
    const [palette, setPalette] = useLocalStorage('aura_generate_palette', 'none');
    const [currentResult, setCurrentResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useLocalStorage('aura_generate_is_saved', false);
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [referencePreviews, setReferencePreviews] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [viewingReferenceIndex, setViewingReferenceIndex] = useState<number | null>(null);

    const handleNextReference = () => {
        if (viewingReferenceIndex === null) return;
        setViewingReferenceIndex((prev) =>
            prev !== null && prev < referencePreviews.length - 1 ? prev + 1 : prev
        );
    };

    const handlePreviousReference = () => {
        if (viewingReferenceIndex === null) return;
        setViewingReferenceIndex((prev) =>
            prev !== null && prev > 0 ? prev - 1 : prev
        );
    };

    useEffect(() => {
        storage.load('generate_current_result').then(val => {
            if (val) setCurrentResult(val);
        });

        storage.load('generate_transferred_references').then(val => {
            if (val) {
                try {
                    const refs = JSON.parse(val) as string[];
                    const files = imageWorkflow.hydrateReferences(refs);
                    setReferenceImages(files);
                    setReferencePreviews(refs);
                    // Clear it so it doesn't persist forever
                    storage.remove('generate_transferred_references');
                } catch (e) {
                    console.error('Failed to load transferred references', e);
                }
            }
        });

    }, []);

    useEffect(() => {
        return () => {
            // Cleanup previews - only revoke if they are object URLs, not data URLs
            // Actually, in this component we always use object URLs for new uploads, 
            // but transferred refs might be data URLs.
            // dataURL previews don't need revocation.
            referencePreviews.forEach((url: string) => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [referencePreviews]);

    // Sanitize persistent state for GPT-Image-1.5 compatibility
    useEffect(() => {
        if (!VALID_SIZES.includes(aspectRatio)) {
            console.warn(`Sanitizing invalid aspectRatio: ${aspectRatio}`);
            setAspectRatio('1024x1024');
        }
    }, [aspectRatio, setAspectRatio]);

    const handleGenerate = async () => {
        if (!apiKey) {
            setError('Please set your OpenAI API Key in Settings first.');
            return;
        }
        if (!prompt.trim()) return;

        setLoading(true);
        setError(null);
        try {
            const imageUrl = await imageWorkflow.generate({
                apiKey,
                prompt,
                quality,
                aspectRatio,
                background,
                style,
                lighting,
                palette,
                referenceImages,
            });

            setCurrentResult(imageUrl);
            setIsSaved(false);
            await storage.save('generate_current_result', imageUrl);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate image');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!currentResult) return;
        const link = document.createElement('a');
        link.href = currentResult;
        link.download = `aura-generation-${Date.now()}.png`;
        link.click();
    };

    const handleSave = () => {
        if (!currentResult || isSaved) return;

        const saveRefImages = async () => {
            const refDataUrls = await imageWorkflow.serializeReferences(referenceImages);

            const newImage: ArchiveImage = {
                id: crypto.randomUUID(),
                url: currentResult,
                prompt,
                model: 'gpt-image-1.5',
                timestamp: new Date().toISOString(),
                width: 1024,
                height: 1024,
                quality,
                aspectRatio: aspectRatio,
                background,
                style,
                lighting,
                palette,
                references: refDataUrls
            };

            onSaveImage(newImage);
            setIsSaved(true);
        };

        saveRefImages();
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
            setReferenceImages(prev => [...prev, ...files]);
            const newPreviews = files.map(file => URL.createObjectURL(file));
            setReferencePreviews(prev => [...prev, ...newPreviews]);
        }
    };



    return (
        <div className="generate-container">
            <header className="view-header">
                <h1 className="gradient-text">Create Magic</h1>
                <p>Harness the power of GPT-Image-1.5 to bring your ideas to life.</p>
            </header>

            <div className="generate-grid">
                <section className="controls-panel glass-panel">
                    <div className="input-section">
                        <div className="prompt-header">
                            <label>PROMPT</label>
                            <select
                                value=""
                                onChange={(e) => {
                                    if (e.target.value) setPrompt(e.target.value);
                                }}
                                className="example-prompt-select"
                            >
                                <option value="">Example prompts...</option>
                                {EXAMPLE_PROMPTS.map((example) => (
                                    <option key={example} value={example}>{example}</option>
                                ))}
                            </select>
                        </div>
                        <textarea
                            placeholder="Describe what you want to see... (e.g., 'A bioluminescent forest with crystal butterflies')"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="prompt-input"
                        />
                    </div>

                    <div className="options-grid">
                        <div className="option-group">
                            <label>QUALITY</label>
                            <div className="toggle-group">
                                <button
                                    className={quality === 'low' ? 'active' : ''}
                                    onClick={() => setQuality('low')}
                                >Low</button>
                                <button
                                    className={quality === 'medium' ? 'active' : ''}
                                    onClick={() => setQuality('medium')}
                                >Medium</button>
                                <button
                                    className={quality === 'high' ? 'active' : ''}
                                    onClick={() => setQuality('high')}
                                >High</button>
                            </div>
                        </div>

                        <div className="option-group">
                            <label>ASPECT RATIO</label>
                            <select
                                value={VALID_SIZES.includes(aspectRatio) ? aspectRatio : '1024x1024'}
                                onChange={(e) => setAspectRatio(e.target.value)}
                                className="select-input"
                            >
                                <option value="auto">Auto</option>
                                <option value="1024x1024">Square (1:1)</option>
                                <option value="1536x1024">Wide (3:2)</option>
                                <option value="1024x1536">Tall (2:3)</option>
                            </select>
                        </div>

                        <div className="option-group">
                            <label>BACKGROUND</label>
                            <div className="toggle-group">
                                <button
                                    className={background === 'auto' ? 'active' : ''}
                                    onClick={() => setBackground('auto')}
                                >Auto</button>
                                <button
                                    className={background === 'opaque' ? 'active' : ''}
                                    onClick={() => setBackground('opaque')}
                                >Opaque</button>
                                <button
                                    className={background === 'transparent' ? 'active' : ''}
                                    onClick={() => setBackground('transparent')}
                                >Transparent</button>
                            </div>
                        </div>

                        <div className="option-group">
                            <label>STYLE</label>
                            <select
                                value={style}
                                onChange={(e) => setStyle(e.target.value)}
                                className="select-input"
                            >
                                <option value="none">None</option>
                                {STYLES.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div className="option-group">
                            <label>LIGHTING</label>
                            <select
                                value={lighting}
                                onChange={(e) => setLighting(e.target.value)}
                                className="select-input"
                            >
                                <option value="none">None</option>
                                {LIGHTING_OPTIONS.map((l) => (
                                    <option key={l} value={l}>{l}</option>
                                ))}
                            </select>
                        </div>

                        <div className="option-group">
                            <label>PALETTE</label>
                            <select
                                value={palette}
                                onChange={(e) => setPalette(e.target.value)}
                                className="select-input"
                            >
                                <option value="none">None</option>
                                {PALETTES.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div
                        className={`reference-section ${isDragging ? 'dragging' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <label>REFERENCE IMAGES (OPTIONAL) {isDragging && '- DROP TO UPLOAD'}</label>
                        <div className="reference-grid">
                            {referencePreviews.map((url: string, idx: number) => (
                                <div key={url} className="reference-preview glass-panel">
                                    <img
                                        src={url}
                                        alt="Reference"
                                        onClick={() => setViewingReferenceIndex(idx)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    <button
                                        className="remove-ref"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setReferenceImages((prev: File[]) => prev.filter((_, i) => i !== idx));
                                            setReferencePreviews((prev: string[]) => prev.filter((_, i) => i !== idx));
                                            URL.revokeObjectURL(url);
                                            if (viewingReferenceIndex === idx) setViewingReferenceIndex(null);
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            <label className="upload-ref glass-panel">
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        setReferenceImages((prev: File[]) => [...prev, ...files]);
                                        const newPreviews = files.map(file => URL.createObjectURL(file));
                                        setReferencePreviews((prev: string[]) => [...prev, ...newPreviews]);
                                    }}
                                    style={{ display: 'none' }}
                                />
                                <Upload size={20} />
                                <span>Add / Drop</span>
                            </label>
                        </div>
                    </div>

                    <button
                        className="aura-btn aura-btn--primary"
                        onClick={handleGenerate}
                        disabled={loading || !prompt.trim() || !apiKey}
                        style={{ width: '100%' }}
                    >
                        {loading ? <Loader2 className="spin" size={20} /> : <Sparkles size={20} />}
                        {loading ? 'Generating...' : 'Generate Image'}
                    </button>

                    {!apiKey && (
                        <div className="error-message">API Key missing. Go to Settings to configure.</div>
                    )}
                    {error && <div className="error-message">{error}</div>}
                </section>

                <section className="preview-panel glass-panel">
                    {currentResult ? (
                        <div className="result-container">
                            <img src={currentResult} alt="Generated result" className="result-image" />
                            <div className="result-actions">
                                <button
                                    onClick={handleSave}
                                    className={`aura-btn ${isSaved ? 'aura-btn--success' : 'aura-btn--primary'}`}
                                    disabled={isSaved}
                                >
                                    <Archive size={18} /> {isSaved ? 'Saved to Archive' : 'Save to Archive'}
                                </button>
                                <button className="aura-btn aura-btn--glass" onClick={handleDownload}>
                                    <Download size={18} /> Download
                                </button>
                                <button onClick={async () => {
                                    setCurrentResult(null);
                                    await storage.remove('generate_current_result');
                                }} className="aura-btn aura-btn--danger">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-preview">
                            <Sparkles size={48} className="dim-icon" />
                            <p>Your generation will appear here</p>
                        </div>
                    )}
                </section>
            </div>

            {viewingReferenceIndex !== null && (
                <ReferenceImageModal
                    imageUrl={referencePreviews[viewingReferenceIndex]}
                    onClose={() => setViewingReferenceIndex(null)}
                    onNext={handleNextReference}
                    onPrevious={handlePreviousReference}
                    hasNext={viewingReferenceIndex < referencePreviews.length - 1}
                    hasPrevious={viewingReferenceIndex > 0}
                />
            )}
        </div>
    );
};

export default GenerateView;
