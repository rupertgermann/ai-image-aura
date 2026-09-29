import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const imageId = 'editor-draft-provenance';
const imagePrompt = 'Artwork with a restored Editor draft';
const firstPrompt = 'Make the artwork red';
const secondPrompt = 'Make the artwork blue';
const model = 'gpt-image-2.5-flare';

async function readSavedImage(page: Page) {
    return page.evaluate(async (id) => {
        const archivePath = '/src/archive/ArchiveStore.ts';
        const lineagePath = '/src/lineage/LineageStore.ts';
        const { archiveStore } = await import(archivePath);
        const { lineageStore } = await import(lineagePath);
        return { image: await archiveStore.get(id), steps: await lineageStore.getByArchiveImageId(id) };
    }, imageId);
}

async function applyEdit(page: Page, prompt: string, layerCount: number) {
    await page.getByLabel('AI transformation prompt').fill(prompt);
    await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
    await expect(page.locator('.layer-name')).toHaveCount(layerCount);
    await expect(page.getByLabel('AI transformation prompt')).toHaveValue('');
    await expect.poll(() => page.evaluate(async (id) => {
        const modulePath = '/src/editor/editorDraftStorage.ts';
        const { loadEditorDraft } = await import(modulePath);
        return (await loadEditorDraft(id))?.layerStack.layers.length;
    }, imageId)).toBe(layerCount);
}

test.beforeEach(async ({ context, page, baseURL }) => {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL
        ? route.continue()
        : route.abort());
    await page.goto('/');
    const results = await page.evaluate(async ({ id, prompt, model }) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const drawing = canvas.getContext('2d');
        if (!drawing) throw new Error('Canvas unavailable');
        const urls = ['rgb(160, 160, 160)', 'rgb(220, 40, 40)', 'rgb(40, 80, 220)'].map((color) => {
            drawing.fillStyle = color;
            drawing.fillRect(0, 0, 128, 128);
            return canvas.toDataURL();
        });
        const archivePath = '/src/archive/ArchiveStore.ts';
        const draftPath = '/src/editor/editorDraftStorage.ts';
        const layersPath = '/src/editor/layers.ts';
        const { archiveStore } = await import(archivePath);
        const { saveEditorDraft } = await import(draftPath);
        const { createEditorDraft } = await import(layersPath);
        const image = await archiveStore.save({
            id, prompt, model, url: urls[0], timestamp: '2026-09-29',
            quality: 'medium', aspectRatio: '128x128', background: 'auto', width: 128, height: 128,
        });
        const draft = createEditorDraft(image);
        await saveEditorDraft(id, {
            layerStack: draft.layerStack, adjustments: draft.adjustments, references: draft.references,
            selectedLayerIds: draft.selectedLayerIds, primarySelectedLayerId: draft.primarySelectedLayerId,
        });
        localStorage.setItem('aura_openapi_key', JSON.stringify('synthetic-key-never-sent'));
        return urls.slice(1);
    }, { id: imageId, prompt: imagePrompt, model });
    let edits = 0;
    await page.route('https://api.openai.com/v1/images/edits', (route) => {
        const imageUrl = results[edits++];
        return route.fulfill({ json: {
            data: [{ b64_json: imageUrl.split(',')[1] }],
            usage: { input_tokens: 10, input_tokens_details: { text_tokens: 10, image_tokens: 0 }, output_tokens: 20 * edits },
        } });
    });
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: `Open image: ${imagePrompt}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Image details' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.layer-name')).toHaveCount(1);
    await page.locator('.ai-edit-section > summary').click();
    await page.locator('.editor-container').getByLabel('Image model', { exact: true }).selectOption(model);
});

for (const restore of ['reload', 'undo', 'redo'] as const) {
    test(`Save uses the current AI edit facts after ${restore}`, async ({ page }, testInfo) => {
        let maskDataUrl: string | undefined;
        if (restore === 'reload') {
            await page.getByRole('button', { name: 'Mask', exact: true }).click();
            const canvas = page.locator('.transform-mask-canvas');
            await expect(canvas).toBeVisible();
            await canvas.click({ position: { x: 24, y: 24 } });
            maskDataUrl = await canvas.evaluate((element) => {
                if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected mask canvas');
                return element.toDataURL();
            });
            await page.getByRole('button', { name: 'Apply Mask', exact: true }).click();
            await expect(page.getByRole('dialog', { name: 'Transform mask' })).toBeHidden();
        }
        await applyEdit(page, firstPrompt, 2);
        if (restore === 'reload') {
            await page.reload();
        } else {
            await applyEdit(page, secondPrompt, 3);
            await page.getByRole('button', { name: 'Undo', exact: true }).click();
            await expect(page.locator('.layer-name')).toHaveCount(2);
            if (restore === 'redo') await page.getByRole('button', { name: 'Redo', exact: true }).click();
        }
        await expect(page.locator('.layer-name')).toHaveCount(restore === 'redo' ? 3 : 2);
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
        await page.reload();
        const saved = await readSavedImage(page);
        await writeFile(testInfo.outputPath('saved-editor.json'), JSON.stringify(saved, null, 2));
        await page.getByRole('button', { name: `Open image: ${imagePrompt}`, exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath('saved-lineage.png'), fullPage: true });

        expect(saved.steps).toHaveLength(1);
        const step = saved.steps[0];
        expect(step.stepType).toBe('ai-edit');
        expect(step.metadata.aiEdit).toMatchObject({
            prompt: restore === 'redo' ? secondPrompt : firstPrompt,
            imageModel: { slug: model },
            transformTarget: restore === 'redo'
                ? { mode: 'selected-layers', layerCount: 1, includesBaseLayer: false }
                : { mode: 'whole-composition', layerCount: null, includesBaseLayer: null },
        });
        expect(step.metadata.costLedger.items).toHaveLength(1);
        expect(step.metadata.costLedger.items[0]).toMatchObject({
            kind: 'image-edit', provider: 'openai', model,
            usage: { inputTextTokens: 10, outputImageTokens: restore === 'redo' ? 40 : 20 },
        });
        expect(saved.image.costLedger).toEqual(step.metadata.costLedger);
        if (maskDataUrl) expect(step.metadata.aiEdit.transformMask.dataUrl).toBe(maskDataUrl);
        const pixel = await page.evaluate(async (url) => {
            const image = await createImageBitmap(await (await fetch(url)).blob());
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 128;
            const drawing = canvas.getContext('2d');
            if (!drawing) throw new Error('Canvas unavailable');
            drawing.drawImage(image, 0, 0);
            return Array.from(drawing.getImageData(64, 64, 1, 1).data);
        }, saved.image.url);
        expect(pixel).toEqual(restore === 'redo' ? [40, 80, 220, 255] : [220, 40, 40, 255]);
        await expect(page.locator('.lineage-summary')).toContainText(restore === 'redo' ? secondPrompt : firstPrompt);
    });
}

test('deleting the AI result omits its facts when saving the remaining draft', async ({ page }, testInfo) => {
    await applyEdit(page, firstPrompt, 2);
    await page.getByTitle('Delete selected layers', { exact: true }).click();
    await expect(page.locator('.layer-name')).toHaveCount(1);
    await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('110');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
    const saved = await readSavedImage(page);
    expect(saved.steps).toHaveLength(1);
    expect(saved.steps[0]).toMatchObject({ stepType: 'overwrite', metadata: { aiEdit: null } });
    expect(saved.steps[0].metadata.costLedger).toBeUndefined();
    await writeFile(testInfo.outputPath('deleted-result.json'), JSON.stringify(saved, null, 2));
    await page.screenshot({ path: testInfo.outputPath('deleted-result.png'), fullPage: true });
});
