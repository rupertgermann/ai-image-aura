import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const icons = {
        success: <CheckCircle size={18} className="success-icon" />,
        error: <AlertCircle size={18} className="error-icon" />,
        info: <AlertCircle size={18} className="info-icon" />
    };

    return (
        <div className={`toast glass-panel ${type}`}>
            {icons[type]}
            <span>{message}</span>
            <button onClick={onClose} className="toast-close">
                <X size={14} />
            </button>
        </div>
    );
};

export default Toast;
