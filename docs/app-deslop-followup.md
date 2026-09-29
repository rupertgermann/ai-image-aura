# App deslop follow-up audit

Base: `81646dd54f709446936e9e3377e6aa068b7a12db`. Branch: `feat/app-deslop-followup`.

This is a fresh pass after the [previous completed audit](app-deslop-audit.md). The prior report and its evidence remain unchanged. The approved scope preserves behavior, appearance, data formats, storage keys, and error recovery.

## Status

All 16 accepted cleanups are implemented and verified. The baseline inventory contains 153 tracked files, including 113 source files and 35 source test files. All 153 have one audit disposition; no paths are missing or duplicated. Six subagent audit slices covered 118 files; the owner covered 35. Application edits were serialized, with one writer per batch. The final inventory also contains 153 files: this report replaces the deleted empty todo document. Three personal configuration files are explicitly excluded from application cleanup.

## Approved tickets

| Ticket | Scope | Blocked by |
| --- | --- | --- |
| [#123](https://github.com/rupertgermann/ai-image-aura/issues/123) | Establish the app-wide audit baseline | None |
| [#124](https://github.com/rupertgermann/ai-image-aura/issues/124) | Audit and simplify generation through archive save | #123 |
| [#125](https://github.com/rupertgermann/ai-image-aura/issues/125) | Audit and simplify the Autopilot journey | #123 |
| [#126](https://github.com/rupertgermann/ai-image-aura/issues/126) | Audit and simplify Editor draft-to-save behavior | #123 |
| [#127](https://github.com/rupertgermann/ai-image-aura/issues/127) | Audit and simplify archive browsing, transfer, and replay | #123 |
| [#128](https://github.com/rupertgermann/ai-image-aura/issues/128) | Audit and simplify settings, navigation, and shared UI | #123 |
| [#129](https://github.com/rupertgermann/ai-image-aura/issues/129) | Reconcile coverage and verify the complete cleanup | #124, #125, #126, #127, #128 |

## Accepted findings

All findings below are resolved. These are evidence-backed deletions and simplifications. A file size, catch, interface, cast, or suspected AI origin alone did not qualify as a finding.

| ID | Decision | Area | Change |
| --- | --- | --- | --- |
| GEN-F01 | Remove | GenerateSession | Use canonical image-model control types instead of four unused aliases. |
| GEN-F02 | Remove | ImageWorkflow | Delete the reference-limit re-export with no consumers; retain canonical model facts. |
| GEN-F03 | Simplify | ImageWorkflow | Use the success predicate directly and delete the two-function lookup chain. |
| AUT-01 | Simplify | AutopilotSession | Remove the string-result adapter used only by old test mocks; migrate those mocks first. |
| ED2-01 | Remove | AI transform result | Drop unconsumed top-level layer ID/name aliases; retain draft selection and provenance. |
| ED2-02 | Remove | Layer insertion | Drop unused returned target bounds; retain their geometry computation. |
| ED2-03 | Simplify | Editor draft references | Inline unchanged reference updates at their sole callers; keep history and persistence ownership. |
| AR-01 | Remove | Autopilot lineage metadata | Delete the uncalled reasoning-model reader; retain stored metadata and historical validation. |
| AR-02 | Remove | Lineage types | Delete unused typed-step aliases; retain active metadata types and generic stored steps. |
| AR-03 | Remove | Lineage store and test doubles | Delete unused init/remove forwarding and dead lineage deletion; preserve concrete SQLite initialization. |
| AR-04 | Simplify | Generate replay metadata | Derive the duplicate metadata shape from the existing reader return type. |
| AR-05 | Simplify | Lineage image-model reader | Keep one sanitization in the existing builder, with baseline-equivalence evidence. |
| UI-NEW-01 | Remove | Cost summary | Delete the never-supplied showBreakdown option; retain compact and full displays. |
| UI-NEW-02 | Remove | Editor CSS | Delete the unmatched editor-canvas ID rule; trace Konva-generated DOM before removal. |
| UI-NEW-03 | Simplify | Grid CSS | Combine adjacent rules with identical declarations and specificity. |
| DOC-01 | Remove | Documentation | Delete the empty todo placeholder and its README tree entry; GitHub remains the tracker. |

The full source audits and caller evidence are retained in [/tmp/aura-deslop-followup/audits/](/tmp/aura-deslop-followup/audits/). The decision trail is [/tmp/aura-deslop-followup/decisions.tsv](/tmp/aura-deslop-followup/decisions.tsv).

## Retained behavior

- Archive and lineage rollback, asset snapshots, migrations, historical model labels, and stored formats remain intact.
- Browser storage, files, imported archives, provider responses, and clipboard input retain their existing validation. The raw-string localStorage fallback was not removed because it is compatibility behavior.
- Generate and Editor operation locks, cancellation, partial-save recovery, reference snapshots, and navigation lifetime remain intact.
- The Editor and ZIP exporter retain lazy loading. The active favicon, documented design tokens, style-reference examples, and historical screenshots remain.
- All dependency records are reachable from the manifest. No dependency or configuration removal was justified. Tests were retained; obsolete mock shapes and fake methods were migrated without weakening assertions.

## Separate behavior defects

These findings are tracked for triage and were not fixed by the cleanup. They do not block the behavior-preserving refactor.

- [#130](https://github.com/rupertgermann/ai-image-aura/issues/130): selected rotated artwork loses 4,000 of 44,000 pixels in the actual Editor AI request. Canvas and export also use different rotation pivots. The browser reproduction keeps both geometries inside the composition and captures the real multipart source. [Evidence](/tmp/aura-deslop-followup/rotated-layer-reproduction/README.md).
- [#131](https://github.com/rupertgermann/ai-image-aura/issues/131): non-JSON OpenAI image errors and malformed Gemini candidate shapes produce incidental TypeErrors. Actual transport/parser code was exercised with synthetic responses; these were source-level checks, not full UI reproductions.
- [#132](https://github.com/rupertgermann/ai-image-aura/issues/132): an archive composition filter array passes string validation and is returned as an array. Reproduced through the actual manifest parser, without changing accepted input behavior.

## Verification

Baseline lint, typecheck, and build passed. Initial browser launches failed in the sandbox before app execution; the same checks passed with browser execution permission. The user explicitly authorized temporary test servers on ports 5183 and 5184. All browser contexts used synthetic data and mocked providers, with unexpected external requests blocked.

Both authorized test ports were confirmed closed after final verification. Only the owned Vite process on port 5184 required explicit termination; Playwright stopped its own port 5183 instance.

The full Vitest suite passed once at final verification, per the implement workflow. Focused existing tests ran before and after relevant batches. No unit tests were added after implementation.

| Check | Baseline | Final |
| --- | --- | --- |
| Lint, typecheck, build | Passed | Passed |
| Full Vitest suite | Reserved for final run | 256 tests in 35 files passed |
| Generate, Save, reload and decoded pixels | Passed | Passed |
| Generation and Autopilot | 11 checkpoints passed | Passed; summary identical to baseline |
| Archive/lineage save failure and retry | 3 scenarios passed | Passed; summary identical to baseline |
| Displayed iteration download and Editor pixels | 5 scenarios passed | Passed; summary identical to baseline |
| App workflows | 26 original checkpoints passed | 29 passed; all original checkpoints retained in order |
| Reference removal, Undo/Redo, upload and draft reload | Added before reference inlining; 29 workflow checkpoints passed | Passed; all three reference-state artifacts identical to pre-inlining baseline |
| Responsive visual comparison | 16 screenshots captured | All 16 PNGs byte-identical at 320, 390, 800 and 1440px |
| File coverage | 153 unique baseline paths | 153 final paths; only the documented deletion and addition |
| Standards and Spec review | Pinned to starting commit and approved tickets | Zero findings on either independent axis |

The reference-history gap was handled before keeping ED2-03: restore only those helpers, extend the existing browser script, pass the new scenario, reapply the inline change, and pass it again. The three persisted reference-state artifacts matched exactly. No new test framework or fixture layer was added.

The current-model lineage reader also matched 55 retained pre-edit outputs after removing duplicate sanitization. Script syntax and diff whitespace checks passed. Independent Standards, Spec and scoped comment reviews found no actionable issues; reports are in [/tmp/aura-deslop-followup/reviews/](/tmp/aura-deslop-followup/reviews/).

The final decision-trail review by gpt-6-astra found no flags. It independently checked logs, screenshot bytes and hashes, browser summaries, reference artifacts and coverage. Worker-command visibility was incomplete; the review relied on the root transcript and retained raw artifacts for those steps.

Baseline artifacts: [/tmp/aura-deslop-followup/baseline/](/tmp/aura-deslop-followup/baseline/). Final browser and test artifacts: [/tmp/aura-deslop-followup/final/](/tmp/aura-deslop-followup/final/). Exact inventory, summary, reference-state and screenshot comparisons are recorded in [reconciliation.json](/tmp/aura-deslop-followup/final/reconciliation.json). Lint, typecheck and build logs are in [/tmp/aura-deslop-followup/](/tmp/aura-deslop-followup/). These local artifacts are temporary; the commands below and committed verification scripts reproduce the checks. Paid-provider availability and real local image inference are outside these mocked-provider checks.

## Repeat the checks

Use an authorized isolated Vite instance on port 5184 for the four browser scripts. The Playwright test starts and stops its own temporary instance on port 5183. Preserve the output directories before rerunning.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
node scripts/verify-generation-batch.cjs http://127.0.0.1:5184 /tmp/aura-deslop-recheck/generation
node scripts/verify-archive-lineage.cjs http://127.0.0.1:5184 /tmp/aura-deslop-recheck/archive-lineage
node scripts/verify-app-workflows.cjs http://127.0.0.1:5184 /tmp/aura-deslop-recheck/workflows
node scripts/verify-displayed-iteration.cjs http://127.0.0.1:5184 /tmp/aura-deslop-recheck/displayed-iteration
git diff --check
```

## File coverage

Statuses describe source audit coverage, not execution of every behavior. Binary files were reviewed by purpose and references; generated lockfile contents by dependency consistency. Personal configuration is explicitly excluded from application cleanup.

| Path | Status | Findings | Review or exclusion reason |
| --- | --- | --- | --- |
| `.claude/settings.local.json` | excluded | - | Personal permission configuration; content changes outside application cleanup. |
| `.github/FUNDING.yml` | excluded | - | Personal sponsorship configuration; no application behavior or cleanup relevance. |
| `.gitignore` | reviewed | - | Read fully; keeps dependencies/build output, recovery assets, environment secrets and E2E artifacts out of commits. Agent skill paths are user tooling exclusions. |
| `AGENTS.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `CLAUDE.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `CONTEXT.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `LICENSE` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `README.md` | findings | DOC-01 | Read setup and workflows; only current reference to empty todo placeholder is the project tree. |
| `docs/DESIGN.md` | reviewed | - | Read full style reference; keep inspiration examples and documented tokens, not evidence of unused app code. |
| `docs/agents/domain.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/agents/issue-tracker.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/agents/triage-labels.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/app-deslop-audit.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/app-deslop-plan.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/archive-lineage-validation.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/generation-batch-validation.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/product-polish-validation.md` | reviewed | - | Read governing guidance, historical validation or license; preserve its recorded contract and history. |
| `docs/screens/Archive.png` | reviewed | - | PNG type/dimensions and README reference verified; historical screenshots preserved. |
| `docs/screens/Detail.png` | reviewed | - | PNG type/dimensions and README reference verified; historical screenshots preserved. |
| `docs/screens/Editor.png` | reviewed | - | PNG type/dimensions and README reference verified; historical screenshots preserved. |
| `docs/screens/Generate.png` | reviewed | - | PNG type/dimensions and README reference verified; historical screenshots preserved. |
| `docs/todo.md` | findings | DOC-01 | Contains only # todo; GitHub Issues is the configured tracker. Remove empty placeholder and README listing. |
| `e2e/fixtures/four-colors.png` | reviewed | - | Viewed synthetic four-color asset; mechanically verified 128x128, 8-bit RGBA, no interlace and decoded pixel SHA-256 matching the E2E assertion. Referenced by durable-save spec and app workflows script. |
| `e2e/generate-save-reload.spec.ts` | reviewed | - | Read fully; provider-only mock, blocked other external requests, real settings/generation/save/reload/archive path and decoded pixel hash test real durability. Trace and screenshot retained. |
| `eslint.config.js` | reviewed | - | Read fully; recommended JS/TS/hooks/refresh rules fit React/Vite source. Deliberate TS/TSX scope is not proof of a broken verification step. |
| `index.html` | reviewed | - | Entry script, root and favicon are actively used. |
| `package-lock.json` | reviewed | - | Parsed complete lockfile; root dependencies/devDependencies exactly match package.json. All 292 package records reachable via required/optional/peer relationships; no missing required dependency resolution. Do not hand-edit generated lockfile. |
| `package.json` | reviewed | - | Read fully; all runtime dependencies have source consumers; dev dependencies own compiler/linter/Vite/Vitest/Playwright configuration. @playwright/test resolves playwright for CJS scripts. No obsolete type stub remains. |
| `playwright.config.ts` | reviewed | - | Read fully; single worker, strict isolated port, no server reuse, blocked service workers and trace capture preserve deterministic durability verification. |
| `public/vite.svg` | reviewed | - | Referenced favicon. Removal/rebranding would change visible behavior. |
| `scripts/qwen-sd-server.sh` | reviewed | - | Read full setup/build/download/serve/start/test paths. Pin, calibration override, resume marker, separate model limits and hardware flags have concrete purpose. No lifecycle/network commands executed. |
| `scripts/verify-app-workflows.cjs` | reviewed | - | Read all 317 lines; retains real storage/ZIP/canvas and provider mocks, saved artifacts, error propagation, imported fresh context, contract assertions and responsive/navigation checks. |
| `scripts/verify-archive-lineage.cjs` | reviewed | - | Read all 178 lines; preserve loaded HMR module failure injection, rollback snapshots, retry/reload, no-success-toast checks and final durable lineage assertions. |
| `scripts/verify-displayed-iteration.cjs` | reviewed | - | Read all 108 lines; snapshot/archived/latest/no-history/missing-output paths differ. Download bytes and editor pixels verify displayed identity; collected failures still cause nonzero process exit. |
| `scripts/verify-generation-batch.cjs` | reviewed | - | Read all 433 lines; real persistence, per-slot partial saves and retry, best/latest Autopilot distinctions, failure injection, mixed reasoning providers and exact model controls are behavior contracts. |
| `skills-lock.json` | excluded | - | Read installed-skill provenance; installation configuration is outside cleanup. |
| `src/App.tsx` | reviewed | - | Preserve hidden Generate and lazy Editor lifetime, focus handling, and selected-image actions. |
| `src/app/CompletionNotificationPort.test.ts` | reviewed | - | Readiness cases distinguish supported and blocked browser states; retain. |
| `src/app/CompletionNotificationPort.ts` | reviewed | - | Browser readiness, security, permission and environment checks are real boundary behavior. |
| `src/app/providerKeys.test.ts` | reviewed | - | Distinct storage and credential normalization behavior assertions retained. |
| `src/app/providerKeys.ts` | reviewed | - | Retain raw/JSON storage compatibility, credential trimming and Local server URL validation. |
| `src/app/types.ts` | reviewed | - | AppView is a shared domain union with runtime consumers. |
| `src/app/useAppController.ts` | reviewed | - | Preserve busy gates, recovery initialization, asynchronous save errors and draft clearing after durable save. |
| `src/app/useAppNotifications.ts` | reviewed | - | Toast identifiers, removal and error narrowing are used by controller actions. |
| `src/app/useAppPreferences.ts` | reviewed | - | Preserve legacy credentials, URL normalization, and callback identities; no independent duplication proved. |
| `src/archive/ArchiveAssets.ts` | reviewed | - | Read fully; preserve image/reference/layer keys, snapshots, restoration and ownership. |
| `src/archive/ArchiveExport.ts` | reviewed | - | Read fully; preserve lazy ZIP module and Blob-byte normalization. |
| `src/archive/ArchiveManifest.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/archive/ArchiveManifest.ts` | findings | BUG-AR-01 | Read fully; see BUG-AR-01 (bug excluded from cleanup). |
| `src/archive/ArchiveStore.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/archive/ArchiveStore.ts` | reviewed | - | Read fully; preserve save/remove compensation, hydration, orphan recovery and ownership. |
| `src/archive/ArchiveTransfer.test.ts` | findings | AR-03 | Read fully; see AR-03. |
| `src/archive/ArchiveTransfer.ts` | reviewed | - | Read fully; preserve schemas, missing-asset reports, JSON clone and mask ownership. |
| `src/archive/SQLiteArchiveMetadataPort.ts` | reviewed | - | Read fully; preserve migrations and storage parsers; no new shared parsing abstraction justified. |
| `src/archive/recoverArchiveMetadata.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/archive/recoverArchiveMetadata.ts` | reviewed | - | Read fully; trace app URL-driven recovery; preserve missing-blob skip and schemas. |
| `src/archive/saveArchiveImage.ts` | reviewed | - | Read fully; trace generation/editor callers; preserve dual-write compensation and AggregateError. |
| `src/archive/useArchiveController.ts` | reviewed | - | Read fully and traced callers; retain boundary, historical data and runtime contracts. |
| `src/autopilot/AutopilotSession.test.ts` | findings | AUT-01 | Full behavioral cases reviewed; eight string mock resolutions and mutation-helper string require object migration for AUT-01; retain assertions. |
| `src/autopilot/AutopilotSession.ts` | findings | AUT-01 | Traced sole injected runtime producer and default producer; both object results. Preserve all cancellation, lineage, snapshot and cost behavior. |
| `src/autopilot/GoalPromptTranslator.test.ts` | reviewed | - | Operation-specific token cost assertion; retain. |
| `src/autopilot/GoalPromptTranslator.ts` | reviewed | - | Small factory, blank-output boundary and local optional-cost wrapper retained. |
| `src/autopilot/PromptRefiner.test.ts` | reviewed | - | Operation-specific cost and refined prompt behavior; retain. |
| `src/autopilot/PromptRefiner.ts` | reviewed | - | Feedback formatting, blank-output boundary and distinct operation cost retained. |
| `src/autopilot/ReasoningClient.test.ts` | reviewed | - | Native request/schema/vision, transport and numeric usage tests reviewed; malformed candidates not covered. |
| `src/autopilot/ReasoningClient.ts` | findings | AUT-BUG-01 | Preserve transport forwarding, provider identity and numeric usage; separately reproduced malformed-candidate TypeErrors outside cleanup. |
| `src/autopilot/SatisfactionEvaluator.test.ts` | reviewed | - | Fallback, usage/cost and normalization behavior retained. |
| `src/autopilot/SatisfactionEvaluator.ts` | reviewed | - | External JSON parsing, score finite/clamp and feedback normalization retained; no new abstraction. |
| `src/components/ActualParametersPanel.tsx` | reviewed | - | Read fully; meaningful empty/compact/details variants retained. |
| `src/components/ConfirmModal.tsx` | reviewed | - | Read fully; busy, error/retry, cancel blocking and native Modal behavior retained. |
| `src/components/CostSummaryPanel.tsx` | findings | UI-NEW-01 | Read fully and all callers traced; remove never-supplied showBreakdown prop only. Preserve exported helpers and ledger defenses. |
| `src/components/ImageCard.tsx` | reviewed | - | Read fully; selection/favorite/action propagation, accessibility and loading behavior retained. |
| `src/components/ImageDetailModal.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/components/ImageDetailModal.tsx` | reviewed | - | Read fully; preserve cancellation, retry, historical model display, costs and artwork fallback. |
| `src/components/Modal.tsx` | reviewed | - | Read fully; native dialog focus, Escape and backdrop behavior retained. |
| `src/components/PaletteSelect.tsx` | reviewed | - | Read fully; active versus selected, pointer/keyboard/focus behaviors preserved. |
| `src/components/ReferenceImageModal.tsx` | reviewed | - | Read fully and GenerateView caller traced; navigation/availability semantics retained. |
| `src/components/Sidebar.tsx` | reviewed | - | Read fully; persisted collapsed and responsive state classes traced and retained. |
| `src/components/Toast.tsx` | reviewed | - | Read fully; effect-event callback, persistent errors, timed other types and accessibility retained. |
| `src/costs/apiCost.test.ts` | reviewed | - | Local zero, missing usage, per-image allocation, subtotal/import snapshot/format behavior retained. |
| `src/costs/apiCost.ts` | reviewed | - | Full 605 lines and consumers reviewed; earlier GEN-05/GEN-06 already applied. Preserve validation, unique IDs and historical snapshots. |
| `src/db/AuraPersistence.ts` | reviewed | - | Read fully; actual concrete-port cached initialization must remain. |
| `src/db/types.ts` | reviewed | - | Read fully and traced callers; retain boundary, historical data and runtime contracts. |
| `src/download/download.ts` | reviewed | - | All helpers have real archive/generation/export consumers; delayed URL revocation preserved. |
| `src/editor/EditorCanvas.tsx` | reviewed | - | Read fully; image cancellation, resize, transform attachment and callbacks retained. |
| `src/editor/LayerPanel.tsx` | reviewed | - | Read fully; base/locked controls, selection and reorder retained. |
| `src/editor/aiTransform.test.ts` | findings | ED2-01 | Read fully; preserve target/reference/history assertions; migrate unused alias assertion. |
| `src/editor/aiTransform.ts` | findings | ED2-01 | Read fully; callers traced; unused result aliases; provenance guards retained. |
| `src/editor/editorDraftStorage.test.ts` | reviewed | - | Read fully; failed migration and large draft behavior retained; focused test passed. |
| `src/editor/editorDraftStorage.ts` | reviewed | - | Read fully; IndexedDB-first migration and legacy removal ordering retained. |
| `src/editor/layers.test.ts` | reviewed | - | Read fully; 15 geometry/locking/order/history scenarios retained; rotation gap noted separately. |
| `src/editor/layers.ts` | findings | ED2-02, ED2-03, ED2-B01 | Read fully; insertion return metadata and two adapters removable; rotated bounds bug separate. |
| `src/editor/renderLayerStack.ts` | reviewed | - | Read fully; ordered compositing, error propagation, rotated draw and Blob AI seam traced. |
| `src/editor/saveEditedImage.test.ts` | reviewed | - | Read fully; 11 save/lineage/cost/mask/reopen/failure scenarios retained; focused tests passed. |
| `src/editor/shortcuts.test.ts` | reviewed | - | Read fully; modifier and text-input behavior retained; focused tests passed. |
| `src/editor/shortcuts.ts` | reviewed | - | Read fully; modifier precedence and public key handlers traced. |
| `src/editor/transformMask.test.ts` | reviewed | - | Read fully; transparent and nonzero alpha behavior retained; focused tests passed. |
| `src/editor/transformMask.ts` | reviewed | - | Read fully; bounded alpha scan has real EditorView caller. |
| `src/editor/useEditorController.test.ts` | reviewed | - | Read fully; provenance undo/redo/rename and injected workflow behavior retained. |
| `src/editor/useEditorController.ts` | reviewed | - | Read fully; imageWorkflow edit/save callbacks traced; synchronous lock and recovery retained. |
| `src/editor/useEditorSession.ts` | findings | ED2-03 | Read fully; draft restore/history/gesture/reference callers traced; inline adapters only. |
| `src/generate-session/GenerateSession.test.ts` | reviewed | - | Read all 323 lines; preserve legacy migration, transfer clearing, saved Qwen controls, batch round-trip and reference snapshot coverage. |
| `src/generate-session/GenerateSession.ts` | findings | GEN-F01 | Read all 580 lines; preserve legacy keys and writes, unknown input validation, lineage cycle guard and server-safe storage. Only four alias declarations are unnecessary. |
| `src/generate-session/actualParameters.ts` | reviewed | - | Read all 83 lines; preserve requested versus provider-reported fields, finite elapsed time and omission semantics. |
| `src/generate-session/runGenerateAutopilot.test.ts` | reviewed | - | Read all 231 lines; mutation isolation, mixed credentials, zero-cost local inference and one-image best-result capture test observable behavior. |
| `src/generate-session/runGenerateAutopilot.ts` | reviewed | - | Read all 116 lines; one-image coercion, cloned draft, used references and lineage parent are required. Single-image adapter is an injection boundary. |
| `src/generate-session/saveGeneratedImage.test.ts` | reviewed | - | Read all 290 lines; real in-memory lineage verifies Qwen replay, stable references, actual parameters, explicit/latest parent, captured batch source and failed archive save. |
| `src/generate-session/useGenerateController.test.ts` | reviewed | - | Read all 484 lines; preserve partial save retry, failed/saved slot filtering, preview run identity, reference capacity/provenance and provider-used archive metadata. |
| `src/generate-session/useGenerateController.ts` | reviewed | - | Read all 829 lines; preserve synchronous locks, live versus durable results, publish-before-persist, save progress, legacy draft fallback and translation-ledger matching. Public single-slot aliases have GenerateView callers. |
| `src/hooks/useImageArchive.ts` | reviewed | - | Read fully; favorite uses addImage, saves publish after dual write; preserve failures. |
| `src/hooks/useLocalStorage.ts` | reviewed | - | Double cast preserves legacy raw-string fallback; changing invalid-data handling would be a behavior change. |
| `src/image-models/ImageModelControls.test.ts` | reviewed | - | Read all 215 lines; mapping assertions exercise real request contracts, invalid inputs, local budget, dimensions and ordered reference limits. |
| `src/image-models/ImageModelControls.ts` | reviewed | - | Read all 829 lines; retain correlated discriminated switches, provider-specific limits, overloads, boundary coercion and local size budget. Repeated coercion in transports is deliberate independent boundary validation; no new helper proposed. |
| `src/image-workflow/ImageProvider.ts` | reviewed | - | Read all 245 lines; keep per-slot Google error isolation and image usage detail parsing. Unknown response shape assumptions are outside behavior-preserving cleanup; no speculative schema rewrite. |
| `src/image-workflow/ImageWorkflow.test.ts` | reviewed | - | Read all 843 lines; preserve request routing, missing image errors, partial gate, actual parameters/costs, masked source ordering and Google fanout failure tests. |
| `src/image-workflow/ImageWorkflow.ts` | findings | GEN-F02, GEN-F03 | Read all 313 lines; remove unused re-export and two-helper boolean indirection only. Keep provider errors, slot alignment, single versus batch error policy, callback isolation and costs. |
| `src/image-workflow/LocalImageProvider.ts` | reviewed | - | Read all 103 lines; keep URL trimming, sd-server init reset, no-key transport, connection statuses and boundary response handling. |
| `src/image-workflow/LocalImageWorkflow.test.ts` | reviewed | - | Read all 308 lines; preserve local errors, target/context order, no-mask mapping, init reset, transparency template, FLUX routing and connection contracts. Identical ternary arms narrow different model/control variants and should remain. |
| `src/index.css` | findings | UI-NEW-02, UI-NEW-03 | All 2364 lines read, PostCSS selector inventory plus runtime/dynamic/dependency/cascade/responsive trace; dead ID rule and adjacent identical grids found. Keep documented tokens. |
| `src/lineage/LineageNavigator.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/lineage/LineageNavigator.ts` | reviewed | - | Read fully and traced callers; retain boundary, historical data and runtime contracts. |
| `src/lineage/LineageStore.ts` | findings | AR-03 | Read fully; see AR-03. |
| `src/lineage/SQLiteLineageMetadataPort.ts` | findings | AR-03 | Read fully; see AR-03. |
| `src/lineage/autopilotLineageMetadata.ts` | findings | AR-01 | Read fully; see AR-01. |
| `src/lineage/editorLineageMetadata.ts` | reviewed | - | Read fully and traced callers; retain boundary, historical data and runtime contracts. |
| `src/lineage/generateLineageMetadata.ts` | findings | AR-05 | Read fully; see AR-05. |
| `src/lineage/lineageCostLedger.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/lineage/lineageCostLedger.ts` | reviewed | - | Read fully and traced callers; retain boundary, historical data and runtime contracts. |
| `src/lineage/lineageMetadata.ts` | reviewed | - | Read fully and traced callers; retain boundary, historical data and runtime contracts. |
| `src/lineage/loadLineageTimeline.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/lineage/loadLineageTimeline.ts` | reviewed | - | Read fully and traced callers; retain boundary, historical data and runtime contracts. |
| `src/lineage/replayLineageStep.test.ts` | reviewed | - | Read fully, including callers and retained behavioral test fixtures; no confirmed minimal cleanup. |
| `src/lineage/replayLineageStep.ts` | findings | AR-04 | Read fully; see AR-04. |
| `src/lineage/types.ts` | findings | AR-02 | Read fully; see AR-02. |
| `src/main.tsx` | reviewed | - | Root assertion matches index.html; index.css is the imported style entry. |
| `src/references/clipboard.test.ts` | reviewed | - | Items and files fallback exercise distinct boundaries; retain. |
| `src/references/clipboard.ts` | reviewed | - | Native event callers traced; nullable file and MIME checks retained. |
| `src/references/useReferenceImageCollection.ts` | reviewed | - | GenerateView and EditorSession callers traced; File/preview state, hydration/serialization and blob cleanup preserved. |
| `src/services/StorageService.ts` | reviewed | - | Read fully; storage seam and historical falsy-to-null behavior retained. |
| `src/utils/file.test.ts` | reviewed | - | Decoded bytes, MIME parameters, whitespace and malformed input cases retained. |
| `src/utils/file.ts` | reviewed | - | ImageWorkflow/editor/generation/lineage callers traced; parsing protections and allocation-safe loops retained. |
| `src/utils/openai.test.ts` | reviewed | - | Read all 514 lines; meaningful transport coverage. Existing HTTP error test uses JSON and misses non-JSON error body. No cleanup-driven test deletion proposed. |
| `src/utils/openai.ts` | findings | GEN-B01 | Read all 508 lines; keep JSON/SSE fallback, decoder framing, required completion, callback catches and usage inheritance. Separately reproduced non-JSON HTTP error bug; no cleanup fix. |
| `src/utils/openaiModels.test.ts` | reviewed | - | Read all 68 lines; keep retired/current model distinctions, inherited key rejection and reasoning preference migration. |
| `src/utils/openaiModels.ts` | reviewed | - | Read all 191 lines; registry/model vocabulary remains canonical. Own-key checks protect historical input; no mapping duplication cleanup remains. |
| `src/views/ArchiveView.tsx` | reviewed | - | Read fully; preserve lazy ZIP import, finalizer, filters and hidden selections. |
| `src/views/EditorView.tsx` | reviewed | - | All 695 lines read; App keyed mounting, archive save and mask/keyboard paths traced. |
| `src/views/GenerateView.tsx` | reviewed | - | Read all 785 lines; preserve confirmation, native controls, snapshots, batch result states, provider messages and reference capacity. Dynamic-control casts reflect heterogeneous model controls; eliminating them needs a wider API change. |
| `src/views/SettingsView.tsx` | reviewed | - | Read all 262 lines; saved versus draft state, URL/key boundaries, connection finally and notification readiness retained. |
| `tsconfig.app.json` | reviewed | - | Read fully; strict/no-unused/no-emit and browser libs fit source; build info writes ignored dependency cache. |
| `tsconfig.json` | reviewed | - | Read fully; project-reference composition has two required child configs. |
| `tsconfig.node.json` | reviewed | - | Read fully; includes Vite/Playwright configs and E2E source with Node types; no unused source inclusion or stale root build cache. |
| `vite.config.ts` | reviewed | - | Read fully; Vitest include matches the current .test.ts corpus; React and SQLocal plugin consumers required. No pointless config extraction. |

### Added during this pass

| Path | Status | Review |
| --- | --- | --- |
| `docs/app-deslop-followup.md` | reviewed | Reconciled final claims and local evidence links against successful command logs, browser summaries and exact baseline/final file inventories. |
