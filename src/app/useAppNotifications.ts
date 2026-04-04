import { useCallback, useState } from 'react';
import type { ToastType } from '../components/Toast';

interface AppToast {
    id: string;
    message: string;
    type: ToastType;
}

export function useAppNotifications() {
    const [toasts, setToasts] = useState<AppToast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = crypto.randomUUID();
        setToasts((currentToasts) => [...currentToasts, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, []);

    const notifyError = useCallback((error: unknown, fallback: string) => {
        addToast(error instanceof Error ? error.message : fallback, 'error');
    }, [addToast]);

    return {
        toasts,
        addToast,
        removeToast,
        notifyError,
    };
}
