import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const imageFile = new URL('./fixtures/four-colors.png', import.meta.url);
const imageBase64 = readFileSync(imageFile).toString('base64');
const batchKey = 'generate_current_batch';
const referencesKey = 'generate_transferred_references';

declare global {
    interface Window {
        generateReadHeld: boolean;
        releaseGenerateRead: () => void;
    }
}

async function seedAndHoldRead(page: Page, baseURL: string, key: string) {
    await page.route(`${baseURL}/restore-fixture`, (route) => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Generate restoration fixture</title>',
    }));
    await page.goto('/restore-fixture');
    await page.evaluate(async ({ key, batchKey }) => {
        const modulePath = '/src/generate-session/GenerateSession.ts';
        const { generateSessionStore, DEFAULT_GENERATE_DRAFT } = await import(modulePath);
        localStorage.setItem('aura_openapi_key', JSON.stringify('synthetic-provider-key'));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const drawing = canvas.getContext('2d');
        if (!drawing) throw new Error('Canvas unavailable');
        drawing.fillStyle = 'blue';
        drawing.fillRect(0, 0, 32, 32);
        const imageUrl = canvas.toDataURL();
        const draft = { ...DEFAULT_GENERATE_DRAFT, prompt: 'Stored batch' };
        if (key === batchKey) {
            await generateSessionStore.saveCurrentBatch({
                results: [{ slotIndex: 0, status: 'success', imageUrl, isSaved: false }],
                references: [],
                draft,
                lineageSource: null,
            });
        } else {
            await generateSessionStore.transfer({ draft, references: [imageUrl], lineageSource: null });
        }
    }, { key, batchKey });

    await page.addInitScript((heldKey) => {
        if (sessionStorage.getItem('generate-read-was-held')) return;
        sessionStorage.setItem('generate-read-was-held', '1');
        window.generateReadHeld = false;
        const held = new Promise<void>((resolve) => { window.releaseGenerateRead = resolve; });
        const get = IDBObjectStore.prototype.get;
        const setSuccess = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess')?.set;
        if (!setSuccess) throw new Error('IndexedDB success handler unavailable');
        IDBObjectStore.prototype.get = function (key) {
            const request = get.call(this, key);
            if (key === heldKey) {
                Object.defineProperty(request, 'onsuccess', {
                    set(listener: (this: IDBRequest, event: Event) => void) {
                        // Hold delivery of the real result after IndexedDB has finished reading.
                        setSuccess.call(request, async (event: Event) => {
                            window.generateReadHeld = true;
                            await held;
                            listener.call(request, event);
                        });
                    },
                });
            }
            return request;
        };
    }, key);
    await page.goto('/');
    await page.waitForFunction(() => window.generateReadHeld);
}

async function releaseRead(page: Page, key: string) {
    await page.evaluate(() => window.releaseGenerateRead());
    if (key === referencesKey) {
        await page.waitForFunction(async (key) => {
            const modulePath = '/src/services/StorageService.ts';
            const { storage } = await import(modulePath);
            return await storage.load(key) === null;
        }, key);
    }
    await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
}

test('a delayed stored batch cannot replace a new result', async ({ page, baseURL }, testInfo) => {
    if (!baseURL) throw new Error('Test server URL unavailable');
    await page.route('https://api.openai.com/v1/images/generations', (route) => route.fulfill({
        json: { data: [{ b64_json: imageBase64 }] },
    }));
    await seedAndHoldRead(page, baseURL, batchKey);
    await page.getByLabel('Prompt', { exact: true }).fill('New batch');
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    const result = page.getByRole('img', { name: 'Generated result', exact: true });
    const save = page.getByRole('button', { name: 'Save to Archive', exact: true });
    await expect(result).toHaveJSProperty('naturalWidth', 128);
    await expect(save).toBeEnabled();

    await releaseRead(page, batchKey);
    await page.screenshot({ path: testInfo.outputPath('result-after-restore.png') });
    await expect(result).toHaveJSProperty('naturalWidth', 128);
    await save.click();
    await expect(page.getByRole('button', { name: 'Saved to Archive', exact: true })).toBeDisabled();
    await page.reload();
    await expect(result).toHaveJSProperty('naturalWidth', 128);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open image: New batch', exact: true })).toBeVisible();
});

test('an all-failed run keeps a stored batch that arrives during the run', async ({ page, baseURL }, testInfo) => {
    if (!baseURL) throw new Error('Test server URL unavailable');
    let finishGeneration = () => {};
    const responseReady = new Promise<void>((resolve) => { finishGeneration = resolve; });
    await page.route('https://api.openai.com/v1/images/generations', async (route) => {
        await responseReady;
        await route.fulfill({ status: 502, body: 'Synthetic image provider failure' });
    });
    await seedAndHoldRead(page, baseURL, batchKey);
    await page.getByLabel('Prompt', { exact: true }).fill('Failed batch');
    await page.getByLabel('BATCH SIZE', { exact: true }).selectOption('2');
    const request = page.waitForRequest('https://api.openai.com/v1/images/generations');
    await page.getByRole('button', { name: 'Generate 2 images', exact: true }).click();
    const result = page.getByRole('img', { name: 'Generated result', exact: true });
    try {
        await request;
        await releaseRead(page, batchKey);
        await expect(result).toHaveJSProperty('naturalWidth', 32);
    } finally {
        finishGeneration();
    }
    await expect(page.getByRole('alert')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('retained-batch-after-failure.png') });
    await expect(result).toHaveJSProperty('naturalWidth', 32);
    await expect(page.getByRole('button', { name: 'Save to Archive', exact: true })).toBeEnabled();
    await page.reload();
    await expect(result).toHaveJSProperty('naturalWidth', 32);
});

for (const removeReference of [false, true]) {
    test(`a delayed transfer respects a reference ${removeReference ? 'removal' : 'upload'}`, async ({ page, baseURL }, testInfo) => {
        if (!baseURL) throw new Error('Test server URL unavailable');
        await seedAndHoldRead(page, baseURL, referencesKey);
        await page.getByLabel('Add reference images').setInputFiles({
            name: 'chosen-reference.png',
            mimeType: 'image/png',
            buffer: Buffer.from(imageBase64, 'base64'),
        });
        const reference = page.getByRole('img', { name: 'Reference 1', exact: true });
        await expect(reference).toHaveJSProperty('naturalWidth', 128);
        if (removeReference) {
            await page.getByRole('button', { name: 'Remove reference 1', exact: true }).click();
            await expect(reference).toHaveCount(0);
        }

        await releaseRead(page, referencesKey);
        await page.screenshot({ path: testInfo.outputPath('references-after-transfer.png') });
        if (removeReference) await expect(reference).toHaveCount(0);
        else await expect(reference).toHaveJSProperty('naturalWidth', 128);
    });
}

test('a delayed transfer restores references when the selection stays untouched', async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('Test server URL unavailable');
    await seedAndHoldRead(page, baseURL, referencesKey);
    const reference = page.getByRole('img', { name: 'Reference 1', exact: true });
    await expect(reference).toHaveCount(0);
    await releaseRead(page, referencesKey);
    await expect(reference).toHaveJSProperty('naturalWidth', 32);
});
