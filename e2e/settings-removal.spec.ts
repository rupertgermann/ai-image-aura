import { expect, test } from '@playwright/test';

test('disconnecting the local server persists after reload', async ({ page }, testInfo) => {
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Local server (stable-diffusion.cpp)', exact: true }) });
    await page.getByLabel('Server URL').fill('http://127.0.0.1:1234');
    await section.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(section.getByText('Configured', { exact: true })).toBeVisible();
    await page.getByLabel('Server URL').fill('');
    await section.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(section.getByText('Not configured', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Server URL')).toHaveValue('');
    await expect(section.getByRole('button', { name: 'Test connection', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('disconnected-settings.png'), fullPage: true });
});

test('removing a migrated OpenAI key does not restore the legacy key', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.evaluate(() => {
        localStorage.setItem('openai_api_key', 'synthetic-legacy-key');
        localStorage.removeItem('aura_openapi_key');
    });
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click();
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'OpenAI API Key', exact: true }) });
    await expect(page.getByLabel('OpenAI API Key', { exact: true })).toHaveValue('synthetic-legacy-key');
    await page.getByLabel('OpenAI API Key', { exact: true }).fill('');
    await section.getByRole('button', { name: 'Remove key', exact: true }).click();
    await expect(section.getByText('Configured', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('OpenAI API Key', { exact: true })).toHaveValue('');
    expect(await page.evaluate(() => localStorage.getItem('openai_api_key'))).toBeNull();
    await page.screenshot({ path: testInfo.outputPath('removed-key-settings.png'), fullPage: true });
});
