import { useCallback, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { AppView } from '../types';

export function useAppPreferences() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate');
    const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('aura_theme', 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const changeView = useCallback((view: AppView) => {
        setCurrentView(view);
    }, [setCurrentView]);

    const toggleTheme = useCallback(() => {
        setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');
    }, [setTheme]);

    return {
        currentView,
        theme,
        changeView,
        toggleTheme,
    };
}
