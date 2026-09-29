import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const prompt = 'Four colored squares for the durable archive test';
const model = 'gpt-image-2.5-sunburst';
const imageBase64 = readFileSync(new URL('./fixtures/four-colors.png', import.meta.url)).toString('base64');

test('generated image survives Save to Archive and a full reload', async ({ page, context, baseURL }, testInfo) => {
    // Only the provider boundary is replaced; unexpected external requests never leave the browser.
    await context.route('**/*', async (route) => {
        const request = route.request();
        if (request.url() === 'https://api.openai.com/v1/images/generations') {
            expect(request.method()).toBe('POST');
            expect(request.postDataJSON()).toMatchObject({ prompt, model, n: 1 });
            await route.fulfill({ json: { data: [{ b64_json: imageBase64 }] } });
        } else if (new URL(request.url()).origin === baseURL) {
            await route.continue();
        } else {
            await route.abort();
        }
    });

    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('textbox', { name: 'OpenAI API Key' }).fill('sk-e2e-fake-key');
    await page.locator('section').filter({ has: page.getByRole('heading', { name: 'OpenAI API Key' }) })
        .getByRole('button', { name: 'Save key' }).click();
    await navigation.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByLabel('Image model', { exact: true }).selectOption(model);
    await page.getByLabel('Prompt', { exact: true }).fill(prompt);
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    const generated = page.getByRole('img', { name: 'Generated result', exact: true });
    await expect(generated).toBeVisible();
    await expect(generated).toHaveJSProperty('naturalWidth', 128);
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved to Archive', exact: true })).toBeDisabled();
    await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: `Open image: ${prompt}`, exact: true })).toHaveCount(1);

    await page.reload();
    await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
    const archived = page.getByRole('button', { name: `Open image: ${prompt}`, exact: true });
    await expect(archived).toHaveCount(1);
    await archived.click();
    const details = page.getByRole('dialog', { name: 'Image details' });
    await expect(details.locator('.prompt-container p')).toHaveText(prompt);
    await expect(details.locator('.info-cell').filter({ hasText: 'MODEL' }).locator('span'))
        .toHaveText('GPT Image 2.5 Sunburst');
    const restored = details.locator('.modal-image');
    await expect(restored).toBeVisible();
    await expect(restored).toHaveJSProperty('naturalWidth', 128);
    await expect(restored).toHaveJSProperty('naturalHeight', 128);
    const pixelHash = await restored.evaluate(async (element) => {
        if (!(element instanceof HTMLImageElement)) throw new Error('Expected the restored archive image');
        const canvas = document.createElement('canvas');
        canvas.width = element.naturalWidth;
        canvas.height = element.naturalHeight;
        const drawing = canvas.getContext('2d');
        if (!drawing) throw new Error('Canvas is unavailable');
        drawing.drawImage(element, 0, 0);
        const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
        const digest = await crypto.subtle.digest('SHA-256', pixels);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    });
    // SHA-256 of the fixture's decoded RGBA pixels, independent of PNG encoding.
    expect(pixelHash).toBe('ac404e69ccd2cd1c7e4e77761d3aa366621d02de86ba70ceab609934b9541ee7');
    await details.screenshot({ path: testInfo.outputPath('restored-image.png') });
});
