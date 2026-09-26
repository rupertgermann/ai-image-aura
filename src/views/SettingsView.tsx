import React, { useState } from 'react';
import { Key, Save, AlertCircle, CheckCircle2, ShieldCheck, Bell, Server } from 'lucide-react';
import { normalizeLocalServerUrl } from '../app/providerKeys';
import { testLocalServerConnection } from '../image-workflow/LocalImageProvider';
import type { CompletionNotificationReadiness } from '../app/CompletionNotificationPort';

interface SettingsViewProps {
    onOpenGenerate: () => void;
    apiKey: string | null;
    googleApiKey: string | null;
    localServerUrl: string | null;
    completionNotificationsEnabled: boolean;
    completionNotificationReadiness: CompletionNotificationReadiness;
    onApiKeyChange: (key: string) => void;
    onGoogleApiKeyChange: (key: string) => void;
    onLocalServerUrlChange: (url: string) => void;
    onCompletionNotificationsChange: (enabled: boolean) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
    onOpenGenerate,
    apiKey,
    googleApiKey,
    localServerUrl,
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
                <h1>Settings</h1>
                <p>Connect the providers you use. Your archive and settings are stored in this browser.</p>
                <button className="btn-text-link" onClick={onOpenGenerate}>Back to Generate →</button>
            </header>

            <ProviderKeySection
                title="OpenAI API Key"
                description="Use OpenAI image and reasoning models."
                configured={!!apiKey && apiKey.length > 5}
                placeholder="sk-..."
                initialKey={apiKey ?? ''}
                onSaveKey={onApiKeyChange}
            />

            <ProviderKeySection
                title="Google (Gemini) API Key"
                description="Use Google image and reasoning models."
                configured={!!googleApiKey && googleApiKey.length > 5}
                placeholder="AIza..."
                initialKey={googleApiKey ?? ''}
                onSaveKey={onGoogleApiKeyChange}
            />

            <LocalServerSection
                localServerUrl={localServerUrl}
                onSave={onLocalServerUrlChange}
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
        if (draftUrl.trim() && !url) {
            setError('Enter a valid server URL starting with http:// or https://.');
            return;
        }
        onSave(url ?? '');
        setDraftUrl(url ?? '');
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
                <button className="btn-amber" onClick={handleSave} disabled={draftUrl.trim() === (localServerUrl ?? '') || testing}>
                    {saved ? <CheckCircle2 size={18} /> : <Save size={18} />}
                    {saved ? 'Saved' : !draftUrl.trim() && configuredUrl ? 'Disconnect' : 'Save'}
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
        onSaveKey(tempKey.trim());
        setStatus('saved');

    };

    return (
        <section className="settings-section glass-panel">
            <div className="section-title">
                <Key size={20} className={configured ? 'icon-green' : 'icon-purple'} />
                <h2>{title}</h2>
                {configured && (
                    <div className="badge-configured">
                        <ShieldCheck size={14} />
                        <span>Configured</span>
                    </div>
                )}
            </div>

            <p className="section-desc">
                {description} Your key is stored in this browser and sent only to the provider.
            </p>

            <div className="input-group">
                <input
                    type="password"
                    aria-label={title}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={placeholder}
                    value={tempKey}
                    onChange={(e) => { setTempKey(e.target.value); setStatus('idle'); }}
                    className="aura-input"
                />
                <button
                    className="btn-amber"
                    onClick={handleSave}
                    disabled={tempKey.trim() === initialKey}
                >
                    {status === 'saved' ? <CheckCircle2 size={18} /> : <Save size={18} />}
                    {status === 'saved' ? 'Saved' : !tempKey.trim() && configured ? 'Remove key' : 'Save key'}
                </button>
            </div>

            {!configured ? (
                <div className="warning-box">
                    <AlertCircle size={16} />
                    <span>Add a key when you want to use this provider.</span>
                </div>
            ) : (
                <div className="success-box">
                    <CheckCircle2 size={16} />
                    <span>Key saved on this device.</span>
                </div>
            )}
        </section>
    );
};

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
