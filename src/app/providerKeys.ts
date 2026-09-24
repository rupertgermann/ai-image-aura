import { LOCAL_PROVIDER, type Provider } from '../utils/openaiModels';

export const PROVIDER_API_KEY_STORAGE_KEYS: Record<Exclude<Provider, typeof LOCAL_PROVIDER>, string> = {
    openai: 'aura_openapi_key',
    google: 'aura_google_api_key',
};
export const LOCAL_SERVER_URL_STORAGE_KEY = 'aura_local_server_url';

export type ProviderCredentialSet = Record<Provider, string | null | undefined>;

export function createProviderCredentialResolver(credentials: ProviderCredentialSet) {
    return {
        getCredential(provider: Provider) {
            return provider === LOCAL_PROVIDER
                ? normalizeLocalServerUrl(credentials.local)
                : normalizeKey(credentials[provider]);
        },
    };
}

export function readProviderApiKey(provider: Exclude<Provider, typeof LOCAL_PROVIDER>, storage: Pick<Storage, 'getItem'> = localStorage) {
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

export function normalizeLocalServerUrl(value: string | null | undefined) {
    const url = value?.trim().replace(/\/+$/, '') ?? '';
    if (!/^https?:\/\//i.test(url)) return null;

    try {
        const parsed = new URL(url);
        return parsed.hostname && !parsed.search && !parsed.hash ? url : null;
    } catch {
        return null;
    }
}

function normalizeKey(value: string | null | undefined) {
    const trimmed = value?.trim() ?? '';
    return trimmed ? trimmed : null;
}
