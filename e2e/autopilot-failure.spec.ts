import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const imageBase64 = readFileSync(new URL('./fixtures/four-colors.png', import.meta.url)).toString('base64');
const prompt = 'Keep the completed Autopilot image';

test('a failed evaluation leaves the generated image available to save', async ({ page, context, baseURL }, testInfo) => {
    let generations = 0;
    let evaluations = 0;
    await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (url === 'https://api.openai.com/v1/images/generations') {
            generations += 1;
            await route.fulfill({ json: { data: [{ b64_json: imageBase64 }] } });
        } else if (url === 'https://api.openai.com/v1/responses') {
            evaluations += 1;
            await route.fulfill({ status: 429, json: { error: { message: 'Synthetic evaluation quota exceeded' } } });
        } else if (new URL(url).origin === baseURL) {
            await route.continue();
        } else {
            await route.abort();
        }
    });
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('OpenAI API Key', { exact: true }).fill('synthetic-provider-key');
    await page.locator('section').filter({ has: page.getByRole('heading', { name: 'OpenAI API Key', exact: true }) })
        .getByRole('button', { name: 'Save key', exact: true }).click();
    await navigation.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
    await page.getByLabel('Starting prompt', { exact: true }).fill(prompt);
    await page.getByLabel('Goal', { exact: true }).fill('Keep four colored squares');
    await page.getByRole('button', { name: 'Run Autopilot', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Run', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Generated result', exact: true })).toHaveJSProperty('naturalWidth', 128);
    expect(generations).toBe(1);
    expect(evaluations).toBe(1);
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved to Archive', exact: true })).toBeDisabled();
    await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: `Open image: ${prompt}`, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('retained-autopilot-image.png'), fullPage: true });
});
