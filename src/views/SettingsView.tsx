import React, { useEffect, useState } from 'react';
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
    const [openAiTempKey, setOpenAiTempKey] = useState(() => apiKey ?? '');
    const [googleTempKey, setGoogleTempKey] = useState(() => googleApiKey ?? '');
    const [openAiStatus, setOpenAiStatus] = useState<'idle' | 'saved'>('idle');
    const [googleStatus, setGoogleStatus] = useState<'idle' | 'saved'>('idle');

    useEffect(() => {
        setOpenAiTempKey(apiKey ?? '');
    }, [apiKey]);

    useEffect(() => {
        setGoogleTempKey(googleApiKey ?? '');
    }, [googleApiKey]);

    const handleOpenAiSave = () => {
        if (!openAiTempKey.trim()) return;
        onApiKeyChange(openAiTempKey.trim());
        setOpenAiStatus('saved');
        setTimeout(() => setOpenAiStatus('idle'), 3000);
    };

    const handleGoogleSave = () => {
        if (!googleTempKey.trim()) return;
        onGoogleApiKeyChange(googleTempKey.trim());
        setGoogleStatus('saved');
        setTimeout(() => setGoogleStatus('idle'), 3000);
    };

    return (
        <div className="settings-container">
            <header className="view-header">
                <h1>Configuration</h1>
                <p>Manage your API keys and application preferences.</p>
            </header>

            <ProviderKeySection
                title="OpenAI API Key"
                description={`Required for ${OPENAI_IMAGE_MODEL} image generation and ${OPENAI_RESPONSES_MODEL} reasoning.`}
                configured={!!apiKey && apiKey.length > 5}
                placeholder="sk-..."
                tempKey={openAiTempKey}
                status={openAiStatus}
                onTempKeyChange={setOpenAiTempKey}
                onSave={handleOpenAiSave}
            />

            <ProviderKeySection
                title="Google (Gemini) API Key"
                description="Required for Google-hosted image and reasoning models."
                configured={!!googleApiKey && googleApiKey.length > 5}
                placeholder="AIza..."
                tempKey={googleTempKey}
                status={googleStatus}
                onTempKeyChange={setGoogleTempKey}
                onSave={handleGoogleSave}
            />
        </div>
    );
};

interface ProviderKeySectionProps {
    title: string;
    description: string;
    configured: boolean;
    placeholder: string;
    tempKey: string;
    status: 'idle' | 'saved';
    onTempKeyChange: (key: string) => void;
    onSave: () => void;
}

const ProviderKeySection: React.FC<ProviderKeySectionProps> = ({
    title,
    description,
    configured,
    placeholder,
    tempKey,
    status,
    onTempKeyChange,
    onSave,
}) => (
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
                onChange={(e) => onTempKeyChange(e.target.value)}
                className="aura-input"
            />
            <button
                className="btn-amber"
                onClick={onSave}
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

export default SettingsView;
