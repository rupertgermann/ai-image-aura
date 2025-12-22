import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Download, Archive, Trash2 } from 'lucide-react';
import { generateImageWithGPTImage15 } from '../utils/openai';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storage } from '../services/StorageService';
import type { ArchiveImage } from '../db/types';

interface GenerateViewProps {
    apiKey: string | null;
    onSaveImage: (image: ArchiveImage) => void;
}

const VALID_SIZES = ['1024x1024', '1536x1024', '1024x1536', 'auto'];

const GenerateView: React.FC<GenerateViewProps> = ({ apiKey, onSaveImage }) => {
    const [prompt, setPrompt] = useLocalStorage('aura_generate_prompt', '');
    const [quality, setQuality] = useLocalStorage<'low' | 'medium' | 'high'>('aura_generate_quality', 'medium');
    const [aspectRatio, setAspectRatio] = useLocalStorage('aura_generate_aspect_ratio', '1024x1024');
    const [background, setBackground] = useLocalStorage<'opaque' | 'transparent' | 'auto'>('aura_generate_background', 'auto');
    const [currentResult, setCurrentResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useLocalStorage('aura_generate_is_saved', false);

    // Initial load from storage
    useEffect(() => {
        storage.load('generate_current_result').then(val => {
            if (val) setCurrentResult(val);
        });
    }, []);

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
            // Final validation before call
            const safeSize = VALID_SIZES.includes(aspectRatio) ? aspectRatio : '1024x1024';

            const result = await generateImageWithGPTImage15(apiKey, prompt, {
                quality,
                size: safeSize,
                background,
            });

            if (result.b64_json) {
                const imageUrl = `data:image/png;base64,${result.b64_json}`;
                setCurrentResult(imageUrl);
                setIsSaved(false); // New image generated
                await storage.save('generate_current_result', imageUrl);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to generate image');
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
            background
        };

        onSaveImage(newImage);
        setIsSaved(true);
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
                        <label>PROMPT</label>
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
                    </div>

                    <button
                        className="generate-btn"
                        onClick={handleGenerate}
                        disabled={loading || !prompt.trim() || !apiKey}
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
                                    className={`action-btn ${isSaved ? 'success' : 'purple'}`}
                                    disabled={isSaved}
                                >
                                    <Archive size={18} /> {isSaved ? 'Saved to Archive' : 'Save to Archive'}
                                </button>
                                <button className="action-btn" onClick={handleDownload}>
                                    <Download size={18} /> Download
                                </button>
                                <button onClick={async () => {
                                    setCurrentResult(null);
                                    await storage.remove('generate_current_result');
                                }} className="action-btn danger">
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
        </div>
    );
};

export default GenerateView;
