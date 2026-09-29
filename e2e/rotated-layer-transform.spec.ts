import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const cases = [
    { name: 'right angle', x: 250, y: 120, rotation: 90, mask: false, whole: false },
    { name: 'oblique masked layer', x: 150.25, y: 120.75, rotation: 37, mask: true, whole: false },
    { name: 'composition edge', x: -40, y: 120, rotation: 90, mask: false, whole: false },
    { name: 'whole composition at edge', x: -40, y: 120, rotation: 90, mask: false, whole: true },
    { name: 'base and rotated selection', x: -40, y: 120, rotation: 90, mask: false, whole: false },
];

async function editorPixels(page: Page) {
    const canvas = page.locator('.editor-stage canvas').first();
    await expect(canvas).toHaveJSProperty('width', 500);
    await expect(canvas).toHaveJSProperty('height', 500);
    return canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected Editor canvas');
        const context = element.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        return Array.from(context.getImageData(0, 0, element.width, element.height).data);
    });
}

async function openEditor(page: Page) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: 'Open image: Rotated artwork', exact: true }).click();
    await page.getByRole('dialog', { name: 'Image details' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.editor-stage canvas').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as copy', exact: true })).toBeEnabled();
}

for (const scenario of cases) {
    test(`rotated artwork survives AI and save/reopen: ${scenario.name}`, async ({ page, context, baseURL }, testInfo) => {
        const uploads: { name: string; data: Buffer }[] = [];
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await context.route('**/*', async (route) => {
            const request = route.request();
            if (request.url() === 'https://api.openai.com/v1/images/edits') {
                const form = await new Response(new Uint8Array(request.postDataBuffer() ?? []), {
                    headers: { 'content-type': request.headers()['content-type'] },
                }).formData();
                for (const name of ['image[]', 'mask']) {
                    for (const value of form.getAll(name)) {
                        if (typeof value !== 'string') uploads.push({ name, data: Buffer.from(await value.arrayBuffer()) });
                    }
                }
                const source = uploads.find((upload) => upload.name === 'image[]');
                if (!source) throw new Error('Missing selected source');
                await route.fulfill({ json: { data: [{ b64_json: source.data.toString('base64') }] } });
            } else if (new URL(request.url()).origin === baseURL) {
                await route.continue();
            } else {
                await route.abort();
            }
        });
        await page.goto('/');
        await page.evaluate(async (geometry) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 500;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas unavailable');
            drawing.fillStyle = '#eeeeee';
            drawing.fillRect(0, 0, 500, 500);
            const base = canvas.toDataURL();
            canvas.width = 200;
            canvas.height = 220;
            drawing.fillStyle = '#ff0000';
            drawing.fillRect(0, 0, 200, 220);
            drawing.fillStyle = '#0000ff';
            drawing.fillRect(0, 0, 200, 10);
            drawing.fillStyle = '#00ff00';
            drawing.fillRect(0, 210, 200, 10);
            const artwork = canvas.toDataURL();
            const modulePath = '/src/archive/ArchiveStore.ts';
            const { archiveStore } = await import(modulePath);
            localStorage.setItem('aura_openapi_key', JSON.stringify('sk-e2e-never-sent'));
            const common = { opacity: 1, blendMode: 'normal', visible: true };
            await archiveStore.save({
                id: 'rotation-test', url: base, prompt: 'Rotated artwork', timestamp: '2026-09-29',
                model: 'gpt-image-2.5-flare', width: 500, height: 500, quality: 'medium', aspectRatio: '500x500', background: 'auto',
                layerStack: { canvasWidth: 500, canvasHeight: 500, layers: [
                    { ...common, id: 'base', name: 'Base', kind: 'base', assetUrl: base, x: 0, y: 0, width: 500, height: 500, rotation: 0, locked: true },
                    { ...common, id: 'rotated', name: 'Rotated', kind: 'uploaded', assetUrl: artwork, x: geometry.x, y: geometry.y, width: 200, height: 220, rotation: geometry.rotation, locked: false },
                ] },
            });
        }, scenario);
        await page.reload();
        await openEditor(page);
        const expected = await page.evaluate(async () => {
            const storePath = '/src/archive/ArchiveStore.ts';
            const renderPath = '/src/editor/renderLayerStack.ts';
            const { archiveStore } = await import(storePath);
            const { renderLayerStackToDataUrl } = await import(renderPath);
            const image = await archiveStore.get('rotation-test');
            return renderLayerStackToDataUrl(image.layerStack, { brightness: 100, contrast: 100, saturation: 100, filter: 'none' });
        });
        const expectedPixels = await page.evaluate(async (url) => {
            const image = await createImageBitmap(await (await fetch(url)).blob());
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 500;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas unavailable');
            drawing.drawImage(image, 0, 0);
            return Array.from(drawing.getImageData(0, 0, 500, 500).data);
        }, expected);
        const assertPlacement = async () => {
            await expect.poll(async () => {
                const actual = await editorPixels(page);
                return actual.filter((value, index) => Math.abs(value - expectedPixels[index]) > 2).length;
            }, { message: 'Editor artwork must retain its saved composition position' }).toBeLessThan(1500);
        };
        await assertPlacement();
        await page.screenshot({ path: testInfo.outputPath('before.png'), fullPage: true });

        if (!scenario.whole) await page.locator('.layer-name').filter({ hasText: 'Rotated' }).click({ modifiers: scenario.name === 'base and rotated selection' ? ['Shift'] : [] });
        if (scenario.name === 'right angle') {
            const stage = await page.locator('.editor-stage').boundingBox();
            if (!stage) throw new Error('Missing Editor stage');
            const readLayer = () => page.evaluate(async () => {
                const modulePath = '/src/editor/editorDraftStorage.ts';
                const { loadEditorDraft } = await import(modulePath);
                const draft = await loadEditorDraft('rotation-test');
                return draft?.layerStack.layers.find((layer: { id: string }) => layer.id === 'rotated');
            });
            await page.mouse.move(stage.x + 350, stage.y + 230);
            await page.mouse.down();
            await page.mouse.move(stage.x + 370, stage.y + 245, { steps: 8 });
            await page.mouse.up();
            await expect.poll(readLayer).toMatchObject({ x: 270, y: 135, width: 200, height: 220, rotation: 90 });
            await page.getByRole('button', { name: 'Undo', exact: true }).click();
            await expect.poll(readLayer).toMatchObject({ x: 250, y: 120 });
            await page.mouse.move(stage.x + 240, stage.y + 330);
            await page.mouse.down();
            await page.mouse.move(stage.x + 218, stage.y + 350, { steps: 8 });
            await page.mouse.up();
            await expect.poll(async () => (await readLayer())?.width).toBeGreaterThan(210);
            const resized = await readLayer();
            expect(resized.width / resized.height).toBeCloseTo(200 / 220);
            expect(resized.x + resized.width / 2 + resized.height / 2).toBeCloseTo(460);
            expect(resized.y + resized.height / 2 - resized.width / 2).toBeCloseTo(130);
            await page.getByRole('button', { name: 'Undo', exact: true }).click();
            await expect.poll(readLayer).toMatchObject({ x: 250, y: 120, width: 200, height: 220, rotation: 90 });
        }
        await page.locator('.ai-edit-section > summary').click();
        await page.locator('.editor-container').getByLabel('Image model', { exact: true }).selectOption('gpt-image-2.5-flare');
        let maskPixels: number[] | undefined;
        if (scenario.mask) {
            await page.getByRole('button', { name: 'Mask', exact: true }).click();
            const maskCanvas = page.locator('.transform-mask-canvas');
            await expect(maskCanvas).toBeVisible();
            await maskCanvas.click({ position: { x: 24, y: 24 } });
            maskPixels = await maskCanvas.evaluate((element) => {
                if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected mask canvas');
                return Array.from(element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data);
            });
            await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
            await expect(page.getByRole('dialog', { name: 'Transform mask', exact: true })).toBeHidden();
        }
        await page.getByLabel('AI transformation prompt').fill('Return selected artwork unchanged');
        await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
        await expect(page.getByLabel('AI result name', { exact: true })).toBeVisible();
        expect(uploads.filter((upload) => upload.name === 'image[]')).toHaveLength(scenario.whole ? 1 : 2);
        for (const [index, upload] of uploads.entries()) await writeFile(testInfo.outputPath(`request-${index}.png`), upload.data);
        const source = uploads[0].data.toString('base64');
        const sourcePixels = await page.evaluate(async (base64) => {
            const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas unavailable');
            drawing.drawImage(image, 0, 0);
            const pixels = drawing.getImageData(0, 0, image.width, image.height).data;
            let red = 0, blue = 0, green = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0) red++;
                if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 255) blue++;
                if (pixels[i] === 0 && pixels[i + 1] === 255 && pixels[i + 2] === 0) green++;
            }
            return { width: image.width, height: image.height, red, blue, green };
        }, source);
        if (scenario.name === 'base and rotated selection') {
            expect(sourcePixels).toMatchObject({ width: 550, height: 500, red: 40000, blue: 2000, green: 2000 });
        } else if (scenario.rotation === 90 && !scenario.whole) {
            expect(sourcePixels).toEqual({ width: 220, height: 200, red: 40000, blue: 2000, green: 2000 });
        } else if (scenario.whole) {
            expect(sourcePixels).toMatchObject({ width: 500, height: 500 });
        } else {
            expect(sourcePixels.blue).toBeGreaterThan(1500);
            expect(sourcePixels.green).toBeGreaterThan(1500);
        }
        if (maskPixels) {
            const mask = uploads.find((upload) => upload.name === 'mask');
            expect(mask).toBeDefined();
            const decoded = await page.evaluate(async (base64) => {
                const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const drawing = canvas.getContext('2d')!;
                drawing.drawImage(image, 0, 0);
                return { width: image.width, height: image.height, pixels: Array.from(drawing.getImageData(0, 0, image.width, image.height).data) };
            }, mask!.data.toString('base64'));
            expect([decoded.width, decoded.height]).toEqual([sourcePixels.width, sourcePixels.height]);
            expect(decoded.pixels).toEqual(maskPixels);
        }
        await page.locator('.layer-name').filter({ hasText: 'Base' }).click();
        await assertPlacement();
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open image: Rotated artwork', exact: true })).toBeVisible();
        await page.reload();
        await openEditor(page);
        await assertPlacement();
        await page.screenshot({ path: testInfo.outputPath('reopened.png'), fullPage: true });
        await writeFile(testInfo.outputPath('pixels.json'), JSON.stringify({ scenario, sourcePixels, errors }, null, 2));
        expect(errors).toEqual([]);
    });
}
