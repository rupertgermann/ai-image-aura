import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const imageId = 'editor-import-mask';
const prompt = 'Editor import and mask';

async function openEditor(page: Page) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Image details' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save as copy', exact: true })).toBeEnabled();
}

async function seedEditor(page: Page) {
    await page.goto('/');
    const dataUrl = await page.evaluate(async ({ imageId, prompt }) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.fillStyle = '#888888';
        context.fillRect(0, 0, 128, 128);
        const url = canvas.toDataURL();
        const modulePath = '/src/archive/ArchiveStore.ts';
        const { archiveStore } = await import(modulePath);
        localStorage.setItem('aura_openapi_key', JSON.stringify('synthetic-never-sent'));
        await archiveStore.save({ id: imageId, url, prompt, model: 'gpt-image-2.5-flare', timestamp: '2026-10-24',
            width: 128, height: 128, quality: 'medium', aspectRatio: '128x128', background: 'auto' });
        return url;
    }, { imageId, prompt });
    await page.reload();
    await openEditor(page);
    return dataUrl;
}

async function delayImports(page: Page) {
    await page.evaluate(() => {
        const read = File.prototype.arrayBuffer;
        const pending = new Map<string, () => Promise<void>>();
        File.prototype.arrayBuffer = function () {
            if (!this.name.startsWith('delayed-')) return read.call(this);
            return new Promise<ArrayBuffer>((resolve) => {
                pending.set(this.name, async () => { resolve(await read.call(this)); });
            });
        };
        document.addEventListener('release-import', (event) => {
            if (event instanceof CustomEvent) void pending.get(event.detail)?.();
        });
    });
}

async function releaseImport(page: Page, name: string) {
    await page.evaluate((name) => document.dispatchEvent(new CustomEvent('release-import', { detail: name })), name);
}

async function paintMask(page: Page) {
    await page.getByRole('button', { name: 'Mask', exact: true }).click();
    const canvas = page.locator('.transform-mask-canvas');
    await expect(canvas).toHaveJSProperty('width', 128);
    await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
    await expect(page.getByText('Paint a mask before applying it.', { exact: true })).toBeVisible();
    await canvas.click({ position: { x: 64, y: 64 } });
    await canvas.click({ position: { x: 32, y: 32 } });
    await page.getByRole('button', { name: 'Eraser', exact: true }).click();
    await canvas.click({ position: { x: 32, y: 32 } });
    await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Transform mask' })).toBeHidden();
}

test.beforeEach(async ({ context, baseURL }) => {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

test('pending layer import preserves adjustments, undo, reload and archive save', async ({ page }, testInfo) => {
    const dataUrl = await seedEditor(page);
    await delayImports(page);
    await page.getByLabel('Add image layers', { exact: true }).setInputFiles({ name: 'delayed-layer.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
    await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('150');
    await releaseImport(page, 'delayed-layer.png');
    await expect(page.locator('.layer-name')).toHaveCount(2);
    await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('150');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.layer-name')).toHaveCount(1);
    await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('150');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.layer-name')).toHaveCount(2);
    await page.reload();
    await openEditor(page);
    await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('150');
    await expect(page.locator('.layer-name')).toHaveCount(2);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
    await openEditor(page);
    await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('150');
    await expect(page.locator('.layer-name')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('import-saved-reopened.png'), fullPage: true });
});

for (const order of [['a', 'b'], ['b', 'a']]) {
    test(`overlapping reference imports preserve removal and completion order ${order.join('-')}`, async ({ page }, testInfo) => {
        const dataUrl = await seedEditor(page);
        await page.locator('.ai-edit-section > summary').click();
        const upload = page.locator('.editor-container').getByLabel('Add reference images', { exact: true });
        const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
        await upload.setInputFiles({ name: 'existing.png', mimeType: 'image/png', buffer });
        await expect(page.getByRole('img', { name: 'Reference', exact: true })).toHaveCount(1);
        await delayImports(page);
        for (const name of ['a', 'b']) await upload.setInputFiles({ name: `delayed-${name}.png`, mimeType: 'image/png', buffer });
        await page.getByRole('button', { name: 'Remove reference 1', exact: true }).click();
        for (const [index, name] of order.entries()) {
            await releaseImport(page, `delayed-${name}.png`);
            await expect(page.getByRole('img', { name: 'Reference', exact: true })).toHaveCount(index + 1);
        }
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(page.getByRole('img', { name: 'Reference', exact: true })).toHaveCount(1);
        await page.getByRole('button', { name: 'Redo', exact: true }).click();
        await expect(page.getByRole('img', { name: 'Reference', exact: true })).toHaveCount(2);
        await page.screenshot({ path: testInfo.outputPath('reference-imports.png'), fullPage: true });
    });
}

for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
    test(`painted and replayed mask selects editable pixels for ${model}`, async ({ page }, testInfo) => {
        await seedEditor(page);
        const masks: string[] = [];
        await page.route('https://api.openai.com/v1/images/edits', async (route) => {
            const request = route.request();
            const form = await new Response(new Uint8Array(request.postDataBuffer() ?? []), { headers: { 'content-type': request.headers()['content-type'] } }).formData();
            const source = form.get('image[]');
            const mask = form.get('mask');
            if (!(source instanceof File) || !(mask instanceof File)) throw new Error('Missing edit source/mask');
            masks.push(Buffer.from(await mask.arrayBuffer()).toString('base64'));
            await route.fulfill({ json: { data: [{ b64_json: Buffer.from(await source.arrayBuffer()).toString('base64') }] } });
        });
        await page.locator('.ai-edit-section > summary').click();
        await page.locator('.editor-container').getByLabel('Image model', { exact: true }).selectOption(model);
        await paintMask(page);
        await page.getByLabel('AI transformation prompt').fill('Change only the painted area');
        await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
        await expect(page.getByLabel('AI result name', { exact: true })).toBeVisible();
        const inspectMask = (base64: string) => page.evaluate(async (base64) => {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width; canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas unavailable');
            context.drawImage(bitmap, 0, 0); bitmap.close();
            return { width: canvas.width, height: canvas.height, painted: context.getImageData(64, 64, 1, 1).data[3], erased: context.getImageData(32, 32, 1, 1).data[3], untouched: context.getImageData(4, 4, 1, 1).data[3] };
        }, base64);
        expect(await inspectMask(masks[0])).toEqual({ width: 128, height: 128, painted: 0, erased: 255, untouched: 255 });
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
        await page.evaluate(async ({ imageId, model }) => {
            const storePath = '/src/archive/ArchiveStore.ts';
            const clientPath = '/src/utils/openai.ts';
            const filePath = '/src/utils/file.ts';
            const lineagePath = '/src/lineage/LineageStore.ts';
            const replayPath = '/src/lineage/replayLineageStep.ts';
            const { archiveStore } = await import(storePath);
            const { openAiImageClient } = await import(clientPath);
            const { dataURLtoFile } = await import(filePath);
            const image = await archiveStore.get(imageId);
            const { lineageStore } = await import(lineagePath);
            const { buildEditorReplay } = await import(replayPath);
            const steps = await lineageStore.getByArchiveImageId(imageId);
            const replay = steps.map(buildEditorReplay).find((replay: { maskImage?: File } | null) => replay?.maskImage);
            if (!replay?.maskImage) throw new Error('Saved lineage mask missing');
            await openAiImageClient.createImage({ apiKey: 'synthetic-never-sent', model, prompt: 'Replay saved mask', referenceImages: [dataURLtoFile(image.url, 'source.png')], maskImage: replay.maskImage });
        }, { imageId, model });
        expect(masks).toHaveLength(2);
        expect(await inspectMask(masks[1])).toEqual(await inspectMask(masks[0]));
        await writeFile(testInfo.outputPath('outgoing-mask.png'), Buffer.from(masks[0], 'base64'));
        await page.screenshot({ path: testInfo.outputPath('mask-saved.png'), fullPage: true });
    });
}

test('a restored mask with different dimensions is rejected before the provider request', async ({ page }) => {
    await seedEditor(page);
    let requests = 0;
    await page.route('https://api.openai.com/v1/images/edits', async (route) => {
        requests++;
        await route.fulfill({ json: { data: [{ b64_json: 'unused' }] } });
    });
    const error = await page.evaluate(async () => {
        const clientPath = '/src/utils/openai.ts';
        const { openAiImageClient } = await import(clientPath);
        const canvas = document.createElement('canvas');
        const blob = () => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG unavailable'))));
        canvas.width = canvas.height = 128;
        const source = new File([await blob()], 'source.png', { type: 'image/png' });
        canvas.width = 64;
        const mask = await blob();
        try {
            await openAiImageClient.createImage({ apiKey: 'synthetic-never-sent', prompt: 'Replay', referenceImages: [source], maskImage: mask });
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    });
    expect(error).toBe('Transform mask dimensions must match the source image. Repaint the mask for this target.');
    expect(requests).toBe(0);
});

async function addMaskTarget(page: Page) {
    const asset = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 32;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.fillStyle = '#ff3333'; context.fillRect(0, 0, 64, 32);
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByLabel('Add image layers', { exact: true }).setInputFiles({ name: 'Target.png', mimeType: 'image/png', buffer: Buffer.from(asset, 'base64') });
    await expect(page.locator('.layer-name')).toHaveCount(2);
}

async function applySmallMask(page: Page) {
    await page.getByRole('button', { name: 'Mask', exact: true }).click();
    const canvas = page.locator('.transform-mask-canvas');
    await expect(canvas).toBeVisible();
    await canvas.click();
    await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit Mask', exact: true })).toBeVisible();
}

const clearedMaskMessage = 'Transform target changed. The mask was cleared; repaint it for this target.';

test('changing mask target clears paint visibly and sends the new source without a stale mask', async ({ page }, testInfo) => {
    await seedEditor(page);
    await addMaskTarget(page);
    await page.locator('.layer-name').filter({ hasText: 'Base' }).click();
    await page.locator('.ai-edit-section > summary').click();
    await paintMask(page);
    await page.locator('.layer-name').filter({ hasText: 'Target.png' }).click();
    await expect(page.getByText(clearedMaskMessage, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Mask', exact: true })).toHaveCount(0);
    let submitted = false;
    await page.route('https://api.openai.com/v1/images/edits', async (route) => {
        const request = route.request();
        const form = await new Response(new Uint8Array(request.postDataBuffer() ?? []), { headers: { 'content-type': request.headers()['content-type'] } }).formData();
        expect(form.has('mask')).toBe(false);
        const source = form.get('image[]');
        if (!(source instanceof File)) throw new Error('Source missing');
        submitted = true;
        await route.fulfill({ json: { data: [{ b64_json: Buffer.from(await source.arrayBuffer()).toString('base64') }] } });
    });
    await page.getByLabel('AI transformation prompt').fill('Edit selected target');
    await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
    await expect(page.getByLabel('AI result name', { exact: true })).toBeVisible();
    expect(submitted).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('changed-target.png'), fullPage: true });
});

test('same-target paint survives reopening but target movement, undo and redo clear it', async ({ page }, testInfo) => {
    await seedEditor(page);
    await addMaskTarget(page);
    await page.locator('.ai-edit-section > summary').click();
    await applySmallMask(page);
    await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('120');
    await page.getByRole('button', { name: 'Edit Mask', exact: true }).click();
    await expect.poll(() => page.locator('.transform-mask-canvas').evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error('Canvas missing');
        return element.getContext('2d')?.getImageData(element.width / 2, element.height / 2, 1, 1).data[3];
    })).toBe(255);
    await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
    await page.locator('.layer-name').filter({ hasText: 'Target.png' }).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(clearedMaskMessage, { exact: true })).toBeVisible();
    for (const action of ['Undo', 'Redo']) {
        await applySmallMask(page);
        await page.getByRole('button', { name: action, exact: true }).click();
        await expect(page.getByRole('button', { name: 'Clear Mask', exact: true })).toHaveCount(0);
        await expect(page.getByText(clearedMaskMessage, { exact: true })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('mask-history-invalidation.png'), fullPage: true });
});

test('same-size target switches, actual resize and 180-degree rotation invalidate masks', async ({ page }, testInfo) => {
    await seedEditor(page);
    await page.evaluate(async (imageId) => {
        const storePath = '/src/archive/ArchiveStore.ts';
        const { archiveStore } = await import(storePath);
        const image = await archiveStore.get(imageId);
        const common = { assetUrl: image.url, opacity: 1, visible: true, blendMode: 'normal', rotation: 0 };
        await archiveStore.save({ ...image, width: 500, height: 500, layerStack: { canvasWidth: 500, canvasHeight: 500, layers: [
            { ...common, id: 'base', name: 'Base', kind: 'base', locked: true, x: 0, y: 0, width: 500, height: 500 },
            { ...common, id: 'target-a', name: 'Target A', kind: 'uploaded', locked: false, x: 150, y: 200, width: 200, height: 100 },
            { ...common, id: 'target-b', name: 'Target B', kind: 'uploaded', locked: false, x: 150, y: 200, width: 200, height: 100 },
        ] } });
    }, imageId);
    await page.reload();
    await openEditor(page);
    await page.locator('.ai-edit-section > summary').click();
    await page.locator('.layer-name').filter({ hasText: 'Target A' }).click();
    await applySmallMask(page);
    await page.locator('.layer-name').filter({ hasText: 'Target B' }).click();
    await expect(page.getByText(clearedMaskMessage, { exact: true })).toBeVisible();
    await applySmallMask(page);
    const stage = await page.locator('.editor-stage').boundingBox();
    if (!stage) throw new Error('Editor stage missing');
    await page.mouse.move(stage.x + 350, stage.y + 300);
    await page.mouse.down();
    await page.mouse.move(stage.x + 390, stage.y + 320, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Clear Mask', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await applySmallMask(page);
    await page.mouse.move(stage.x + 250, stage.y + 150);
    await page.mouse.down();
    await page.mouse.move(stage.x + 350, stage.y + 250, { steps: 8 });
    await page.mouse.move(stage.x + 250, stage.y + 350, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(async (imageId) => {
        const modulePath = '/src/editor/editorDraftStorage.ts';
        const { loadEditorDraft } = await import(modulePath);
        const draft = await loadEditorDraft(imageId);
        return Math.abs(draft.layerStack.layers.find((layer: { id: string }) => layer.id === 'target-b').rotation);
    }, imageId)).toBeCloseTo(180);
    await expect(page.getByRole('button', { name: 'Clear Mask', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('mask-rotated-target.png'), fullPage: true });
});

for (const cancellation of ['target change', 'Clear']) {
    test(`a delayed mask apply cannot restore paint after ${cancellation}`, async ({ page }) => {
        await seedEditor(page);
        await addMaskTarget(page);
        await page.locator('.ai-edit-section > summary').click();
        await page.getByRole('button', { name: 'Mask', exact: true }).click();
        await page.locator('.transform-mask-canvas').click();
        await page.evaluate(() => {
            const encode = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
                if (this.classList.contains('transform-mask-canvas')) {
                    document.addEventListener('release-mask', () => encode.call(this, callback, ...args), { once: true });
                } else encode.call(this, callback, ...args);
            };
        });
        await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
        if (cancellation === 'Clear') {
            await page.getByRole('button', { name: 'Clear', exact: true }).click();
            await page.evaluate(() => document.dispatchEvent(new Event('release-mask')));
            await expect(page.getByRole('dialog', { name: 'Transform mask', exact: true })).toBeVisible();
            await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
            await expect(page.getByText('Paint a mask before applying it.', { exact: true })).toBeVisible();
            return;
        }
        await page.getByRole('button', { name: 'Close mask editor', exact: true }).click();
        await page.locator('.layer-name').filter({ hasText: 'Base' }).click();
        await page.evaluate(() => document.dispatchEvent(new Event('release-mask')));
        await page.getByRole('button', { name: 'Mask', exact: true }).click();
        await expect(page.locator('.transform-mask-canvas')).toHaveJSProperty('width', 128);
        await page.getByRole('button', { name: 'Close mask editor', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Clear Mask', exact: true })).toHaveCount(0);
    });

}


test('a delayed target render cannot replace the target after reopening Mask', async ({ page }) => {
    await seedEditor(page);
    await addMaskTarget(page);
    await page.locator('.ai-edit-section > summary').click();
    await page.evaluate(() => {
        const fetchImage = window.fetch;
        const createUrl = URL.createObjectURL;
        let renders = 0;
        let targetUrls = 0;
        URL.createObjectURL = (blob) => {
            document.documentElement.dataset.maskTargetUrls = String(++targetUrls);
            return createUrl(blob);
        };
        window.fetch = async (input, init) => {
            const response = await fetchImage(input, init);
            if (typeof input === 'string' && input.startsWith('data:image/png')) {
                const render = ++renders;
                if (render === 1) {
                    document.documentElement.dataset.pendingMaskTarget = 'true';
                    return new Promise<Response>((resolve) => document.addEventListener('release-target', () => resolve(response), { once: true }));
                }
                if (render === 3) {
                    const read = response.blob.bind(response);
                    response.blob = async () => {
                        const blob = await read();
                        requestAnimationFrame(() => document.dispatchEvent(new Event('old-render-finished')));
                        return blob;
                    };
                }
            }
            return response;
        };
    });
    await page.getByRole('button', { name: 'Mask', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-pending-mask-target', 'true');
    await page.getByRole('button', { name: 'Close mask editor', exact: true }).click();
    await page.locator('.layer-name').filter({ hasText: 'Base' }).click();
    await page.getByRole('button', { name: 'Mask', exact: true }).click();
    await expect(page.locator('.transform-mask-canvas')).toHaveJSProperty('width', 128);
    await page.evaluate(() => new Promise<void>((resolve) => {
        document.addEventListener('old-render-finished', () => resolve(), { once: true });
        document.dispatchEvent(new Event('release-target'));
    }));
    expect(await page.locator('html').getAttribute('data-mask-target-urls')).toBe('1');
    await expect(page.locator('.transform-mask-canvas')).toHaveJSProperty('width', 128);
});

test('Load in Editor rejects a historical mask with different dimensions and does not stretch its paint', async ({ page }, testInfo) => {
    await seedEditor(page);
    await page.evaluate(async (imageId) => {
        const modulePath = '/src/lineage/LineageStore.ts';
        const { lineageStore } = await import(modulePath);
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 32;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.fillStyle = '#ffffff'; context.fillRect(16, 8, 16, 16);
        await lineageStore.save({ archiveImageId: imageId, stepType: 'ai-edit', metadata: {
            editPrompt: 'Replay historical paint', model: 'gpt-image-2.5-flare',
            transformMaskAsset: { assetId: null, mimeType: 'image/png', dataUrl: canvas.toDataURL() },
        } });
    }, imageId);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
    await page.getByRole('button', { name: 'Load in Editor', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit Mask', exact: true })).toBeVisible();
    let requests = 0;
    await page.route('https://api.openai.com/v1/images/edits', async (route) => { requests++; await route.abort(); });
    await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Transform mask dimensions must match the source image.' })).toBeVisible();
    expect(requests).toBe(0);
    await page.getByRole('button', { name: 'Edit Mask', exact: true }).click();
    await expect(page.getByText('Saved mask does not match this target. Paint a new mask.', { exact: true })).toBeVisible();
    const coverage = await page.locator('.transform-mask-canvas').evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error('Canvas missing');
        const pixels = element.getContext('2d')?.getImageData(0, 0, element.width, element.height).data;
        return pixels?.some((value, index) => index % 4 === 3 && value > 0);
    });
    expect(coverage).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('replay-mask-dimension-rejection.png'), fullPage: true });
});
