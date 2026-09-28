import { describe, expect, it } from 'vitest';
import {
    createProviderCredentialResolver,
    normalizeLocalServerUrl,
    readProviderApiKey,
} from './providerKeys';

describe('provider credentials', () => {

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
        const resolver = createProviderCredentialResolver({
            openai: '   ',
            google: 'gemini-key',
            local: '',
        });

        expect(resolver.getCredential('openai')).toBeNull();
        expect(resolver.getCredential('google')).toBe('gemini-key');
        expect(resolver.getCredential('local')).toBeNull();
    });

    it('resolves a cleaned saved Local server URL', () => {
        expect(createProviderCredentialResolver({
            openai: null,
            google: null,
            local: '  http://127.0.0.1:1234///  ',
        }).getCredential('local')).toBe('http://127.0.0.1:1234');
    });

    it('rejects invalid Local server URLs before they can resolve as credentials', () => {
        expect(normalizeLocalServerUrl('ftp://127.0.0.1:1234')).toBeNull();
        expect(normalizeLocalServerUrl('http://')).toBeNull();
        expect(createProviderCredentialResolver({
            openai: null,
            google: null,
            local: 'file:///tmp/server',
        }).getCredential('local')).toBeNull();
    });
});

function createStorage(values: Record<string, string>): Pick<Storage, 'getItem'> {
    return {
        getItem(key: string) {
            return values[key] ?? null;
        },
    };
}
