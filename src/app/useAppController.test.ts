import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ArchiveImage } from '../db/types';
import type { LineageStep } from '../lineage/types';

const ports = vi.hoisted(() => ({ images: new Map<string, ArchiveImage>(), steps: new Map<string, LineageStep>(), blobs: new Map<string,string>() }));
vi.mock('../services/StorageService', () => ({ storage: {
  save: async (k:string,v:string) => { ports.blobs.set(k,v); }, load: async (k:string) => ports.blobs.get(k) ?? null,
  remove: async (k:string) => { ports.blobs.delete(k); }, listKeys: async () => [...ports.blobs.keys()],
} }));
vi.mock('../archive/ArchiveStore', () => ({ archiveStore: {
  get: async (id:string) => ports.images.get(id) ?? null,
  save: async (image:ArchiveImage) => { ports.images.set(image.id,image); return image; },
  remove: async (id:string) => { ports.images.delete(id); },
} }));
vi.mock('../lineage/LineageStore', () => ({ lineageStore: {
  getById: async (id:string) => ports.steps.get(id) ?? null,
  getByArchiveImageId: async (id:string) => [...ports.steps.values()].filter(s => s.archiveImageId === id),
  save: async (input:Omit<LineageStep,'id'>) => { const step = { ...input, id: `new-${ports.steps.size}` }; ports.steps.set(step.id,step); return step; },
} }));
vi.mock('../hooks/useImageArchive', async importOriginal => ({ ...await importOriginal<typeof import('../hooks/useImageArchive')>(), useImageArchive: () => ({ images: [...ports.images.values()], loading: false, error: null, setFavorite: async () => {}, publishSavedImage: () => {}, deleteImage: async () => {}, refresh: async () => {} }) }));
vi.mock('../editor/editorDraftStorage', () => ({ clearEditorDraft: async () => {} }));

import { generateSessionStore } from '../generate-session/GenerateSession';
import { useAppController } from '../app/useAppController';

it.each(['replay', 'similar'])('Editor A save preserves independent Generate B ancestry after %s', async (operation) => {
  ports.images.clear(); ports.steps.clear(); ports.blobs.clear();
  const local = new Map<string,string>([['editor_image_id', JSON.stringify('A')]]);
  vi.stubGlobal('window', { localStorage: { getItem: (k:string) => local.get(k) ?? null, setItem: (k:string,v:string) => { local.set(k,v); }, removeItem: (k:string) => { local.delete(k); } } });
  try {
    const base = { url: 'data:image/png;base64,AA', prompt: 'image', quality: 'medium', aspectRatio: '1024x1024', background: 'auto', timestamp: '2026-10-24T00:00:00Z' };
    ports.images.set('A', { ...base, id: 'A' }); ports.images.set('B', { ...base, id: 'B' });
    for (const id of ['A','B']) ports.steps.set(`step${id}`, { id: `step${id}`, archiveImageId: id, parentStepId: null, stepType: 'generation', timestamp: base.timestamp, metadata: {} });
    let controller: ReturnType<typeof useAppController> | undefined;
    renderToStaticMarkup(createElement(() => { controller = useAppController(); return null; }));
    if (!controller) throw new Error('Controller not rendered');
    expect(controller.editorViewProps.image?.id).toBe('A');
    if (operation === 'replay') await controller.replayGenerateFromLineageStep('stepB');
    else await generateSessionStore.transferFromArchive(ports.images.get('B')!);
    const expectedSource = operation === 'replay' ? { archiveImageId: 'B', stepId: 'stepB' } : { archiveImageId: 'B' };
    expect(generateSessionStore.loadLineageSource()).toEqual(expectedSource);
    await controller.editorViewProps.onSave('data:image/png;base64,EDITED_A', { isCopy: false, adjustments: { brightness: 100, contrast: 100, saturation: 100, filter: 'none' } });
    const editedStep = [...ports.steps.values()].at(-1);
    expect(editedStep).toMatchObject({ archiveImageId: 'A', parentStepId: 'stepA' });
    expect(generateSessionStore.loadLineageSource()).toEqual(expectedSource);
    await controller.generateViewProps.onSaveImage({ kind: 'generation', image: { ...base, id: 'B-child' }, source: generateSessionStore.loadLineageSource(), runDraft: null });
    expect([...ports.steps.values()].at(-1)).toMatchObject({ archiveImageId: 'B-child', parentStepId: 'stepB' });
  } finally { vi.unstubAllGlobals(); }
});
