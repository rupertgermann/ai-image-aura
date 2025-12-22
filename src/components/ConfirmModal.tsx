import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
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
    if (!isOpen) return null;

    return (
        <div className="modal-overlay dialog-overlay" onClick={onCancel}>
            <div className="modal-content glass-panel confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-icon-container">
                    <div className={`modal-icon ${type}`}>
                        <AlertTriangle size={24} />
                    </div>
                </div>

                <div className="confirm-body">
                    <h3>{title}</h3>
                    <p>{message}</p>

                    <div className="confirm-actions">
                        <button className="glass-btn" onClick={onCancel}>{cancelText}</button>
                        <button
                            className={`action-button ${type === 'danger' ? 'danger-bg' : 'primary'}`}
                            onClick={onConfirm}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
