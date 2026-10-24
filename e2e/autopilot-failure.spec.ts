import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const imageBase64 = readFileSync(new URL('./fixtures/four-colors.png', import.meta.url)).toString('base64');
const prompt = 'Keep the completed Autopilot image';

for (const failedIteration of [1, 2]) {
    test(`a failed evaluation on iteration ${failedIteration} leaves its image available to save`, async ({ page, context, baseURL }, testInfo) => {
        let generations = 0;
        let reasoningCalls = 0;
        const refinedPrompt = 'Refined colored squares';
        const latestImageBase64 = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas unavailable');
            drawing.fillStyle = 'blue';
            drawing.fillRect(0, 0, 64, 64);
            return canvas.toDataURL().split(',')[1];
        });
        await context.route('**/*', async (route) => {
            const url = route.request().url();
            if (url === 'https://api.openai.com/v1/images/generations') {
                generations += 1;
                await route.fulfill({ json: { data: [{ b64_json: generations === 1 ? imageBase64 : latestImageBase64 }] } });
            } else if (url === 'https://api.openai.com/v1/responses') {
                reasoningCalls += 1;
                if (failedIteration === 2 && reasoningCalls < 3) {
                    await route.fulfill({ json: { output_text: reasoningCalls === 1
                        ? JSON.stringify({ score: 80, feedback: ['Improve the squares.'] })
                        : refinedPrompt } });
                } else {
                    await route.fulfill({ status: 429, json: { error: { message: 'Synthetic evaluation quota exceeded' } } });
                }
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
        await expect(page.getByText('Latest Autopilot Result', { exact: true })).toBeVisible();
        const expectedWidth = failedIteration === 1 ? 128 : 64;
        const expectedPrompt = failedIteration === 1 ? prompt : refinedPrompt;
        await expect(page.getByRole('img', { name: 'Generated result', exact: true })).toHaveJSProperty('naturalWidth', expectedWidth);
        expect(generations).toBe(failedIteration);
        expect(reasoningCalls).toBe(failedIteration * 2 - 1);
        await page.reload();
        await expect(page.getByRole('img', { name: 'Generated result', exact: true })).toHaveJSProperty('naturalWidth', expectedWidth);
        await expect(page.getByLabel('Starting prompt', { exact: true })).toHaveValue(expectedPrompt);
        await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Saved to Archive', exact: true })).toBeDisabled();
        await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
        await expect(page.getByRole('button', { name: `Open image: ${expectedPrompt}`, exact: true })).toBeVisible();
        if (failedIteration === 2) {
            await page.getByRole('button', { name: `Open image: ${expectedPrompt}`, exact: true }).click();
            const details = page.getByRole('dialog', { name: 'Image details' });
            const earlierBest = details.locator('.lineage-entry').filter({ hasText: 'Iteration 1 · Score 80' });
            await earlierBest.locator('.lineage-select').click();
            await expect(details.getByRole('img', { name: /^Iteration 1 · score 80/ })).toHaveJSProperty('naturalWidth', 128);
        }
        await page.screenshot({ path: testInfo.outputPath('retained-autopilot-image.png'), fullPage: true });
    });
}

for (const batchSize of [1, 2]) {
    test(`a first image failure keeps all ${batchSize} prior results usable without reload`, async ({ page, context, baseURL }, testInfo) => {
        let failImage = false;
        await context.route('**/*', async (route) => {
            const url = route.request().url();
            if (url === 'https://api.openai.com/v1/images/generations') {
                if (failImage) await route.fulfill({ status: 429, json: { error: { message: 'Synthetic image quota exceeded' } } });
                else await route.fulfill({ json: { data: Array.from({ length: batchSize }, () => ({ b64_json: imageBase64 })) } });
            } else if (new URL(url).origin === baseURL) await route.continue();
            else await route.abort();
        });
        await page.goto('/');
        const navigation = page.getByRole('navigation', { name: 'Main navigation' });
        await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByLabel('OpenAI API Key', { exact: true }).fill('synthetic-provider-key');
        await page.locator('section').filter({ has: page.getByRole('heading', { name: 'OpenAI API Key', exact: true }) })
            .getByRole('button', { name: 'Save key', exact: true }).click();
        await navigation.getByRole('button', { name: 'Generate', exact: true }).click();
        await page.getByLabel('Prompt', { exact: true }).fill('Prior usable result');
        await page.getByLabel('BATCH SIZE', { exact: true }).selectOption(String(batchSize));
        await page.getByRole('button', { name: batchSize === 1 ? 'Generate image' : 'Generate 2 images', exact: true }).click();
        await expect(page.getByRole('img', { name: /^Generated result/ })).toHaveCount(batchSize);
        failImage = true;
        await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
        await page.getByLabel('Goal', { exact: true }).fill('A paper crane');
        await page.getByRole('button', { name: 'Run Autopilot', exact: true }).click();
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.getByRole('button', { name: 'Confirm Run', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('Synthetic image quota exceeded');
        await expect(page.getByRole('img', { name: /^Generated result/ })).toHaveCount(batchSize);
        await page.getByRole('button', { name: 'Use as reference', exact: true }).first().click();
        await expect(page.getByRole('button', { name: /Remove reference/ })).toHaveCount(1);
        await page.getByRole('button', { name: batchSize === 1 ? 'Save to Archive' : 'Save all', exact: true }).click();
        await expect(page.getByRole('button', { name: batchSize === 1 ? 'Saved to Archive' : 'All saved', exact: true })).toBeDisabled();
        await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Open image: Prior usable result', exact: true })).toHaveCount(batchSize);
        await page.screenshot({ path: testInfo.outputPath('prior-results-saved-after-failure.png'), fullPage: true });
    });
}
