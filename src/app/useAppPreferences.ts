import { useCallback, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { AppView } from './types';

export function useAppPreferences() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate');
    const [apiKey, setApiKey] = useLocalStorage<string>('aura_openapi_key', '');

    useEffect(() => {
        if (!apiKey) {
            const legacyKey = localStorage.getItem('openai_api_key');
            if (legacyKey) {
                setApiKey(legacyKey);
            }
        }
    }, [apiKey, setApiKey]);

    const changeView = useCallback((view: AppView) => {
        setCurrentView(view);
    }, [setCurrentView]);

    const updateApiKey = useCallback((key: string) => {
        setApiKey(key);
    }, [setApiKey]);

    return {
        currentView,
        apiKey,
        changeView,
        updateApiKey,
    };
}
