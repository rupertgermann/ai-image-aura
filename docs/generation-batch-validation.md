# Generation batch validation

Validated on 28 September 2026 on `feat/generation-batch-ownership`.

The Generate controller now owns one completed `GenerateBatchSnapshot`. Autopilot returns its batch; the controller publishes and persists it once. Live iteration previews remain separate. Storage keys, legacy metadata fallback, and the Generate view contract are unchanged.

Completed results become visible before storage finishes. If persistence fails, the completed best image and its run metadata remain available for Save. Previously, this failure could leave the latest Autopilot preview with incomplete run metadata.

## Repeat the browser check

Use a checkout with its dependencies installed, Google Chrome, and Playwright. If Playwright is installed outside this checkout, set `NODE_PATH` to the directory containing its package.

Start an isolated Vite server, then run the check from another terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5177 --strictPort
```

```sh
node scripts/verify-generation-batch.cjs http://127.0.0.1:5177 /tmp/aura-generation-batch
```

The script uses fresh browser storage for each scenario, mocks image and reasoning HTTP responses, and blocks other external requests. The app, archive storage, lineage storage, and session persistence run normally. It writes screenshots, stored-state JSON, and `summary.json` after all assertions pass.

Checks cover mixed successful/failed slots; edits after generation; individual Save followed by Save all; recovery from a later archive-save failure without duplicates; reload and Clear; live latest versus final best Autopilot images; cancellation; original prompt, controls, references, costs, and lineage; and saving after reference serialization or batch persistence fails.

## Results and limits

All baseline browser scenarios passed before and after the refactor. The added persistence-failure scenario passed with the completed best result and its provenance intact. The full suite passed with the archive save follow-up: 256 tests across 35 files. ESLint, type checking, production build, and diff checks passed.

Paid providers were mocked. The existing development server and browser storage were not used. Archive completion now uses the shared save module described in [Archive image and lineage save validation](archive-lineage-validation.md). Batch progress records each result after its archive image and lineage step are saved.
