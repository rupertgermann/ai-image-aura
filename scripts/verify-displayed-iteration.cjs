const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const origin = process.argv[2] || 'http://localhost:5173';
const output = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'aura-displayed-iteration'));
const results = [];

async function scenario(browser, kind) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
        await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await page.goto(origin);
        const colors = await page.evaluate(async kind => {
            const { archiveStore } = await import('/src/archive/ArchiveStore.ts');
            const { lineageStore } = await import('/src/lineage/LineageStore.ts');
            const colors = ['#ff0000', '#00ff00', '#0000ff'].map(color => {
                const canvas = document.createElement('canvas');
                canvas.width = 96;
                canvas.height = 72;
                const drawing = canvas.getContext('2d');
                drawing.fillStyle = color;
                drawing.fillRect(0, 0, 96, 72);
                return canvas.toDataURL('image/png');
            });
            const fields = { quality: '768', aspectRatio: '4:3', background: 'auto', model: 'qwen-image-2.1', width: 96, height: 72 };
            await archiveStore.save({ ...fields, id: 'iteration-2', url: colors[1], prompt: 'Iteration two', timestamp: '2026-09-01T00:00:02.000Z' });
            await archiveStore.save({
                ...fields, id: 'iteration-3', url: colors[2], prompt: 'Iteration three', timestamp: '2026-09-01T00:00:03.000Z',
                layerStack: { canvasWidth: 96, canvasHeight: 72, layers: [{
                    id: 'latest-base', name: 'Base', kind: 'base', assetUrl: colors[2], x: 0, y: 0,
                    width: 96, height: 72, rotation: 0, opacity: 1, blendMode: 'normal', visible: true, locked: true,
                }] },
            });
            if (kind !== 'no-history') {
                for (let index = 0; index < colors.length; index++) {
                    await lineageStore.save({
                        id: `step-${index + 1}`, archiveImageId: `iteration-${index + 1}`,
                        parentStepId: index ? `step-${index}` : null, stepType: 'autopilot-iteration',
                        timestamp: `2026-09-01T00:00:0${index + 1}.000Z`,
                        metadata: { ...fields, iterationNumber: index + 1, prompt: `Iteration ${index + 1}`,
                            outputImageDataUrl: kind === 'missing' && index === 0 ? undefined : colors[index] },
                    });
                }
            }
            return colors;
        }, kind);
        await page.reload();
        await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
        await page.getByRole('button', { name: 'Open image: Iteration three', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Image details' });
        if (kind === 'no-history') {
            await expect(dialog.getByText('No history recorded', { exact: true })).toBeVisible();
        } else {
            await expect(dialog.locator('.lineage-entry')).toHaveCount(3);
            const index = kind === 'archived' ? 1 : kind === 'latest' ? 2 : 0;
            await dialog.locator('.lineage-entry').nth(index).getByRole('button', { name: 'Autopilot Iteration', exact: true }).click();
        }
        const selectedIndex = kind === 'snapshot' ? 0 : kind === 'archived' ? 1 : 2;
        await expect(dialog.locator('.modal-image')).toHaveAttribute('src', colors[selectedIndex]);
        await dialog.screenshot({ path: path.join(output, `${kind}-selected.png`) });
        const downloadPromise = page.waitForEvent('download');
        await dialog.getByRole('button', { name: 'Download', exact: true }).click();
        const download = await downloadPromise;
        const downloadPath = path.join(output, `${kind}-download.png`);
        await download.saveAs(downloadPath);
        const downloaded = await fs.readFile(downloadPath);
        const downloadMatches = downloaded.equals(Buffer.from(colors[selectedIndex].split(',')[1], 'base64'));

        await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
        const canvas = page.locator('.canvas-area .konvajs-content canvas').first();
        await expect(canvas).toBeVisible();
        const expectedPixel = [[255, 0, 0], [0, 255, 0], [0, 0, 255]][selectedIndex];
        let editorMatches = true;
        try {
            await expect.poll(() => canvas.evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data).slice(0, 3)), { timeout: 3000 }).toEqual(expectedPixel);
        } catch { editorMatches = false; }
        await page.screenshot({ path: path.join(output, `${kind}-editor.png`), animations: 'disabled' });
        assert.deepEqual(pageErrors, [], 'No browser errors');
        const result = { kind, downloadMatches, editorMatches, passed: downloadMatches && editorMatches };
        results.push(result);
        console.log(JSON.stringify(result));
    } catch (error) {
        results.push({ kind, passed: false, error: error.message });
        console.error(`${kind}: ${error.message}`);
        await page.screenshot({ path: path.join(output, `${kind}-error.png`) });
    } finally {
        await context.tracing.stop({ path: path.join(output, `${kind}-trace.zip`) });
        await context.close();
    }
}

(async () => {
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const kind of ['snapshot', 'archived', 'latest', 'no-history', 'missing']) await scenario(browser, kind);
        await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(results, null, 2));
        assert(results.every(result => result.passed), `Displayed iteration checks failed; see ${output}`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
