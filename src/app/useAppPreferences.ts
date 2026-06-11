import { useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { Provider } from '../utils/openaiModels';
import { PROVIDER_API_KEY_STORAGE_KEYS, createProviderKeyResolver } from './providerKeys';
import type { AppView } from './types';

export function useAppPreferences() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate');
    const [apiKey, setApiKey] = useLocalStorage<string>(PROVIDER_API_KEY_STORAGE_KEYS.openai, '');
    const [googleApiKey, setGoogleApiKey] = useLocalStorage<string>(PROVIDER_API_KEY_STORAGE_KEYS.google, '');
    const [completionNotificationsEnabled, setCompletionNotificationsEnabled] = useLocalStorage('aura_completion_notifications_enabled', false);
    const providerKeyResolver = useMemo(() => createProviderKeyResolver({
        openai: apiKey,
        google: googleApiKey,
    }), [apiKey, googleApiKey]);

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

    const updateGoogleApiKey = useCallback((key: string) => {
        setGoogleApiKey(key);
    }, [setGoogleApiKey]);

    const updateCompletionNotificationsEnabled = useCallback((enabled: boolean) => {
        setCompletionNotificationsEnabled(enabled);
    }, [setCompletionNotificationsEnabled]);

    const getKey = useCallback((provider: Provider) => {
        return providerKeyResolver.getKey(provider);
    }, [providerKeyResolver]);

    return {
        currentView,
        apiKey,
        openAiApiKey: apiKey,
        googleApiKey,
        completionNotificationsEnabled,
        changeView,
        getKey,
        updateApiKey,
        updateOpenAiApiKey: updateApiKey,
        updateGoogleApiKey,
        updateCompletionNotificationsEnabled,
    };
}
