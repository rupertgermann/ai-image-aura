# Isolated generation verification history

On 2026-11-09, inspection of `rupertgermann/ai-image-aura@d823cc31ec67b4a371492ca82fa986d4ae7d5740` found two existing browser verification routes:

- The [generation-batch verifier](https://github.com/rupertgermann/ai-image-aura/blob/d823cc31ec67b4a371492ca82fa986d4ae7d5740/scripts/verify-generation-batch.cjs) exercised Generate, Save/retry, reload/Clear, and Autopilot with mocked provider HTTP, writing screenshots, stored-state JSON, and a summary. Its [validation notes](https://github.com/rupertgermann/ai-image-aura/blob/d823cc31ec67b4a371492ca82fa986d4ae7d5740/docs/generation-batch-validation.md) recorded earlier checks; those historical passes do not establish a new branch's status.
- The [Playwright configuration](https://github.com/rupertgermann/ai-image-aura/blob/d823cc31ec67b4a371492ca82fa986d4ae7d5740/playwright.config.ts) used Chromium, retained traces, blocked service workers, and refused to reuse an existing server. The [E2E directory](https://github.com/rupertgermann/ai-image-aura/tree/d823cc31ec67b4a371492ca82fa986d4ae7d5740/e2e) included provider errors, Generate save/reload and delayed restoration, Autopilot failures, Editor transform masks, and Editor draft provenance.

At that commit, the older batch verifier explicitly launched the Chrome channel. On 2026-11-09, planning required correcting that launch to installed isolated Chromium before using the verifier. Verification was restricted to dedicated servers, fresh browser storage, and mocked providers; daily-driver previews/browser state and paid-provider availability were excluded.

On 2026-11-09, worktree setup guidance recorded by the coordinating task required dependencies installed in each checkout with `npm ci --ignore-scripts`, not a shared `node_modules` symlink: SQLocal workers had been blocked across Vite roots during earlier task setup. The task's isolated browser cache was `/tmp/aura-playwright-browsers`; that temporary location was environment-specific, not a repository convention.

On 2026-11-09, Rupert approved these browser testing seams in [spec #179](https://github.com/rupertgermann/ai-image-aura/issues/179); [controller ticket #182](https://github.com/rupertgermann/ai-image-aura/issues/182) owned the isolated-Chromium correction.

No test pass from the generation/provider simplification is asserted here. New evidence should be dated and tied to its tested commit, with artifact locations and explicit mocked-provider limits.

Related: [generation simplification scope and constraints](generation-simplification.md).
