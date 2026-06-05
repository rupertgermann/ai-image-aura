import { describe, expect, it } from 'vitest';
import { dataURLtoFile, fileToDataURL } from './file';

describe('file utilities', () => {
    it('roundtrips a data URL to a File and back', async () => {
        const source = new File(['hello'], 'source.txt', { type: 'text/plain' });
        const dataUrl = await fileToDataURL(source);

        const restored = dataURLtoFile(dataUrl, 'restored.txt');

        expect(restored.name).toBe('restored.txt');
        expect(restored.type).toBe('text/plain');
        expect(await restored.text()).toBe('hello');
    });

    it('throws for malformed data URLs', () => {
        expect(() => dataURLtoFile('not-a-data-url', 'file.txt')).toThrow('Invalid data URL: expected format data:[mime];base64,[data]');
    });

    it('accepts base64 data URLs with embedded whitespace', async () => {
        const spacedDataUrl = 'data:text/plain;base64,aG V sbG8=';

        const file = dataURLtoFile(spacedDataUrl, 'whitespace.txt');

        expect(file.type).toBe('text/plain');
        expect(await file.text()).toBe('hello');
    });

    it('throws for malformed base64 payloads', () => {
        const malformedDataUrl = 'data:text/plain;base64,@@@not-base64@@@';

        expect(() => dataURLtoFile(malformedDataUrl, 'malformed.txt')).toThrow('Invalid data URL: malformed base64 payload');
    });

    it('accepts mime-parameter data URLs while preserving the mime type', async () => {
        const parameterizedDataUrl = 'data:text/plain;charset=utf-8;base64,aGVsbG8=';

        const file = dataURLtoFile(parameterizedDataUrl, 'parameterized.txt');

        expect(file.type).toBe('text/plain');
        expect(await file.text()).toBe('hello');
    });
});
