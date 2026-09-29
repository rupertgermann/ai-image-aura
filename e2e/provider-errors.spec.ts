import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const imageBase64 = readFileSync(new URL('./fixtures/four-colors.png', import.meta.url)).toString('base64');
const prompt = 'Four colored squares for provider error recovery';

async function configureKey(page: Page, provider: 'OpenAI' | 'Google') {
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
    const title = provider === 'Google' ? 'Google (Gemini) API Key' : 'OpenAI API Key';
    await page.getByLabel(title, { exact: true }).fill('synthetic-provider-key');
    await page.locator('section').filter({ has: page.getByRole('heading', { name: title }) })
        .getByRole('button', { name: 'Save key' }).click();
    await navigation.getByRole('button', { name: 'Generate', exact: true }).click();
}

test.beforeEach(async ({ context, baseURL, page }) => {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL
        ? route.continue()
        : route.abort());
    await page.goto('/');
    await configureKey(page, 'OpenAI');
    await page.getByLabel('Prompt', { exact: true }).fill(prompt);
});

test('a failed generation preserves completed batch results and can be retried', async ({ page }, testInfo) => {
    let requests = 0;
    await page.route('https://api.openai.com/v1/images/generations', async (route) => {
        requests += 1;
        if (requests === 2) {
            await route.fulfill({ status: 502, contentType: 'text/plain', body: 'upstream unavailable' });
        } else {
            const count = route.request().postDataJSON().n;
            await route.fulfill({ json: { data: Array.from({ length: count }, () => ({ b64_json: imageBase64 })) } });
        }
    });
    await page.getByLabel('BATCH SIZE', { exact: true }).selectOption('2');
    await page.getByRole('button', { name: 'Generate 2 images', exact: true }).click();
    await expect(page.getByRole('img', { name: /^Generated result/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Save all', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveCount(2);
    await page.getByLabel('BATCH SIZE', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('OpenAI API Error: 502');
    await expect(page.getByRole('img', { name: /^Generated result/ })).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('generation-error-retained-batch.png'), fullPage: true });
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Generated result', exact: true })).toHaveJSProperty('naturalWidth', 128);
    expect(requests).toBe(3);
    await page.screenshot({ path: testInfo.outputPath('generation-retry.png'), fullPage: true });
});

test('a failed AI transform preserves the Editor draft and allows retry', async ({ page }, testInfo) => {
    await page.route('https://api.openai.com/v1/images/generations', (route) => route.fulfill({
        json: { data: [{ b64_json: imageBase64 }] },
    }));
    let edits = 0;
    await page.route('https://api.openai.com/v1/images/edits', async (route) => {
        edits += 1;
        await route.fulfill(edits === 1
            ? { status: 502, contentType: 'text/plain', body: 'upstream unavailable' }
            : { json: { data: [{ b64_json: imageBase64 }] } });
    });
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved to Archive', exact: true })).toBeDisabled();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: `Open image: ${prompt}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Image details' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('slider', { name: 'Brightness', exact: true }).press('End');
    const brightness = await page.getByRole('slider', { name: 'Brightness', exact: true }).inputValue();
    expect(brightness).not.toBe('100');
    await page.getByRole('textbox', { name: 'AI transformation prompt' }).fill('Keep the colored squares');
    await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('OpenAI API Error: 502');
    await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue(brightness);
    await expect(page.getByRole('textbox', { name: 'AI transformation prompt' })).toHaveValue('Keep the colored squares');
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await expect(page.locator('.layer-name')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('editor-error-retained-draft.png'), fullPage: true });
    await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.layer-name')).toHaveCount(2);
    await expect(page.getByRole('textbox', { name: 'AI transformation prompt' })).toHaveValue('');
    expect(edits).toBe(2);
    await page.screenshot({ path: testInfo.outputPath('editor-retry.png'), fullPage: true });
});

test('malformed Gemini reasoning shows a deliberate error and can be retried', async ({ page }, testInfo) => {
    await configureKey(page, 'Google');
    let requests = 0;
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        requests += 1;
        await route.fulfill({ json: requests === 1
            ? { candidates: [null] }
            : { candidates: [{ content: { parts: [{ text: 'Four colored squares on paper' }] } }] } });
    });
    await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
    await page.getByLabel('Reasoning model', { exact: true }).selectOption('gemini-2.5-flash');
    await page.getByLabel('Goal', { exact: true }).fill('Keep the colored squares');
    await page.getByRole('button', { name: 'Create starting prompt', exact: true }).click();
    await expect(page.getByText('Malformed response from Google Gemini', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Starting prompt', { exact: true })).toHaveValue(prompt);
    await page.screenshot({ path: testInfo.outputPath('gemini-error.png'), fullPage: true });
    await page.getByRole('button', { name: 'Create starting prompt', exact: true }).click();
    await expect(page.getByLabel('Starting prompt', { exact: true })).toHaveValue('Four colored squares on paper');
    await expect(page.getByText('Malformed response from Google Gemini', { exact: true })).toHaveCount(0);
    expect(requests).toBe(2);
    await page.screenshot({ path: testInfo.outputPath('gemini-retry.png'), fullPage: true });
});
