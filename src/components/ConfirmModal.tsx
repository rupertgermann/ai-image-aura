import Modal from './Modal';
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    type?: 'danger' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    type = 'info'
}) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!isOpen) return null;
    const cancel = () => { if (!busy) { setError(null); onCancel(); } };
    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try { await onConfirm(); }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not complete this action. Try again.'); }
        finally { setBusy(false); }
    };

    return (
        <Modal label={title} className="dialog-overlay" onClose={cancel}>
            <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-icon-container">
                    <div className={`modal-icon ${type}`}>
                        <AlertTriangle size={24} />
                    </div>
                </div>

                <div className="confirm-body">
                    <h3>{title}</h3>
                    <p>{message}</p>
                    {error && <p role="alert">{error}</p>}

                    <div className="confirm-actions">
                        <button className="btn-ghost" autoFocus disabled={busy} onClick={cancel}>{cancelText}</button>
                        <button
                            className="btn-primary"
                            disabled={busy}
                            onClick={() => { void confirm(); }}
                        >
                            {busy ? 'Working…' : confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmModal;
