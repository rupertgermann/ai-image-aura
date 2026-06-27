import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, Download, Archive, Trash2, Upload, X, ImagePlus } from 'lucide-react';
import type { ApiCostLedger, ApiCostLineItem, ArchiveImage } from '../db/types';
import { generateSessionStore, getImageModelDraftKey, useGenerateDraft, type GenerateDraft } from '../generate-session/GenerateSession';
import { addGeneratedResultAsReferenceFromAction, useGenerateController, type GenerateResultSlot } from '../generate-session/useGenerateController';
import { getImageFilesFromClipboard } from '../references/clipboard';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';
import ReferenceImageModal from '../components/ReferenceImageModal';
import ActualParametersPanel from '../components/ActualParametersPanel';
import CostSummaryPanel, { hasApiCostLedger } from '../components/CostSummaryPanel';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
    buildActualParameterDetails,
    getRequestedGenerateParameters,
    hasActualParameterDetails,
    type ActualParameterDetails,
} from '../generate-session/actualParameters';
import { calculateApiCostTotals, formatUsd } from '../costs/apiCost';
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
    getImageModelReferenceCapacityMessage,
    type ImageModelControlId,
} from '../image-models/ImageModelControls';
import {
    OPENAI_RESPONSES_MODEL,
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

type SuccessfulGenerateResultSlot = Extract<GenerateResultSlot, { status: 'success' }>;

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
    className?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, onChange, className }) => {
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
        <div ref={ref} className={className} style={{ position: 'relative' }}>
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

interface ResultSummaryTableProps {
    actualDetails: ActualParameterDetails | null;
    costLedger?: ApiCostLedger;
    resultSlot: SuccessfulGenerateResultSlot | null;
    isSaved: boolean;
    resultReferenceCapacityMessage: string | null;
    onSave: () => void;
    onDownload: () => void;
    onUseAsReference: (result: SuccessfulGenerateResultSlot) => void;
    onClear: () => void;
}

const ResultSummaryTable: React.FC<ResultSummaryTableProps> = ({
    actualDetails,
    costLedger,
    resultSlot,
    isSaved,
    resultReferenceCapacityMessage,
    onSave,
    onDownload,
    onUseAsReference,
    onClear,
}) => {
    const hasActualDetails = actualDetails ? hasActualParameterDetails(actualDetails) : false;
    const hasCostLedger = hasApiCostLedger(costLedger);
    const costTotals = hasCostLedger ? calculateApiCostTotals(costLedger) : null;

    return (
        <table className="result-summary-table" aria-label="Generated image details and actions">
            <tbody>
                <tr>
                    <td className="result-summary-cell result-summary-cell-parameters">
                        <label className="section-label">Actual Parameters</label>
                        {hasActualDetails && actualDetails ? (
                            <div className="result-summary-metrics">
                                {actualDetails.rows.map((row) => (
                                    <div
                                        key={row.label}
                                        className={`result-summary-metric result-summary-metric-compare${row.changed ? ' changed' : ''}`}
                                    >
                                        <span className="result-summary-metric-label">{row.label}</span>
                                        <div className="result-summary-pair">
                                            <span>
                                                <small>Requested</small>
                                                <strong>{row.requested ?? 'Not set'}</strong>
                                            </span>
                                            <span>
                                                <small>Actual</small>
                                                <strong>{row.actual}</strong>
                                            </span>
                                        </div>
                                        {row.changed && <em>Changed</em>}
                                    </div>
                                ))}
                                {actualDetails.elapsedLabel && (
                                    <div className="result-summary-metric">
                                        <span className="result-summary-metric-label">Elapsed</span>
                                        <strong>{actualDetails.elapsedLabel}</strong>
                                    </div>
                                )}
                                {actualDetails.revisedPrompt && (
                                    <div className="result-summary-metric result-summary-prompt">
                                        <span className="result-summary-metric-label">Rewritten Prompt</span>
                                        <p>{actualDetails.revisedPrompt}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span className="result-summary-empty">Not returned</span>
                        )}
                    </td>
                    <td className="result-summary-cell result-summary-cell-cost">
                        <label className="section-label">API Cost</label>
                        {hasCostLedger ? (
                            <div className="result-summary-metrics">
                                <div className="result-summary-metric">
                                    <span className="result-summary-metric-label">Total</span>
                                    <strong>{formatResultSummaryTotal(costTotals)}</strong>
                                </div>
                                {costLedger.items.map((item) => (
                                    <div key={item.id} className={`result-summary-metric ${item.status}`}>
                                        <span className="result-summary-metric-label">{item.label}</span>
                                        <strong>{formatResultSummaryLineItem(item)}</strong>
                                        {item.note && <small className="result-summary-note">{item.note}</small>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="result-summary-empty">Unavailable</span>
                        )}
                    </td>
                    <td className="result-summary-cell result-summary-cell-actions">
                        <label className="section-label">Actions</label>
                        <div className="result-summary-actions">
                            <button
                                onClick={onSave}
                                className="btn-amber"
                                disabled={isSaved}
                            >
                                <Archive size={18} /> {isSaved ? 'Saved to Archive' : 'Save to Archive'}
                            </button>
                            <button className="btn-ghost result-summary-action" onClick={onDownload}>
                                <Download size={16} /> Download
                            </button>
                            {resultSlot && (
                                <button
                                    className="btn-ghost result-summary-action"
                                    onClick={() => onUseAsReference(resultSlot)}
                                    disabled={!!resultReferenceCapacityMessage}
                                    title={resultReferenceCapacityMessage ?? 'Use this result as a reference image'}
                                >
                                    <ImagePlus size={16} /> Reference
                                </button>
                            )}
                            <button
                                onClick={onClear}
                                className="btn-ghost btn-icon result-summary-clear"
                                title="Clear result"
                                aria-label="Clear result"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    );
};

function formatResultSummaryTotal(totals: ReturnType<typeof calculateApiCostTotals> | null) {
    if (!totals) {
        return 'Unavailable';
    }

    if (typeof totals.totalUsd === 'number') {
        return formatUsd(totals.totalUsd);
    }

    return totals.status === 'partial' ? 'Partial' : 'Unavailable';
}

function formatResultSummaryLineItem(item: ApiCostLineItem) {
    return item.status === 'calculated' && typeof item.amountUsd === 'number'
        ? formatUsd(item.amountUsd)
        : 'Unavailable';
}

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
    const [reasoningModel] = useLocalStorage<ReasoningModelSlug>('generate_reasoning_model', OPENAI_RESPONSES_MODEL);
    const [isDragging, setIsDragging] = useState(false);
    const [viewingReferenceIndex, setViewingReferenceIndex] = useState<number | null>(null);
    const [showCostDisclosure, setShowCostDisclosure] = useState(false);
    const [autopilotNotice, setAutopilotNotice] = useState<string | null>(null);
    const [translatingGoal, setTranslatingGoal] = useState(false);
    const [goalTranslationCostContext, setGoalTranslationCostContext] = useState<{
        goal: string;
        prompt: string;
        ledger: ApiCostLedger;
    } | null>(null);
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
        currentPartialResult,
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
        saveAllResults,
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
            const translation = await goalPromptTranslator.translate({ goal, apiKey: reasoningApiKey });
            updateDraft({ prompt: translation.prompt, isSaved: false });
            setGoalTranslationCostContext(translation.costLedger ? {
                goal,
                prompt: translation.prompt,
                ledger: translation.costLedger,
            } : null);
        } catch (translationError) {
            setGoalTranslationCostContext(null);
            setAutopilotNotice(translationError instanceof Error ? translationError.message : 'Failed to translate goal');
        } finally {
            setTranslatingGoal(false);
        }
    };

    const handleRunAutopilot = async () => {
        setAutopilotNotice(null);
        const initialCostLedger = goalTranslationCostContext
            && goalTranslationCostContext.goal === goal
            && goalTranslationCostContext.prompt === draft.prompt
            ? goalTranslationCostContext.ledger
            : undefined;
        const result = await runAutopilot({
            goal,
            maxIterations,
            satisfactionThreshold,
            initialCostLedger,
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
    const resultReferenceCapacityMessage = getImageModelReferenceCapacityMessage(model, referenceImages.length, 'generation');
    const activeModelDraftKey = getImageModelDraftKey(model);
    const activeModelControls = draft[activeModelDraftKey] as Record<string, string | number>;
    const successfulBatchResults = currentBatchResults.filter((result) => result.status === 'success');
    const hasUnsavedSuccessfulBatchResults = successfulBatchResults.some((result) => !result.isSaved);
    const showBatchGrid = currentBatchResults.length > 1 || currentBatchResults.some((result) => result.status === 'failed');
    const singleResultSlot = !showBatchGrid ? successfulBatchResults[0] : null;
    const requestedParameters = getRequestedGenerateParameters(currentRunDraft ?? draft);
    const singleResultActualDetails = singleResultSlot
        ? buildActualParameterDetails({
            actualParameters: singleResultSlot.actualParameters,
            requestedParameters,
        })
        : null;
    const updateImageModelControl = (controlId: ImageModelControlId, value: string) => {
        updateDraft({
            [activeModelDraftKey]: {
                ...activeModelControls,
                [controlId]: coerceImageModelControlValue(model, controlId, value),
            },
        } as Partial<GenerateDraft>);
    };

    const handleUseResultAsReference = (result: SuccessfulGenerateResultSlot) => {
        addGeneratedResultAsReferenceFromAction({
            slot: result,
            addReferenceFiles,
            session: generateSessionStore,
            capacityMessage: resultReferenceCapacityMessage,
            setNotice: setAutopilotNotice,
        });
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
                        <div className="prompt-header">
                            <label>{isAutopilotMode ? 'STARTING PROMPT' : 'PROMPT'}</label>
                            <CustomSelect
                                className="example-prompt-select"
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
                        {isAutopilotMode && (
                            <p className="field-relationship-note">
                                Autopilot starts with this prompt, then scores and refines each result against the goal below.
                            </p>
                        )}
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
                                <p className="field-relationship-note">
                                    The goal is the target Autopilot evaluates against; the starting prompt above is the first image attempt.
                                </p>
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

                    <div className="options-grid">
                        <div className="image-model-options-grid">
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
                    {resultReferenceCapacityMessage && successfulBatchResults.length > 0 && <div className="info-message">{resultReferenceCapacityMessage}</div>}
                    {error && <div className="error-message">{error}</div>}
                    {autopilotNotice && <div className="info-message">{autopilotNotice}</div>}
                </section>

                <section className={`preview-panel glass-panel${showBatchGrid && !currentPartialResult ? ' batch-preview-panel' : ''}`}>
                    {currentPartialResult ? (
                        <div className="result-container partial-result-container">
                            <img src={currentPartialResult} alt="In-progress generation preview" className="result-image partial-result-image" />
                            <div className="partial-result-banner glass-panel">
                                <Loader2 className="spin" size={18} />
                                <strong>Generating preview</strong>
                                <span>Final result is still rendering.</span>
                            </div>
                        </div>
                    ) : showBatchGrid ? (
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
                                                <CostSummaryPanel compact ledger={result.costLedger} />
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
                                                    <button
                                                        className="btn-ghost"
                                                        onClick={() => handleUseResultAsReference(result)}
                                                        disabled={!!resultReferenceCapacityMessage}
                                                        title={resultReferenceCapacityMessage ?? 'Use this result as a reference image'}
                                                    >
                                                        <ImagePlus size={16} /> Use as Reference
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
                            <div className="result-batch-actions">
                                <button
                                    onClick={() => { void saveAllResults(); }}
                                    className="btn-amber"
                                    disabled={!hasUnsavedSuccessfulBatchResults}
                                >
                                    <Archive size={18} /> Save All
                                </button>
                                <button onClick={() => { void clear(); }} className="btn-ghost result-batch-clear">
                                    <Trash2 size={18} /> Clear Results
                                </button>
                            </div>
                        </div>
                    ) : currentResult ? (
                        <div className="result-container has-result-summary">
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
                            <ResultSummaryTable
                                actualDetails={singleResultActualDetails}
                                costLedger={singleResultSlot?.costLedger}
                                resultSlot={singleResultSlot}
                                isSaved={singleResultSlot?.isSaved ?? isSaved}
                                resultReferenceCapacityMessage={resultReferenceCapacityMessage}
                                onSave={() => { void save(); }}
                                onDownload={download}
                                onUseAsReference={handleUseResultAsReference}
                                onClear={() => { void clear(); }}
                            />
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
