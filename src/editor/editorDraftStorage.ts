import { del, get, set } from 'idb-keyval';
import type { EditorDraft } from './layers';

const draftKey = (imageId: string) => `editor_${imageId}_draft`;

/** Keep image data out of localStorage's small, synchronous quota. */
export async function loadEditorDraft(imageId: string): Promise<EditorDraft | null> {
    const key = draftKey(imageId);
    const stored = await get<EditorDraft>(key);
    if (stored) return stored;
    const legacy = localStorage.getItem(key);
    if (!legacy) return null;
    const draft = JSON.parse(legacy) as EditorDraft;
    await set(key, draft);
    localStorage.removeItem(key);
    return draft;
}

export const saveEditorDraft = (imageId: string, draft: EditorDraft) => set(draftKey(imageId), draft);

export async function clearEditorDraft(imageId: string) {
    await del(draftKey(imageId));
    localStorage.removeItem(draftKey(imageId));
}
