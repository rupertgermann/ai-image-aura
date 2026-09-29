const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');

const origin = process.argv[2] || 'http://127.0.0.1:5177';
const output = path.resolve(process.argv[3] || '/tmp/aura-app-workflows');
const fixturePath = path.join(__dirname, '../e2e/fixtures/four-colors.png');
const results = [];

const navigate = (page, name) => page.getByRole('navigation', { name: 'Main navigation' })
  .getByRole('button', { name, exact: true }).click();

async function state(page) {
  return page.evaluate(async () => {
    const { archiveStore } = await import('/src/archive/ArchiveStore.ts');
    const { lineageStore } = await import('/src/lineage/LineageStore.ts');
    const { loadEditorDraft } = await import('/src/editor/editorDraftStorage.ts');
    const images = await archiveStore.list();
    return { images, steps: (await Promise.all(images.map(image => lineageStore.getByArchiveImageId(image.id)))).flat(), draft: await loadEditorDraft('source-image') };
  });
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  const stored = await state(page);
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(stored, null, 2));
  results.push(name);
  return stored;
}

async function createContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  return context;
}

async function contractChecks(browser) {
  const context = await createContext(browser);
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const actual = await page.evaluate(async () => {
      const { calculateApiCostTotals, sanitizeApiCostLedger } = await import('/src/costs/apiCost.ts');
      const { buildCostTotalRows } = await import('/src/components/CostSummaryPanel.tsx');
      const { sanitizeImageModelControls } = await import('/src/image-models/ImageModelControls.ts');
      const image = { id: 'image', kind: 'image-generation', operation: 'image-generation', provider: 'openai', model: 'gpt-image-2.5-flare', label: 'Image', currency: 'USD', status: 'calculated', amountUsd: 0.02 };
      const reasoning = { ...image, id: 'reasoning', kind: 'reasoning', label: 'Reasoning', status: 'unavailable', amountUsd: undefined };
      const cases = [[], [image], [reasoning], [image, reasoning], [{ ...image, amountUsd: NaN }, reasoning], [image, { ...reasoning, status: 'calculated', amountUsd: 0.01 }]];
      return {
        costs: cases.map(items => {
          const ledger = { version: 1, currency: 'USD', items };
          return { totals: calculateApiCostTotals(ledger), rows: buildCostTotalRows(ledger), compact: buildCostTotalRows(ledger, { compact: true }), sanitized: sanitizeApiCostLedger(ledger) };
        }),
        ratios: ['1024x1024', 'auto', '1536x1024', '1024x1536', ' 1536x1024 ', null, 42].map(aspectRatio => sanitizeImageModelControls('nano-banana-pro', { aspectRatio }).aspectRatio),
      };
    });
    assert.deepEqual(actual.ratios, ['1:1', '1:1', '3:2', '2:3', '3:2', '1:1', '1:1']);
    assert.deepEqual(actual.costs.map(item => item.totals.status), ['unavailable', 'calculated', 'unavailable', 'partial', 'unavailable', 'calculated']);
    assert.equal(actual.costs[3].totals.totalUsd, 0.02);
    assert.deepEqual(actual.costs[3].rows.map(row => row.label), ['Total', 'Image generation', 'Reasoning']);
    assert(actual.costs.every(item => item.compact.length === 1));
    await fs.writeFile(path.join(output, 'contracts.json'), JSON.stringify(actual, null, 2));
    results.push('cost-and-model-contracts');
  } finally { await context.close(); }
}

async function editorAndArchive(browser, imageBase64) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await page.goto(origin);
    await navigate(page, 'Archive');
    await page.getByRole('heading', { name: 'No images yet' }).waitFor();
    await page.evaluate(async imageBase64 => {
      localStorage.setItem('aura_openapi_key', JSON.stringify('sk-test-never-sent'));
      const { archiveStore } = await import('/src/archive/ArchiveStore.ts');
      const { lineageStore } = await import('/src/lineage/LineageStore.ts');
      const image = { id: 'source-image', url: `data:image/png;base64,${imageBase64}`, prompt: 'Workflow source', timestamp: '2026-09-01T00:00:00.000Z', model: 'gpt-image-2.5-flare', width: 128, height: 128, quality: 'medium', aspectRatio: '1024x1024', background: 'auto', references: [`data:image/png;base64,${imageBase64}`] };
      await archiveStore.save(image);
      await lineageStore.save({ id: 'source-step', archiveImageId: image.id, stepType: 'reference-generation', timestamp: image.timestamp, metadata: {} });
    }, imageBase64);
    await page.reload();
    await page.getByRole('button', { name: 'Open image: Workflow source', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Image details' });
    await detail.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByText('No unsaved changes', { exact: true })).toBeVisible();
    await page.getByLabel('Add image layers').setInputFiles(fixturePath);
    await page.getByLabel('four-colors.png name').fill('Overlay');
    await page.getByLabel('Overlay blend mode').selectOption('multiply');
    await page.getByLabel('Overlay opacity').fill('60');
    await page.getByLabel('Lock Overlay', { exact: true }).click();
    await expect(page.getByLabel('Overlay name', { exact: true })).toBeDisabled();
    await page.getByLabel('Unlock Overlay', { exact: true }).click();
    await page.getByLabel('Hide Overlay', { exact: true }).click();
    await page.getByLabel('Show Overlay', { exact: true }).click();
    await page.locator('.layer-name').filter({ hasText: 'Overlay' }).click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    const adjustments = page.getByRole('button', { name: 'Adjustments', exact: true });
    if (await adjustments.getAttribute('aria-expanded') === 'false') await adjustments.click();
    await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('125');
    const filters = page.getByRole('button', { name: 'Filters', exact: true });
    if (await filters.getAttribute('aria-expanded') === 'false') await filters.click();
    await page.getByRole('button', { name: 'Sepia', exact: true }).click();
    await expect.poll(async () => (await state(page)).draft?.adjustments.filter).toBe('sepia(100%)');
    const drafted = await capture(page, 'editor-draft');
    const overlay = drafted.draft.layerStack.layers.find(layer => layer.name === 'Overlay');
    assert.equal(overlay.opacity, 0.6);
    assert.equal(overlay.blendMode, 'multiply');
    assert.equal(overlay.x, 26.6);
    assert.equal(overlay.y, 35.6);
    await page.reload();
    await expect(page.getByLabel('Overlay name', { exact: true })).toBeVisible();
    assert.deepEqual((await state(page)).draft, drafted.draft, 'Draft survives reload');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

    await page.locator('.ai-edit-section > summary').click();
    await page.locator('.editor-container').getByLabel('Image model', { exact: true }).selectOption('gpt-image-2.5-flare');
    await page.getByLabel('AI transformation prompt').fill('  Replace the colored squares  ');
    await page.getByRole('button', { name: 'Mask', exact: true }).click();
    const maskDialog = page.getByRole('dialog', { name: 'Transform mask' });
    await maskDialog.getByRole('button', { name: 'Apply Mask', exact: true }).click();
    await expect(page.getByText('Paint a mask before applying it.', { exact: true })).toBeVisible();
    const canvas = maskDialog.locator('.transform-mask-canvas');
    const box = await canvas.boundingBox();
    assert(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
    await page.mouse.up();
    await maskDialog.getByRole('button', { name: 'Apply Mask', exact: true }).click();
    let editCalls = 0;
    await page.route('https://api.openai.com/v1/images/edits', route => {
      const body = route.request().postData();
      assert(body.includes('Replace the colored squares'));
      assert(body.includes('name="mask"'));
      assert.equal((body.match(/name="image\[\]"/g) || []).length, 3, 'Target, composition, and reference reach provider');
      editCalls++;
      return route.fulfill({ json: { data: [{ b64_json: imageBase64 }] } });
    });
    await page.getByRole('button', { name: 'Transform with AI', exact: true }).click();
    await page.getByLabel('AI result name', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('AI result name', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.getByLabel('AI result name', { exact: true }).fill('Final artwork');
    await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await page.getByRole('heading', { name: 'Archive', exact: true }).waitFor();
    const saved = await capture(page, 'editor-copy');
    assert.equal(editCalls, 1);
    assert.equal(saved.images.length, 2);
    const copy = saved.images.find(image => image.id !== 'source-image');
    assert.equal(copy.layerStack.layers.length, 3);
    assert.equal(copy.layerStack.adjustments.brightness, 125);
    assert.equal(saved.images.find(image => image.id === 'source-image').url, `data:image/png;base64,${imageBase64}`);
    const aiStep = saved.steps.find(step => step.archiveImageId === copy.id);
    assert.equal(aiStep.stepType, 'ai-edit');
    assert.equal(aiStep.metadata.layers.aiResultLayer.name, 'Final artwork');
    assert(aiStep.metadata.aiEdit.transformMask.dataUrl.startsWith('data:image/png'));

    const cards = page.locator('.image-card');
    await cards.first().getByTitle('Add to favorites').click();
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expect(cards).toHaveCount(1);
    await page.getByLabel('Search archive prompts').fill('missing');
    await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear Filters', exact: true }).click();
    await expect(cards).toHaveCount(2);
    await page.getByRole('button', { name: 'Select All', exact: true }).click();
    await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Delete selected', exact: true })).toBeFocused();
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download as ZIP', exact: true }).click();
    const download = await downloadReady;
    const zipPath = path.join(output, 'archive.zip');
    await download.saveAs(zipPath);
    const zipBytes = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipBytes);
    assert(zip.file('archive-manifest.json'));
    assert(zip.file('lineage-manifest.json'));
    const exported = await state(page);
    await capture(page, 'archive-export');

    const importedContext = await createContext(browser);
    try {
      const importedPage = await importedContext.newPage();
      await importedPage.goto(origin);
      await navigate(importedPage, 'Archive');
      await importedPage.getByRole('heading', { name: 'No images yet' }).waitFor();
      const summary = await importedPage.evaluate(async bytes => {
        const { archiveStore } = await import('/src/archive/ArchiveStore.ts');
        const { lineageStore } = await import('/src/lineage/LineageStore.ts');
        const { importArchiveZip } = await import('/src/archive/ArchiveTransfer.ts');
        return importArchiveZip(new Uint8Array(bytes), { archiveStore, lineageStore });
      }, Array.from(zipBytes));
      assert.deepEqual(summary.missingAssetFiles, []);
      assert.deepEqual(summary.brokenParentReferences, []);
      await importedPage.reload();
      await expect(importedPage.locator('.image-card')).toHaveCount(2);
      const imported = await capture(importedPage, 'archive-import');
      assert.deepEqual(imported.images, exported.images, 'ZIP restores pixels, layers, references and metadata');
      assert.deepEqual(imported.steps, exported.steps, 'ZIP restores masked AI lineage');
      await importedPage.getByRole('button', { name: 'Open image: Workflow source', exact: true }).first().click();
      await importedPage.getByRole('button', { name: 'Load in Editor', exact: true }).first().click();
      if (await importedPage.locator('.ai-edit-section').getAttribute('open') === null) await importedPage.locator('.ai-edit-section > summary').click();
      await expect(importedPage.getByLabel('AI transformation prompt')).toHaveValue('Replace the colored squares');
      await expect(importedPage.getByRole('button', { name: 'Edit Mask', exact: true })).toBeVisible();
      await capture(importedPage, 'editor-replay');
      await navigate(importedPage, 'Archive');
      await importedPage.getByRole('button', { name: 'Open image: Workflow source', exact: true }).last().click();
      await importedPage.getByRole('button', { name: 'Load in Generate', exact: true }).first().click();
      await expect(importedPage.getByLabel('Prompt', { exact: true })).toHaveValue('Workflow source');
      await capture(importedPage, 'generate-replay');
      await navigate(importedPage, 'Archive');
      await importedPage.getByRole('button', { name: 'Open image: Workflow source', exact: true }).last().click();
      await importedPage.getByRole('button', { name: 'Fork from this step', exact: true }).first().click();
      await expect(importedPage.getByText('Next save will branch from this lineage step', { exact: true })).toBeVisible();
      const fork = await importedPage.evaluate(async () => {
        const { generateSessionStore } = await import('/src/generate-session/GenerateSession.ts');
        return generateSessionStore.loadLineageSource();
      });
      assert.equal(fork.stepId, 'source-step');
      await importedPage.getByRole('button', { name: 'Create Similar', exact: true }).click();
      await expect(importedPage.getByLabel('Prompt', { exact: true })).toHaveValue('Workflow source');
      await expect(importedPage.getByRole('button', { name: 'Preview reference 1', exact: true })).toBeVisible();
      await capture(importedPage, 'create-similar');
      await navigate(importedPage, 'Archive');
      await importedPage.getByRole('button', { name: 'Select All', exact: true }).click();
      await importedPage.getByRole('button', { name: 'Delete selected', exact: true }).click();
      await importedPage.getByRole('dialog').getByRole('button', { name: 'Delete 2 images', exact: true }).click();
      await expect(importedPage.getByRole('heading', { name: 'No images yet', exact: true })).toBeVisible();
      await importedPage.reload();
      await expect(importedPage.getByRole('heading', { name: 'No images yet', exact: true })).toBeVisible();
      const deleted = await capture(importedPage, 'archive-deleted');
      assert.deepEqual(deleted.images, []);
    } finally { await importedContext.close(); }
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    await capture(page, 'editor-archive-failure');
    await fs.writeFile(path.join(output, 'editor-archive-failure.txt'), await page.locator('body').ariaSnapshot());
    throw error;
  } finally { await context.close(); }
}

async function settingsAndLayout(browser, imageBase64) {
  const context = await createContext(browser);
  await context.grantPermissions(['notifications'], { origin });
  const page = await context.newPage();
  try {
    await page.route('http://local-provider.test/v1/models', route => route.fulfill({ json: { data: [{ id: 'qwen-image-2.1' }] } }));
    await page.goto(origin);
    await navigate(page, 'Settings');
    const openAi = page.locator('section').filter({ has: page.getByRole('heading', { name: 'OpenAI API Key', exact: true }) });
    await page.getByRole('textbox', { name: 'OpenAI API Key', exact: true }).fill('sk-fake-never-sent');
    await openAi.getByRole('button', { name: 'Save key', exact: true }).click();
    const local = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Local server (stable-diffusion.cpp)', exact: true }) });
    await page.getByLabel('Server URL', { exact: true }).fill('bad-url');
    await local.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByLabel('Server URL', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Server URL', { exact: true }).fill('http://local-provider.test');
    await local.getByRole('button', { name: 'Save', exact: true }).click();
    await local.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(local.getByRole('status')).toHaveText('Connected. Model IDs: qwen-image-2.1');
    await page.getByRole('checkbox', { name: 'Notify when runs finish in the background' }).check();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Notify when runs finish in the background' })).toBeChecked();
    await expect(page.getByLabel('Server URL', { exact: true })).toHaveValue('http://local-provider.test');
    for (const width of [320, 390, 800, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ['Generate', 'Archive', 'Editor', 'Settings']) {
        await navigate(page, view);
        await expect(page.getByRole('heading', { name: view, exact: true })).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${view} has no horizontal page overflow at ${width}px`);
        await capture(page, `${view.toLowerCase()}-${width}`);
      }
    }
    let releaseResponse;
    const responseReady = new Promise(resolve => { releaseResponse = resolve; });
    await page.route('https://api.openai.com/v1/images/generations', async route => {
      await responseReady;
      await route.fulfill({ json: { data: [{ b64_json: imageBase64 }] } });
    });
    await navigate(page, 'Generate');
    await page.getByLabel('Prompt', { exact: true }).fill('Generation survives navigation');
    const requested = page.waitForRequest('https://api.openai.com/v1/images/generations');
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await requested;
    await navigate(page, 'Settings');
    releaseResponse();
    await navigate(page, 'Generate');
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    await expect.poll(async () => (await state(page)).images.length).toBe(1);
    const generated = await capture(page, 'generation-across-navigation');
    assert.equal(generated.images[0].prompt, 'Generation survives navigation');
    assert.equal(generated.images[0].url, `data:image/png;base64,${imageBase64}`);
  } finally { await context.close(); }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await contractChecks(browser);
    const imageBase64 = (await fs.readFile(fixturePath)).toString('base64');
    await editorAndArchive(browser, imageBase64);
    await settingsAndLayout(browser, imageBase64);
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ passed: true, checkpoints: results }, null, 2));
    console.log(`Passed ${results.length} app workflow checkpoints; evidence at ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
