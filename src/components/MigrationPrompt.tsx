import React from 'react';
import { DatabaseZap, KeyRound, ShieldCheck, X } from 'lucide-react';
import type { MigrationSnapshot } from '../session/LocalStorageMigrator';

interface MigrationPromptProps {
    snapshot: MigrationSnapshot;
    onMigrate: () => void;
    onDecline: () => void;
    isMigrating?: boolean;
}

const MigrationPrompt: React.FC<MigrationPromptProps> = ({ snapshot, onMigrate, onDecline, isMigrating = false }) => {
    return (
        <div className="modal-overlay dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="migration-prompt-title">
            <div className="modal-content glass-panel migration-prompt" onClick={(event) => event.stopPropagation()}>
                <div className="modal-icon-container">
                    <div className="modal-icon info">
                        <DatabaseZap size={24} />
                    </div>
                </div>

                <div className="confirm-body">
                    <h3 id="migration-prompt-title">Move session data to local SQLite?</h3>
                    <p>
                        We can migrate values that are currently stored in your browser's localStorage
                        into the local SQLite database. The data never leaves your machine.
                    </p>

                    <ul className="migration-prompt__list">
                        <li className="migration-prompt__row">
                            <span className="migration-prompt__row-icon">
                                <KeyRound size={16} />
                            </span>
                            <span className="migration-prompt__row-label">OpenAI API key</span>
                            <span className={`migration-prompt__row-status ${snapshot.apiKey.present ? 'is-present' : 'is-absent'}`}>
                                {snapshot.apiKey.present ? 'present' : 'not set'}
                            </span>
                        </li>
                    </ul>

                    <div className="migration-prompt__notice">
                        <ShieldCheck size={14} />
                        <span>API key value is never displayed here.</span>
                    </div>

                    <div className="confirm-actions">
                        <button className="glass-btn" onClick={onDecline} disabled={isMigrating}>
                            <X size={16} />
                            Decline
                        </button>
                        <button
                            className="action-button primary"
                            onClick={onMigrate}
                            disabled={isMigrating}
                        >
                            {isMigrating ? 'Migrating…' : 'Migrate'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MigrationPrompt;
