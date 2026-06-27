import React, { useState } from 'react';
import { Key, Save, AlertCircle, CheckCircle2, ShieldCheck, Bell, SlidersHorizontal } from 'lucide-react';
import { getImageModelUiChoices } from '../image-models/ImageModelControls';
import { useGenerateDraft } from '../generate-session/GenerateSession';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
    GOOGLE_PROVIDER,
    OPENAI_IMAGE_MODEL,
    OPENAI_PROVIDER,
    OPENAI_RESPONSES_MODEL,
    REASONING_MODEL_REGISTRY,
    resolveReasoningModelConfig,
    type Provider,
    type ReasoningModelSlug,
} from '../utils/openaiModels';
import type { CompletionNotificationReadiness } from '../app/CompletionNotificationPort';

interface SettingsViewProps {
    apiKey: string | null;
    googleApiKey: string | null;
    completionNotificationsEnabled: boolean;
    completionNotificationReadiness: CompletionNotificationReadiness;
    onApiKeyChange: (key: string) => void;
    onGoogleApiKeyChange: (key: string) => void;
    onCompletionNotificationsChange: (enabled: boolean) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
    apiKey,
    googleApiKey,
    completionNotificationsEnabled,
    completionNotificationReadiness,
    onApiKeyChange,
    onGoogleApiKeyChange,
    onCompletionNotificationsChange,
}) => {
    return (
        <div className="settings-container">
            <header className="view-header">
                <h1>Configuration</h1>
                <p>Manage your API keys and application preferences.</p>
            </header>

            <ProviderKeySection
                key={`openai-${apiKey ?? ''}`}
                title="OpenAI API Key"
                description={`Required for ${OPENAI_IMAGE_MODEL} image generation and ${OPENAI_RESPONSES_MODEL} reasoning.`}
                configured={!!apiKey && apiKey.length > 5}
                placeholder="sk-..."
                initialKey={apiKey ?? ''}
                onSaveKey={onApiKeyChange}
            />

            <ProviderKeySection
                key={`google-${googleApiKey ?? ''}`}
                title="Google (Gemini) API Key"
                description="Required for Google-hosted image and reasoning models."
                configured={!!googleApiKey && googleApiKey.length > 5}
                placeholder="AIza..."
                initialKey={googleApiKey ?? ''}
                onSaveKey={onGoogleApiKeyChange}
            />

            <ModelPreferencesSection
                apiKey={apiKey}
                googleApiKey={googleApiKey}
            />

            <section className="settings-section glass-panel">
                <div className="section-title">
                    <Bell size={20} className={completionNotificationsEnabled ? 'icon-green' : 'icon-purple'} />
                    <h2>Completion Notifications</h2>
                    <span className="status-badge">{getReadinessLabel(completionNotificationReadiness)}</span>
                </div>

                <label className="settings-toggle-row">
                    <input
                        type="checkbox"
                        checked={completionNotificationsEnabled}
                        onChange={(event) => onCompletionNotificationsChange(event.target.checked)}
                        disabled={completionNotificationReadiness === 'unsupported' || completionNotificationReadiness === 'insecure-context'}
                    />
                    <span>Notify when runs finish in the background</span>
                </label>
            </section>
        </div>
    );
};

interface ModelPreferencesSectionProps {
    apiKey: string | null;
    googleApiKey: string | null;
}

const ModelPreferencesSection: React.FC<ModelPreferencesSectionProps> = ({
    apiKey,
    googleApiKey,
}) => {
    const [draft, setDraft] = useGenerateDraft();
    const [reasoningModel, setReasoningModel] = useLocalStorage<ReasoningModelSlug>('generate_reasoning_model', OPENAI_RESPONSES_MODEL);

    return (
        <section className="settings-section glass-panel">
            <div className="section-title">
                <SlidersHorizontal size={20} className="icon-purple" />
                <h2>Model Preferences</h2>
            </div>

            <p className="section-desc">
                These selections control the Generate module. Provider keys still decide which models are available.
            </p>

            <div className="settings-model-grid">
                <div className="input-section">
                    <label>IMAGE MODEL</label>
                    <div className="toggle-group">
                        {getImageModelUiChoices().map((choice) => {
                            const hasKey = hasProviderKey(choice.provider, apiKey, googleApiKey);
                            return (
                                <button
                                    key={choice.slug}
                                    className={draft.model === choice.slug ? 'active' : ''}
                                    onClick={() => setDraft((current) => ({
                                        ...current,
                                        model: choice.slug,
                                    }))}
                                    disabled={!hasKey}
                                    title={hasKey ? choice.label : `Add a ${getProviderLabel(choice.provider)} API key above`}
                                >
                                    {choice.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="input-section">
                    <label>REASONING MODEL</label>
                    <div className="toggle-group">
                        {(Object.keys(REASONING_MODEL_REGISTRY) as ReasoningModelSlug[]).map((modelSlug) => {
                            const config = resolveReasoningModelConfig(modelSlug);
                            const hasKey = hasProviderKey(config.provider, apiKey, googleApiKey);
                            return (
                                <button
                                    key={modelSlug}
                                    className={reasoningModel === modelSlug ? 'active' : ''}
                                    onClick={() => setReasoningModel(modelSlug)}
                                    disabled={!hasKey}
                                    title={hasKey ? config.label : `Add a ${getProviderLabel(config.provider)} API key above`}
                                >
                                    {config.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
};

interface ProviderKeySectionProps {
    title: string;
    description: string;
    configured: boolean;
    placeholder: string;
    initialKey: string;
    onSaveKey: (key: string) => void;
}

const ProviderKeySection: React.FC<ProviderKeySectionProps> = ({
    title,
    description,
    configured,
    placeholder,
    initialKey,
    onSaveKey,
}) => {
    const [tempKey, setTempKey] = useState(() => initialKey);
    const [status, setStatus] = useState<'idle' | 'saved'>('idle');
    const handleSave = () => {
        if (!tempKey.trim()) return;
        onSaveKey(tempKey.trim());
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 3000);
    };

    return (
        <section className="settings-section glass-panel">
            <div className="section-title">
                <Key size={20} className={configured ? 'icon-green' : 'icon-purple'} />
                <h2>{title}</h2>
                {configured && (
                    <div className="badge-configured">
                        <ShieldCheck size={14} />
                        <span>Active</span>
                    </div>
                )}
            </div>

            <p className="section-desc">
                {description} It is stored locally in your browser and never sent to our servers.
            </p>

            <div className="input-group">
                <input
                    type="password"
                    placeholder={placeholder}
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    className="aura-input"
                />
                <button
                    className="btn-amber"
                    onClick={handleSave}
                    disabled={!tempKey.trim()}
                >
                    {status === 'saved' ? <CheckCircle2 size={18} /> : <Save size={18} />}
                    {status === 'saved' ? 'Saved' : 'Save Key'}
                </button>
            </div>

            {!configured ? (
                <div className="warning-box">
                    <AlertCircle size={16} />
                    <span>This provider is unavailable until a valid API key is provided.</span>
                </div>
            ) : (
                <div className="success-box">
                    <CheckCircle2 size={16} />
                    <span>Key is stored and ready. Masked for security.</span>
                </div>
            )}
        </section>
    );
};

function hasProviderKey(provider: Provider, apiKey: string | null, googleApiKey: string | null) {
    const key = provider === GOOGLE_PROVIDER ? googleApiKey : apiKey;
    return !!key && key.length > 5;
}

function getProviderLabel(provider: Provider) {
    return provider === OPENAI_PROVIDER ? 'OpenAI' : 'Google';
}

function getReadinessLabel(readiness: CompletionNotificationReadiness) {
    switch (readiness) {
        case 'unsupported':
            return 'Unsupported';
        case 'insecure-context':
            return 'Unavailable';
        case 'denied':
            return 'Denied';
        case 'granted':
            return 'Allowed';
        case 'default':
            return 'Off';
    }
}

export default SettingsView;
