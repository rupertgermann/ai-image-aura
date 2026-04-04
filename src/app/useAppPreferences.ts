import { useCallback, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { AppView } from '../types';

export function useAppPreferences() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate');
    const [apiKey, setApiKey] = useLocalStorage<string>('aura_openapi_key', '');
    const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('aura_theme', 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

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

    const toggleTheme = useCallback(() => {
        setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');
    }, [setTheme]);

    return {
        currentView,
        apiKey,
        theme,
        changeView,
        updateApiKey,
        toggleTheme,
    };
}
