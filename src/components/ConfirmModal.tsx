import React from 'react';
import { X, AlertCircle, Trash2, HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'info',
    onConfirm,
    onCancel
}) => {
    const getIcon = () => {
        switch (type) {
            case 'danger': return <Trash2 size={48} className="icon-danger" />;
            case 'warning': return <AlertCircle size={48} className="icon-warning" />;
            default: return <HelpCircle size={48} className="icon-info" />;
        }
    };

    return (
        <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 3000 }}>
            <div className="confirm-modal glass-panel" onClick={e => e.stopPropagation()}>
                <div className="confirm-header">
                    {getIcon()}
                    <h2>{title}</h2>
                </div>
                <p className="confirm-message">{message}</p>
                <div className="confirm-actions">
                    <button className="confirm-btn-cancel" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button className={`confirm-btn-action ${type}`} onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
