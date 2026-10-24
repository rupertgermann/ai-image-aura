import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const imageBase64 = readFileSync(new URL('./fixtures/four-colors.png', import.meta.url)).toString('base64');
const goal = 'Four colored squares with crisp edges';
const translatedPrompt = 'Four crisp colored squares on a white background';

for (const rejectFirst of [false, true]) {
    test(`pending goal translation protects its inputs and ${rejectFirst ? 'recovers after rejection' : 'retains its cost'}`, async ({ page, context, baseURL }, testInfo) => {
        let releaseTranslation = () => {};
        const translationReady = new Promise<void>((resolve) => { releaseTranslation = resolve; });
        let translationRequests = 0;
        let imageRequests = 0;
        await context.route('**/*', async (route) => {
            const request = route.request();
            const url = request.url();
            if (url === 'https://api.openai.com/v1/responses') {
                const isTranslation = request.postData()?.includes('goal-prompt-translator.v1');
                if (isTranslation) {
                    translationRequests += 1;
                    expect(request.postData()).toContain(goal);
                    await translationReady;
                    if (rejectFirst && translationRequests === 1) {
                        await route.fulfill({ status: 429, json: { error: { message: 'Synthetic translation quota exceeded' } } });
                        return;
                    }
                }
                await route.fulfill({ json: {
                    output_text: isTranslation ? translatedPrompt : JSON.stringify({ score: 100, feedback: ['Goal met.'] }),
                    usage: { input_tokens: 100, output_tokens: 20 },
                } });
            } else if (url === 'https://api.openai.com/v1/images/generations') {
                imageRequests += 1;
                expect(request.postDataJSON().prompt).toBe(translatedPrompt);
                await route.fulfill({ json: { data: [{ b64_json: imageBase64 }] } });
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
        await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
        const promptInput = page.getByLabel('Starting prompt', { exact: true });
        const goalInput = page.getByLabel('Goal', { exact: true });
        const examples = page.getByLabel('Example prompts', { exact: true });
        const translate = page.getByRole('button', { name: 'Create starting prompt', exact: true });
        const run = page.getByRole('button', { name: 'Run Autopilot', exact: true });
        const confirm = page.getByRole('button', { name: 'Confirm Run', exact: true });
        await promptInput.fill('Original handwritten prompt');
        await goalInput.fill(goal);
        await run.click();
        await expect(confirm).toBeVisible();
        await translate.click();
        await expect.poll(() => translationRequests).toBe(1);

        for (const input of [promptInput, goalInput, examples, page.getByLabel('Reasoning model', { exact: true }),
            page.getByRole('button', { name: 'Single Shot', exact: true }), run, confirm]) {
            await expect(input).toBeDisabled();
        }
        await expect(page.getByText('Creating a starting prompt. Prompt and goal editing will resume when it finishes.', { exact: true })).toBeVisible();
        await expect(promptInput).toHaveValue('Original handwritten prompt');
        await expect(goalInput).toHaveValue(goal);
        expect(imageRequests).toBe(0);
        await page.screenshot({ path: testInfo.outputPath('translation-pending.png'), fullPage: true });
        releaseTranslation();

        if (rejectFirst) {
            await expect(page.getByText('Synthetic translation quota exceeded', { exact: true })).toBeVisible();
            await expect(promptInput).toBeEnabled();
            await expect(goalInput).toBeEnabled();
            await expect(examples).toBeEnabled();
            await expect(promptInput).toHaveValue('Original handwritten prompt');
            await translate.click();
        }
        await expect(promptInput).toHaveValue(translatedPrompt);
        await expect(goalInput).toHaveValue(goal);
        await expect(promptInput).toBeEnabled();
        await expect(goalInput).toBeEnabled();
        await expect(examples).toBeEnabled();
        await expect(translate).toBeEnabled();
        await expect(run).toBeEnabled();
        await expect(confirm).toBeEnabled();
        await confirm.click();
        await expect(page.getByRole('img', { name: 'Generated result', exact: true })).toBeVisible();
        await expect(page.locator('.cost-line-item').filter({ hasText: 'Goal translation' })).toHaveCount(1);
        await expect(page.locator('.cost-line-item').filter({ hasText: 'Goal translation' }).locator('strong')).toHaveText(/^\$/);
        expect(translationRequests).toBe(rejectFirst ? 2 : 1);
        expect(imageRequests).toBe(1);
        await page.screenshot({ path: testInfo.outputPath('translation-applied-with-cost.png'), fullPage: true });
    });
}
