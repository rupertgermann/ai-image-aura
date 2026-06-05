import { describe, expect, it } from 'vitest';
import {
    PROVIDER_API_KEY_STORAGE_KEYS,
    createProviderKeyResolver,
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
        });

        expect(resolver.getKey('openai')).toBeNull();
        expect(resolver.getKey('google')).toBe('gemini-key');
    });
});

function createStorage(values: Record<string, string>): Pick<Storage, 'getItem'> {
    return {
        getItem(key: string) {
            return values[key] ?? null;
        },
    };
}
