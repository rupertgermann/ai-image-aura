# Performance results

Measured on 2026-09-29 against commit `8b6ca483d1af2a1f9a41996af204576468e4cea4`. The recorded samples are in [performance-results.json](performance-results.json).

| Measurement | Before | After | Result |
| --- | ---: | ---: | --- |
| Favorite click to visible update, median | 128.1 ms | 94.6 ms | 26.1% faster |
| Favorite asset reads | 6 | 0 | Eliminated |
| Favorite asset writes | 6 | 0 | Eliminated |
| Asset characters written per favorite toggle | 18,850,476 | 0 | Eliminated |
| Archive schema statements per reload | 18 | 9 | 50% fewer |
| Search to one result, median | 49.6 ms | 49.3 ms | No meaningful change |
| Clear search to 300 results, median | 83.0 ms | 83.3 ms | No meaningful change |
| Reload to rendered archive, median | 293.5 ms | 286.9 ms | Inconclusive |

Favorite timings ranged from 122.2 to 144.6 ms before and 92.6 to 101.4 ms after. The timing ranges do not overlap. Reload timings ranged from 259.1 to 577.2 ms before and 244.6 to 731.4 ms after. That variability does not support a startup latency claim.

Favorite updates previously used the full image-save operation. It read rollback snapshots and rewrote the flattened image, reference, and four layer assets. The new `setFavorite` operation updates one SQLite field and then patches the matching image in React state. It preserves the archive order and every other field. A missing image rejects the update.

Two startup callers initialized the archive metadata store concurrently. Each ran the same schema statements before the old boolean initialization flag changed. They now share one pending promise. A failed initialization clears the promise so a later call can retry. The schema and migration statements are unchanged.

The implementation changes four production files and updates one existing test fake. The benchmark adds no dependencies. It uses the installed Playwright, Vite, SQLite, and IndexedDB implementations.

## Method

The test-only fixture entry seeds 300 archive records through the real archive store. It includes 299 synthetic 128px images and one 1024px image with four layers and one reference. The larger image's data URL is 3,141,746 characters. No provider requests or personal browser storage are used.

The runner builds optimized production code with a separate fixture entry. This entry changes chunk partitioning compared with the normal release build, so these results make no bundle-loading claim. It serves the artifact on a temporary loopback port and opens a fresh Chromium context. Each sample reloads the populated archive, filters to one result, restores 300 results, and toggles the layered image's favorite flag. Setup is excluded.

The timing comparison pools two runs of seven samples per version, for 14 before and 14 after samples. Each run excludes one warmup. The run order was baseline, favorite-only, baseline repeat, initialization diagnostic, final, final repeat. The initialization diagnostic used three samples before the shared-promise change; all three measured 18 statements. All 14 final samples measured 9.

Measurements ran serially on an Apple M2 Max, macOS arm64, Chromium `153.0.8010.12`, with a 1440 by 1000 viewport. CPU profiling and Playwright tracing run during the excluded warmup only. Latency includes Playwright action delivery and two animation frames after the expected DOM state. It measures the complete UI operation, not raw SQL execution time. Worker message counting measures archive schema dispatches; IndexedDB instrumentation counts asset reads, writes, and written string characters.

The benchmark checks favorite persistence, hashes every other image field and asset to detect changes, and checks that a brightness edit survives reload. The optimized run also checks zero asset I/O and rejection of a missing image. No screenshot alone is treated as proof of persistence.

The first attempt in the shared checkout was interrupted by an unrelated UI task that changed the branch and cleared the shared test output. Those incomplete samples were discarded. All reported samples came from the isolated worktree. Initial baseline results predate build checksums; the preserved baseline bundle's provenance file was added retrospectively. Final results include the exact source diff and fixture checksum.

## Run the benchmark

From this worktree, run:

```sh
PERF_EXPECT_METADATA_ONLY=1 node scripts/benchmark-performance.mjs current
```

`PERF_RUNS` changes the sample count. `PERF_DIST` reuses an immutable build instead of rebuilding. The saved baseline can be repeated with:

```sh
PERF_DIST=performance.local/baseline/dist node scripts/benchmark-performance.mjs before-repeat
```

To rebuild the baseline independently, use a clean checkout of the baseline commit and copy the two benchmark scripts into it. Run the benchmark without `PERF_EXPECT_METADATA_ONLY`, using the same installed dependency versions and browser.

Each run saves `results.json`, `browser.cpuprofile`, `trace.zip`, and archive/editor screenshots under `performance.local/<label>/`. Built artifacts and their provenance are under `dist/`. These are local artifacts, excluded from Git.

The committed [recorded results](performance-results.json) contain the baseline, baseline repeat, initialization diagnostic, favorite-only, final, and final-repeat runs. They preserve samples, summaries, environment details, and verification results. Full source diffs remain in the local build provenance files.

Before archiving the worktree, all local evidence was copied and checksum-verified under `performance.local/measured-performance/` in the primary checkout. That copy includes saved builds, profiles, traces, screenshots, test output, and `decisions.tsv`. To reuse its baseline from the primary checkout, set `PERF_DIST=performance.local/measured-performance/baseline/dist`.

## Validation and limits

The 279 existing tests, lint, TypeScript checking, and the normal production build pass. Five existing browser E2E tests pass against the optimized artifact, covering generation, save/reload pixel integrity, provider failures/retries, and editor draft preservation. Their trace and screenshot artifacts are in `performance.local/e2e-results/`. The benchmark fixture also passes a separate strict TypeScript check.

Subagents inspected archive storage, editor work, and startup imports. Independent review found no actionable correctness issue in the changes. The existing rapid-repeat favorite behavior remains unchanged. This work does not change provider generation speed or claim improvements on Safari, mobile devices, or other archive sizes.

Eager archive asset loading and full editor-draft writes remain possible targets for a later profile. They were left unchanged because this run did not establish a measured benefit for redesigning them.

Build the Lever led to a rerunnable benchmark instead of one-time measurements. Prove It Works led to persistence checks, asset hashes, and real browser actions. Sequence Work into Verifiable Units kept the favorite-only result separate from the initialization change.
