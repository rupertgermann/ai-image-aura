import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const model = 'gpt-image-2.5-flare';
const prompt = 'Editor adjustment pixels';

async function seedEditor(page: Page, contrast: boolean, selectedLayer: boolean) {
    await page.goto('/');
    const assets = await page.evaluate((contrast) => {
        function asset(gray: number) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 128;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas unavailable');
            drawing.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
            drawing.fillRect(0, 0, 128, 128);
            return canvas.toDataURL().split(',')[1];
        }
        return { base: asset(contrast ? 100 : 200), overlay: asset(contrast ? 200 : 100) };
    }, contrast);
    await page.route('https://api.openai.com/v1/images/generations', (route) => route.fulfill({
        json: { data: [{ b64_json: assets.base }] },
    }));
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('OpenAI API Key', { exact: true }).fill('synthetic-key-never-sent');
    await page.locator('section').filter({ has: page.getByRole('heading', { name: 'OpenAI API Key', exact: true }) })
        .getByRole('button', { name: 'Save key', exact: true }).click();
    await navigation.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByLabel('Prompt', { exact: true }).fill(prompt);
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved to Archive', exact: true })).toBeDisabled();
    await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Image details' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Add image layers', { exact: true }).setInputFiles({
        name: 'Overlay.png', mimeType: 'image/png', buffer: Buffer.from(assets.overlay, 'base64'),
    });
    await expect(page.locator('.layer-name')).toHaveCount(2);
    if (contrast) {
        await page.getByRole('slider', { name: 'Overlay.png opacity', exact: true }).press('End');
        for (let n = 0; n < 5; n += 1) await page.getByRole('slider', { name: 'Overlay.png opacity', exact: true }).press('PageDown');
        await expect(page.getByRole('slider', { name: 'Overlay.png opacity', exact: true })).toHaveValue('50');
        await page.getByRole('slider', { name: 'Contrast', exact: true }).press('End');
    } else {
        const brightness = page.getByRole('slider', { name: 'Brightness', exact: true });
        await brightness.press('Home');
        for (let n = 0; n < 50; n += 1) await brightness.press('ArrowRight');
        await expect(brightness).toHaveValue('50');
    }
    if (!selectedLayer) await page.locator('.layer-name').filter({ hasText: 'Base' }).click();
}

async function saveAndReadPixels(page: Page) {
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
    const image = page.getByRole('dialog', { name: 'Image details' }).locator('.modal-image');
    await expect(image).toHaveJSProperty('complete', true);
    return image.evaluate((element) => {
        if (!(element instanceof HTMLImageElement) || !element.naturalWidth) throw new Error('Saved bitmap missing');
        const canvas = document.createElement('canvas');
        canvas.width = element.naturalWidth;
        canvas.height = element.naturalHeight;
        const drawing = canvas.getContext('2d');
        if (!drawing) throw new Error('Canvas unavailable');
        drawing.drawImage(element, 0, 0);
        return [0.5, 0.95].map((fraction) => Array.from(drawing.getImageData(Math.floor(canvas.width * fraction), Math.floor(canvas.height / 2), 1, 1).data));
    });
}

test.beforeEach(async ({ context, baseURL }) => {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL
        ? route.continue()
        : route.abort());
});

test('Save applies contrast to the composed pixels once', async ({ page }, testInfo) => {
    await seedEditor(page, true, false);
    const pixels = await saveAndReadPixels(page);
    await writeFile(testInfo.outputPath('saved-contrast-pixels.json'), JSON.stringify(pixels));
    expect(pixels).toEqual([[172, 172, 172, 255], [72, 72, 72, 255]]);
});

for (const selectedLayer of [false, true]) {
    test(`An echoed AI edit preserves brightness with ${selectedLayer ? 'a selected layer' : 'the whole composition'}`, async ({ page }, testInfo) => {
        await seedEditor(page, false, selectedLayer);
        await page.route('https://api.openai.com/v1/images/edits', async (route) => {
            const request = route.request();
            const body = request.postDataBuffer();
            if (!body) throw new Error('AI edit body missing');
            const form = await new Response(new Uint8Array(body), { headers: { 'content-type': request.headers()['content-type'] } }).formData();
            const source = form.get('image[]') ?? form.get('image');
            if (!(source instanceof File)) throw new Error('AI edit source missing');
            const b64_json = Buffer.from(await source.arrayBuffer()).toString('base64');
            await route.fulfill({ json: { data: [{ b64_json }] } });
        });
        await page.locator('.ai-edit-section > summary').click();
        await page.locator('.editor-container').getByLabel('Image model', { exact: true }).selectOption(model);
        await page.getByLabel('AI transformation prompt').fill('Return the source image unchanged');
        await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
        await expect(page.locator('.layer-name')).toHaveCount(3);
        await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('50');
        const pixels = await saveAndReadPixels(page);
        await writeFile(testInfo.outputPath('echoed-ai-pixels.json'), JSON.stringify(pixels));
        expect(pixels).toEqual([[50, 50, 50, 255], [100, 100, 100, 255]]);
    });
}
