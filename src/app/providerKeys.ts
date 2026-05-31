import type { Provider } from '../utils/openaiModels';

export const PROVIDER_API_KEY_STORAGE_KEYS: Record<Provider, string> = {
    openai: 'aura_openapi_key',
    google: 'aura_google_api_key',
};

export type ProviderKeySet = Record<Provider, string | null | undefined>;

export function createProviderKeyResolver(keys: ProviderKeySet) {
    return {
        getKey(provider: Provider) {
            return normalizeKey(keys[provider]);
        },
    };
}

export function readProviderApiKey(provider: Provider, storage: Pick<Storage, 'getItem'> = localStorage) {
    const rawValue = storage.getItem(PROVIDER_API_KEY_STORAGE_KEYS[provider]);

    if (!rawValue) {
        return null;
    }

    try {
        const parsedValue = JSON.parse(rawValue);
        return typeof parsedValue === 'string' ? normalizeKey(parsedValue) : null;
    } catch {
        return normalizeKey(rawValue);
    }
}

function normalizeKey(value: string | null | undefined) {
    const trimmed = value?.trim() ?? '';
    return trimmed ? trimmed : null;
}
