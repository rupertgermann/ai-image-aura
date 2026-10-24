import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

for (const mode of ['light', 'dark'] as const) {
    test(`${mode} system preference is readable and manual choice persists`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: mode });
        await page.goto('/');
        const opposite = mode === 'dark' ? 'light' : 'dark';
        const toggle = page.getByRole('button', { name: `Switch to ${opposite} mode` });
        await expect(toggle).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
        const prompt = page.getByPlaceholder('Describe an image. A subject, a setting, a little imagination…');
        await prompt.fill('A paper moon above the ocean');
        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(prompt).toHaveValue('A paper moon above the ocean');
        await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
        await page.emulateMedia({ colorScheme: opposite });
        await page.emulateMedia({ colorScheme: mode });
        await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
        await expect(prompt).toHaveValue('A paper moon above the ocean');
        await page.getByRole('button', { name: `Switch to ${mode} mode` }).click();
        for (const view of ['Generate', 'Archive', 'Editor', 'Settings']) {
            await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: view, exact: true }).click();
            await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
            await page.screenshot({ path: testInfo.outputPath(`${mode}-${view.toLowerCase()}.png`), fullPage: true });
        }
        await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
        await expect(page.getByRole('button', { name: `Switch to ${opposite} mode` })).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: `Switch to ${opposite} mode` }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${opposite}-mobile.png`), fullPage: true });
    });
}

test('invalid saved theme falls back to the system preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('aura_theme', 'unexpected'));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('theme remains usable when persistent storage is denied', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
        const read = Storage.prototype.getItem;
        const write = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) {
            if (key === 'aura_theme') throw new DOMException('Denied', 'SecurityError');
            return read.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
            if (key === 'aura_theme') throw new DOMException('Denied', 'SecurityError');
            return write.call(this, key, value);
        };
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
});
