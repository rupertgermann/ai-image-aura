# Generation batch validation

Validated on 28 September 2026 on `feat/generation-batch-ownership`.

The Generate controller now owns one completed `GenerateBatchSnapshot`. Autopilot returns its batch; the controller publishes and persists it once. Live iteration previews remain separate. Storage keys, legacy metadata fallback, and the Generate view contract are unchanged.

Completed results become visible before storage finishes. If persistence fails, the completed best image and its run metadata remain available for Save. Previously, this failure could leave the latest Autopilot preview with incomplete run metadata.

## Repeat the browser check

Install dependencies inside this checkout; do not share or symlink `node_modules` between worktrees because Vite must load SQLocal workers from the same root. The verifier uses Playwright's bundled Chromium, without a system Chrome installation.

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

Optionally set `PLAYWRIGHT_BROWSERS_PATH` to an isolated browser cache before installing Chromium, and use the same value when running the verifier or Playwright. For example, this validation used `export PLAYWRIGHT_BROWSERS_PATH=/tmp/aura-playwright-browsers`; that temporary path is not required.

Start an isolated Vite server, then run the check from another terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5177 --strictPort
```

```sh
node scripts/verify-generation-batch.cjs http://127.0.0.1:5177 /tmp/aura-generation-batch
```

The existing `npm run test:e2e` configuration owns port 5183 and refuses server reuse. Parallel agents can run focused tests independently, but must hand off that browser-test port and use separate artifact directories; stop a manually started server before Playwright starts its own.

The script uses fresh browser storage for each scenario, mocks image and reasoning HTTP responses, and blocks other external requests. The app, archive storage, lineage storage, and session persistence run normally. It writes screenshots, stored-state JSON, and `summary.json` after all assertions pass.

Checks cover mixed successful/failed slots; edits after generation; individual Save followed by Save all; recovery from a later archive-save failure without duplicates; reload and Clear; live latest versus final best Autopilot images; cancellation; original prompt, controls, references, costs, and lineage; and saving after reference serialization or batch persistence fails.

## Results and limits

All baseline browser scenarios passed before and after the refactor. The added persistence-failure scenario passed with the completed best result and its provenance intact. The full suite passed with the archive save follow-up: 256 tests across 35 files. ESLint, type checking, production build, and diff checks passed.

Paid providers were mocked. The existing development server and browser storage were not used. Archive completion now uses the shared save module described in [Archive image and lineage save validation](archive-lineage-validation.md). Batch progress records each result after its archive image and lineage step are saved.

## Autopilot reasoning ownership

The browser check also covers Local server images with each hosted reasoning model. It creates a starting prompt, runs evaluation and refinement, saves the best result, and verifies provider credentials, costs, and lineage identity. The Google scenario edits the starting prompt and verifies that the earlier translation cost is excluded, matching the existing goal-and-prompt association.

`AutopilotSession` selects the reasoning model, credential, and transport for both goal translation and the iteration loop. Generate no longer assembles the three reasoning functions. Tests can replace the reasoning transport without replacing its selected model identity.

The Clear check waits for session storage deletion before reloading. Clearing the visible results happens before that asynchronous deletion completes.

Validated on 29 September 2026. The browser checks passed before and after the refactor with matching summaries across eight saved checkpoints. All 256 tests across 35 files passed, along with type checking, ESLint, and the production build. Provider responses were mocked; paid-provider availability was not tested.

## Image-model controls

Generation now passes a typed model/control pair into `ImageWorkflow`. The workflow maps native controls to provider requests without a flattened intermediate representation. Autopilot copies nested controls for each iteration, and its lineage writer reads those controls directly. Drafts, saved batches, archive fields, and historical replay keep their existing formats.

The browser check adds GPT single-shot generation with high quality, wide size, transparent background, and two results. It also runs Nano Banana Autopilot with 16:9, 4K, and a draft batch size of four, verifying one image per iteration. Both scenarios check provider requests, saved batch controls, archive fields, and lineage. Failure injection uses the module instance loaded by the app so the checks work after Vite hot reloads.

Validated on 29 September 2026. All ten browser checkpoints passed before and after the refactor with matching summaries. GPT and Nano Banana provider requests, batch drafts, saved image controls, and lineage controls matched the baseline. Multipart request comparison ignores the generated boundary. The existing tests were migrated before implementation; all 256 tests across 35 files passed, along with type checking, ESLint, and the production build. Hosted provider responses were mocked.

## Controller ownership

Validated on 9 November 2026 for #182, starting from integrated provider/control commit `9923b84`. Generate now copies reference files directly before asynchronous work and owns its partial-preview run guard. Save coordination resolves the legacy null-reference fallback directly, retaining sequential archive/lineage completion and per-result progress. The archive-image builder remains private; no persistence format changed.

Before controller changes, the verifier needed two corrections to match current behavior: Clear must wait for all result slots to disappear instead of using a strict single-element locator; reference serialization now runs before Autopilot provider calls. The serialization-failure scenario therefore first creates a completed result, then verifies that failed preflight makes no new provider request and leaves that original result saveable with its references and lineage.

The isolated Chromium verifier passed all 11 saved checkpoints before and after controller changes, with identical summaries. Both runs retained screenshots and stored-state JSON. The 22 relevant provider-error, streaming-preview, save/reload, session-restoration, and Autopilot-failure browser scenarios also passed before and after, retaining screenshots and traces. The complete focused suite passed: 349 tests across 38 files, plus type checking, lint, build, and diff checks. Provider HTTP remained mocked; no paid-provider availability or daily-driver state was tested.
