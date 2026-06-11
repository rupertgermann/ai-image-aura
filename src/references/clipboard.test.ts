import { describe, expect, it } from 'vitest';
import { getImageFilesFromClipboard } from './clipboard';

describe('getImageFilesFromClipboard', () => {
    it('returns every image file from clipboard items', () => {
        const png = new File(['png'], 'pasted.png', { type: 'image/png' });
        const jpeg = new File(['jpeg'], 'pasted.jpg', { type: 'image/jpeg' });
        const text = new File(['hello'], 'note.txt', { type: 'text/plain' });

        expect(getImageFilesFromClipboard({
            clipboardData: {
                items: [
                    createClipboardItem(png),
                    createClipboardItem(text),
                    createClipboardItem(jpeg),
                    createTextClipboardItem(),
                ],
            },
        })).toEqual([png, jpeg]);
    });

    it('falls back to clipboard files when items are not available', () => {
        const png = new File(['png'], 'fallback.png', { type: 'image/png' });
        const text = new File(['hello'], 'fallback.txt', { type: 'text/plain' });

        expect(getImageFilesFromClipboard({
            clipboardData: {
                files: [text, png],
            },
        })).toEqual([png]);
    });

    it('ignores non-image payloads without throwing', () => {
        expect(getImageFilesFromClipboard({
            clipboardData: {
                items: [
                    createTextClipboardItem(),
                    createClipboardItem(new File(['hello'], 'note.txt', { type: 'text/plain' })),
                ],
            },
        })).toEqual([]);
    });
});

function createClipboardItem(file: File) {
    return {
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
    };
}

function createTextClipboardItem() {
    return {
        kind: 'string',
        type: 'text/plain',
        getAsFile: () => null,
    };
}
