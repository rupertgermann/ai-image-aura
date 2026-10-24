import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const imageUrl = `data:image/png;base64,${readFileSync(new URL('./fixtures/four-colors.png', import.meta.url)).toString('base64')}`;

test.beforeEach(async ({ page, context, baseURL }) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await page.goto('/');
    await page.evaluate(async (url) => {
        const archivePath = '/src/archive/ArchiveStore.ts';
        const lineagePath = '/src/lineage/LineageStore.ts';
        const sessionPath = '/src/generate-session/GenerateSession.ts';
        const { archiveStore } = await import(archivePath);
        const { lineageStore } = await import(lineagePath);
        const { generateSessionStore, DEFAULT_GENERATE_DRAFT } = await import(sessionPath);
        for (const id of ['A', 'B']) {
            await archiveStore.save({ id, url, prompt: `Image ${id}`, model: 'gpt-image-2.5-flare', quality: 'high', aspectRatio: '1536x1024', background: 'transparent', width: 128, height: 128, timestamp: '2026-10-24' });
            await lineageStore.save({ id: `step${id}`, archiveImageId: id, parentStepId: null, stepType: 'generation', timestamp: '2026-10-24', metadata: {} });
        }
        await lineageStore.save({ id: 'editA', archiveImageId: 'A', parentStepId: 'stepA', stepType: 'ai-edit', timestamp: '2026-10-24T01:00:00Z', metadata: { aiEditPrompt: 'Earlier chosen edit' } });
        await lineageStore.save({ id: 'latestA', archiveImageId: 'A', parentStepId: 'editA', stepType: 'overwrite', timestamp: '2026-10-24T02:00:00Z', metadata: {} });
        await generateSessionStore.saveCurrentBatch({ results: [{ slotIndex: 0, status: 'success', imageUrl: url, isSaved: false }], references: [], draft: DEFAULT_GENERATE_DRAFT, lineageSource: null });
        localStorage.setItem('aura_openapi_key', JSON.stringify('synthetic-key'));
    }, imageUrl);
    await page.reload();
});

for (const action of ['Load in Editor', 'Fork from this step']) {
    test(`Editor ${action} keeps its selected parent across Generate replay and reload`, async ({ page }, testInfo) => {
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        await nav.getByRole('button', { name: 'Archive', exact: true }).click();
        await page.getByRole('button', { name: 'Open image: Image A', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Image details' });
        await dialog.locator('.lineage-entry').filter({ has: page.getByRole('button', { name: 'Load in Editor', exact: true }) }).getByRole('button', { name: action, exact: true }).click();
        await expect(page.locator('.editor-container')).toBeVisible();
        await nav.getByRole('button', { name: 'Archive', exact: true }).click();
        await page.getByRole('button', { name: 'Open image: Image B', exact: true }).click();
        await dialog.getByRole('button', { name: 'Load in Generate', exact: true }).click();
        await nav.getByRole('button', { name: 'Editor', exact: true }).click();
        await page.reload();
        await page.getByRole('button', { name: 'B&W', exact: true }).click();
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.locator('.editor-container')).toBeHidden();
        const result = await page.evaluate(async () => {
            const lineagePath = '/src/lineage/LineageStore.ts';
            const sessionPath = '/src/generate-session/GenerateSession.ts';
            const { lineageStore } = await import(lineagePath);
            const { generateSessionStore } = await import(sessionPath);
            return { steps: await lineageStore.getByArchiveImageId('A'), source: generateSessionStore.loadLineageSource() };
        });
        expect(result.steps.at(-1)?.parentStepId).toBe('editA');
        expect(result.source).toEqual({ archiveImageId: 'B', stepId: 'stepB' });
        await page.screenshot({ path: testInfo.outputPath('independent-editor-ancestry.png'), fullPage: true });
    });
}

test('intermediate Autopilot replay restores reference bytes and controls in the next HTTP request', async ({ page }, testInfo) => {
    const importedReferences = await page.evaluate(async (url) => {
        const lineagePath = '/src/lineage/LineageStore.ts';
        const { lineageStore } = await import(lineagePath);
        await lineageStore.save({ id: 'intermediate', archiveImageId: 'autopilot:synthetic:iteration:1', parentStepId: null, stepType: 'autopilot-iteration', timestamp: '2026-10-24', metadata: {
            prompt: 'Intermediate reference request', model: 'gpt-image-2.5-flare', quality: 'high', aspectRatio: '1536x1024', background: 'transparent', references: [url], outputImageDataUrl: url,
        } });
        await lineageStore.save({ id: 'stepB', archiveImageId: 'B', parentStepId: 'intermediate', stepType: 'generation', timestamp: '2026-10-24T01:00:00Z', metadata: {} });
        const archivePath = '/src/archive/ArchiveStore.ts';
        const transferPath = '/src/archive/ArchiveTransfer.ts';
        const { archiveStore } = await import(archivePath);
        const { buildArchiveZip, importArchiveZip } = await import(transferPath);
        const image = await archiveStore.get('B');
        if (!image) throw new Error('Missing fixture image');
        let references: unknown;
        const zip = await buildArchiveZip([image], { lineageStore });
        const summary = await importArchiveZip(zip, {
            archiveStore: { save: async (input: unknown) => input },
            lineageStore: { save: async (step: { id: string; metadata: Record<string, unknown> }) => {
                if (step.id === 'intermediate') references = step.metadata.references;
                return step;
            } },
        });
        if (summary.missingAssetFiles.length) throw new Error('Missing ZIP assets');
        return references;

    }, imageUrl);
    expect(importedReferences).toEqual([imageUrl]);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: 'Open image: Image B', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Image details' });
    await dialog.locator('.lineage-entry').filter({ hasText: 'Autopilot Iteration' }).getByRole('button', { name: 'Load in Generate', exact: true }).click();
    await expect(page.getByRole('img', { name: /^Generated result/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Remove reference/ })).toHaveCount(1);
    let requestBody = '';
    await page.route('https://api.openai.com/v1/images/edits', async route => {
        requestBody = route.request().postDataBuffer()?.toString('latin1') ?? '';
        await route.fulfill({ json: { data: [{ b64_json: imageUrl.split(',')[1] }] } });
    });
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Generated result', exact: true })).toBeVisible();
    expect(requestBody).toContain('Intermediate reference request');
    expect(requestBody).toContain('1536x1024');
    expect(requestBody).toContain('transparent');
    expect(requestBody).toContain(Buffer.from(imageUrl.split(',')[1], 'base64').toString('latin1'));
    await page.screenshot({ path: testInfo.outputPath('replayed-provider-request.png'), fullPage: true });
});
