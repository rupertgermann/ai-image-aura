import { describe, expect, it } from 'vitest';
import {
    LOCAL_SERVER_URL_STORAGE_KEY,
    PROVIDER_API_KEY_STORAGE_KEYS,
    createProviderKeyResolver,
    normalizeLocalServerUrl,
    readProviderApiKey,
} from './providerKeys';

describe('providerKeys', () => {
    it('keeps OpenAI and Google keys in distinct local storage slots', () => {
        expect(PROVIDER_API_KEY_STORAGE_KEYS.openai).toBe('aura_openapi_key');
        expect(PROVIDER_API_KEY_STORAGE_KEYS.google).toBe('aura_google_api_key');
        expect(PROVIDER_API_KEY_STORAGE_KEYS.openai).not.toBe(PROVIDER_API_KEY_STORAGE_KEYS.google);
    });

    it('reads provider keys from JSON-stringified local storage values', () => {
        const storage = createStorage({
            aura_openapi_key: JSON.stringify('sk-openai'),
            aura_google_api_key: JSON.stringify('gemini-key'),
        });

        expect(readProviderApiKey('openai', storage)).toBe('sk-openai');
        expect(readProviderApiKey('google', storage)).toBe('gemini-key');
    });

    it('returns null for non-string JSON values in provider storage', () => {
        const storage = createStorage({
            aura_openapi_key: JSON.stringify({ key: 'sk-openai' }),
            aura_google_api_key: JSON.stringify(['not-a-key']),
        });

        expect(readProviderApiKey('openai', storage)).toBeNull();
        expect(readProviderApiKey('google', storage)).toBeNull();
    });

    it('normalizes whitespace-only strings to null', () => {
        const storage = createStorage({
            aura_openapi_key: '   ',
            aura_google_api_key: '\t\n',
        });

        expect(readProviderApiKey('openai', storage)).toBeNull();
        expect(readProviderApiKey('google', storage)).toBeNull();
    });

    it('resolves empty strings as null', () => {
        const resolver = createProviderKeyResolver({
            openai: '   ',
            google: 'gemini-key',
            local: '',
        });

        expect(resolver.getKey('openai')).toBeNull();
        expect(resolver.getKey('google')).toBe('gemini-key');
        expect(resolver.getKey('local')).toBeNull();
    });

    it('has a dedicated Local server URL slot and resolves a cleaned saved URL', () => {
        expect(LOCAL_SERVER_URL_STORAGE_KEY).toBe('aura_local_server_url');
        expect(LOCAL_SERVER_URL_STORAGE_KEY).not.toBe(PROVIDER_API_KEY_STORAGE_KEYS.openai);
        expect(LOCAL_SERVER_URL_STORAGE_KEY).not.toBe(PROVIDER_API_KEY_STORAGE_KEYS.google);
        expect(createProviderKeyResolver({
            openai: null,
            google: null,
            local: '  http://127.0.0.1:1234///  ',
        }).getKey('local')).toBe('http://127.0.0.1:1234');
    });

    it('rejects invalid Local server URLs before they can resolve as credentials', () => {
        expect(normalizeLocalServerUrl('ftp://127.0.0.1:1234')).toBeNull();
        expect(normalizeLocalServerUrl('http://')).toBeNull();
        expect(createProviderKeyResolver({
            openai: null,
            google: null,
            local: 'file:///tmp/server',
        }).getKey('local')).toBeNull();
    });
});

function createStorage(values: Record<string, string>): Pick<Storage, 'getItem'> {
    return {
        getItem(key: string) {
            return values[key] ?? null;
        },
    };
}
