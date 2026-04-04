import React, { useState } from 'react';
import { Sparkles, Loader2, Download, Archive, Trash2, Upload, X } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { useGenerateDraft } from '../generate-session/GenerateSession';
import { useGenerateController } from '../generate-session/useGenerateController';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';
import ReferenceImageModal from '../components/ReferenceImageModal';

interface GenerateViewProps {
    apiKey: string | null;
    onSaveImage: (image: ArchiveImage) => ArchiveImage | Promise<ArchiveImage>;
}

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
    const [draft, setDraft] = useGenerateDraft();
    const [isDragging, setIsDragging] = useState(false);
    const [viewingReferenceIndex, setViewingReferenceIndex] = useState<number | null>(null);
    const { prompt, quality, aspectRatio, background, style, lighting, palette, isSaved } = draft;
    const referenceCollection = useReferenceImageCollection();
    const referenceImages = referenceCollection.files;
    const referencePreviews = referenceCollection.previews;
    const addReferenceFiles = referenceCollection.addFiles;
    const removeReferenceAt = referenceCollection.removeAt;
    const {
        currentResult,
        loading,
        error,
        updateDraft,
        generate,
        save,
        download,
        clear,
    } = useGenerateController({
        apiKey,
        draft,
        setDraft,
        referenceImages,
        replaceReferences: referenceCollection.replaceWithDataUrls,
        serializeReferences: referenceCollection.serialize,
        onSaveImage,
    });

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
            addReferenceFiles(files);
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
                                    if (e.target.value) updateDraft({ prompt: e.target.value });
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
                            onChange={(e) => updateDraft({ prompt: e.target.value })}
                            className="prompt-input"
                        />
                    </div>

                    <div className="options-grid">
                        <div className="option-group">
                            <label>QUALITY</label>
                            <div className="toggle-group">
                                <button
                                    className={quality === 'low' ? 'active' : ''}
                                    onClick={() => updateDraft({ quality: 'low' })}
                                >Low</button>
                                <button
                                    className={quality === 'medium' ? 'active' : ''}
                                    onClick={() => updateDraft({ quality: 'medium' })}
                                >Medium</button>
                                <button
                                    className={quality === 'high' ? 'active' : ''}
                                    onClick={() => updateDraft({ quality: 'high' })}
                                >High</button>
                            </div>
                        </div>

                        <div className="option-group">
                            <label>ASPECT RATIO</label>
                            <select
                                value={aspectRatio}
                                onChange={(e) => updateDraft({ aspectRatio: e.target.value })}
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
                                    onClick={() => updateDraft({ background: 'auto' })}
                                >Auto</button>
                                <button
                                    className={background === 'opaque' ? 'active' : ''}
                                    onClick={() => updateDraft({ background: 'opaque' })}
                                >Opaque</button>
                                <button
                                    className={background === 'transparent' ? 'active' : ''}
                                    onClick={() => updateDraft({ background: 'transparent' })}
                                >Transparent</button>
                            </div>
                        </div>

                        <div className="option-group">
                            <label>STYLE</label>
                            <select
                                value={style}
                                onChange={(e) => updateDraft({ style: e.target.value })}
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
                                onChange={(e) => updateDraft({ lighting: e.target.value })}
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
                                onChange={(e) => updateDraft({ palette: e.target.value })}
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
                                            removeReferenceAt(idx);
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
                                        addReferenceFiles(Array.from(e.target.files || []));
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
                        onClick={() => { void generate(); }}
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
                                    onClick={() => { void save(); }}
                                    className={`aura-btn ${isSaved ? 'aura-btn--success' : 'aura-btn--primary'}`}
                                    disabled={isSaved}
                                >
                                    <Archive size={18} /> {isSaved ? 'Saved to Archive' : 'Save to Archive'}
                                </button>
                                <button className="aura-btn aura-btn--glass" onClick={download}>
                                    <Download size={18} /> Download
                                </button>
                                <button onClick={() => { void clear(); }} className="aura-btn aura-btn--danger">
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
