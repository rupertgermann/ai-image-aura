import { describe, expect, it } from 'vitest';
import { resolveEditorShortcut } from './shortcuts';

describe('resolveEditorShortcut', () => {
    it.each([
        [{ key: 's', metaKey: true }, 'save'],
        [{ key: 'z', metaKey: true }, 'undo'],
        [{ key: 'z', metaKey: true, shiftKey: true }, 'redo'],
        [{ key: 'y', ctrlKey: true }, 'redo'],
        [{ key: 'd', metaKey: true }, 'duplicate'],
        [{ key: 'Delete' }, 'delete'],
        [{ key: 'Backspace' }, 'delete'],
        [{ key: 'Escape' }, 'clear-selection'],
    ] as const)('maps %j to %s', (input, shortcut) => {
        expect(resolveEditorShortcut(input)).toBe(shortcut);
    });

    it('ignores shortcuts while text fields are active', () => {
        expect(resolveEditorShortcut({ key: 's', metaKey: true, isTextInput: true })).toBeNull();
        expect(resolveEditorShortcut({ key: 'Delete', isTextInput: true })).toBeNull();
    });
});
