import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, page, baseURL }) => {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL
        ? route.continue() : route.abort());
    await page.route('**/storage-test', (route) => route.fulfill({ contentType: 'text/html',
        headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
        body: '<title>Archive persistence test</title>' }));
    await page.goto('/storage-test');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

for (const missing of ['reference', 'layer', 'image']) {
    test(`incomplete conflicting ZIP preserves original assets and lineage when ${missing} is absent`, async ({ page }, testInfo) => {
        const result = await page.evaluate(async (missing) => {
            const archivePath = '/src/archive/ArchiveStore.ts';
            const transferPath = '/src/archive/ArchiveTransfer.ts';
            const lineagePath = '/src/lineage/LineageStore.ts';
            const zipPath = '/node_modules/.vite/deps/jszip.js';
            const { archiveStore }: typeof import('../src/archive/ArchiveStore') = await import(archivePath);
            const { buildArchiveZip, importArchiveZip }: typeof import('../src/archive/ArchiveTransfer') = await import(transferPath);
            const { lineageStore }: typeof import('../src/lineage/LineageStore') = await import(lineagePath);
            const { default: JSZip }: { default: typeof import('jszip') } = await import(zipPath);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas unavailable');
            const urls = ['red', 'green', 'blue'].map((color) => {
                drawing.fillStyle = color;
                drawing.fillRect(0, 0, 64, 64);
                return canvas.toDataURL();
            });
            await archiveStore.save({
                id: 'saved', url: urls[0], prompt: 'Original artwork', quality: 'high',
                aspectRatio: '64x64', model: 'gpt-image-2.5-flare', background: 'transparent', timestamp: '2026-10-24T12:00:00Z',
                references: [urls[1]], layerStack: { canvasWidth: 64, canvasHeight: 64, layers: [{
                    id: 'base', name: 'Base', kind: 'base', assetUrl: urls[2], x: 0, y: 0,
                    width: 64, height: 64, rotation: 0, opacity: 1, blendMode: 'normal', visible: true, locked: false,
                }] },
            });
            const original = await archiveStore.get('saved');
            if (!original) throw new Error('Original archive image was not persisted');
            const originalStep = await lineageStore.save({ id: 'step', archiveImageId: original.id,
                stepType: 'generation', parentStepId: null, timestamp: original.timestamp, metadata: { prompt: original.prompt } });
            const incoming = { ...original, prompt: 'Incoming artwork', url: urls[1] };
            const incomingLineage = {
                getByArchiveImageId: async () => [{ ...originalStep, metadata: { prompt: incoming.prompt } }],
                getById: async () => null,
            };
            const complete = await buildArchiveZip([incoming], { lineageStore: incomingLineage });
            const zip = await JSZip.loadAsync(complete);
            const missingFile = missing === 'reference' ? 'aura-saved-reference-0.png'
                : missing === 'layer' ? 'aura-saved-layer-base.png' : 'aura-saved.png';
            if (!zip.file(missingFile)) throw new Error(`Fixture asset missing: ${missingFile}`);
            zip.remove(missingFile);
            const partial = await zip.generateAsync({ type: 'uint8array' });
            const summary = await importArchiveZip(partial, { archiveStore, lineageStore });
            const preserved = await archiveStore.get('saved');
            const steps = await lineageStore.getByArchiveImageId('saved');
            const exported = await JSZip.loadAsync(await buildArchiveZip(preserved ? [preserved] : [], { lineageStore }));
            const reference = await exported.file('aura-saved-reference-0.png')?.async('base64');
            const layer = await exported.file('aura-saved-layer-base.png')?.async('base64');
            return { original, originalStep, preserved, steps, summary, reference, layer,
                complete: Array.from(complete), partial: Array.from(partial), missingFile };
        }, missing);
        await testInfo.attach('archive-transfer.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
        expect(result.summary.missingAssetFiles).toContain(result.missingFile);
        expect(result.summary.importedImageIds).toEqual([]);
        expect(result.summary.importedStepIds).toEqual([]);
        expect(result.preserved).toEqual(result.original);
        expect(result.steps).toEqual([result.originalStep]);
        expect(result.reference).toBe(result.original.references?.[0].split(',')[1]);
        expect(result.layer).toBe(result.original.layerStack?.layers[0].assetUrl?.split(',')[1]);
        await page.reload();
        const controls = await page.evaluate(async ({ complete, partial }) => {
            const archivePath = '/src/archive/ArchiveStore.ts';
            const transferPath = '/src/archive/ArchiveTransfer.ts';
            const lineagePath = '/src/lineage/LineageStore.ts';
            const { archiveStore }: typeof import('../src/archive/ArchiveStore') = await import(archivePath);
            const { importArchiveZip }: typeof import('../src/archive/ArchiveTransfer') = await import(transferPath);
            const { lineageStore }: typeof import('../src/lineage/LineageStore') = await import(lineagePath);
            const reloaded = await archiveStore.get('saved');
            const steps = await lineageStore.getByArchiveImageId('saved');
            const completeSummary = await importArchiveZip(new Uint8Array(complete), { archiveStore, lineageStore });
            const overwritten = await archiveStore.get('saved');
            await archiveStore.remove('saved');
            const freshSummary = await importArchiveZip(new Uint8Array(partial), { archiveStore, lineageStore });
            const fresh = await archiveStore.get('saved');
            return { reloaded, steps, completeSummary, overwritten, freshSummary, fresh };
        }, { complete: result.complete, partial: result.partial });
        await testInfo.attach('archive-transfer-reload.json', { body: JSON.stringify(controls, null, 2), contentType: 'application/json' });
        expect(controls.reloaded).toEqual(result.original);
        expect(controls.steps).toEqual([result.originalStep]);
        expect(controls.completeSummary.importedImageIds).toEqual(['saved']);
        expect(controls.overwritten?.prompt).toBe('Incoming artwork');
        if (missing === 'image') {
            expect(controls.fresh).toBeNull();
        } else {
            expect(controls.freshSummary.importedImageIds).toEqual(['saved']);
            expect(controls.fresh?.references).toHaveLength(missing === 'reference' ? 0 : 1);
            expect(controls.fresh?.layerStack?.layers).toHaveLength(missing === 'layer' ? 0 : 1);
        }
    });
}

test('stale listing preserves the rich save and concurrent recovery inserts a true orphan once', async ({ page }, testInfo) => {
    const result = await page.evaluate(async () => {
        const archivePath = '/src/archive/ArchiveStore.ts';
        const metadataPath = '/src/archive/SQLiteArchiveMetadataPort.ts';
        const storagePath = '/src/services/StorageService.ts';
        const { createArchiveStore }: typeof import('../src/archive/ArchiveStore') = await import(archivePath);
        const { SQLiteArchiveMetadataPort }: typeof import('../src/archive/SQLiteArchiveMetadataPort') = await import(metadataPath);
        const { storage }: typeof import('../src/services/StorageService') = await import(storagePath);
        const costPath = '/src/costs/apiCost.ts';
        const { buildImageCostLedger }: typeof import('../src/costs/apiCost') = await import(costPath);
        const firstMetadata = new SQLiteArchiveMetadataPort();
        const secondMetadata = new SQLiteArchiveMetadataPort();
        await Promise.all([firstMetadata.init(), secondMetadata.init()]);
        let scanned: () => void = () => {};
        let resume: () => void = () => {};
        const started = new Promise<void>((resolve) => { scanned = resolve; });
        const gate = new Promise<void>((resolve) => { resume = resolve; });
        const listStore = createArchiveStore({ metadata: firstMetadata, blobs: {
            save: (key, data) => storage.save(key, data), load: (key) => storage.load(key),
            remove: (key) => storage.remove(key),
            listKeys: async () => { scanned(); await gate; return storage.listKeys(); },
        } });
        const saveStore = createArchiveStore({ metadata: secondMetadata });
        const listing = listStore.list();
        await started;
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 64;
        const url = canvas.toDataURL();
        await saveStore.save({ id: 'rich', url, prompt: 'Rich saved artwork', quality: 'medium',
            aspectRatio: '96x64', background: 'auto', model: 'gpt-image-2.5-flare', width: 96, height: 64,
            favorite: true, style: 'cinematic', lighting: 'sunlight', palette: 'warm',
            actualParameters: { revisedPrompt: 'Rich revised prompt', size: '96x64' },
            costLedger: buildImageCostLedger({ provider: 'local', model: 'local-model', operation: 'image-generation' }),
            references: [url], layerStack: { canvasWidth: 96, canvasHeight: 64, layers: [{
                id: 'base', name: 'Base', kind: 'base', assetUrl: url, x: 0, y: 0, width: 96, height: 64,
                rotation: 0, opacity: 1, blendMode: 'normal', visible: true, locked: false,
            }] },
        });
        const original = await saveStore.get('rich');
        resume();
        const listed = await listing;
        const saved = await saveStore.get('rich');
        await storage.save('img_orphan', url);
        const recoveries = await Promise.all([
            createArchiveStore({ metadata: firstMetadata, clock: () => '2026-10-24T13:00:00Z' }).list(),
            createArchiveStore({ metadata: secondMetadata, clock: () => '2026-10-24T14:00:00Z' }).list(),
        ]);
        const orphan = await saveStore.get('orphan');
        return { original, listed, saved, orphan, recovered: recoveries.map((images) => images.find((image) => image.id === 'orphan')) };
    });
    await testInfo.attach('archive-recovery.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.saved).toEqual(result.original);
    expect(result.listed).toEqual([result.original]);
    expect(result.orphan?.prompt).toBe('Recovered image');
    expect(result.recovered).toEqual([result.orphan, result.orphan]);
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open image: Rich saved artwork', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open image: Recovered image', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('recovered-archive.png') });
});
