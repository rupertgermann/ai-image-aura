export type EditorShortcut =
    | 'save'
    | 'undo'
    | 'redo'
    | 'duplicate'
    | 'delete'
    | 'clear-selection'
    | 'nudge-up'
    | 'nudge-down'
    | 'nudge-left'
    | 'nudge-right';

export interface EditorShortcutInput {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    isTextInput?: boolean;
}

export function resolveEditorShortcut(input: EditorShortcutInput): EditorShortcut | null {
    if (input.isTextInput) {
        return null;
    }

    const key = input.key.toLowerCase();
    const modifier = !!input.metaKey || !!input.ctrlKey;

    if (modifier && key === 's') {
        return 'save';
    }
    if (modifier && key === 'z' && input.shiftKey) {
        return 'redo';
    }
    if (modifier && key === 'z') {
        return 'undo';
    }
    if (modifier && key === 'y') {
        return 'redo';
    }
    if (modifier && key === 'd') {
        return 'duplicate';
    }
    if (key === 'delete' || key === 'backspace') {
        return 'delete';
    }
    if (key === 'escape') {
        return 'clear-selection';
    }
    if (!modifier && key === 'arrowup') {
        return 'nudge-up';
    }
    if (!modifier && key === 'arrowdown') {
        return 'nudge-down';
    }
    if (!modifier && key === 'arrowleft') {
        return 'nudge-left';
    }
    if (!modifier && key === 'arrowright') {
        return 'nudge-right';
    }

    return null;
}
