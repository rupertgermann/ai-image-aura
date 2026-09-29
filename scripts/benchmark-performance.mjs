import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const label = process.argv[2] ?? 'current';
assert.match(label, /^[a-z0-9-]+$/);
const output = path.join(root, 'performance.local', label);
const dist = process.env.PERF_DIST ? path.resolve(process.env.PERF_DIST) : path.join(output, 'dist');
const runs = Number(process.env.PERF_RUNS ?? 7);
assert(Number.isInteger(runs) && runs > 0);
await mkdir(output, { recursive: true });
if (!process.env.PERF_DIST) {
    await build({ root, build: { outDir: dist, emptyOutDir: true,
        rollupOptions: {
            input: { app: path.join(root, 'index.html'), fixture: path.join(root, 'scripts/performance-fixture.ts') },
            preserveEntrySignatures: 'strict',
            output: { entryFileNames: 'assets/[name].js' },
        },
    } });
    const sourceDiff = execFileSync('git', ['diff', '--', 'src'], { cwd: root, encoding: 'utf8' });
    await writeFile(path.join(dist, 'benchmark-build.json'), JSON.stringify({
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        sourceDiff, sourceDiffSha256: createHash('sha256').update(sourceDiff).digest('hex'),
        fixtureSha256: createHash('sha256').update(await readFile(path.join(root, 'scripts/performance-fixture.ts'))).digest('hex'),
    }, null, 2));
}
const buildInfo = JSON.parse(await readFile(path.join(dist, 'benchmark-build.json'), 'utf8'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        response.setHeader('Cache-Control', 'no-store');
        if (pathname === '/fixture') {
            response.setHeader('Content-Type', 'text/html');
            response.end('<!doctype html><title>Isolated performance fixture</title>');
            return;
        }
        const target = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
        if (!target.startsWith(`${dist}${path.sep}`)) throw new Error('Invalid path');
        response.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream');
        response.end(await readFile(target));
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:' ? route.continue() : route.abort();
});
await context.addInitScript(() => {
    window.perfCounters = { reads: 0, writes: 0, writeCharacters: 0, archiveInitStatements: 0, longTasks: [] };
    const postMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...args) {
        if (message?.type === 'query' && typeof message.sql === 'string'
            && /CREATE TABLE IF NOT EXISTS images|ALTER TABLE images/.test(message.sql)) {
            window.perfCounters.archiveInitStatements++;
        }
        return postMessage.call(this, message, ...args);
    };
    for (const method of ['get', 'put']) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (...args) {
            if (method === 'get') window.perfCounters.reads++;
            else {
                window.perfCounters.writes++;
                if (typeof args[0] === 'string') window.perfCounters.writeCharacters += args[0].length;
            }
            return original.apply(this, args);
        };
    }
    new PerformanceObserver(list => {
        window.perfCounters.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })));
    }).observe({ type: 'longtask', buffered: true });
});
const navigation = page.getByRole('navigation', { name: 'Main navigation' });
const samples = [];
const nextPaint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const now = () => page.evaluate(() => performance.now());
const counts = () => page.evaluate(() => ({ ...window.perfCounters }));
const cdP = await context.newCDPSession(page);
try {
    await page.goto(`${origin}/fixture`);
    const fixture = await page.evaluate(async () => (await import('/assets/fixture.js')).seed());
    const originalImageHash = await page.evaluate(async () => {
        const { archiveStore } = await import('/assets/fixture.js');
        const image = await archiveStore.get('perf-0');
        delete image.favorite;
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(image)));
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    });
    await page.goto(origin);
    await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 300);
    await nextPaint();
    await context.tracing.start({ screenshots: true, snapshots: false });
    await cdP.send('Profiler.enable');
    await cdP.send('Profiler.start');
    const favorite = page.locator('.image-card').first().getByRole('button', { name: /favorites/ });
    let expectedFavorite = false;
    for (let run = 0; run <= runs; run++) {
        await page.reload();
        await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 300);
        await page.locator('.card-image').first().evaluate(image => image.decode());
        await nextPaint();
        const archiveReadyMs = await now();
        const search = page.getByRole('searchbox', { name: 'Search archive prompts' });
        let start = await now();
        await search.fill('layered');
        await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 1);
        await nextPaint();
        const searchMs = await now() - start;
        start = await now();
        await search.fill('');
        await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 300);
        await nextPaint();
        const clearSearchMs = await now() - start;
        const before = await counts();
        assert.equal(await favorite.getAttribute('aria-pressed'), String(expectedFavorite), 'Favorite state survives reload');
        expectedFavorite = !expectedFavorite;
        start = await now();
        await favorite.click();
        await page.waitForFunction(expected => document.querySelector('.card-favorite-toggle')?.getAttribute('aria-pressed') === String(expected), expectedFavorite);
        await nextPaint();
        const favoriteMs = await now() - start;
        const after = await counts();
        const sample = { run, archiveReadyMs, searchMs, clearSearchMs, favoriteMs,
            archiveInitStatements: after.archiveInitStatements,
            favoriteReads: after.reads - before.reads, favoriteWrites: after.writes - before.writes,
            favoriteWriteCharacters: after.writeCharacters - before.writeCharacters,
            longTaskMs: after.longTasks.reduce((sum, task) => sum + task.duration, 0),
            domNodes: await page.locator('*').count() };
        if (run > 0) samples.push(sample);
        console.log(JSON.stringify({ label, warmup: run === 0, ...sample }));
        if (run === 0) {
            const { profile } = await cdP.send('Profiler.stop');
            await writeFile(path.join(output, 'browser.cpuprofile'), JSON.stringify(profile));
            await context.tracing.stop({ path: path.join(output, 'trace.zip') });
        }
    }
    await page.reload();
    await navigation.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 300);
    assert.equal(await favorite.getAttribute('aria-pressed'), String(expectedFavorite), 'Final favorite state survives reload');
    await page.screenshot({ path: path.join(output, 'archive.png') });
    const stored = await page.evaluate(async () => {
        const { archiveStore } = await import('/assets/fixture.js');
        const image = await archiveStore.get('perf-0');
        const favorite = image.favorite ?? false;
        delete image.favorite;
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(image)));
        return { favorite, imageHash: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''), layers: image.layerStack.layers.length,
            references: image.references.length, imageUrlLength: image.url.length,
            layerUrlLengths: image.layerStack.layers.map(layer => layer.assetUrl.length) };
    });
    assert.equal(stored.favorite, expectedFavorite);
    assert.equal(stored.imageHash, originalImageHash, 'Favorite changes preserve every other metadata field and asset byte');
    assert.equal(stored.layers, 4);
    assert.equal(stored.references, 1);
    assert.equal(stored.imageUrlLength, fixture.artworkBytes);
    assert(stored.layerUrlLengths.every(length => length === fixture.artworkBytes));
    if (process.env.PERF_EXPECT_METADATA_ONLY === '1') {
        assert(samples.every(sample => sample.favoriteReads === 0 && sample.favoriteWrites === 0), 'Favorite updates perform no IndexedDB asset I/O');
        const missingError = await page.evaluate(async () => {
            const { archiveStore } = await import('/assets/fixture.js');
            try { await archiveStore.setFavorite('missing-image', true); }
            catch (error) { return error.message; }
            return null;
        });
        assert.equal(missingError, 'Archive image no longer exists');
    }
    await page.getByRole('button', { name: 'Open image: Performance layered image', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
    const brightness = page.getByRole('slider', { name: 'Brightness', exact: true });
    await brightness.fill('125');
    await page.getByText('Changes not yet saved to archive', { exact: true }).waitFor();
    await page.waitForFunction(async () => {
        const { loadEditorDraft } = await import('/assets/fixture.js');
        return (await loadEditorDraft('perf-0'))?.adjustments.brightness === 125;
    });
    await page.screenshot({ path: path.join(output, 'editor.png') });
    await page.reload();
    await navigation.getByRole('button', { name: 'Editor', exact: true }).click();
    await brightness.waitFor();
    assert.equal(await brightness.inputValue(), '125');
    assert.deepEqual(errors, []);
    const summary = {};
    for (const key of Object.keys(samples[0]).filter(key => key !== 'run')) {
        const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
        summary[key] = { median: values[Math.floor(values.length / 2)], min: values[0], max: values.at(-1) };
    }
    await writeFile(path.join(output, 'results.json'), JSON.stringify({ label, build: buildInfo,
        browser: browser.version(), platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0].model,
        viewport: { width: 1440, height: 1000 }, runs, fixture, samples, summary,
        checks: { stored, editorDraftSurvivesReload: true, pageErrors: errors } }, null, 2));
    console.log(JSON.stringify({ output, summary }, null, 2));
} finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
