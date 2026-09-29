# Audit and remove app slop

Review the whole app, then remove confirmed unnecessary code without changing its behavior, appearance, or stored data formats.

Completed on `feat/app-deslop`. See [the audit results](app-deslop-audit.md) for findings, complete file coverage and verification evidence.

GEN-09 was dismissed as speculative. It creates no follow-up work and requires no code changes or additional tests. All accepted cleanup and verification work is complete.

The planning inventory at `6b1c10b` contains 152 tracked files, including 115 files under `src/`, 35 source test files, and one Playwright spec. These counts describe scope, not audit results. No application checks were run during planning.

## 1. Capture the baseline

- [x] Check the working tree and preserve unrelated changes. Create or select a `feat/` branch before implementation.
- [x] Record the base SHA and the complete `git ls-files` inventory in `docs/app-deslop-audit.md`.
- [x] Read `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, and the current validation documents listed below.
- [x] Run the existing lint, typecheck, tests, and build once. Record results and pre-existing failures.
- [x] Capture baseline evidence for the user flows in section 5. Use disposable browser storage, synthetic images, and fake provider credentials.

Run the static checks from the repository root:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

For browser checks, first obtain Rupert's authorization for the temporary test-server lifecycle or have Rupert supply an isolated test instance. `npm run test:e2e` starts and stops Vite on port 5183. The two verification scripts expect an existing Vite instance. Do not manage the daily development, preview, or Qwen server.

**Finish when** the inventory, base SHA, check results, and browser evidence exist. Record unavailable checks as deferred, never passed. Continue read-only auditing if a runtime prerequisite is unavailable.

## 2. Audit every area before removing code

Create one coverage table in `docs/app-deslop-audit.md`. Give every tracked file a row with its path, status, finding IDs, and any exclusion reason. Use `reviewed`, `findings`, or `excluded` as the status. Review binary assets by their references and purpose. Exclude generated outputs and lockfile contents from stylistic rewriting, but check their ownership and consistency.

Review these areas in order:

| Area | Files | What to inspect |
| --- | --- | --- |
| Entry and app state | `src/main.tsx`, `src/App.tsx`, `src/app/` | View lifetime, prop forwarding, duplicate state, notifications, provider preferences, unnecessary adapters |
| Views and shared UI | `src/views/`, `src/components/` | Repeated controls, avoidable nesting, unnecessary callbacks, duplicated display rules, misleading comments |
| Generate session | `src/generate-session/` | Draft versus completed-run ownership, snapshots, save progress, persistence, redundant conversions |
| Image controls and providers | `src/image-models/`, `src/image-workflow/`, `src/utils/openai.ts`, `src/utils/openaiModels.ts` | Repeated model decisions, request mapping, needless wrappers, type bypasses, boundary validation |
| Autopilot and costs | `src/autopilot/`, `src/costs/` | Reasoning ownership, cancellation, result selection, repeated orchestration, cost accounting |
| Editor | `src/editor/` | Draft and history ownership, layer operations, rendering, AI targets and masks, repeated state transitions |
| Archive and persistence | `src/archive/`, `src/db/`, `src/services/`, `src/hooks/` | Storage boundaries, save completion, rollback, import/export, migrations, redundant internal checks |
| Lineage | `src/lineage/` | Metadata builders and readers, replay, parent selection, repeated translations, historical-data handling |
| References and files | `src/references/`, `src/download/`, `src/utils/file.ts` | Duplicate conversion paths, hydration, clipboard boundaries, URL cleanup, downloads |
| Styles and assets | `src/index.css`, `src/App.css`, `src/assets/`, `public/`, `index.html` | Unused selectors and assets, duplicate rules, obsolete template content, actual responsive usage |
| Tests and verification | All source tests, `e2e/`, `scripts/verify-*.cjs` | Assertions that test behavior, excessive mocking, redundant cases, setup duplication, retained evidence |
| Tooling and documentation | Remaining tracked files, including root config, manifests, scripts, and `docs/` | Unused dependencies or settings, stale instructions, obsolete references, consistency with the app |

For each area:

- [x] Read the implementation and its callers. Trace the relevant user action through storage or provider requests.
- [x] Inspect comments, casts, suppressions, defensive checks, nested control flow, pass-through wrappers, duplicated state, and repeated mappings.
- [x] Search all callers before proposing a shared-function change. Include tests, browser scripts, dynamic imports, configuration, and CSS class construction.
- [x] Record findings with the file and symbol, concrete evidence, smallest proposed edit, risk, affected behavior, and verification command or scenario.
- [x] Mark the remaining files reviewed without inventing findings to meet a quota.

Use search results as leads. A small module, interface, long file, `catch`, or cast is not sufficient evidence of slop.

**Finish when** a mechanical comparison between the base inventory and the coverage table finds no missing or duplicate paths, and every candidate has a disposition.

## 3. Decide which findings merit edits

Classify each finding as `remove`, `simplify`, `keep`, or `defer`. Order accepted findings by benefit, confidence, and risk.

- [x] Accept dead code only after checking runtime and tooling references.
- [x] Accept a simplification only when it removes decisions, state, or indirection without moving the same complexity elsewhere.
- [x] Keep validation at browser storage, imported archives, provider responses, files, clipboard input, and URL boundaries.
- [x] Keep error handling that preserves images, drafts, references, and lineage after failed writes.
- [x] Keep comments that explain a non-obvious constraint. Remove narration, stale claims, and redundant summaries.
- [x] Keep useful behavior tests. Remove a redundant test only when another retained check proves the same relevant contract.
- [x] Separate bugs, product changes, and architecture proposals from behavior-preserving cleanup. Record their evidence without expanding this work into a redesign.

Planning inspection identified these starting points, not approved edits:

| Starting point | Evidence to resolve during the audit |
| --- | --- |
| `src/App.css` and `src/assets/react.svg` | Initial searches found no app references. Verify the complete tracked tree before deletion. |
| `public/vite.svg` | `index.html` still uses it as the favicon. It is not an unused asset. |
| `src/hooks/useLocalStorage.ts` | A double cast exists. Read the fallback contract and every caller before judging it. |
| `src/views/GenerateView.tsx`, `src/views/EditorView.tsx`, `src/generate-session/useGenerateController.ts` | These are large files. Look for concrete duplication or unnecessary state, not arbitrary file splitting. |
| `src/archive/ArchiveExport.ts` | ArchiveView dynamically imports this small module. Preserve the lazy-loading behavior when evaluating wrappers. |
| `src/archive/saveArchiveImage.ts` | Nested catches restore archive data when lineage saving fails. This is documented recovery behavior, not a blanket deletion candidate. |

**Finish when** every accepted edit has a behavior contract and a check that can detect its failure. Leave uncertain candidates intact with a short reason.

## 4. Remove accepted slop in small batches

Process only batches that have accepted findings. Skip empty batches.

| Order | Batch | Required checks |
| --- | --- | --- |
| A | Proven dead code and assets, stale comments, unused imports and exports | Reference searches, lint, typecheck, build when module or asset loading changes |
| B | UI and controller simplifications | Affected behavior tests, exact browser interactions, keyboard and layout checks for touched UI |
| C | Generate, providers, Autopilot, model controls, and cost logic | Relevant existing tests and generation browser evidence, including cancellation and partial failure when affected |
| D | Editor, archive, persistence, and lineage | Relevant existing tests plus draft, save, reload, transfer, and failure-recovery browser evidence |
| E | Remaining styles, tooling, tests, and documentation | Relevant browser states, runnable documented commands, retained test coverage, and final checks |

For each batch:

- [x] Start from the recorded baseline or the previous verified batch.
- [x] Reuse an existing implementation before adding a helper. Prefer deletion and native platform features.
- [x] If a real coverage gap exists, add the smallest behavior check before changing implementation. Prefer extending the existing browser checks. Do not add tests merely to record a deletion or a new internal shape.
- [x] Make the smallest coherent edit and update all affected callers in the same batch.
- [x] Run the relevant checks immediately. Compare visible and persisted behavior against the baseline and fixed scenario expectations.
- [x] Inspect the diff for behavior changes, lost error handling, weakened types, and unrelated formatting.
- [x] Record the changed files, removed complexity, results, and artifact paths in the audit report before continuing.

Do not introduce a cleanup framework, dependency, global formatter pass, schema migration, or blanket type-system rewrite. Preserve storage keys, archive formats, model behavior, and the existing visual design.

## 5. Verify the user flows

Run the matrix at baseline and after the completed cleanup. Between batches, rerun only the affected scenarios. Use fresh browser contexts and intercept provider HTTP requests, while keeping the real app and persistence stack.

| User flow | Pass condition | Existing check or required evidence |
| --- | --- | --- |
| Generate, Save, reload, reopen | Exactly one saved image restores with the expected decoded pixels, prompt, and model | `e2e/generate-save-reload.spec.ts`, retained trace and screenshot |
| Batch generation and Autopilot | Controls, original inputs, successful slots, best result, cancellation, save retry, costs, and lineage remain correct | `scripts/verify-generation-batch.cjs`, screenshots, stored-state JSON, and summary |
| Failed archive/lineage save | Failed generation save or Editor save preserves the appropriate image/draft state, and retry creates no duplicate | `scripts/verify-archive-lineage.cjs`, screenshots, stored-state JSON, and summary |
| Editor work and reload | Layer changes, selection, transforms, masks, adjustments, undo/redo, draft restoration, save, and copy retain their expected artwork and metadata | Existing editor tests plus a repeatable browser scenario covering gaps before relevant edits |
| Archive browsing and transfer | Filters, favorites, selection, detail navigation, reference assets, layer assets, and lineage survive export/import | Existing archive tests plus browser download inspection and import into a fresh context |
| Replay and create similar | Saved settings and references restore to the correct Generate or Editor state with the intended lineage parent | Existing lineage tests plus browser checks for replay, branch, and create similar |
| Settings and navigation | Provider configuration persists; invalid input and notification readiness remain clear; navigation does not terminate active work | Browser checks with fake credentials, mocked connectivity, and controlled notification permissions |
| Shared UI | Dialog focus, keyboard actions, toasts, loading/empty/error states, and responsive layouts remain usable | Before/after screenshots and interactions at 320, 390, 800, and 1440 px for affected views |

Test delete confirmation and cancellation. Verify actual deletion only with synthetic records in disposable storage. Never use personal browser data or real provider credentials.

After the server prerequisite in section 1 is satisfied, run the existing browser checks:

```sh
npm run test:e2e
node scripts/verify-generation-batch.cjs http://127.0.0.1:5177 /tmp/aura-deslop/baseline/generation
node scripts/verify-archive-lineage.cjs http://127.0.0.1:5177 /tmp/aura-deslop/baseline/archive-lineage
```

The scripts require Google Chrome and a resolvable `playwright` module. Port 5177 is an example isolated test origin, not permission to use an existing server there. Use a separate run directory for final evidence. Copy Playwright's `test-results/` artifacts before another run replaces them.

If a cleanup changes rendering frequency, canvas work, or archive iteration, compare that operation before and after with the same fixture. Preserve the Editor and ZIP lazy-loading behavior. No performance target or speedup is claimed in advance.

## 6. Close the audit

- [x] Run lint, typecheck, the full existing test suite, build, and `git diff --check` on the final tree.
- [x] Complete the browser matrix and link its retained artifacts. Report any unavailable scenario and its impact on verification.
- [x] Compare coverage against both the original inventory and the final file list, including deleted files and new verification files.
- [x] Confirm every accepted finding was removed or explicitly deferred with evidence and a reason.
- [x] Review the complete diff for unrelated changes and behavior drift.
- [x] Summarize the actual simplifications, intentionally retained protections, check results, and unresolved findings in `docs/app-deslop-audit.md`.

The work is complete when every in-scope file has a recorded disposition, every accepted cleanup is resolved, and all required checks pass. A partial audit or deferred browser check must be reported as incomplete. Fewer lines are useful evidence, not a success quota.

## Read before editing

- [Domain vocabulary](../CONTEXT.md)
- [App setup and user flows](../README.md)
- [Visual design](DESIGN.md)
- [Generation batch validation](generation-batch-validation.md)
- [Archive image and lineage save validation](archive-lineage-validation.md)
- [Product polish validation and known limits](product-polish-validation.md)
