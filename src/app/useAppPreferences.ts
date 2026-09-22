import { useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { Provider } from '../utils/openaiModels';
import { LOCAL_SERVER_URL_STORAGE_KEY, PROVIDER_API_KEY_STORAGE_KEYS, createProviderCredentialResolver, normalizeLocalServerUrl } from './providerKeys';
import type { AppView } from './types';

export function useAppPreferences() {
    const [currentView, setCurrentView] = useLocalStorage<AppView>('aura_current_view', 'generate');
    const [apiKey, setApiKey] = useLocalStorage<string>(PROVIDER_API_KEY_STORAGE_KEYS.openai, '');
    const [googleApiKey, setGoogleApiKey] = useLocalStorage<string>(PROVIDER_API_KEY_STORAGE_KEYS.google, '');
    const [localServerUrl, setLocalServerUrl] = useLocalStorage<string>(LOCAL_SERVER_URL_STORAGE_KEY, '');
    const [completionNotificationsEnabled, setCompletionNotificationsEnabled] = useLocalStorage('aura_completion_notifications_enabled', false);
    const providerCredentialResolver = useMemo(() => createProviderCredentialResolver({
        openai: apiKey,
        google: googleApiKey,
        local: localServerUrl,
    }), [apiKey, googleApiKey, localServerUrl]);

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

    const updateLocalServerUrl = useCallback((url: string) => {
        const normalized = normalizeLocalServerUrl(url);
        if (normalized) setLocalServerUrl(normalized);
    }, [setLocalServerUrl]);

    const updateCompletionNotificationsEnabled = useCallback((enabled: boolean) => {
        setCompletionNotificationsEnabled(enabled);
    }, [setCompletionNotificationsEnabled]);

    const getCredential = useCallback((provider: Provider) => {
        return providerCredentialResolver.getCredential(provider);
    }, [providerCredentialResolver]);

    return {
        currentView,
        apiKey,
        openAiApiKey: apiKey,
        googleApiKey,
        localServerUrl,
        completionNotificationsEnabled,
        changeView,
        getCredential,
        updateApiKey,
        updateOpenAiApiKey: updateApiKey,
        updateGoogleApiKey,
        updateLocalServerUrl,
        updateCompletionNotificationsEnabled,
    };
}
