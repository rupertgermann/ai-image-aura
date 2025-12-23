import React, { useState, useEffect } from 'react';
import { Key, Save, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

interface SettingsViewProps {
    apiKey: string | null;
    onApiKeyChange: (key: string) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ apiKey, onApiKeyChange }) => {
    const [tempKey, setTempKey] = useState('');
    const [status, setStatus] = useState<'idle' | 'saved'>('idle');

    // Initialize tempKey from apiKey prop
    useEffect(() => {
        if (apiKey) setTempKey(apiKey);
    }, [apiKey]);

    const handleSave = () => {
        if (!tempKey.trim()) return;
        onApiKeyChange(tempKey.trim());
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 3000);
    };

    const isConfigured = !!apiKey && apiKey.length > 5;

    return (
        <div className="settings-container">
            <header className="view-header">
                <h1 className="gradient-text">Configuration</h1>
                <p>Manage your API keys and application preferences.</p>
            </header>

            <section className="settings-section glass-panel">
                <div className="section-title">
                    <Key size={20} className={isConfigured ? 'icon-green' : 'icon-purple'} />
                    <h2>OpenAI API Key</h2>
                    {isConfigured && (
                        <div className="badge-configured">
                            <ShieldCheck size={14} />
                            <span>Active</span>
                        </div>
                    )}
                </div>

                <p className="section-desc">
                    Your API key is required to generate images using GPT-Image-1.5.
                    It is stored locally in your browser and never sent to our servers.
                </p>

                <div className="input-group">
                    <input
                        type="password"
                        placeholder="sk-..."
                        value={tempKey}
                        onChange={(e) => setTempKey(e.target.value)}
                        className="aura-input"
                    />
                    <button
                        className={`aura-btn ${status === 'saved' ? 'aura-btn--success' : 'aura-btn--primary'}`}
                        onClick={handleSave}
                        disabled={!tempKey.trim()}
                    >
                        {status === 'saved' ? <CheckCircle2 size={18} /> : <Save size={18} />}
                        {status === 'saved' ? 'Saved' : 'Save Key'}
                    </button>
                </div>

                {!isConfigured ? (
                    <div className="warning-box">
                        <AlertCircle size={16} />
                        <span>Image generation will be disabled until a valid API key is provided.</span>
                    </div>
                ) : (
                    <div className="success-box">
                        <CheckCircle2 size={16} />
                        <span>Key is stored and ready for generation. Masked for security.</span>
                    </div>
                )}
            </section>
        </div>
    );
};

export default SettingsView;
