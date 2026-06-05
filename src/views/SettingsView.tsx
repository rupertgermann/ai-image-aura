import React, { useState } from 'react';
import { Key, Save, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { OPENAI_IMAGE_MODEL, OPENAI_RESPONSES_MODEL } from '../utils/openaiModels';

interface SettingsViewProps {
    apiKey: string | null;
    googleApiKey: string | null;
    onApiKeyChange: (key: string) => void;
    onGoogleApiKeyChange: (key: string) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
    apiKey,
    googleApiKey,
    onApiKeyChange,
    onGoogleApiKeyChange,
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
        </div>
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

export default SettingsView;
