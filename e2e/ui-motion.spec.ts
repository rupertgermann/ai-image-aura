import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ video: { mode: 'on', size: { width: 1440, height: 1000 } } });

async function settle(page: Page) {
    await page.evaluate(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const finite = document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity);
        await Promise.allSettled(finite.map((animation) => animation.finished));
    });
}

async function expectExit(locator: Locator) {
    await expect.poll(() => locator.evaluateAll((elements) => elements.some((element) =>
        element.closest('[inert]') && element.getAnimations().some((animation) => animation.playState === 'running'),
    ))).toBe(true);
    await expect(locator).toHaveCount(0);
}

test.beforeEach(async ({ context, page, baseURL }) => {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await page.goto('/');
    await page.getByRole('heading', { name: 'Generate', exact: true }).waitFor();
});

test('Prompt has a visible keyboard focus border', async ({ page }, testInfo) => {
    const prompt = page.getByLabel('Prompt', { exact: true });
    const unfocusedBorder = await prompt.evaluate((element) => getComputedStyle(element).borderBottomColor);
    await page.getByRole('combobox', { name: 'Example prompts', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(prompt).toBeFocused();
    await expect(prompt).not.toHaveCSS('border-bottom-color', unfocusedBorder);
    await page.screenshot({ path: testInfo.outputPath('prompt-keyboard-focus.png') });
});

test('keyboard focus skips closing disclosures', async ({ page }, testInfo) => {
    const summary = page.locator('.style-options > summary');
    await summary.click();
    await settle(page);
    await summary.click();
    await page.keyboard.press('Tab');
    const upload = page.getByLabel('Add reference images', { exact: true });
    expect(await upload.evaluate((element) => element === document.activeElement)).toBe(true);
    await settle(page);
    await expect(upload).toBeFocused();
    await summary.click();
    await settle(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Style', exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('disclosure-keyboard-focus.png') });
});

test('navigation, disclosures, reference dialogs and menus enter and exit without losing input', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await settle(page);
    await expect(page.getByRole('button', { name: 'Expand Sidebar' })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Expand Sidebar' }).click();
    await page.getByLabel('Prompt', { exact: true }).fill('A quiet orange studio');
    await nav.getByRole('button', { name: 'Settings', exact: true }).click();
    await settle(page);
    await nav.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue('A quiet orange studio');
    await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
    await page.getByLabel('Goal', { exact: true }).fill('Keep the orange subject centered');
    await settle(page);
    await page.getByRole('button', { name: 'Single Shot', exact: true }).click();
    await expectExit(page.locator('.autopilot-panel'));
    await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
    await expect(page.getByLabel('Goal', { exact: true })).toHaveValue('Keep the orange subject centered');
    await page.getByRole('button', { name: 'Single Shot', exact: true }).click();
    await settle(page);

    await page.locator('.style-options > summary').click();
    const palette = page.getByRole('combobox', { name: 'Palette', exact: true });
    await palette.click();
    await settle(page);
    await palette.press('Escape');
    await expectExit(page.locator('.palette-options'));
    await expect(palette).toBeFocused();
    await palette.click();
    await palette.press('ArrowDown');
    await palette.press('Enter');
    await expect(palette).toContainText('copper + teal + cream');

    await page.getByLabel('Add reference images', { exact: true }).setInputFiles('e2e/fixtures/four-colors.png');
    const preview = page.getByRole('button', { name: 'Preview reference 1', exact: true });
    await preview.click();
    const dialog = page.locator('dialog[aria-label="Reference preview"]');
    await expect(dialog).toBeVisible();
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath('reference-dialog.png') });
    await page.keyboard.press('Escape');
    await expectExit(dialog);
    await expect(preview).toBeFocused();
    await preview.click();
    await page.getByRole('button', { name: 'Close reference preview' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove reference 1' }).click();
    await expectExit(page.locator('.reference-preview'));
    await page.locator('.style-options > summary').click();
    await expect.poll(() => page.locator('.style-options').evaluate((element) =>
        getComputedStyle(element, '::details-content').contentVisibility,
    )).toBe('hidden');
    await settle(page);
    await page.locator('main').evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('generate-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await page.locator('main').evaluate((element) => element.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('generate-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
});

test('reduced motion and rapid toggles never leave dismissed UI behind', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.style-options > summary').click();
    const palette = page.getByRole('combobox', { name: 'Palette', exact: true });
    await palette.click();
    await palette.press('Escape');
    await expect(page.locator('.palette-options')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await palette.evaluate((element) => {
        if (!(element instanceof HTMLButtonElement)) throw new Error('Expected palette button');
        element.click();
        requestAnimationFrame(() => {
            element.click();
            requestAnimationFrame(() => element.click());
        });
    });
    await expect(palette).toHaveAttribute('aria-expanded', 'true');
    await settle(page);
    await expect(page.getByRole('listbox', { name: 'Palette' })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await palette.press('Escape');
    await expect(page.locator('.palette-options')).toHaveCount(0);
    await page.getByLabel('Add reference images', { exact: true }).setInputFiles('e2e/fixtures/four-colors.png');
    await page.getByRole('button', { name: 'Preview reference 1' }).click();
    expect(await page.locator('dialog').evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Preview reference 1' }).click();
    await settle(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Preview reference 1' }).click();
    await settle(page);
    await expect(page.getByRole('dialog', { name: 'Reference preview' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: testInfo.outputPath('reduced-motion.png') });
});

test('archive filtering, confirmations, toasts and Editor panels remain usable through transitions', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(async () => {
        const modulePath = '/src/archive/ArchiveStore.ts';
        const { archiveStore } = await import(modulePath);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 640;
        const drawing = canvas.getContext('2d');
        if (!drawing) throw new Error('Canvas unavailable');
        for (const [index, color] of ['#e37d4c', '#678995', '#98a78e'].entries()) {
            drawing.fillStyle = '#eae8dc';
            drawing.fillRect(0, 0, 640, 640);
            drawing.fillStyle = color;
            drawing.beginPath();
            drawing.arc(320, 320, 220 - index * 30, 0, Math.PI * 2);
            drawing.fill();
            await archiveStore.save({
                id: `motion-${index}`, prompt: ['Orange study', 'Blue study', 'Green study'][index],
                url: canvas.toDataURL(), timestamp: '2026-09-29', model: 'gpt-image-2.5-flare',
                quality: 'medium', aspectRatio: '640x640', background: 'auto', width: 640, height: 640,
                favorite: index === 0,
            });
        }
    });
    await page.reload();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.locator('.image-card')).toHaveCount(3);
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath('archive-desktop.png') });
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expectExit(page.locator('.image-card').filter({ hasText: 'Blue study' }));
    await expect(page.locator('.image-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expect(page.locator('.image-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'Select image: Orange study', exact: true }).click();
    await expect(page.locator('.bulk-action-bar')).toBeVisible();
    await settle(page);
    await nav.getByRole('button', { name: 'Generate', exact: true }).click();
    await nav.getByRole('button', { name: 'Archive', exact: true }).click();
    const bulkBottom = await page.locator('.bulk-action-bar').evaluate((element) => element.getBoundingClientRect().bottom);
    expect(bulkBottom).toBeGreaterThan(960);
    await settle(page);
    await page.locator('.bulk-action-bar').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expectExit(page.locator('.bulk-action-bar'));

    await page.getByRole('button', { name: 'Open image: Orange study', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Image details', exact: true });
    await expect(detail).toBeVisible();
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath('image-details.png') });
    await detail.getByRole('button', { name: 'Favorited', exact: true }).click();
    await detail.getByRole('button', { name: 'Close image details' }).click();
    await expectExit(page.locator('dialog[aria-label="Image details"]'));
    await page.getByRole('button', { name: 'Dismiss notification' }).last().click();
    await expectExit(page.locator('.toast'));

    const blue = page.locator('.image-card').filter({ hasText: 'Blue study' });
    await blue.hover();
    await blue.getByTitle('Delete', { exact: true }).click();
    const confirm = page.locator('dialog[aria-label="Delete image?"]');
    await expect(confirm).toBeVisible();
    await settle(page);
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expectExit(confirm);
    await expect(page.locator('.image-card')).toHaveCount(3);

    await page.getByRole('button', { name: 'Open image: Orange study', exact: true }).click();
    await detail.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.editor-stage canvas').first()).toBeVisible();
    const adjustments = page.getByRole('button', { name: 'Adjustments', exact: true });
    await expect(adjustments).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('120');
    await adjustments.click();
    await expect(page.locator('#editor-adjustments-panel')).toHaveAttribute('inert', '');
    await settle(page);
    await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveCount(0);
    await nav.getByRole('button', { name: 'Generate', exact: true }).click();
    await nav.getByRole('button', { name: 'Editor', exact: true }).click();
    await adjustments.click();
    await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('120');
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath('editor-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole('button', { name: 'Archive', exact: true }).click();
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('archive-mobile.png') });
    expect(errors).toEqual([]);
});
