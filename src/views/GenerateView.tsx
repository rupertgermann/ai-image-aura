import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Loader2, Download, Archive, Trash2, Upload, X, ImagePlus } from 'lucide-react';
import type { ApiCostLedger, ArchiveImage } from '../db/types';
import { generateSessionStore, getImageModelDraftKey, useGenerateDraft, type GenerateDraft } from '../generate-session/GenerateSession';
import { addGeneratedResultAsReferenceFromAction, useGenerateController, type GenerateResultSlot } from '../generate-session/useGenerateController';
import { getImageFilesFromClipboard } from '../references/clipboard';
import { useReferenceImageCollection } from '../references/useReferenceImageCollection';
import ConfirmModal from '../components/ConfirmModal';
import ReferenceImageModal from '../components/ReferenceImageModal';
import PaletteSelect from '../components/PaletteSelect';
import ActualParametersPanel from '../components/ActualParametersPanel';
import CostSummaryPanel from '../components/CostSummaryPanel';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
    buildActualParameterDetails,
    getRequestedGenerateParameters,
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
    getImageModelReferenceCapacityMessage,
    type ImageModelControlId,
} from '../image-models/ImageModelControls';
import {
    OPENAI_RESPONSES_MODEL,
    REASONING_MODEL_REGISTRY,
    isImageModelSlug,
    type ReasoningModelSlug,
    LOCAL_PROVIDER,
    getProviderLabel,
    resolveImageModelConfig,
    resolveReasoningModelConfig,
    sanitizeReasoningModel,
    type Provider,
} from '../utils/openaiModels';

interface GenerateViewProps {
    onBusyChange: (busy: boolean) => void;
    onOpenSettings: () => void;
    getProviderCredential: (provider: Provider) => string | null;
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

const Select = ({ label, value, options, onChange, className }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    className?: string;
}) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={className}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
);

const GenerateView: React.FC<GenerateViewProps> = ({
    onBusyChange,
    onOpenSettings,
    getProviderCredential,
    onSaveImage,
    completionNotificationsEnabled,
    completionNotificationPort,
    isDocumentHidden,
}) => {
    const [draft, setDraft] = useGenerateDraft();
    const previewRef = useRef<HTMLElement>(null);
    const [pendingAction, setPendingAction] = useState<'generate' | 'autopilot' | 'clear' | null>(null);
    const [mode, setMode] = useLocalStorage<'single-shot' | 'autopilot'>('generate_mode', 'single-shot');
    const [goal, setGoal] = useLocalStorage('generate_autopilot_goal', '');
    const [maxIterations, setMaxIterations] = useLocalStorage('generate_autopilot_max_iterations', DEFAULT_AUTOPILOT_MAX_ITERATIONS);
    const [satisfactionThreshold, setSatisfactionThreshold] = useLocalStorage('generate_autopilot_threshold', DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD);
    const [storedReasoningModel, setReasoningModel] = useLocalStorage<string>('generate_reasoning_model', OPENAI_RESPONSES_MODEL);
    const reasoningModel = sanitizeReasoningModel(storedReasoningModel);
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
    const imageCredential = getProviderCredential(activeModel.provider);
    const activeReasoningModel = resolveReasoningModelConfig(reasoningModel);
    const reasoningApiKey = getProviderCredential(activeReasoningModel.provider);
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
        saving,
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
        imageCredential,
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
    useEffect(() => { onBusyChange(loading || saving || translatingGoal); }, [loading, saving, translatingGoal, onBusyChange]);

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
    const maxReasoningApiCalls = maxIterations * 2 - 1;
    const isLocalImageModel = activeModel.provider === LOCAL_PROVIDER;
    const isAutopilotMode = mode === 'autopilot';
    const imageModelReferenceWarning = referenceRunPlan.referenceLimitMessage;
    const resultReferenceCapacityMessage = getImageModelReferenceCapacityMessage(model, referenceImages.length, 'generation');
    const activeModelDraftKey = getImageModelDraftKey(model);
    const activeModelControls = draft[activeModelDraftKey] as Record<string, string | number>;
    const successfulBatchResults = currentBatchResults.filter((result) => result.status === 'success');
    const hasUnsavedSuccessfulBatchResults = successfulBatchResults.some((result) => !result.isSaved);
    const requestAction = (action: 'generate' | 'autopilot' | 'clear') => {
        if (hasUnsavedSuccessfulBatchResults) {
            setPendingAction(action);
        } else {
            performAction(action);
        }
    };
    const performAction = (action: 'generate' | 'autopilot' | 'clear') => {
        setPendingAction(null);
        if (action === 'generate') void generate();
        else if (action === 'clear') void clear();
        else setShowCostDisclosure(true);
    };
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
                <h1>Generate</h1>
                <p>Start with an idea. Make it your own.</p>
            </header>

            <div className="generate-grid">
                <section className="controls-panel glass-panel">
                    <div className="option-group">
                        <label htmlFor="image-model">Image model</label>
                        <select id="image-model" value={model} disabled={loading} onChange={(event) => {
                            if (isImageModelSlug(event.target.value)) updateDraft({ model: event.target.value });
                        }}>
                            {getImageModelUiChoices().map((choice) => (
                                <option key={choice.slug} value={choice.slug}>{choice.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="input-section">
                        <div className="prompt-header">
                            <label htmlFor="generation-prompt">{isAutopilotMode ? 'Starting prompt' : 'Prompt'}</label>
                            <Select
                                label="Example prompts"
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
                            id="generation-prompt"
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
                                aria-pressed={!isAutopilotMode}
                                disabled={loading}
                                onClick={() => setMode('single-shot')}
                            >Single Shot</button>
                            <button
                                className={isAutopilotMode ? 'active' : ''}
                                aria-pressed={isAutopilotMode}
                                disabled={loading}
                                onClick={() => setMode('autopilot')}
                            >Autopilot</button>
                        </div>
                    </div>

                    {isAutopilotMode && (
                        <div className="autopilot-panel">
                            <div className="option-group">
                                <label htmlFor="reasoning-model">Reasoning model</label>
                                <select id="reasoning-model" value={reasoningModel} disabled={loading} onChange={(event) => setReasoningModel(event.target.value)}>
                                    {(Object.keys(REASONING_MODEL_REGISTRY) as ReasoningModelSlug[]).map((slug) => (
                                        <option key={slug} value={slug}>{resolveReasoningModelConfig(slug).label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-section">
                                <div className="prompt-header">
                                    <label htmlFor="autopilot-goal">Goal</label>
                                    <button
                                        className="btn-ghost autopilot-inline-btn"
                                        onClick={() => { void handleTranslateGoal(); }}
                                        disabled={!goal.trim() || !reasoningApiKey || translatingGoal || loading}
                                    >
                                        {translatingGoal ? 'Translating...' : 'Translate to Prompt'}
                                    </button>
                                </div>
                                <textarea
                                    id="autopilot-goal"
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
                                    <label htmlFor="max-iterations">Max iterations</label>
                                    <input
                                        type="range"
                                        id="max-iterations"
                                        min={1}
                                        max={MAX_AUTOPILOT_ITERATIONS}
                                        value={maxIterations}
                                        onChange={(e) => setMaxIterations(Number(e.target.value))}
                                        className="range-input"
                                    />
                                    <span className="autopilot-metric">{maxIterations}</span>
                                </div>

                                <div className="option-group">
                                    <label htmlFor="satisfaction-threshold">Satisfaction threshold</label>
                                    <input
                                        type="range"
                                        id="satisfaction-threshold"
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
                                <p>{isLocalImageModel
                                    ? `Up to ${maxIterations} local image calls with no API charge, and ${maxReasoningApiCalls} ${activeReasoningModel.label} reasoning API calls.`
                                    : `Up to ${maxIterations} iterations and roughly ${maxApiCalls} API calls using ${activeModel.label} for images and ${activeReasoningModel.label} for reasoning.`}</p>
                            </div>

                        </div>
                    )}

                    <div className="options-grid">
                        <div className="image-model-options-grid">
                            {getImageModelGenerateControls(model).filter((control) => !isAutopilotMode || control.id !== 'batchSize').map((control) => (
                                <div className="option-group" key={control.id}>
                                    <label>{control.label}</label>
                                    {control.kind === 'select' ? (
                                        <Select
                                            label={control.label}
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
                                                    aria-pressed={String(activeModelControls[control.id] ?? '') === option.value}
                                                    onClick={() => updateImageModelControl(control.id, option.value)}
                                                >{option.label}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <details className="style-options">
                            <summary>Style &amp; mood{[style, lighting, palette].some((value) => value !== 'none') ? ' · Applied' : ' · Optional'}</summary>
                            <div className="option-group">
                            <label>Style</label>
                            <Select
                                label="Style"
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
                            <Select
                                label="Lighting"
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
                            <PaletteSelect
                                value={palette}
                                onChange={(v) => updateDraft({ palette: v })}
                            />
                        </div>
                        </details>
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
                                    <button className="reference-open" aria-label={`Preview reference ${idx + 1}`} onClick={() => setViewingReferenceIndex(idx)}>
                                        <img src={url} alt={`Reference ${idx + 1}`} />
                                    </button>
                                    <button
                                        className="remove-ref"
                                        aria-label={`Remove reference ${idx + 1}`}
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
                                        e.currentTarget.value = '';
                                    }}
                                    className="file-input-overlay"
                                    aria-label="Add reference images"
                                />
                                <Upload size={20} />
                                <span>Add / Drop</span>
                            </label>
                        </div>
                    </div>

                    {isAutopilotMode ? (
                        <>
                            {showCostDisclosure && (
                                <div className="autopilot-confirmation glass-panel">
                                    <p>{isLocalImageModel
                                        ? `Confirm Autopilot run with up to ${maxIterations} local image calls (no API charge) and ${maxReasoningApiCalls} reasoning API calls.`
                                        : `Confirm Autopilot run with up to ${maxIterations} iterations and approximately ${maxApiCalls} API calls.`}</p>
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
                            <button
                                className="btn-amber"
                                onClick={() => requestAction('autopilot')}
                                disabled={loading || saving || !prompt.trim() || !goal.trim() || !imageCredential || !reasoningApiKey}
                                style={{ width: '100%' }}
                            >
                                {loading ? <Loader2 className="spin" size={20} /> : <Sparkles size={20} />}
                                {loading ? 'Autopilot Running...' : 'Run Autopilot'}
                            </button>
                        </>
                    ) : (
                        <button
                            className="btn-amber"
                            onClick={() => requestAction('generate')}
                            disabled={loading || saving || !prompt.trim() || !imageCredential}
                            style={{ width: '100%' }}
                        >
                            {loading ? <Loader2 className="spin" size={20} /> : <Sparkles size={20} />}
                            {loading ? 'Generating…' : Number(activeModelControls.batchSize) > 1 ? `Generate ${activeModelControls.batchSize} images` : 'Generate image'}
                        </button>
                    )}

                    {currentBatchResults.length > 0 && !loading && <button className="btn-text-link jump-to-results" onClick={() => previewRef.current?.scrollIntoView({ block: 'start' })}>View {successfulBatchResults.length === 1 ? 'result' : 'results'} ↓</button>}

                    {isAutopilotMode && autopilot.running && (
                        <div className="autopilot-live-panel glass-panel">
                            <div className="autopilot-live-header">
                                <strong>Iteration {autopilot.iterations.length}/{maxIterations}</strong>
                                <button className="btn-ghost" onClick={cancelAutopilot}>Stop after this iteration</button>
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

                    {!imageCredential && (
                        <div className="error-message">{activeModel.provider === LOCAL_PROVIDER
                            ? 'Connect a local server to use this model.'
                            : `Add an ${getProviderLabel(activeModel.provider)} API key to use this model.`} <button className="inline-link" onClick={onOpenSettings}>Open Settings</button></div>
                    )}
                    {isAutopilotMode && !reasoningApiKey && (
                        <div className="error-message">{activeReasoningModel.label} needs a {getProviderLabel(activeReasoningModel.provider)} API key. <button className="inline-link" onClick={onOpenSettings}>Open Settings</button></div>
                    )}
                    {imageModelReferenceWarning && <div className="info-message">{imageModelReferenceWarning}</div>}
                    {resultReferenceCapacityMessage && successfulBatchResults.length > 0 && <div className="info-message">{resultReferenceCapacityMessage}</div>}
                    {error && <div role="alert" className="error-message">{error}</div>}
                    {autopilotNotice && <div className="info-message">{autopilotNotice}</div>}
                </section>

                <section ref={previewRef} className={`preview-panel glass-panel${showBatchGrid && !currentPartialResult ? ' batch-preview-panel' : ''}`}>
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
                                                <details className="batch-result-details"><summary>Generation details</summary>
                                                <ActualParametersPanel
                                                    compact
                                                    details={buildActualParameterDetails({
                                                        actualParameters: result.actualParameters,
                                                        requestedParameters,
                                                    })}
                                                />
                                                <CostSummaryPanel compact ledger={result.costLedger} />
                                                </details>
                                                <div className="result-slot-actions">
                                                    <button
                                                        onClick={() => { void saveResult(result.slotIndex); }}
                                                        className="btn-amber"
                                                        disabled={result.isSaved || saving || loading}
                                                    >
                                                        <Archive size={16} /> {result.isSaved ? 'Saved' : saving ? 'Saving…' : 'Save'}
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
                                                        <ImagePlus size={16} /> Use as reference
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
                                    disabled={!hasUnsavedSuccessfulBatchResults || saving || loading}
                                >
                                    <Archive size={18} /> {saving ? 'Saving…' : hasUnsavedSuccessfulBatchResults ? 'Save all' : 'All saved'}
                                </button>
                                <button onClick={() => requestAction('clear')} className="btn-ghost result-batch-clear" disabled={loading || saving}>
                                    <Trash2 size={18} /> Clear results
                                </button>
                            </div>
                        </div>
                    ) : currentResult ? (
                        <div className="result-container has-result-summary">
                            {loading && <div className="run-status" role="status"><Loader2 size={18} className="spin" /> Generating a new image…</div>}
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
                            <div className="result-toolbar">
                                <button className="btn-amber" disabled={saving || loading || (singleResultSlot?.isSaved ?? isSaved)} onClick={() => { void save(); }}>
                                    <Archive size={18} /> {(singleResultSlot?.isSaved ?? isSaved) ? 'Saved to Archive' : saving ? 'Saving…' : 'Save to Archive'}
                                </button>
                                <button className="btn-ghost" onClick={download}><Download size={18} /> Download</button>
                                {singleResultSlot && <button className="btn-ghost" disabled={!!resultReferenceCapacityMessage} title={resultReferenceCapacityMessage ?? undefined} onClick={() => handleUseResultAsReference(singleResultSlot)}>
                                    <ImagePlus size={18} /> Use as reference
                                </button>}
                            </div>
                            <div className="result-footer">
                                <details className="result-details">
                                    <summary>Generation details{singleResultActualDetails?.elapsedLabel ? ` · ${singleResultActualDetails.elapsedLabel}` : ''}</summary>
                                    {singleResultActualDetails && <ActualParametersPanel details={singleResultActualDetails} />}
                                    <CostSummaryPanel ledger={singleResultSlot?.costLedger} />
                                </details>
                                <button className="btn-ghost btn-icon" aria-label="Clear result" title="Clear result" disabled={loading || saving} onClick={() => requestAction('clear')}><X size={18} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-preview" role="status">
                            {loading ? <Loader2 size={36} className="spin" /> : <ImagePlus size={36} className="dim-icon" />}
                            <h2>{loading ? 'Creating your image' : 'A little space for your next idea'}</h2>
                            <p>{loading ? 'You can browse the archive while this runs.' : 'Write a prompt or choose an example to get started.'}</p>
                        </div>
                    )}
                </section>
            </div>

            <ConfirmModal
                isOpen={pendingAction !== null}
                title={pendingAction === 'clear' ? 'Clear unsaved results?' : 'Replace unsaved results?'}
                message="These images have not been saved to your archive. Save or download them first if you want to keep them."
                confirmText={pendingAction === 'clear' ? 'Clear results' : 'Continue'}
                cancelText="Keep results"
                onCancel={() => setPendingAction(null)}
                onConfirm={() => { if (pendingAction) performAction(pendingAction); }}
            />

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
