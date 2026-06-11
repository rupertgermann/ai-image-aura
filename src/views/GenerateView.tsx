import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, Download, Archive, Trash2, Upload, X } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { getImageModelDraftKey, useGenerateDraft, type GenerateDraft } from '../generate-session/GenerateSession';
import { useGenerateController } from '../generate-session/useGenerateController';
import { getImageFilesFromClipboard } from '../references/clipboard';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';
import ReferenceImageModal from '../components/ReferenceImageModal';
import ActualParametersPanel from '../components/ActualParametersPanel';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
    buildActualParameterDetails,
    getRequestedGenerateParameters,
    hasActualParameterDetails,
} from '../generate-session/actualParameters';
import { DEFAULT_AUTOPILOT_MAX_ITERATIONS, DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD, MAX_AUTOPILOT_ITERATIONS } from '../autopilot/AutopilotSession';
import { createGoalPromptTranslator } from '../autopilot/GoalPromptTranslator';
import { createPromptRefiner } from '../autopilot/PromptRefiner';
import { createSatisfactionEvaluator } from '../autopilot/SatisfactionEvaluator';
import { resolveReasoningClient } from '../autopilot/ReasoningClient';
import type { CompletionNotificationPort } from '../app/CompletionNotificationPort';
import {
    buildImageModelGenerateReferenceRunPlan,
    coerceImageModelControlValue,
    getImageModelGenerateControls,
    getImageModelUiChoices,
    type ImageModelControlId,
} from '../image-models/ImageModelControls';
import {
    OPENAI_RESPONSES_MODEL,
    REASONING_MODEL_REGISTRY,
    resolveImageModelConfig,
    resolveReasoningModelConfig,
    type Provider,
    type ReasoningModelSlug,
} from '../utils/openaiModels';

interface GenerateViewProps {
    getProviderKey: (provider: Provider) => string | null;
    onSaveImage: (image: ArchiveImage) => ArchiveImage | Promise<ArchiveImage>;
    completionNotificationsEnabled?: boolean;
    completionNotificationPort?: Pick<CompletionNotificationPort, 'showCompletion'>;
    isDocumentHidden?: () => boolean;
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
                className="custom-select-trigger"
                onClick={() => setOpen((o) => !o)}
            >
                {selected?.swatches && (
                    <span className="select-swatches">
                        {selected.swatches.map((c) => (
                            <span key={c} className="swatch" style={{ background: c }} />
                        ))}
                    </span>
                )}
                <span className="custom-select-value">{selected?.label ?? value}</span>
                <span className="custom-select-arrow">▾</span>
            </button>
            {open && (
                <div className="custom-select-dropdown">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            className={`custom-select-option${value === opt.value ? ' selected' : ''}`}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                        >
                            {opt.swatches && (
                                <span className="select-swatches">
                                    {opt.swatches.map((c) => (
                                        <span key={c} className="swatch" style={{ background: c }} />
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

const GenerateView: React.FC<GenerateViewProps> = ({
    getProviderKey,
    onSaveImage,
    completionNotificationsEnabled,
    completionNotificationPort,
    isDocumentHidden,
}) => {
    const [draft, setDraft] = useGenerateDraft();
    const [mode, setMode] = useLocalStorage<'single-shot' | 'autopilot'>('generate_mode', 'single-shot');
    const [goal, setGoal] = useLocalStorage('generate_autopilot_goal', '');
    const [maxIterations, setMaxIterations] = useLocalStorage('generate_autopilot_max_iterations', DEFAULT_AUTOPILOT_MAX_ITERATIONS);
    const [satisfactionThreshold, setSatisfactionThreshold] = useLocalStorage('generate_autopilot_threshold', DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD);
    const [reasoningModel, setReasoningModel] = useLocalStorage<ReasoningModelSlug>('generate_reasoning_model', OPENAI_RESPONSES_MODEL);
    const [isDragging, setIsDragging] = useState(false);
    const [viewingReferenceIndex, setViewingReferenceIndex] = useState<number | null>(null);
    const [showCostDisclosure, setShowCostDisclosure] = useState(false);
    const [autopilotNotice, setAutopilotNotice] = useState<string | null>(null);
    const [translatingGoal, setTranslatingGoal] = useState(false);
    const { prompt, model, style, lighting, palette, isSaved } = draft;
    const activeModel = resolveImageModelConfig(model);
    const activeImageApiKey = getProviderKey(activeModel.provider);
    const activeReasoningModel = resolveReasoningModelConfig(reasoningModel);
    const reasoningApiKey = getProviderKey(activeReasoningModel.provider);
    const reasoningClient = useMemo(() => resolveReasoningClient(reasoningModel), [reasoningModel]);
    const goalPromptTranslator = useMemo(() => createGoalPromptTranslator(reasoningClient), [reasoningClient]);
    const satisfactionEvaluator = useMemo(() => createSatisfactionEvaluator(reasoningClient), [reasoningClient]);
    const promptRefiner = useMemo(() => createPromptRefiner(reasoningClient), [reasoningClient]);
    const referenceCollection = useReferenceImageCollection();
    const referenceImages = referenceCollection.files;
    const referenceRunPlan = useMemo(
        () => buildImageModelGenerateReferenceRunPlan(model, referenceImages),
        [model, referenceImages],
    );
    const referencePreviews = referenceCollection.previews;
    const addReferenceFiles = referenceCollection.addFiles;
    const removeReferenceAt = referenceCollection.removeAt;
    const {
        currentResult,
        currentBatchResults,
        currentRunDraft,
        loading,
        error,
        autopilot,
        updateDraft,
        generate,
        runAutopilot,
        cancelAutopilot,
        save,
        saveResult,
        download,
        downloadResult,
        clear,
    } = useGenerateController({
        apiKey: activeImageApiKey,
        reasoningApiKey,
        reasoningModel,
        draft,
        setDraft,
        referenceImages: referenceRunPlan.providerReferenceImages,
        replaceReferences: referenceCollection.replaceWithDataUrls,
        serializeReferences: referenceCollection.serialize,
        onSaveImage,
        evaluate: satisfactionEvaluator.evaluate,
        refine: promptRefiner.refine,
        completionNotificationsEnabled,
        completionNotificationPort,
        isDocumentHidden,
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

    const handlePaste = (e: React.ClipboardEvent) => {
        const files = getImageFilesFromClipboard(e);
        if (files.length === 0) {
            return;
        }

        e.preventDefault();
        addReferenceFiles(files);
    };

    const handleTranslateGoal = async () => {
        if (!reasoningApiKey || !goal.trim()) {
            return;
        }

        setTranslatingGoal(true);
        setAutopilotNotice(null);
        try {
            const nextPrompt = await goalPromptTranslator.translate({ goal, apiKey: reasoningApiKey });
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
    const imageModelReferenceWarning = referenceRunPlan.referenceLimitMessage;
    const activeModelDraftKey = getImageModelDraftKey(model);
    const activeModelControls = draft[activeModelDraftKey] as Record<string, string | number>;
    const successfulBatchResults = currentBatchResults.filter((result) => result.status === 'success');
    const showBatchGrid = currentBatchResults.length > 1 || currentBatchResults.some((result) => result.status === 'failed');
    const singleResultSlot = !showBatchGrid ? successfulBatchResults[0] : null;
    const requestedParameters = getRequestedGenerateParameters(currentRunDraft ?? draft);
    const singleResultActualDetails = singleResultSlot
        ? buildActualParameterDetails({
            actualParameters: singleResultSlot.actualParameters,
            requestedParameters,
        })
        : null;
    const hasSingleResultActualDetails = singleResultActualDetails
        ? hasActualParameterDetails(singleResultActualDetails)
        : false;
    const updateImageModelControl = (controlId: ImageModelControlId, value: string) => {
        updateDraft({
            [activeModelDraftKey]: {
                ...activeModelControls,
                [controlId]: coerceImageModelControlValue(model, controlId, value),
            },
        } as Partial<GenerateDraft>);
    };



    return (
        <div className="generate-container" onPaste={handlePaste}>
            <header className="view-header">
                <h1>Create Magic</h1>
                <p>Harness the power of {activeModel.label} to bring your ideas to life.</p>
            </header>

            <div className="generate-grid">
                <section className="controls-panel glass-panel">
                    <div className="input-section">
                        <label>IMAGE MODEL</label>
                        <div className="toggle-group">
                            {getImageModelUiChoices().map((choice) => {
                                const hasKey = !!getProviderKey(choice.provider);
                                return (
                                    <button
                                        key={choice.slug}
                                        className={model === choice.slug ? 'active' : ''}
                                        onClick={() => updateDraft({ model: choice.slug })}
                                        disabled={!hasKey}
                                        title={hasKey ? choice.label : `Add a ${choice.provider === 'google' ? 'Google' : 'OpenAI'} API key in Settings`}
                                    >
                                        {choice.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="input-section">
                        <label>MODE</label>
                        <div className="toggle-group">
                            <button
                                className={!isAutopilotMode ? 'active' : ''}
                                onClick={() => setMode('single-shot')}
                            >Single Shot</button>
                            <button
                                className={isAutopilotMode ? 'active' : ''}
                                onClick={() => setMode('autopilot')}
                            >Autopilot</button>
                        </div>
                    </div>

                    {isAutopilotMode && (
                        <div className="autopilot-panel glass-panel">
                            <div className="input-section">
                                <label>REASONING MODEL</label>
                                <div className="toggle-group">
                                    {(Object.keys(REASONING_MODEL_REGISTRY) as ReasoningModelSlug[]).map((modelSlug) => {
                                        const config = resolveReasoningModelConfig(modelSlug);
                                        const hasKey = !!getProviderKey(config.provider);
                                        return (
                                            <button
                                                key={modelSlug}
                                                className={reasoningModel === modelSlug ? 'active' : ''}
                                                onClick={() => setReasoningModel(modelSlug)}
                                                disabled={!hasKey}
                                                title={hasKey ? config.label : `Add a ${config.provider === 'google' ? 'Google' : 'OpenAI'} API key in Settings`}
                                            >
                                                {config.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="input-section">
                                <div className="prompt-header">
                                    <label>GOAL</label>
                                    <button
                                        className="btn-ghost autopilot-inline-btn"
                                        onClick={() => { void handleTranslateGoal(); }}
                                        disabled={!goal.trim() || !reasoningApiKey || translatingGoal || loading}
                                    >
                                        {translatingGoal ? 'Translating...' : 'Translate to Prompt'}
                                    </button>
                                </div>
                                <textarea
                                    placeholder="Describe the outcome you want in plain language..."
                                    value={goal}
                                    onChange={(e) => setGoal(e.target.value)}
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
                                        onChange={(e) => setMaxIterations(Number(e.target.value))}
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
                                        onChange={(e) => setSatisfactionThreshold(Number(e.target.value))}
                                        className="range-input"
                                    />
                                    <span className="autopilot-metric">{satisfactionThreshold}/100</span>
                                </div>
                            </div>

                            <div className="autopilot-disclosure glass-panel">
                                <strong>Cost disclosure</strong>
                                <p>Up to {maxIterations} iterations and roughly {maxApiCalls} API calls using {activeModel.label} for images and {activeReasoningModel.label} for reasoning.</p>
                            </div>

                            {showCostDisclosure && (
                                <div className="autopilot-confirmation glass-panel">
                                    <p>Confirm Autopilot run with up to {maxIterations} iterations and approximately {maxApiCalls} API calls.</p>
                                    <div className="autopilot-confirmation-actions">
                                        <button className="btn-ghost" onClick={() => setShowCostDisclosure(false)}>Cancel</button>
                                        <button
                                            className="btn-amber"
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
                            <CustomSelect
                                value=""
                                onChange={(v) => { if (v) updateDraft({ prompt: v }); }}
                                options={[
                                    { value: '', label: 'Example prompts...' },
                                    ...EXAMPLE_PROMPTS.map((e) => ({ value: e, label: e })),
                                ]}
                            />
                        </div>
                        <textarea
                            placeholder="Describe what you want to see... (e.g., 'A bioluminescent forest with crystal butterflies')"
                            value={prompt}
                            onChange={(e) => updateDraft({ prompt: e.target.value })}
                            className="prompt-input"
                        />
                    </div>

                    <div className="options-grid">
                        {getImageModelGenerateControls(model).map((control) => (
                            <div className="option-group" key={control.id}>
                                <label>{control.label}</label>
                                {control.kind === 'select' ? (
                                    <CustomSelect
                                        value={String(activeModelControls[control.id] ?? '')}
                                        onChange={(value) => updateImageModelControl(control.id, value)}
                                        options={control.options}
                                    />
                                ) : (
                                    <div className="toggle-group">
                                        {control.options.map((option) => (
                                            <button
                                                key={option.value}
                                                className={String(activeModelControls[control.id] ?? '') === option.value ? 'active' : ''}
                                                onClick={() => updateImageModelControl(control.id, option.value)}
                                            >{option.label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

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
                            className="btn-amber"
                            onClick={() => setShowCostDisclosure(true)}
                            disabled={loading || !prompt.trim() || !goal.trim() || !activeImageApiKey || !reasoningApiKey}
                            style={{ width: '100%' }}
                        >
                            {loading ? <Loader2 className="spin" size={20} /> : <Sparkles size={20} />}
                            {loading ? 'Autopilot Running...' : 'Run Autopilot'}
                        </button>
                    ) : (
                        <button
                            className="btn-amber"
                            onClick={() => { void generate(); }}
                            disabled={loading || !prompt.trim() || !activeImageApiKey}
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
                                <button className="btn-ghost" onClick={cancelAutopilot}>Pause / Cancel</button>
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

                    {!activeImageApiKey && (
                        <div className="error-message">{activeModel.label} API key missing. Go to Settings to configure.</div>
                    )}
                    {isAutopilotMode && !reasoningApiKey && (
                        <div className="error-message">{activeReasoningModel.label} API key missing. Go to Settings to configure.</div>
                    )}
                    {imageModelReferenceWarning && <div className="info-message">{imageModelReferenceWarning}</div>}
                    {error && <div className="error-message">{error}</div>}
                    {autopilotNotice && <div className="info-message">{autopilotNotice}</div>}
                </section>

                <section className={`preview-panel glass-panel${showBatchGrid ? ' batch-preview-panel' : ''}`}>
                    {showBatchGrid ? (
                        <div className="result-batch-container">
                            <div className="result-batch-grid">
                                {currentBatchResults.map((result) => (
                                    <div key={result.slotIndex} className={`result-slot-card ${result.status}`}>
                                        <div className="result-slot-header">
                                            <span>Result {result.slotIndex + 1}</span>
                                            {result.status === 'success' && result.isSaved && <span>Saved</span>}
                                            {result.status === 'failed' && <span>Failed</span>}
                                        </div>
                                        {result.status === 'success' ? (
                                            <>
                                                <img src={result.imageUrl} alt={`Generated result ${result.slotIndex + 1}`} className="result-slot-image" />
                                                <ActualParametersPanel
                                                    compact
                                                    details={buildActualParameterDetails({
                                                        actualParameters: result.actualParameters,
                                                        requestedParameters,
                                                    })}
                                                />
                                                <div className="result-slot-actions">
                                                    <button
                                                        onClick={() => { void saveResult(result.slotIndex); }}
                                                        className="btn-amber"
                                                        disabled={result.isSaved}
                                                    >
                                                        <Archive size={16} /> {result.isSaved ? 'Saved' : 'Save'}
                                                    </button>
                                                    <button className="btn-ghost" onClick={() => downloadResult(result.slotIndex)}>
                                                        <Download size={16} /> Download
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="result-slot-error">
                                                <Sparkles size={28} className="dim-icon" />
                                                <p>{result.error}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => { void clear(); }} className="btn-ghost result-batch-clear">
                                <Trash2 size={18} /> Clear Results
                            </button>
                        </div>
                    ) : currentResult ? (
                        <div className={`result-container${hasSingleResultActualDetails ? ' has-actual-parameters' : ''}`}>
                            <img src={currentResult} alt="Generated result" className="result-image" />
                            {singleResultActualDetails && (
                                <ActualParametersPanel details={singleResultActualDetails} />
                            )}
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
                                    className="btn-amber"
                                    disabled={singleResultSlot?.isSaved ?? isSaved}
                                >
                                    <Archive size={18} /> {(singleResultSlot?.isSaved ?? isSaved) ? 'Saved to Archive' : 'Save to Archive'}
                                </button>
                                <button className="btn-ghost" onClick={download}>
                                    <Download size={18} /> Download
                                </button>
                                <button onClick={() => { void clear(); }} className="btn-ghost">
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
