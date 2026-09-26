import React, { useState } from 'react';
import { Key, Save, AlertCircle, CheckCircle2, ShieldCheck, Bell, SlidersHorizontal, Server } from 'lucide-react';
import { getImageModelUiChoices } from '../image-models/ImageModelControls';
import { useGenerateDraft } from '../generate-session/GenerateSession';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { normalizeLocalServerUrl } from '../app/providerKeys';
import { testLocalServerConnection } from '../image-workflow/LocalImageProvider';
import {
    LOCAL_PROVIDER,
    OPENAI_IMAGE_MODEL,
    OPENAI_SUNBURST_IMAGE_MODEL,
    OPENAI_RESPONSES_MODEL,
    REASONING_MODEL_REGISTRY,
    getProviderLabel,
    resolveReasoningModelConfig,
    sanitizeReasoningModel,
    type Provider,
    type ReasoningModelSlug,
} from '../utils/openaiModels';
import type { CompletionNotificationReadiness } from '../app/CompletionNotificationPort';

interface SettingsViewProps {
    apiKey: string | null;
    googleApiKey: string | null;
    localServerUrl: string | null;
    getProviderCredential: (provider: Provider) => string | null;
    completionNotificationsEnabled: boolean;
    completionNotificationReadiness: CompletionNotificationReadiness;
    onApiKeyChange: (key: string) => void;
    onGoogleApiKeyChange: (key: string) => void;
    onLocalServerUrlChange: (url: string) => void;
    onCompletionNotificationsChange: (enabled: boolean) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
    apiKey,
    googleApiKey,
    localServerUrl,
    getProviderCredential,
    completionNotificationsEnabled,
    completionNotificationReadiness,
    onApiKeyChange,
    onGoogleApiKeyChange,
    onLocalServerUrlChange,
    onCompletionNotificationsChange,
}) => {
    return (
        <div className="settings-container">
            <header className="view-header">
                <h1>Configuration</h1>
                <p>Manage your providers and application preferences.</p>
            </header>

            <ProviderKeySection
                key={`openai-${apiKey ?? ''}`}
                title="OpenAI API Key"
                description={`Required for ${OPENAI_IMAGE_MODEL} and ${OPENAI_SUNBURST_IMAGE_MODEL} image generation and ${OPENAI_RESPONSES_MODEL} reasoning.`}
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

            <LocalServerSection
                localServerUrl={localServerUrl}
                onSave={onLocalServerUrlChange}
            />

            <ModelPreferencesSection
                getProviderCredential={getProviderCredential}
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
    getProviderCredential: (provider: Provider) => string | null;
}

const ModelPreferencesSection: React.FC<ModelPreferencesSectionProps> = ({
    getProviderCredential,
}) => {
    const [draft, setDraft] = useGenerateDraft();
    const [storedReasoningModel, setReasoningModel] = useLocalStorage<string>('generate_reasoning_model', OPENAI_RESPONSES_MODEL);
    const reasoningModel = sanitizeReasoningModel(storedReasoningModel);

    return (
        <section className="settings-section glass-panel">
            <div className="section-title">
                <SlidersHorizontal size={20} className="icon-purple" />
                <h2>Model Preferences</h2>
            </div>

            <p className="section-desc">
                These selections control the Generate module. Provider credentials decide which models are available.
            </p>

            <div className="settings-model-grid">
                <div className="input-section">
                    <label>IMAGE MODEL</label>
                    <div className="toggle-group">
                        {getImageModelUiChoices().map((choice) => {
                            const hasCredential = !!getProviderCredential(choice.provider);
                            return (
                                <button
                                    key={choice.slug}
                                    className={draft.model === choice.slug ? 'active' : ''}
                                    onClick={() => setDraft((current) => ({
                                        ...current,
                                        model: choice.slug,
                                    }))}
                                    disabled={!hasCredential}
                                    title={hasCredential ? choice.label : getProviderSetupHint(choice.provider)}
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
                            const hasCredential = !!getProviderCredential(config.provider);
                            return (
                                <button
                                    key={modelSlug}
                                    className={reasoningModel === modelSlug ? 'active' : ''}
                                    onClick={() => setReasoningModel(modelSlug)}
                                    disabled={!hasCredential}
                                    title={hasCredential ? config.label : getProviderSetupHint(config.provider)}
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

interface LocalServerSectionProps {
    localServerUrl: string | null;
    onSave: (url: string) => void;
}

const LocalServerSection: React.FC<LocalServerSectionProps> = ({ localServerUrl, onSave }) => {
    const [draftUrl, setDraftUrl] = useState(localServerUrl ?? '');
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [testing, setTesting] = useState(false);
    const [connection, setConnection] = useState<Awaited<ReturnType<typeof testLocalServerConnection>> | null>(null);
    const configuredUrl = normalizeLocalServerUrl(localServerUrl);

    const handleSave = () => {
        const url = normalizeLocalServerUrl(draftUrl);
        if (!url) {
            setError('Enter a valid server URL starting with http:// or https://.');
            return;
        }
        onSave(url);
        setDraftUrl(url);
        setError(null);
        setConnection(null);
        setSaved(true);
    };

    const handleTest = async () => {
        if (!configuredUrl) return;
        setTesting(true);
        setConnection(null);
        try {
            setConnection(await testLocalServerConnection(configuredUrl));
        } finally {
            setTesting(false);
        }
    };

    return (
        <section className="settings-section glass-panel">
            <div className="section-title">
                <Server size={20} className={configuredUrl ? 'icon-green' : 'icon-purple'} />
                <h2>Local Server (stable-diffusion.cpp)</h2>
                <span className="status-badge">{configuredUrl ? 'Configured' : 'Not configured'}</span>
            </div>
            <p className="section-desc">Connect to an sd-server on your machine or behind llama-swap. The URL is stored in this browser.</p>
            <label htmlFor="local-server-url">Server URL</label>
            <div className="input-group">
                <input
                    id="local-server-url"
                    type="url"
                    placeholder="http://127.0.0.1:1234"
                    value={draftUrl}
                    onChange={(event) => {
                        setDraftUrl(event.target.value);
                        setError(null);
                        setSaved(false);
                        setConnection(null);
                    }}
                    className="aura-input"
                    aria-invalid={!!error}
                    aria-describedby={error ? 'local-server-url-error' : undefined}
                />
                <button className="btn-amber" onClick={handleSave} disabled={!draftUrl.trim()}>
                    {saved ? <CheckCircle2 size={18} /> : <Save size={18} />}
                    {saved ? 'Saved' : 'Save'}
                </button>
                <button className="btn-ghost" onClick={() => { void handleTest(); }} disabled={!configuredUrl || normalizeLocalServerUrl(draftUrl) !== configuredUrl || testing}>
                    {testing ? 'Testing…' : 'Test connection'}
                </button>
            </div>
            {error && <div id="local-server-url-error" className="warning-box" role="alert"><AlertCircle size={16} />{error}</div>}
            {connection && (
                <div className={connection.status === 'connected' ? 'success-box' : 'warning-box'} role="status">
                    {connection.status === 'connected' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{connection.status === 'connected'
                        ? `Connected. ${connection.modelIds.length ? `Model IDs: ${connection.modelIds.join(', ')}` : 'No model IDs reported.'}`
                        : connection.status === 'http-error'
                            ? `Local server returned HTTP ${connection.httpStatus}.`
                            : `Could not reach the local server at ${connection.url}.`}</span>
                </div>
            )}
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

function getProviderSetupHint(provider: Provider) {
    return provider === LOCAL_PROVIDER
        ? `Add a ${getProviderLabel(provider)} URL above`
        : `Add a ${getProviderLabel(provider)} API key above`;
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
