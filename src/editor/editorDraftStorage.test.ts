import { afterEach, expect, it, vi } from 'vitest';
import { get, set } from 'idb-keyval';
import { loadEditorDraft, saveEditorDraft } from './editorDraftStorage';
import type { EditorDraft } from './layers';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('keeps legacy drafts until migration succeeds and saves large drafts without localStorage', async () => {
    const draft = { references: ['data:image/png;base64,legacy'] } as EditorDraft;
    const legacy = new Map([['editor_image_draft', JSON.stringify(draft)]]);
    const setItem = vi.fn(() => { throw new Error('Quota exceeded'); });
    vi.stubGlobal('localStorage', { getItem: (key: string) => legacy.get(key), removeItem: (key: string) => legacy.delete(key), setItem });
    vi.mocked(set).mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(undefined);
    await expect(loadEditorDraft('image')).rejects.toThrow('Storage unavailable');
    expect(legacy.has('editor_image_draft')).toBe(true);
    await expect(loadEditorDraft('image')).resolves.toEqual(draft);
    expect(legacy.size).toBe(0);

    const largeDraft = { ...draft, references: ['x'.repeat(6 * 1024 * 1024)] };
    await saveEditorDraft('image', largeDraft);
    vi.mocked(get).mockResolvedValue(largeDraft);
    await expect(loadEditorDraft('image')).resolves.toEqual(largeDraft);
    expect(setItem).not.toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith('editor_image_draft', largeDraft);
});
