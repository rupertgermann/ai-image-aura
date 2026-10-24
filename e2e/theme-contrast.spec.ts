import { expect, test, type Locator } from '@playwright/test';

async function contrast(locator: Locator, foreground: 'color' | 'borderTopColor' | 'outlineColor') {
    return locator.evaluate((element, property) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const channels = (value: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            const rgba = Array.from(context.getImageData(0, 0, 1, 1).data);
            return [rgba[0], rgba[1], rgba[2], rgba[3] / 255];
        };
        const luminance = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, channel, index) => {
            const value = channel / 255;
            return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
        }, 0);
        const blend = (front: number[], back: number[], opacity = 1) => {
            const alpha = (front[3] ?? 1) * opacity;
            return back.map((channel, index) => front[index] * alpha + channel * (1 - alpha));
        };
        const ancestors: Element[] = [];
        for (let node = element.parentElement; node; node = node.parentElement) ancestors.unshift(node);
        let backdrop = [255, 255, 255];
        for (const ancestor of ancestors) backdrop = blend(channels(getComputedStyle(ancestor).backgroundColor), backdrop);
        const style = getComputedStyle(element);
        const opacity = Number(style.opacity);
        const fill = blend(channels(style.backgroundColor), backdrop);
        const visibleFill = blend([...fill, 1], backdrop, opacity);
        const visibleInk = blend(blend(channels(style[property]), fill), backdrop, opacity);
        const first = luminance(visibleFill);
        const second = luminance(visibleInk);
        return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
    }, foreground);
}

for (const mode of ['light', 'dark'] as const) {
    test(`${mode} hover labels, archive selection, and keyboard focus stay distinguishable`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: mode });
        await page.goto('/');
        await page.evaluate(async () => {
            const path = '/src/archive/ArchiveStore.ts';
            const { archiveStore }: typeof import('../src/archive/ArchiveStore') = await import(path);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas unavailable');
            for (const color of ['white', 'black']) {
                context.fillStyle = color;
                context.fillRect(0, 0, 64, 64);
                await archiveStore.save({ id: color, url: canvas.toDataURL(), prompt: `${color} contrast artwork`,
                    quality: 'medium', aspectRatio: '64x64', model: 'gpt-image-2', background: 'opaque',
                    timestamp: '2026-10-25T00:00:00Z' });
            }
        });
        await page.reload();
        const navigation = page.getByRole('navigation', { name: 'Main navigation' });
        await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByLabel('OpenAI API Key', { exact: true }).fill('synthetic-contrast-test');
        const save = page.getByRole('button', { name: 'Save key', exact: true }).first();
        await save.hover();
        await page.waitForTimeout(250);
        expect.soft(await contrast(save, 'color'), 'hovered amber button label').toBeGreaterThanOrEqual(4.5);
        await page.screenshot({ path: testInfo.outputPath(`${mode}-hover.png`) });
        await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
        const whiteCard = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Open image: white contrast artwork', exact: true }) });
        await whiteCard.hover();
        expect.soft(await contrast(whiteCard.locator('.selector-inner'), 'borderTopColor'), 'unchecked archive selection boundary').toBeGreaterThanOrEqual(3);
        await whiteCard.getByRole('button', { name: 'Add to favorites', exact: true }).click();
        const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
        await page.keyboard.press('Tab');
        await dismiss.focus();
        await expect(dismiss).toBeFocused();
        const toastFocus = await dismiss.evaluate((element) => {
            const style = getComputedStyle(element);
            return { color: style.outlineColor, width: style.outlineWidth, visible: element.matches(':focus-visible') };
        });
        expect(toastFocus.visible).toBe(true);
        expect(parseFloat(toastFocus.width)).toBeGreaterThanOrEqual(2);
        expect.soft(await contrast(dismiss, 'outlineColor'), 'toast keyboard focus').toBeGreaterThanOrEqual(3);
        await page.screenshot({ path: testInfo.outputPath(`${mode}-toast-focus.png`) });
        await dismiss.click();
        for (const art of ['white', 'black']) {
            const open = page.getByRole('button', { name: `Open image: ${art} contrast artwork`, exact: true });
            await page.keyboard.press('Tab');
            await open.focus();
            const ring = await open.evaluate((element, artColor) => {
                const style = getComputedStyle(element);
                const after = getComputedStyle(element, '::after');
                const colors = [parseFloat(style.outlineWidth) > 0 ? style.outlineColor : '',
                    after.content !== 'none' && parseFloat(after.outlineWidth) > 0 ? after.outlineColor : '',
                    after.content !== 'none' && parseFloat(after.borderTopWidth) > 0 ? after.borderTopColor : ''].filter(Boolean);
                const backgroundLuminance = artColor === 'white' ? 1 : 0;
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Canvas unavailable');
                const ratios = colors.map((color) => {
                    context.fillStyle = color;
                    context.fillRect(0, 0, 1, 1);
                    const rgb = Array.from(context.getImageData(0, 0, 1, 1).data);
                    const luminance = rgb.slice(0, 3).reduce((sum, channel, index) => {
                        const value = channel / 255;
                        return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
                    }, 0);
                    return (Math.max(luminance, backgroundLuminance) + .05) / (Math.min(luminance, backgroundLuminance) + .05);
                });
                return { visible: element.matches(':focus-visible'), colors, ratio: Math.max(0, ...ratios) };
            }, art);
            expect(ring.visible).toBe(true);
            expect.soft(ring.ratio, `${art} artwork keyboard focus`).toBeGreaterThanOrEqual(3);
            await page.screenshot({ path: testInfo.outputPath(`${mode}-${art}-art-focus.png`) });
        }
        await page.getByRole('button', { name: 'Open image: black contrast artwork', exact: true }).click();
        const download = page.getByRole('button', { name: 'Download', exact: true });
        await download.hover();
        await page.waitForTimeout(250);
        expect(await contrast(download, 'color'), 'hovered primary button label').toBeGreaterThanOrEqual(4.5);
        await page.screenshot({ path: testInfo.outputPath(`${mode}-primary-hover.png`) });
    });
}
