const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const origin = process.argv[2] || 'http://127.0.0.1:5177';
const output = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'aura-archive-lineage'));
const results = [];

async function readState(page) {
  return page.evaluate(async () => {
    const { archiveStore } = await import('/src/archive/ArchiveStore.ts');
    const { lineageStore } = await import('/src/lineage/LineageStore.ts');
    const { generateSessionStore } = await import('/src/generate-session/GenerateSession.ts');
    const { loadEditorDraft } = await import('/src/editor/editorDraftStorage.ts');
    const images = await archiveStore.list();
    return {
      images,
      steps: [await lineageStore.getById('source-step'), ...await lineageStore.getChildren('source-step')],
      batch: await generateSessionStore.loadCurrentBatch(),
      source: generateSessionStore.loadLineageSource(),
      editorDraft: await loadEditorDraft('source-image'),
      toasts: Array.from(document.querySelectorAll('.toast')).map(toast => toast.textContent),
    };
  });
}

async function capture(page, name) {
  const state = await readState(page);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(state, null, 2));
  return state;
}

async function openArchive(page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Archive', exact: true }).click();
  await page.locator('.archive-container .image-grid, .archive-container .empty-archive').waitFor();
}

async function scenario(browser, kind) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await context.addInitScript(origin => {
      if (location.origin !== origin || localStorage.getItem('archive-save-check')) return;
      localStorage.setItem('archive-save-check', '1');
      localStorage.setItem('aura_local_server_url', JSON.stringify('http://archive-provider.test'));
      localStorage.setItem('aura_generate_draft', JSON.stringify({
        model: 'qwen-image-2.1', prompt: 'A generated branch from the source',
        qwenImage2_1: { aspectRatio: '4:3', imageSize: '768', background: 'auto', batchSize: 1 },
      }));
    }, origin);
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin);
    await openArchive(page);
    const colors = await page.evaluate(async () => {
      const colors = ['#8e4238', '#305c8b'].map(color => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 72;
        canvas.getContext('2d').fillStyle = color;
        canvas.getContext('2d').fillRect(0, 0, 96, 72);
        return canvas.toDataURL('image/png');
      });
      const { archiveStore } = await import('/src/archive/ArchiveStore.ts');
      const { lineageStore } = await import('/src/lineage/LineageStore.ts');
      const { generateSessionStore } = await import('/src/generate-session/GenerateSession.ts');
      await archiveStore.save({
        id: 'source-image', url: colors[0], prompt: 'Original source', timestamp: '2026-09-01T00:00:00.000Z',
        quality: '768', aspectRatio: '4:3', background: 'auto', model: 'qwen-image-2.1',
        width: 96, height: 72, references: [colors[0]], favorite: true,
      });
      await lineageStore.save({ id: 'source-step', archiveImageId: 'source-image', stepType: 'generation', timestamp: '2026-09-01T00:00:00.000Z', metadata: {} });
      generateSessionStore.saveLineageSource({ archiveImageId: 'source-image', stepId: 'source-step' });
      return colors;
    });
    await page.reload();
    await openArchive(page);
    const before = await readState(page);
    if (kind === 'generate') {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Generate', exact: true }).click();
      await page.getByLabel('Add reference images').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(colors[0].split(',')[1], 'base64') });
      await page.getByRole('button', { name: 'Preview reference 1', exact: true }).waitFor();
      await page.route('http://archive-provider.test/**', route => route.fulfill({ json: { data: [{ b64_json: colors[1].split(',')[1] }] } }));
      await page.getByRole('button', { name: 'Generate image', exact: true }).click();
      await page.getByRole('button', { name: 'Save to Archive', exact: true }).waitFor();
    } else {
      await page.getByRole('button', { name: 'Open image: Original source', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByLabel('Add image layers').setInputFiles({ name: 'blue-layer.png', mimeType: 'image/png', buffer: Buffer.from(colors[1].split(',')[1], 'base64') });
      const adjustments = page.getByRole('button', { name: 'Adjustments', exact: true });
      if (await adjustments.getAttribute('aria-expanded') === 'false') await adjustments.click();
      await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('125');
      await page.getByText('Changes not yet saved to archive', { exact: true }).waitFor();
    }
    await page.evaluate(async () => {
      const moduleUrl = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/lineage/LineageStore.ts').name;
      const { lineageStore } = await import(moduleUrl);
      const save = lineageStore.save.bind(lineageStore);
      lineageStore.save = async () => {
        lineageStore.save = save;
        throw new Error('Controlled lineage failure');
      };
    });
    const saveLabel = kind === 'generate' ? 'Save to Archive' : kind === 'copy' ? 'Save as copy' : 'Save changes';
    await page.getByRole('button', { name: saveLabel, exact: true }).click();
    await page.getByText('Controlled lineage failure', { exact: true }).first().waitFor();
    const failed = await capture(page, `${kind}-failed`);
    assert.deepEqual(failed.images, before.images, 'Rejected save restores the complete prior archive');
    assert.deepEqual(failed.steps, before.steps, 'Rejected save adds no lineage');
    assert.deepEqual(failed.source, before.source, 'Rejected save retains the selected lineage source');
    assert(!failed.toasts.some(text => text.includes('saved to archive') || text.includes('Changes saved') || text.includes('saved as a copy')), 'No success toast before complete save');
    if (kind === 'generate') assert.equal(failed.batch.results[0].isSaved, false, 'Rejected Generate save remains retryable');
    else assert(failed.editorDraft, 'Rejected Editor save keeps the draft');

    await page.reload();
    await openArchive(page);
    const reloaded = await readState(page);
    assert.deepEqual(reloaded.images, before.images, 'Recovery survives reload');
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: kind === 'generate' ? 'Generate' : 'Editor', exact: true }).click();
    await page.getByRole('button', { name: saveLabel, exact: true }).click();
    if (kind === 'generate') {
      await page.getByRole('button', { name: 'Saved to Archive', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Clear result"]')?.disabled);
    } else {
      await page.getByRole('heading', { name: 'Archive', exact: true }).waitFor();
    }
    await page.reload();
    await openArchive(page);
    const saved = await capture(page, `${kind}-retried-reloaded`);
    assert.equal(saved.images.length, kind === 'overwrite' ? 1 : 2, 'Retry produces no duplicate archive image');
    assert.equal(saved.steps.length, 2, 'Exactly one new lineage step is durable');
    const step = saved.steps.find(step => step.id !== 'source-step');
    const image = saved.images.find(image => image.id === step.archiveImageId);
    assert.equal(step.parentStepId, 'source-step', 'Original selected parent survives retry');
    assert.equal(step.stepType, kind === 'generate' ? 'reference-generation' : kind === 'copy' ? 'save-as-copy' : 'overwrite');
    assert.deepEqual(image.references, [colors[0]]);
    if (kind === 'generate') {
      assert.equal(image.prompt, 'A generated branch from the source');
      assert.equal(saved.batch.results[0].isSaved, true);
    } else {
      assert.equal(image.favorite, true);
      assert.equal(image.layerStack.layers.length, 2, 'Layer assets survive recovery and retry');
      assert.equal(image.layerStack.adjustments.brightness, 125);
      assert.notEqual(image.url, before.images[0].url);
      if (kind === 'overwrite') {
        assert.equal(image.timestamp, before.images[0].timestamp, 'Overwrite retains archive timestamp');
        assert.equal(saved.editorDraft, null, 'Completed overwrite clears the saved draft');
      } else {
        assert.deepEqual(saved.images.find(image => image.id === 'source-image'), before.images[0], 'Copy preserves the source image');
      }
    }
    assert.equal(saved.source, null, 'Completed save clears the selected lineage source');
    assert.deepEqual(pageErrors, []);
    console.log(`Passed ${kind} failure, retry, and reload`);
    results.push({ kind, passed: true, images: saved.images.length, steps: saved.steps.length });
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${kind}-error.png`), fullPage: true, animations: 'disabled' });
    const message = error.message.split('\n')[0];
    results.push({ kind, passed: false, error: message });
    console.error(`${kind}: ${message}`);
  } finally { await context.close(); }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const kind of ['generate', 'overwrite', 'copy']) await scenario(browser, kind);
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(results, null, 2));
    assert(results.every(result => result.passed), `Archive/lineage checks failed; see ${output}`);
    console.log(JSON.stringify({ output, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
