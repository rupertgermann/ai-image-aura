import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import type { ArchiveManifest, LineageManifest } from '../src/archive/ArchiveManifest';
import { OPENAI_IMAGE_MODEL } from '../src/utils/openaiModels';

const prompt = 'Portable layered artwork';
const sourceId = 'zip-source';
const fixture = await readFile(new URL('./fixtures/four-colors.png', import.meta.url));

test('Archive downloads only the selection and restores an editable copy with its assets and lineage', async ({ page, context, browser, baseURL }, testInfo) => {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await page.goto('/');
    await page.evaluate(async ({ prompt, sourceId, base64, model }) => {
        const archivePath = '/src/archive/ArchiveStore.ts';
        const lineagePath = '/src/lineage/LineageStore.ts';
        const { archiveStore } = await import(archivePath);
        const { lineageStore } = await import(lineagePath);
        await archiveStore.save({
            id: sourceId, prompt, model, url: `data:image/png;base64,${base64}`,
            timestamp: '2026-01-01T00:00:00.000Z', quality: 'high', aspectRatio: '128x128', background: 'auto',
            width: 128, height: 128, favorite: true, references: [`data:image/png;base64,${base64}`],
            actualParameters: { revisedPrompt: 'Four vivid colored squares', size: '128x128', quality: 'high', elapsedMs: 1200 },
            costLedger: { version: 1, currency: 'USD', items: [{
                id: 'fixture-cost', kind: 'image-generation', operation: 'image-generation', provider: 'openai', model,
                label: 'Image generation', status: 'calculated', currency: 'USD', amountUsd: 0.04,
            }] },
        });
        await lineageStore.save({
            id: 'zip-source-generation', archiveImageId: sourceId, parentStepId: null, stepType: 'generation',
            timestamp: '2026-01-01T00:00:00.000Z', metadata: { prompt, model },
        });
    }, { prompt, sourceId, base64: fixture.toString('base64'), model: OPENAI_IMAGE_MODEL });
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Image details' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Add image layers', { exact: true }).setInputFiles({ name: 'Overlay.png', mimeType: 'image/png', buffer: fixture });
    await expect(page.locator('.layer-name')).toHaveCount(2);
    const brightness = page.getByRole('slider', { name: 'Brightness', exact: true });
    await brightness.press('Home');
    for (let n = 0; n < 50; n += 1) await brightness.press('ArrowRight');
    await expect(brightness).toHaveValue('50');
    await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: `Open image: ${prompt}`, exact: true })).toHaveCount(2);
    const saved = await page.evaluate(async (sourceId) => {
        const archivePath = '/src/archive/ArchiveStore.ts';
        const { archiveStore } = await import(archivePath);
        const images = await archiveStore.list();
        return { original: images.find((image: { id: string }) => image.id === sourceId), copy: images.find((image: { id: string }) => image.id !== sourceId) };
    }, sourceId);
    expect(saved.original.url).toBe(`data:image/png;base64,${fixture.toString('base64')}`);
    expect(saved.original.layerStack).toBeUndefined();
    expect(saved.copy.layerStack.layers).toHaveLength(2);
    expect(saved.copy.layerStack.adjustments.brightness).toBe(50);

    // Newest copy comes first; the source stays unselected while its lineage is included.
    await page.getByRole('button', { name: `Select image: ${prompt}`, exact: true }).first().click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download as ZIP', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/^aura-collection-\d+\.zip$/);
    const zipPath = testInfo.outputPath('downloaded-archive.zip');
    await download.saveAs(zipPath);
    const zipBytes = await readFile(zipPath);
    const zip = await JSZip.loadAsync(zipBytes);
    const manifest: ArchiveManifest = JSON.parse(await zip.file('archive-manifest.json')!.async('text'));
    const lineage: LineageManifest = JSON.parse(await zip.file('lineage-manifest.json')!.async('text'));
    await writeFile(testInfo.outputPath('archive-manifest.json'), JSON.stringify(manifest, null, 2));
    await writeFile(testInfo.outputPath('lineage-manifest.json'), JSON.stringify(lineage, null, 2));
    expect(manifest.version).toBe(1);
    expect(manifest.images).toHaveLength(1);
    const image = manifest.images[0];
    expect(image).toMatchObject({
        id: saved.copy.id, prompt, model: OPENAI_IMAGE_MODEL, favorite: true,
        actualParameters: { revisedPrompt: 'Four vivid colored squares', size: '128x128', quality: 'high', elapsedMs: 1200 },
        costLedger: { items: [{ amountUsd: 0.04 }] },
        layerStack: { adjustments: { brightness: 50, contrast: 100, saturation: 100, filter: 'none' } },
    });
    expect(await zip.file(image.imageFileName!)!.async('nodebuffer')).toEqual(Buffer.from(saved.copy.url.split(',')[1], 'base64'));
    expect(image.references).toHaveLength(1);
    expect(image.layerStack!.layers).toHaveLength(2);
    for (const file of [...image.references.map((reference) => reference.fileName), ...image.layerStack!.layers.map((layer) => layer.assetFileName)]) {
        expect(await zip.file(file)!.async('nodebuffer')).toEqual(fixture);
    }
    expect(zip.file(`aura-${sourceId}.png`)).toBeNull();
    expect(lineage.version).toBe(1);
    expect(lineage.steps).toEqual([
        expect.objectContaining({ id: 'zip-source-generation', archiveImageId: sourceId, stepType: 'generation', parentStepId: null }),
        expect.objectContaining({ archiveImageId: saved.copy.id, stepType: 'save-as-copy', parentStepId: 'zip-source-generation' }),
    ]);
    await page.screenshot({ path: testInfo.outputPath('download-selection.png'), fullPage: true });

    const restoredContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await restoredContext.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    try {
        const restored = await restoredContext.newPage();
        await restored.goto('/');
        const summary = await restored.evaluate(async (bytes) => {
            const transferPath = '/src/archive/ArchiveTransfer.ts';
            const archivePath = '/src/archive/ArchiveStore.ts';
            const lineagePath = '/src/lineage/LineageStore.ts';
            const { importArchiveZip } = await import(transferPath);
            const { archiveStore } = await import(archivePath);
            const { lineageStore } = await import(lineagePath);
            if ((await archiveStore.list()).length) throw new Error('Restore must start with an empty archive');
            return importArchiveZip(new Uint8Array(bytes), { archiveStore, lineageStore });
        }, Array.from(zipBytes));
        expect(summary).toEqual({
            importedImageIds: [saved.copy.id], importedStepIds: lineage.steps.map((step) => step.id),
            brokenParentReferences: [], missingAssetFiles: [],
        });
        await restored.reload();
        await restored.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
        await restored.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
        const details = restored.getByRole('dialog', { name: 'Image details' });
        await expect(details.locator('.modal-image')).toHaveJSProperty('naturalWidth', 128);
        await details.getByRole('button', { name: 'Edit', exact: true }).click();
        await expect(restored.locator('.layer-name')).toHaveCount(2);
        await expect(restored.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('50');
        await restored.locator('.layer-name').filter({ hasText: 'Overlay.png' }).click();
        await expect(restored.getByRole('slider', { name: 'Overlay.png opacity', exact: true })).toHaveValue('100');
        await restored.getByRole('slider', { name: 'Brightness', exact: true }).press('ArrowRight');
        await restored.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(restored.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
        await restored.reload();
        await restored.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
        await restored.getByRole('dialog', { name: 'Image details' }).getByRole('button', { name: 'Edit', exact: true }).click();
        await expect(restored.locator('.layer-name')).toHaveCount(2);
        await expect(restored.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('51');
        await restored.screenshot({ path: testInfo.outputPath('restored-editable-copy.png'), fullPage: true });
    } finally {
        await restoredContext.close();
    }
});
