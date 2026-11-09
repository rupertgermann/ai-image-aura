# Isolated generation verification history

On 2026-11-09, inspection of `rupertgermann/ai-image-aura@d823cc31ec67b4a371492ca82fa986d4ae7d5740` found two existing browser verification routes:

- The [generation-batch verifier](https://github.com/rupertgermann/ai-image-aura/blob/d823cc31ec67b4a371492ca82fa986d4ae7d5740/scripts/verify-generation-batch.cjs) exercised Generate, Save/retry, reload/Clear, and Autopilot with mocked provider HTTP, writing screenshots, stored-state JSON, and a summary. Its [validation notes](https://github.com/rupertgermann/ai-image-aura/blob/d823cc31ec67b4a371492ca82fa986d4ae7d5740/docs/generation-batch-validation.md) recorded earlier checks; those historical passes do not establish a new branch's status.
- The [Playwright configuration](https://github.com/rupertgermann/ai-image-aura/blob/d823cc31ec67b4a371492ca82fa986d4ae7d5740/playwright.config.ts) used Chromium, retained traces, blocked service workers, and refused to reuse an existing server. The [E2E directory](https://github.com/rupertgermann/ai-image-aura/tree/d823cc31ec67b4a371492ca82fa986d4ae7d5740/e2e) included provider errors, Generate save/reload and delayed restoration, Autopilot failures, Editor transform masks, and Editor draft provenance.

At that commit, the older batch verifier explicitly launched the Chrome channel. On 2026-11-09, planning required correcting that launch to installed isolated Chromium before using the verifier. Verification was restricted to dedicated servers, fresh browser storage, and mocked providers; daily-driver previews/browser state and paid-provider availability were excluded.

On 2026-11-09, worktree setup guidance recorded by the coordinating task required dependencies installed in each checkout with `npm ci --ignore-scripts`, not a shared `node_modules` symlink: SQLocal workers had been blocked across Vite roots during earlier task setup. The task's isolated browser cache was `/tmp/aura-playwright-browsers`; that temporary location was environment-specific, not a repository convention.

On 2026-11-09, Rupert approved these browser testing seams in [spec #179](https://github.com/rupertgermann/ai-image-aura/issues/179); [controller ticket #182](https://github.com/rupertgermann/ai-image-aura/issues/182) owned the isolated-Chromium correction.

On 2026-11-09, the planning entry at `rupertgermann/ai-image-aura@d7ac16de8f37e6a3fa4796ee5bbaa4997f3c084a` asserted no generation/provider simplification test passes. The implementation evidence below supersedes that absence of evidence; it does not establish final integration acceptance.

## Implementation evidence

On 2026-11-09, the [provider report](/tmp/aura-generation-planning/provider-report.md) recorded 79 focused and 23 browser baseline passes on `rupertgermann/ai-image-aura@d7ac16de8f37e6a3fa4796ee5bbaa4997f3c084a`. Added browser cases first reproduced lost usable OpenAI siblings and an incidental Google `flatMap` error. Their artifacts were [OpenAI red](/tmp/aura-generation-planning/provider-red-openai) and [Google red](/tmp/aura-generation-planning/provider-red-google). The provider-only implementation subsequently committed in [`9923b843dc2d5f782ff9fd945d40e6b6e49d0d6f`](https://github.com/rupertgermann/ai-image-aura/commit/9923b843dc2d5f782ff9fd945d40e6b6e49d0d6f) passed 80 focused and 25 browser scenarios, typecheck, lint and build; [final provider artifacts](/tmp/aura-generation-planning/provider-final) include reload/save of original result slot 3, malformed Google retry, Editor masks and completed-stream recovery. Those browser runs preceded the controls integration and must not be represented as a combined-commit browser pass. After that integration, the report recorded 348 tests across 38 files plus typecheck and diff checks passing at `9923b843dc2d5f782ff9fd945d40e6b6e49d0d6f`.

On 2026-11-09, the [control report](/tmp/aura-generation-planning/controls-report.md) recorded 61 focused and 13 existing browser baseline passes on `rupertgermann/ai-image-aura@d7ac16de8f37e6a3fa4796ee5bbaa4997f3c084a`. A new control-snapshot scenario also passed on that baseline once its expectation respected the [existing lineage limitation](generation-lineage-batch-size.md). The numeric-ingress assertion separately failed before implementation. For [`99b305ca7a2a8f11ada55424690477d5020d94de`](https://github.com/rupertgermann/ai-image-aura/commit/99b305ca7a2a8f11ada55424690477d5020d94de), the report recorded 107 focused tests, 347 full-suite tests across 37 files, 14 browser scenarios, typecheck, lint, build and diff checks passing. [Control artifacts](/tmp/aura-generation-planning/controls-after) retain screenshots/traces and attached requests plus saved-state JSON, including Autopilot's `n: 1`, the subsequent manual `n: 3`, and unchanged original controls after editing the draft.

On 2026-11-09, the above reports limited browser evidence to installed isolated Chromium, dedicated port 5183, fresh storage and mocked provider HTTP. They did not test paid providers, production or daily-driver state. These temporary artifact paths preserve session evidence only while the files remain available; committed E2E cases provide repeatable scenarios. Final controller/batch-verifier and combined browser acceptance remained pending at `rupertgermann/ai-image-aura@9923b843dc2d5f782ff9fd945d40e6b6e49d0d6f`.

## Final integration evidence

On 2026-11-09, the [independent verification report](/tmp/aura-generation-planning/integration-verification/final-verification.md) completed the approved browser seams at `rupertgermann/ai-image-aura@d5be3c1097aa6510f1864f29bd535bfd46cd6539`, superseding the earlier final-verification-pending entry. It newly ran 22 Editor import/mask and draft-provenance scenarios in an isolated clean checkout; combined with the 22 retained final-controller scenarios, completed-source evidence covered 44 passing browser scenarios. [Editor artifacts](/tmp/aura-generation-planning/integration-verification/editor-e2e) and [controller artifacts](/tmp/aura-generation-planning/controller-after-e2e) retained traces, screenshots and saved-state attachments. The [mechanical evidence audit](/tmp/aura-generation-planning/integration-verification/evidence-audit.json) matched all 44 embedded test sources to the final checkout and found no trace error records; earlier application-source attribution also relied on the controller report and committed checkout.

On 2026-11-09, that audit verified all 11 named [final batch checkpoints](/tmp/aura-generation-planning/controller-after-batch/summary.json), stored-state archive/lineage counts and unique archive IDs. The summary matched the [baseline](/tmp/aura-generation-planning/controller-baseline-batch/summary.json) byte for byte. The [controller report](/tmp/aura-generation-planning/controller-report.md) supplied the completed-source 349 tests across 38 files, typecheck, lint and build passes; the independent verifier reused those results and reran the baseline-to-final diff check. It did not claim fresh execution of every check.

On 2026-11-09, the coordinator reported no blocking findings from architectural, standards and spec reviews at `rupertgermann/ai-image-aura@d5be3c1097aa6510f1864f29bd535bfd46cd6539`. Browser tests observed partial previews, completion, a subsequent run and reload; stale callbacks after provider resolution were not injected, so preservation of their run-identity guard rested on inspection. Some screenshots captured loading/transition states; assertions, trace sequences and stored-state/pixel checks established outcomes. These checks excluded paid-provider availability, production/daily-driver state and unrelated E2E scenarios; temporary local artifacts were not published attachments.

## Repeatable verification recorded on 2026-11-09

On 2026-11-09, the recipe for `rupertgermann/ai-image-aura@d5be3c1097aa6510f1864f29bd535bfd46cd6539` used the committed [batch verifier](https://github.com/rupertgermann/ai-image-aura/blob/d5be3c1097aa6510f1864f29bd535bfd46cd6539/scripts/verify-generation-batch.cjs) and [Playwright configuration](https://github.com/rupertgermann/ai-image-aura/blob/d5be3c1097aa6510f1864f29bd535bfd46cd6539/playwright.config.ts), completing the setup scope of [#182](https://github.com/rupertgermann/ai-image-aura/issues/182). Rupert approved removing the separate validation document from the working tree; this recipe makes repetition independent of it. The [previous document at that commit](https://github.com/rupertgermann/ai-image-aura/blob/d5be3c1097aa6510f1864f29bd535bfd46cd6539/docs/generation-batch-validation.md) remains an immutable historical source.

At that commit, run the following inside a dedicated checkout. Install its own dependencies so SQLocal workers load from the same Vite root. Chromium installation and execution must use the same `PLAYWRIGHT_BROWSERS_PATH` if one is set; no special cache path is required.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run dev -- --host 127.0.0.1 --port 5177 --strictPort
```

In a second terminal in that checkout, with the same optional browser-cache environment:

```sh
node scripts/verify-generation-batch.cjs http://127.0.0.1:5177 /tmp/aura-generation-batch
```

At `d5be3c1097aa6510f1864f29bd535bfd46cd6539`, success meant all 11 checkpoints completed and the output directory contained screenshots, stored-state JSON and `summary.json`. Fresh contexts used mocked provider HTTP and blocked other external calls. Stop the dedicated server when finished. The corresponding browser scenarios used the following command; Playwright owned port 5183 and refused server reuse, so parallel agents handed off that port and used separate artifact directories.

```sh
npm run test:e2e -- e2e/provider-errors.spec.ts e2e/autopilot-failure.spec.ts e2e/generate-save-reload.spec.ts e2e/generate-session-restoration.spec.ts e2e/editor-import-mask.spec.ts e2e/editor-draft-provenance.spec.ts --output=/tmp/aura-generation-e2e
```

Related: [generation simplification scope and constraints](generation-simplification.md).
