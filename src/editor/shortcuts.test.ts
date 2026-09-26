import { describe, expect, it } from 'vitest';
import { resolveEditorShortcut } from './shortcuts';

describe('resolveEditorShortcut', () => {
    it('leaves modifier-arrow combinations alone', () => {
        expect(resolveEditorShortcut({ key: 'ArrowUp', metaKey: true })).toBeNull();
        expect(resolveEditorShortcut({ key: 'ArrowLeft', ctrlKey: true })).toBeNull();
    });

    it('ignores shortcuts while text fields are active', () => {
        expect(resolveEditorShortcut({ key: 's', metaKey: true, isTextInput: true })).toBeNull();
        expect(resolveEditorShortcut({ key: 'Delete', isTextInput: true })).toBeNull();
    });
});
