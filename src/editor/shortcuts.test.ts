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
        [{ key: 'ArrowUp' }, 'nudge-up'],
        [{ key: 'ArrowDown' }, 'nudge-down'],
        [{ key: 'ArrowLeft' }, 'nudge-left'],
        [{ key: 'ArrowRight' }, 'nudge-right'],
        [{ key: 'ArrowUp', shiftKey: true }, 'nudge-up'],
    ] as const)('maps %j to %s', (input, shortcut) => {
        expect(resolveEditorShortcut(input)).toBe(shortcut);
    });

    it('leaves modifier-arrow combinations alone', () => {
        expect(resolveEditorShortcut({ key: 'ArrowUp', metaKey: true })).toBeNull();
        expect(resolveEditorShortcut({ key: 'ArrowLeft', ctrlKey: true })).toBeNull();
    });

    it('ignores shortcuts while text fields are active', () => {
        expect(resolveEditorShortcut({ key: 's', metaKey: true, isTextInput: true })).toBeNull();
        expect(resolveEditorShortcut({ key: 'Delete', isTextInput: true })).toBeNull();
    });
});
