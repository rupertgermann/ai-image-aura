const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Run against a Vite dev server. Provider calls are mocked; each scenario uses fresh browser storage.
const origin = process.argv[2] || 'http://127.0.0.1:5177';
const output = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'aura-generation-batch'));
const results = [];

async function readState(page) {
  return page.evaluate(async () => {
    const { generateSessionStore } = await import('/src/generate-session/GenerateSession.ts');
    const { archiveStore } = await import('/src/archive/ArchiveStore.ts');
    const { lineageStore } = await import('/src/lineage/LineageStore.ts');
    const images = await archiveStore.list();
    const steps = await Promise.all(images.map(image => lineageStore.getByArchiveImageId(image.id)));
    return { batch: await generateSessionStore.loadCurrentBatch(), images, steps: steps.flat() };
  });
}

async function waitForSaved(page, count) {
  await page.waitForFunction(expected => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const saved = buttons.filter(button => /^(Saved|Saved to Archive)$/.test(button.textContent.trim()));
    const clear = buttons.find(button => /^Clear results?$/.test(button.getAttribute('aria-label') || button.textContent.trim()));
    return saved.length === expected && clear && !clear.disabled;
  }, count);
}

async function waitForArchiveLoad(page) {
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.locator('.archive-container .image-grid, .archive-container .empty-archive').waitFor();
  await navigation.getByRole('button', { name: 'Generate', exact: true }).click();
}

async function createScenario(browser, name, batchSize) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ origin, name, batchSize }) => {
    if (location.origin !== origin || localStorage.getItem('batch-check-seeded')) return;
    localStorage.setItem('batch-check-seeded', '1');
    localStorage.setItem('aura_local_server_url', JSON.stringify('http://batch-provider.test'));
    localStorage.setItem('aura_openapi_key', JSON.stringify('test-key-never-sent'));
    localStorage.setItem('aura_google_api_key', JSON.stringify('google-key-never-sent'));
    localStorage.setItem('aura_generate_draft', JSON.stringify({
      model: 'qwen-image-2.1', prompt: `${name} original prompt`,
      qwenImage2_1: { aspectRatio: '4:3', imageSize: '768', background: 'auto', batchSize },
    }));
  }, { origin, name, batchSize });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  await page.getByLabel('Prompt', { exact: true }).waitFor();
  await waitForArchiveLoad(page);
  const images = await page.evaluate(() => ['#8e4238', '#305c8b', '#37634d'].map(color => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 72;
    canvas.getContext('2d').fillStyle = color;
    canvas.getContext('2d').fillRect(0, 0, 96, 72);
    return canvas.toDataURL('image/png');
  }));
  await page.getByLabel('Add reference images').setInputFiles({
    name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(images[0].split(',')[1], 'base64'),
  });
  await page.getByRole('button', { name: 'Preview reference 1', exact: true }).waitFor();
  return { page, context, images, errors };
}

async function capture(page, name, extra = {}) {
  const state = await readState(page);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(state, null, 2));
  results.push({ name, archivedImages: state.images.length, lineageSteps: state.steps.length, ...extra });
  console.log(`Captured ${name}`);
  return state;
}

function assertOriginalImages(state, prompt, references) {
  for (const image of state.images) {
    assert.equal(image.prompt, prompt, 'Saved prompt comes from the run');
    assert.equal(image.model, 'qwen-image-2.1');
    assert.equal(image.aspectRatio, '4:3');
    assert.equal(image.quality, '768');
    assert.deepEqual(image.references, references, 'Saved references come from the run');
    assert(image.actualParameters.elapsedMs >= 0, 'Measured parameters survive saving');
    assert(state.steps.some(step => step.archiveImageId === image.id), 'Every saved image has lineage');
  }
}

async function mixedBatch(browser) {
  const { page, context, images, errors } = await createScenario(browser, 'mixed', 4);
  try {
    await page.route('http://batch-provider.test/**', route => route.fulfill({
      json: { data: [{ b64_json: images[0].split(',')[1] }, {}, { b64_json: images[1].split(',')[1] }, { b64_json: images[2].split(',')[1] }] },
    }));
    await page.getByRole('button', { name: 'Generate 4 images', exact: true }).click();
    await page.locator('.result-slot-card').nth(3).waitFor();
    assert.equal(await page.locator('.result-slot-card.failed').count(), 1);
    await page.getByLabel('Prompt', { exact: true }).fill('Changed draft after generation');
    await page.getByLabel('ASPECT RATIO', { exact: true }).selectOption('1:1');
    await page.locator('.result-slot-card').nth(0).getByRole('button', { name: 'Save', exact: true }).click();
    await waitForSaved(page, 1);
    await page.evaluate(async () => {
      // Vite's HMR query identifies the store instance used by the app.
      const moduleUrl = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/archive/ArchiveStore.ts').name;
      const { archiveStore } = await import(moduleUrl);
      const save = archiveStore.save.bind(archiveStore);
      let calls = 0;
      archiveStore.save = image => ++calls === 2 ? Promise.reject(new Error('Controlled archive failure')) : save(image);
    });
    await page.getByRole('button', { name: /Save all/i }).click();
    await page.getByText('Controlled archive failure', { exact: true }).first().waitFor();
    await waitForSaved(page, 2);
    let state = await capture(page, 'mixed-partial-save');
    assert.equal(state.images.length, 2);
    assertOriginalImages(state, 'mixed original prompt', [images[0]]);
    await page.reload();
    await waitForArchiveLoad(page);
    await page.locator('.result-slot-card').nth(3).waitFor();
    assert.equal(await page.locator('.result-slot-card').getByRole('button', { name: 'Saved', exact: true }).count(), 2);
    await page.getByRole('button', { name: /Save all/i }).click();
    await waitForSaved(page, 3);
    state = await capture(page, 'mixed-reloaded-saved');
    assert.equal(state.images.length, 3, 'Retry does not duplicate successful saves');
    assertOriginalImages(state, 'mixed original prompt', [images[0]]);
    assert.equal(state.batch.results[1].status, 'failed');
    await page.getByRole('button', { name: 'Clear results', exact: true }).click();
    await page.locator('.result-slot-card').waitFor({ state: 'detached' });
    await page.waitForFunction(async () => {
      const { generateSessionStore } = await import('/src/generate-session/GenerateSession.ts');
      return await generateSessionStore.loadCurrentBatch() === null;
    });
    await page.reload();
    await waitForArchiveLoad(page);
    assert.equal((await readState(page)).batch, null, 'Clear survives reload');
    assert.deepEqual(errors, []);
  } catch (error) {
    await capture(page, 'mixed-failure');
    throw error;
  } finally { await context.close(); }
}

async function autopilot(browser, kind) {
  const { page, context, images, errors } = await createScenario(browser, `autopilot-${kind}`, 4);
  let releaseImage;
  let blockedImage;
  const blocked = new Promise(resolve => { blockedImage = resolve; });
  const release = new Promise(resolve => { releaseImage = resolve; });
  const calls = [];
  let evaluations = 0;
  const stopAt = kind === 'cancelled' ? 3 : 2;
  try {
    await page.route('http://batch-provider.test/**', async route => {
      calls.push(route.request().postData());
      if (calls.length === stopAt) { blockedImage(); await release; }
      await route.fulfill({ json: { data: [{ b64_json: images[Math.min(calls.length - 1, 2)].split(',')[1] }] } });
    });
    await page.route('https://api.openai.com/v1/responses', route => {
      const request = route.request().postDataJSON();
      const isEvaluation = JSON.stringify(request).includes('satisfaction-evaluator.v1');
      const outputText = isEvaluation
        ? JSON.stringify({ score: [70, 40, 20][evaluations++], feedback: ['Make the image closer to the goal.'] })
        : 'A refined prompt for the next iteration';
      return route.fulfill({ json: { output_text: outputText, usage: { input_tokens: 20, output_tokens: 10 } } });
    });
    if (kind === 'serialization-failure') {
      await page.evaluate(async () => {
        const moduleUrl = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/image-workflow/ImageWorkflow.ts').name;
        const { imageWorkflow } = await import(moduleUrl);
        const serialize = imageWorkflow.serializeReferences;
        imageWorkflow.serializeReferences = async () => {
          imageWorkflow.serializeReferences = serialize;
          throw new Error('Controlled reference serialization failure');
        };
      });
    }
    if (kind === 'persistence-failure') {
      await page.evaluate(async () => {
        const moduleUrl = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/generate-session/GenerateSession.ts').name;
        const { generateSessionStore } = await import(moduleUrl);
        const save = generateSessionStore.saveCurrentBatch.bind(generateSessionStore);
        generateSessionStore.saveCurrentBatch = async () => {
          generateSessionStore.saveCurrentBatch = save;
          throw new Error('Controlled batch persistence failure');
        };
      });
    }
    await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
    await page.getByLabel('Goal', { exact: true }).fill('The original reference rendered in warm light');
    await page.getByLabel('Max iterations').fill(String(stopAt));
    await page.getByLabel('Satisfaction threshold').fill('90');
    await page.getByRole('button', { name: 'Run Autopilot', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Run', exact: true }).click();
    await Promise.race([blocked, new Promise((_, reject) => setTimeout(() => reject(new Error('Autopilot never reached the held image request')), 15000).unref())]);
    assert.equal(await page.getByAltText('Generated result', { exact: true }).getAttribute('src'), images[stopAt - 2], 'Live preview is the latest iteration');
    await page.screenshot({ path: path.join(output, `autopilot-${kind}-live.png`), fullPage: true, animations: 'disabled' });
    if (kind === 'cancelled') await page.getByRole('button', { name: 'Stop after this iteration', exact: true }).click();
    releaseImage();
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).waitFor();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Save to Archive')?.disabled);
    if (kind === 'serialization-failure') {
      await page.getByText('Controlled reference serialization failure', { exact: true }).waitFor();
      assert.equal(await page.getByAltText('Generated result', { exact: true }).getAttribute('src'), images[1], 'Latest iteration stays saveable after serialization failure');
      await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
      await waitForSaved(page, 1);
      const state = await capture(page, 'autopilot-serialization-failure-saved');
      assert.equal(state.images.length, 1);
      assert.equal(state.images[0].url, images[1]);
      assertOriginalImages(state, 'autopilot-serialization-failure original prompt', [images[0]]);
      assert.deepEqual(errors, []);
      return;
    }
    assert.equal(await page.getByAltText('Generated result', { exact: true }).getAttribute('src'), images[0], 'Final preview is the best iteration');
    if (kind === 'persistence-failure') {
      await page.getByText('Controlled batch persistence failure', { exact: true }).waitFor();
      assert.equal((await readState(page)).batch, null, 'Failed storage write leaves no persisted batch');
      await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
      await waitForSaved(page, 1);
      const state = await capture(page, 'autopilot-persistence-failure-saved');
      assert.equal(state.images.length, 1);
      assert.equal(state.images[0].url, images[0], 'Completed best result stays saveable after storage failure');
      assertOriginalImages(state, 'autopilot-persistence-failure original prompt', [images[0]]);
      assert.equal(state.batch.draft.qwenImage2_1.batchSize, 1);
      assert.equal(state.steps[0].parentStepId, state.batch.lineageSource.stepId);
      assert.deepEqual(errors, []);
      return;
    }
    let state = await readState(page);
    const source = state.batch.lineageSource;
    assert.equal(state.batch.draft.prompt, `autopilot-${kind} original prompt`);
    assert.equal(state.batch.draft.qwenImage2_1.batchSize, 1, 'Autopilot records the used single-image controls');
    assert(state.batch.results[0].costLedger.items.length > 0, 'Cost ledger survives completion');
    assert(calls.every(body => body.includes('name="n"\r\n\r\n1')), 'Every Autopilot provider request has one image');
    await page.reload();
    await waitForArchiveLoad(page);
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    await waitForSaved(page, 1);
    state = await capture(page, `autopilot-${kind}-saved`, { providerCalls: calls.length });
    assert.equal(state.images.length, 1);
    assertOriginalImages(state, `autopilot-${kind} original prompt`, [images[0]]);
    assert.equal(state.steps[0].parentStepId, source.stepId, 'Saved result branches from the selected best iteration');
    assert.deepEqual(errors, []);
  } finally { releaseImage(); await context.close(); }
}

async function reasoningSelection(browser, model) {
  const { page, context, images, errors } = await createScenario(browser, model, 1);
  const google = model === 'gemini-2.5-flash';
  const endpoint = google
    ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    : 'https://api.openai.com/v1/responses';
  const operations = [];
  const imageRequests = [];
  let evaluations = 0;
  try {
    await page.route('http://batch-provider.test/**', route => {
      imageRequests.push(route.request().postData());
      return route.fulfill({ json: { data: [{ b64_json: images[imageRequests.length - 1].split(',')[1] }] } });
    });
    await page.route(endpoint, route => {
      const request = route.request();
      const body = request.postDataJSON();
      assert.equal(request.headers()[google ? 'x-goog-api-key' : 'authorization'], google ? 'google-key-never-sent' : 'Bearer test-key-never-sent');
      if (!google) assert.equal(body.model, model);
      const text = JSON.stringify(body);
      const operation = text.includes('goal-prompt-translator.v1') ? 'goal-translation'
        : text.includes('satisfaction-evaluator.v1') ? 'satisfaction-evaluation' : 'prompt-refinement';
      operations.push(operation);
      const outputText = operation === 'goal-translation' ? 'A paper crane in warm light'
        : operation === 'prompt-refinement' ? 'A paper crane in stronger warm light'
          : JSON.stringify({ score: [40, 95][evaluations++], feedback: ['Use stronger warm light.'] });
      return route.fulfill({ json: google
        ? { candidates: [{ content: { parts: [{ text: outputText }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 } }
        : { output_text: outputText, usage: { input_tokens: 20, output_tokens: 10 } } });
    });
    await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
    await page.getByLabel('Reasoning model', { exact: true }).selectOption(model);
    await page.getByLabel('Goal', { exact: true }).fill('A paper crane in warm light');
    await page.getByRole('button', { name: 'Create starting prompt', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#generation-prompt').value === 'A paper crane in warm light');
    const startingPrompt = google ? 'A user-edited paper crane prompt' : 'A paper crane in warm light';
    if (google) await page.getByLabel('Starting prompt', { exact: true }).fill(startingPrompt);
    await page.getByLabel('Max iterations').fill('2');
    await page.getByRole('button', { name: 'Run Autopilot', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Run', exact: true }).click();
    await page.getByText('Best result selected from iteration 2.', { exact: true }).waitFor();
    assert.deepEqual(operations, ['goal-translation', 'satisfaction-evaluation', 'prompt-refinement', 'satisfaction-evaluation']);
    assert.equal(imageRequests.length, 2);
    assert(imageRequests[0].includes(startingPrompt), 'First image uses the editable starting prompt');
    assert(imageRequests[1].includes('A paper crane in stronger warm light'), 'Next image uses the selected reasoning model refinement');
    await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    await waitForSaved(page, 1);
    const state = await capture(page, `reasoning-${model}`, { reasoningModel: model, operations });
    const reasoningCosts = state.images[0].costLedger.items.filter(item => item.kind === 'reasoning');
    assert.deepEqual(reasoningCosts.map(item => item.operation), google ? operations.slice(1) : operations,
      'Translation cost follows the existing goal-and-prompt association');
    assert(reasoningCosts.every(item => item.provider === (google ? 'google' : 'openai') && item.model === model));
    assert.equal(state.images[0].model, 'qwen-image-2.1', 'Image model remains independent');
    assert.equal(state.images[0].url, images[1], 'Best image survives archive save');
    const iterations = await page.evaluate(async stepId => {
      const { lineageStore } = await import('/src/lineage/LineageStore.ts');
      const best = await lineageStore.getById(stepId);
      return [await lineageStore.getById(best.parentStepId), best];
    }, state.batch.lineageSource.stepId);
    assert.deepEqual(iterations.map(step => step.metadata.reasoningModel.slug), [model, model]);
    assert.equal(state.steps[0].parentStepId, iterations[1].id);
    await fs.writeFile(path.join(output, `reasoning-${model}-iterations.json`), JSON.stringify(iterations, null, 2));
    assert.deepEqual(errors, []);
  } catch (error) {
    await capture(page, `reasoning-${model}-failure`);
    throw error;
  } finally { await context.close(); }
}

async function imageModelControls(browser, autopilotMode) {
  const name = autopilotMode ? 'nano-controls' : 'gpt-controls';
  const model = autopilotMode ? 'nano-banana-pro' : 'gpt-image-2.5-flare';
  const { page, context, images, errors } = await createScenario(browser, name, 1);
  const requests = [];
  const endpoint = autopilotMode
    ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'
    : 'https://api.openai.com/v1/images/edits';
  const controls = autopilotMode
    ? { aspectRatio: '16:9', imageSize: '4K', batchSize: 1 }
    : { quality: 'high', size: '1536x1024', background: 'transparent', batchSize: 2 };
  const draftKey = autopilotMode ? 'nanoBananaPro' : 'gptImage';
  try {
    await page.route(endpoint, route => {
      const request = route.request();
      const body = autopilotMode ? request.postDataJSON() : request.postData();
      requests.push(body);
      assert.equal(request.headers()[autopilotMode ? 'x-goog-api-key' : 'authorization'],
        autopilotMode ? 'google-key-never-sent' : 'Bearer test-key-never-sent');
      if (autopilotMode) {
        assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: '16:9', imageSize: '4K' });
        assert.equal(body.contents[0].parts.filter(part => part.inline_data).length, 1);
      } else {
        for (const [field, value] of Object.entries({ model, quality: 'high', size: '1536x1024', background: 'transparent', n: '2' })) {
          assert(body.includes(`name="${field}"\r\n\r\n${value}`), `GPT provider receives ${field}=${value}`);
        }
      }
      return route.fulfill({ json: autopilotMode
        ? { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: images[requests.length - 1].split(',')[1] } }] } }] }
        : { data: images.slice(0, 2).map(image => ({ b64_json: image.split(',')[1] })) } });
    });
    let evaluations = 0;
    if (autopilotMode) await page.route('https://api.openai.com/v1/responses', route => {
      const evaluation = JSON.stringify(route.request().postDataJSON()).includes('satisfaction-evaluator.v1');
      return route.fulfill({ json: {
        output_text: evaluation ? JSON.stringify({ score: [40, 95][evaluations++], feedback: ['Improve the light.'] }) : 'Refined Nano prompt',
        usage: { input_tokens: 20, output_tokens: 10 },
      } });
    });
    await page.getByLabel('Image model', { exact: true }).selectOption(model);
    if (autopilotMode) {
      await page.getByLabel('ASPECT RATIO', { exact: true }).selectOption('16:9');
      await page.getByRole('button', { name: '4K', exact: true }).click();
      await page.getByLabel('BATCH SIZE', { exact: true }).selectOption('4');
      await page.getByRole('button', { name: 'Autopilot', exact: true }).click();
      await page.getByLabel('Goal', { exact: true }).fill('Nondefault Nano image controls');
      await page.getByLabel('Max iterations').fill('2');
      await page.getByRole('button', { name: 'Run Autopilot', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm Run', exact: true }).click();
      await page.getByText('Best result selected from iteration 2.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Save to Archive', exact: true }).click();
    } else {
      await page.getByLabel('QUALITY', { exact: true }).selectOption('high');
      await page.getByLabel('SIZE', { exact: true }).selectOption('1536x1024');
      await page.getByLabel('BACKGROUND', { exact: true }).selectOption('transparent');
      await page.getByLabel('BATCH SIZE', { exact: true }).selectOption('2');
      await page.getByRole('button', { name: 'Generate 2 images', exact: true }).click();
      await page.locator('.result-slot-card').nth(1).waitFor();
      await page.getByRole('button', { name: /Save all/i }).click();
    }
    await waitForSaved(page, autopilotMode ? 1 : 2);
    const state = await capture(page, name, { model, providerCalls: requests.length });
    assert.equal(requests.length, autopilotMode ? 2 : 1);
    assert.equal(state.batch.draft.model, model);
    assert.deepEqual(state.batch.draft[draftKey], controls, 'Batch retains native controls actually used');
    assert.equal(state.images.length, autopilotMode ? 1 : 2);
    for (const image of state.images) {
      assert.equal(image.model, model);
      assert.equal(image.prompt, autopilotMode ? 'Refined Nano prompt' : `${name} original prompt`);
      assert.equal(image.aspectRatio, autopilotMode ? '16:9' : '1536x1024');
      assert.equal(image.quality, autopilotMode ? '4K' : 'high');
      assert.equal(image.background, autopilotMode ? 'auto' : 'transparent');
      assert.deepEqual(image.references, [images[0]]);
      const step = state.steps.find(step => step.archiveImageId === image.id);
      assert(step, 'Saved image has lineage');
      assert.equal(step.metadata.imageModel.slug, model);
      assert.deepEqual(step.metadata.imageModel.controls, { ...controls, batchSize: 1 });
    }
    if (autopilotMode) {
      const iteration = await page.evaluate(async id => {
        const { lineageStore } = await import('/src/lineage/LineageStore.ts');
        return lineageStore.getById(id);
      }, state.batch.lineageSource.stepId);
      assert.deepEqual(iteration.metadata.imageModel.controls, controls, 'Autopilot lineage records one-image native controls');
    }
    await fs.writeFile(path.join(output, `${name}-requests.json`), JSON.stringify(requests, null, 2));
    assert.deepEqual(errors, []);
  } catch (error) {
    await capture(page, `${name}-failure`);
    throw error;
  } finally { await context.close(); }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await mixedBatch(browser);
    await autopilot(browser, 'completed');
    await autopilot(browser, 'cancelled');
    await autopilot(browser, 'serialization-failure');
    await autopilot(browser, 'persistence-failure');
    await reasoningSelection(browser, 'gpt-6-sol');
    await reasoningSelection(browser, 'gemini-2.5-flash');
    await imageModelControls(browser, false);
    await imageModelControls(browser, true);
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ output, checks: results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
