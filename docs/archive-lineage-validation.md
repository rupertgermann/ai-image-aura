# Archive image and lineage save validation

Validated on 28 September 2026 on `feat/generation-batch-ownership`, alongside the generation batch changes.

`saveArchiveImage` owns generation and Editor image preparation, parent selection, distinct lineage metadata, and save completion. Generate records each completed slot after both writes succeed. Editor publishes the image and clears its saved draft after the same completion.

If lineage rejects, the module attempts to restore the actual stored image or remove the failed new image. A recovery failure reports both errors. The existing archive operations retain their asset recovery behavior. No storage schema, dependency, retry journal, or transaction framework was added.

## Browser evidence

The same controlled lineage failure was reproduced before the refactor and verified after it using real local storage.

| User action | Before | After failure, reload, and retry |
| --- | --- | --- |
| Generate Save | Image remained without lineage; slot said saved and success toast appeared | Failed image removed; result remained unsaved; retry produced one image and one step |
| Editor Save changes | Source pixels and layers changed without lineage | Original image restored; draft retained; retry saved the layers and appended one step |
| Editor Save as copy | Extra copy remained without lineage | Failed copy removed; source preserved; retry produced one copy and one step |

Assertions also verify references, the selected parent step, overwrite timestamps, layer assets, composition adjustments, source clearing, and absence of premature success toasts. Screenshots and stored-state JSON accompany each failure and completed retry.

All 256 tests across 35 files passed, along with ESLint, type checking, the production build, and diff checks. The generation batch browser suite also passed after this refactor.

## Repeat the checks

Use the Chrome, Playwright, and isolated Vite setup in [Generation batch validation](generation-batch-validation.md). Run these commands from the checkout. Set `NODE_PATH` to the directory containing Playwright if it is installed elsewhere.

```sh
node scripts/verify-archive-lineage.cjs http://127.0.0.1:5177 /tmp/aura-archive-lineage
node scripts/verify-generation-batch.cjs http://127.0.0.1:5177 /tmp/aura-generation-batch
```

Each scenario uses fresh browser storage. Provider requests are mocked and other external requests are blocked. The output directories contain screenshots, stored-state JSON, and `summary.json`.

Recovery covers handled write failures when archive restoration succeeds. The stores remain separate; abrupt process termination and failures in later draft or batch acknowledgment are outside this recovery contract.
