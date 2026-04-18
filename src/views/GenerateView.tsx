import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, Download, Archive, Trash2, Upload, X } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { useGenerateDraft } from '../generate-session/GenerateSession';
import { useGenerateController } from '../generate-session/useGenerateController';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';
import ReferenceImageModal from '../components/ReferenceImageModal';
import { MAX_AUTOPILOT_ITERATIONS } from '../autopilot/AutopilotSession';
import { goalPromptTranslator } from '../autopilot/GoalPromptTranslator';
import { useAutopilotSettings } from '../session/useAutopilotSettings';

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
    "emerald + burgundy + gold",
    "dusty rose + slate + ivory",
    "burnt orange + navy + warm white",
];

const PALETTE_COLORS: Record<string, string[]> = {
    "copper + teal + cream": ["#b87333", "#009688", "#f5f0e8"],
    "cobalt + vermilion + bone": ["#0047ab", "#e34234", "#e8dcc8"],
    "sage + sand + charcoal": ["#9caf88", "#c2b280", "#36454f"],
    "magenta + midnight blue + silver": ["#cc00cc", "#003366", "#c0c0c0"],
    "emerald + burgundy + gold": ["#2e8b57", "#800020", "#d4af37"],
    "dusty rose + slate + ivory": ["#c4a4a4", "#708090", "#fffff0"],
    "burnt orange + navy + warm white": ["#cc5500", "#002147", "#faf9f0"],
};

interface CustomSelectOption {
    value: string;
    label: string;
    swatches?: string[];
}

interface CustomSelectProps {
    value: string;
    options: CustomSelectOption[];
    onChange: (value: string) => void;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);
    const selected = options.find((o) => o.value === value);
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                className="select-input"
                onClick={() => setOpen((o) => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            >
                {selected?.swatches && (
                    <span style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                        {selected.swatches.map((c) => (
                            <span key={c} style={{ width: '12px', height: '12px', borderRadius: '3px', background: c, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block', flexShrink: 0 }} />
                        ))}
                    </span>
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label ?? value}</span>
                <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
            </button>
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        zIndex: 200,
                        padding: '4px 0',
                        maxHeight: '260px',
                        overflowY: 'auto',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '10px',
                        boxShadow: 'var(--glass-shadow)',
                    }}
                >
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                padding: '7px 12px',
                                background: value === opt.value ? 'rgba(255,255,255,0.08)' : 'transparent',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: '13px',
                            }}
                        >
                            {opt.swatches && (
                                <span style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                                    {opt.swatches.map((c) => (
                                        <span key={c} style={{ width: '14px', height: '14px', borderRadius: '3px', background: c, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block', flexShrink: 0 }} />
                                    ))}
                                </span>
                            )}
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const GenerateView: React.FC<GenerateViewProps> = ({ apiKey, onSaveImage }) => {
    const [draft, setDraft] = useGenerateDraft();
    const {
        settings: autopilotSettings,
        setMode,
        setGoal,
        setMaxIterations,
        setSatisfactionThreshold,
    } = useAutopilotSettings();
    const { mode, goal, maxIterations, satisfactionThreshold } = autopilotSettings;
    const [isDragging, setIsDragging] = useState(false);
    const [viewingReferenceIndex, setViewingReferenceIndex] = useState<number | null>(null);
    const [showCostDisclosure, setShowCostDisclosure] = useState(false);
    const [autopilotNotice, setAutopilotNotice] = useState<string | null>(null);
    const [translatingGoal, setTranslatingGoal] = useState(false);
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
        autopilot,
        updateDraft,
        generate,
        runAutopilot,
        cancelAutopilot,
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

    const handleTranslateGoal = async () => {
        if (!apiKey || !goal.trim()) {
            return;
        }

        setTranslatingGoal(true);
        setAutopilotNotice(null);
        try {
            const nextPrompt = await goalPromptTranslator.translate({ goal, apiKey });
            updateDraft({ prompt: nextPrompt, isSaved: false });
        } catch (translationError) {
            setAutopilotNotice(translationError instanceof Error ? translationError.message : 'Failed to translate goal');
        } finally {
            setTranslatingGoal(false);
        }
    };

    const handleRunAutopilot = async () => {
        setAutopilotNotice(null);
        const result = await runAutopilot({
            goal,
            maxIterations,
            satisfactionThreshold,
        });

        if (!result) {
            return;
        }

        if (result.status === 'max-iterations') {
            setAutopilotNotice('Autopilot reached the iteration limit without meeting the satisfaction threshold.');
            return;
        }

        if (result.status === 'cancelled') {
            setAutopilotNotice('Autopilot was cancelled. Showing the best result so far.');
            return;
        }

        if (result.status === 'satisfied' && result.bestIteration) {
            setAutopilotNotice(`Best result selected from iteration ${result.bestIteration.iterationNumber}.`);
        }
    };

    const maxApiCalls = maxIterations * 3;
    const isAutopilotMode = mode === 'autopilot';



    return (
        <div className="generate-container">
            <header className="view-header">
                <h1 className="gradient-text">Create Magic</h1>
                <p>Harness the power of GPT-Image-1.5 to bring your ideas to life.</p>
            </header>

            <div className="generate-grid">
                <section className="controls-panel glass-panel">
                    <div className="input-section">
                        <label>MODE</label>
                        <div className="toggle-group">
                            <button
                                className={!isAutopilotMode ? 'active' : ''}
                                onClick={() => { void setMode('single-shot'); }}
                            >Single Shot</button>
                            <button
                                className={isAutopilotMode ? 'active' : ''}
                                onClick={() => { void setMode('autopilot'); }}
                            >Autopilot</button>
                        </div>
                    </div>

                    {isAutopilotMode && (
                        <div className="autopilot-panel glass-panel">
                            <div className="input-section">
                                <div className="prompt-header">
                                    <label>GOAL</label>
                                    <button
                                        className="aura-btn aura-btn--glass autopilot-inline-btn"
                                        onClick={() => { void handleTranslateGoal(); }}
                                        disabled={!goal.trim() || !apiKey || translatingGoal || loading}
                                    >
                                        {translatingGoal ? 'Translating...' : 'Translate to Prompt'}
                                    </button>
                                </div>
                                <textarea
                                    placeholder="Describe the outcome you want in plain language..."
                                    value={goal}
                                    onChange={(e) => { void setGoal(e.target.value); }}
                                    className="prompt-input autopilot-goal-input"
                                />
                            </div>

                            <div className="autopilot-settings-grid">
                                <div className="option-group">
                                    <label>MAX ITERATIONS</label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={MAX_AUTOPILOT_ITERATIONS}
                                        value={maxIterations}
                                        onChange={(e) => { void setMaxIterations(Number(e.target.value)); }}
                                        className="range-input"
                                    />
                                    <span className="autopilot-metric">{maxIterations}</span>
                                </div>

                                <div className="option-group">
                                    <label>SATISFACTION THRESHOLD</label>
                                    <input
                                        type="range"
                                        min={50}
                                        max={100}
                                        value={satisfactionThreshold}
                                        onChange={(e) => { void setSatisfactionThreshold(Number(e.target.value)); }}
                                        className="range-input"
                                    />
                                    <span className="autopilot-metric">{satisfactionThreshold}/100</span>
                                </div>
                            </div>

                            <div className="autopilot-disclosure glass-panel">
                                <strong>Cost disclosure</strong>
                                <p>Up to {maxIterations} iterations and roughly {maxApiCalls} API calls per run.</p>
                            </div>

                            {showCostDisclosure && (
                                <div className="autopilot-confirmation glass-panel">
                                    <p>Confirm Autopilot run with up to {maxIterations} iterations and approximately {maxApiCalls} API calls.</p>
                                    <div className="autopilot-confirmation-actions">
                                        <button className="aura-btn aura-btn--glass" onClick={() => setShowCostDisclosure(false)}>Cancel</button>
                                        <button
                                            className="aura-btn aura-btn--primary"
                                            onClick={() => {
                                                setShowCostDisclosure(false);
                                                void handleRunAutopilot();
                                            }}
                                        >Confirm Run</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

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
                            <CustomSelect
                                value={aspectRatio}
                                onChange={(v) => updateDraft({ aspectRatio: v })}
                                options={[
                                    { value: 'auto', label: 'Auto' },
                                    { value: '1024x1024', label: 'Square (1:1)' },
                                    { value: '1536x1024', label: 'Wide (3:2)' },
                                    { value: '1024x1536', label: 'Tall (2:3)' },
                                ]}
                            />
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
                            <CustomSelect
                                value={style}
                                onChange={(v) => updateDraft({ style: v })}
                                options={[
                                    { value: 'none', label: 'None' },
                                    ...STYLES.map((s) => ({ value: s, label: s })),
                                ]}
                            />
                        </div>

                        <div className="option-group">
                            <label>LIGHTING</label>
                            <CustomSelect
                                value={lighting}
                                onChange={(v) => updateDraft({ lighting: v })}
                                options={[
                                    { value: 'none', label: 'None' },
                                    ...LIGHTING_OPTIONS.map((l) => ({ value: l, label: l })),
                                ]}
                            />
                        </div>

                        <div className="option-group">
                            <label>PALETTE</label>
                            <CustomSelect
                                value={palette}
                                onChange={(v) => updateDraft({ palette: v })}
                                options={[
                                    { value: 'none', label: 'None' },
                                    ...PALETTES.map((p) => ({ value: p, label: p, swatches: PALETTE_COLORS[p] })),
                                ]}
                            />
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

                    {isAutopilotMode ? (
                        <button
                            className="aura-btn aura-btn--primary"
                            onClick={() => setShowCostDisclosure(true)}
                            disabled={loading || !prompt.trim() || !goal.trim() || !apiKey}
                            style={{ width: '100%' }}
                        >
                            {loading ? <Loader2 className="spin" size={20} /> : <Sparkles size={20} />}
                            {loading ? 'Autopilot Running...' : 'Run Autopilot'}
                        </button>
                    ) : (
                        <button
                            className="aura-btn aura-btn--primary"
                            onClick={() => { void generate(); }}
                            disabled={loading || !prompt.trim() || !apiKey}
                            style={{ width: '100%' }}
                        >
                            {loading ? <Loader2 className="spin" size={20} /> : <Sparkles size={20} />}
                            {loading ? 'Generating...' : 'Generate Image'}
                        </button>
                    )}

                    {isAutopilotMode && autopilot.running && (
                        <div className="autopilot-live-panel glass-panel">
                            <div className="autopilot-live-header">
                                <strong>Iteration {autopilot.iterations.length}/{maxIterations}</strong>
                                <button className="aura-btn aura-btn--danger" onClick={cancelAutopilot}>Pause / Cancel</button>
                            </div>
                            <p className="autopilot-live-feedback">
                                {autopilot.iterations.at(-1)?.feedback[0] ?? 'Generating the first candidate...'}
                            </p>
                            <div className="autopilot-thumbnail-strip">
                                {autopilot.iterations.map((iteration) => (
                                    <div key={iteration.stepId} className={`autopilot-thumbnail ${autopilot.bestIterationNumber === iteration.iterationNumber ? 'best' : ''}`}>
                                        <img src={iteration.imageDataUrl} alt={`Autopilot iteration ${iteration.iterationNumber}`} />
                                        <span>#{iteration.iterationNumber} · {iteration.score}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!apiKey && (
                        <div className="error-message">API Key missing. Go to Settings to configure.</div>
                    )}
                    {error && <div className="error-message">{error}</div>}
                    {autopilotNotice && <div className="info-message">{autopilotNotice}</div>}
                </section>

                <section className="preview-panel glass-panel">
                    {currentResult ? (
                        <div className="result-container">
                            <img src={currentResult} alt="Generated result" className="result-image" />
                            {isAutopilotMode && autopilot.iterations.length > 0 && (
                                <div className="autopilot-result-banner glass-panel">
                                    <strong>
                                        {autopilot.bestIterationNumber ? `Best Autopilot Result: iteration ${autopilot.bestIterationNumber}` : 'Autopilot result'}
                                    </strong>
                                    <span>
                                        {autopilot.status === 'max-iterations' && 'Reached iteration limit without converging.'}
                                        {autopilot.status === 'cancelled' && 'Run cancelled. Showing the best result to date.'}
                                        {autopilot.status === 'failed' && autopilot.lastErrorIteration && `Run stopped at iteration ${autopilot.lastErrorIteration}.`}
                                        {autopilot.status === 'satisfied' && 'Satisfaction threshold reached early.'}
                                        {autopilot.status === 'running' && 'Autopilot is evaluating and refining this run.'}
                                    </span>
                                </div>
                            )}
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
