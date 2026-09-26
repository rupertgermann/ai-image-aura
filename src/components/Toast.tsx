import React, { useEffect, useEffectEvent } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    const dismiss = useEffectEvent(onClose);
    useEffect(() => {
        if (type === 'error') return;
        const timer = setTimeout(dismiss, 5000);
        return () => clearTimeout(timer);
    }, [message, type]);

    const icons = {
        success: <CheckCircle size={18} className="success-icon" />,
        error: <AlertCircle size={18} className="error-icon" />,
        info: <AlertCircle size={18} className="info-icon" />
    };

    return (
        <div className={`toast ${type}`} role={type === 'error' ? 'alert' : 'status'}>
            {icons[type]}
            <span>{message}</span>
            <button onClick={onClose} className="toast-close" aria-label="Dismiss notification">
                <X size={14} />
            </button>
        </div>
    );
};

export default Toast;
