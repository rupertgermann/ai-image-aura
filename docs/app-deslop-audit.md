# App deslop audit

Approved plan: [Audit and remove app slop](app-deslop-plan.md).

Base: `6b1c10bb5d64fca7412fbed51713aa88c3a0b896`. Branch: `feat/app-deslop`.

## Outcome

All 152 original tracked files have a disposition below. Four read-only source audits covered 112 files; the owner reviewed the remaining 40 tooling, style, documentation, and asset entries. Two machine-specific configuration files are excluded from content rewriting. The three new plan, audit and verification files are also covered. One owner made all repository edits.

Removed unused controller properties, APIs, model maps, editor adapters, template files and a JSZip type stub. Reused existing cost, model and lineage parsing; removed dead and duplicate CSS. The `src/` diff removes 205 net lines, including the migrated test fixtures. No storage schema, key, archive format or model request contract changed.

Final verification is recorded below. Browser checks use isolated Vite origins, synthetic data and mocked providers. Paid provider service availability and local image-server execution were not tested; no personal browser data or daily development server was used.

## Findings

All 25 `remove` and `simplify` findings are resolved in batches A–E. Three `keep` findings preserve established protections. There are no open findings. Locations and evidence below explain each disposition; proposed actions in those rows have been applied unless marked `keep`.

| ID | Disposition | Location | Evidence and proposed action |
| --- | --- | --- | --- |
| ROOT-01 | remove | `src/App.css; src/assets/react.svg; tsconfig.tsbuildinfo` | Tracked-tree reference search has no consumers. main.tsx imports index.css; current TypeScript configs write build info under node_modules/.tmp. Root cache has empty fileNames/root. Delete the three unused files. |
| ROOT-02 | simplify | `src/index.css` | No runtime source creates placeholder-view, history-actions, comparison-view or comparison-pane. modal-bg-fade has no animation reference. Adjacent parameter/cost panels have identical declarations; later search-icon and mobile sidebar rules repeat effective values. Deleted dead rules, merged identical adjacent panels and dropped duplicate declarations. Kept reference-remove hover opacity because it overrides disabled fieldset styling. |
| ROOT-03 | remove | `package.json; package-lock.json` | Installed @types/jszip 3.4.0 identifies itself as a stub; jszip package declares its own index.d.ts. Remove obsolete stub dependency using npm package-lock-only uninstall. |
| ROOT-04 | simplify | `README.md; CONTEXT.md` | IMAGE_MODEL_REGISTRY and local server script support flux-2-klein-4b; current-model documentation lists only Qwen. Add the existing FLUX.2 klein 4B model to current-model lists and local provider description. |
| UI-01 | remove | `src/app/useAppPreferences.ts` | Whole-tree search finds openAiApiKey and updateOpenAiApiKey only at their declarations. The sole caller uses canonical apiKey/updateApiKey. Delete the two unused alias properties. |
| UI-02 | remove | `src/app/useAppController.ts` | App.tsx is the sole caller and does not read top-level apiKey/editingImage/updateApiKey. SettingsView neither declares nor reads the forwarded getProviderCredential. Delete only top-level apiKey/editingImage/updateApiKey return properties and settingsViewProps.getProviderCredential. Retain their internal declarations and actual nested usages. |
| UI-03 | simplify | `src/components/CostSummaryPanel.tsx` | Early return line 77 guarantees a reasoning item. reasoningItems length guard is redundant. Private getUnavailableLabel has two callers: imageItems inside explicit nonempty guard; reasoningItems guaranteed nonempty. Its empty branch is unreachable. Unwrap reasoning rows.push; delete private getUnavailableLabel empty guard. Preserve imageItems guard, compact/no-reasoning early return, row order and unavailable/partial labels. |
| GEN-01 | remove | `src/utils/openaiModels.ts` | Full tracked-tree search finds parameters only in these declarations, four ImageWorkflow.test.ts fixture literals, and unrelated prose. No consumer reads the mapping; actual requests are built by ImageModelControls and providers. Delete the parameters field and all four registry maps; remove parameters: {} from the four typed test fixtures in src/image-workflow/ImageWorkflow.test.ts. Preserve endpoints, capabilities, model identity and request mappings. |
| GEN-02 | remove | `src/generate-session/GenerateSession.ts` | loadCurrentResult, loadCurrentResultReferences and saveCurrentResult have no application, browser-script or tooling callers. Their sole callers are GenerateSession.test.ts. The app publishes and reads GenerateBatchSnapshot through loadCurrentBatch/saveCurrentBatch. Remove the three interface members and methods. Migrate existing assertions in GenerateSession.test.ts to the real batch seam: construct a one-slot batch, assert its result and references, then assert null after clear/transfer. Preserve the behavior tests and every legacy storage key, legacy read fallback and compatibility write in saveCurrentBatch. |
| GEN-03 | simplify | `src/generate-session/GenerateSession.ts` | The switch duplicates the exact model-to-draft-key mapping already imported as resolveImageModelDraftKey. buildImageModelArchiveFields accepts unknown controls and owns sanitization. Its callers are actualParameters.getRequestedGenerateParameters and useGenerateController.buildGeneratedArchiveImage. Return buildImageModelArchiveFields(draft.model, draft[resolveImageModelDraftKey(draft.model)]). Keep getActiveGenerateModel switch because its discriminated model/control union needs narrowing. |
| GEN-04 | simplify | `src/image-models/ImageModelControls.ts` | Three legacy size comparisons occur before the string guard and are repeated identically after value.trim(). All matching literals are strings; removing the first group yields the same result for every value while keeping whitespace support. Delete only lines 739-741. Keep the string guard, trim, legacy size mapping and allowed-ratio validation. |
| GEN-05 | simplify | `src/costs/apiCost.ts` | unavailableItems repeats the logical negation of the calculatedItems predicate and is used only for unavailableItems.length > 0. The calculatedItems subset already identifies whether any items were excluded. Delete unavailableItems filter and derive partial status from calculatedItems.length < items.length. Keep finite-number validation and the no-calculated-items unavailable return. |
| GEN-06 | simplify | `src/costs/apiCost.ts` | optionalFiniteNumber(record.amountUsd) and sanitizePricing(record.pricing) each run once in a condition and again to build the same output. sanitizePricing allocates a validated snapshot whose first result is discarded. Compute amountUsd and pricing once into local constants before the return; reuse each checked result in its conditional property spread. Retain all schema checks and property omission behavior, including null amount and undefined pricing. |
| GEN-07 | simplify | `src/utils/openai.ts` | The pure extractResponseUsage(data) helper runs twice in the same conditional spread after data has already been parsed once from JSON. Compute const usage = extractResponseUsage(data) once and reuse it for the undefined check and returned usage property. |
| GEN-08 | simplify | `src/autopilot/AutopilotSession.test.ts` | provider: id === 'image-generation' ? 'openai' : 'openai' has identical branches. Replace with provider: 'openai'. |
| ED-01 | remove | `src/editor/layers.ts` | git grep finds only its declaration in the complete tracked tree. EditorCanvas selects via Konva node mouse events and blank-stage selection; no helper caller or test exists. Delete the unused exported function only. |
| ED-02 | remove | `src/editor/EditorCanvas.tsx` | git grep exportBlob finds only this interface and imperative-handle implementation. Sole handle consumer EditorView calls exportDataUrl. AI transforms use renderLayerStackToBlob directly. Remove exportBlob from handle and its implementation, and remove renderLayerStackToBlob import here; retain renderer function for AI transforms. |
| ED-03 | remove | `src/editor/useEditorSession.ts` | Sole session caller EditorView does not destructure this property. Complete tracked-tree search finds this returned property and unrelated local variable in ArchiveStore only. Save context independently computes hasDurableLayerStack. Remove unused returned property and hasDurableLayerStack import from this hook only. |
| ED-04 | simplify | `src/editor/useEditorController.ts` | Production ImageWorkflow.edit returns Promise<EditImageResult>. runEditorAiTransform has no production callers outside this hook. The only string-returning edit dependency is runTransform test helper in useEditorController.test.ts:174; main test already returns object. Compatibility normalization exists solely for this old mock shape. Type dependency as ImageWorkflow['edit'], await its result directly, delete normalizeEditImageResult and unused result/input imports; change test helper to return { imageUrl: 'data:image/png;base64,ai-result' }. |
| ED-05 | simplify | `src/editor/useEditorController.ts` | onSave is void / Promise<void>; await already adopts both values and thenables, while try/catch catches synchronous throws. Promise.resolve adds no required conversion. Replace await Promise.resolve(onSave(...)) with await onSave(...) and remove one closing parenthesis. |
| ED-06 | keep | `src/editor/useEditorController.ts` | Ref locks synchronously before React state updates, preventing concurrent Save/AI requests. Awaited archive callback rejection populates error and finally unlocks retry; removing catches or relying on loading state could lose save recovery. Retain lock and catches unchanged. |
| ED-07 | keep | `src/editor/editorDraftStorage.ts` | Legacy localStorage draft is deleted only after awaited IndexedDB migration succeeds; retained test checks failed migration keeps legacy data. Draft/session catches expose restore and persistence failure to user. Keep migration ordering, draft keys and error propagation unchanged. JSON cast is a storage-boundary concern requiring separate validation work rather than deletion. |
| ED-08 | keep | `src/editor/aiTransform.ts` | Provenance is valid only while AI result layer exists and is ai-result. Controller tests explicitly cover undo dropping provenance, redo restoring it, and renaming using present layer name. Retain guards and current-layer lookup; keep those behavior tests. |
| ST-01 | remove | `src/services/StorageService.ts` | Whole tracked-tree rg finds clearAll only on the interface, concrete provider, and an uncalled InMemoryStorageProvider method at GenerateSession.test.ts:320. All persistence callers use save/load/remove/listKeys. Remove the clear import, clearAll interface member and concrete method; remove the matching unused test-fake method in src/generate-session/GenerateSession.test.ts (coordinate with its owner). |
| ST-02 | simplify | `src/lineage/editorLineageMetadata.ts` | normalizeNullableNumber and asFiniteNumber have identical typeof + Number.isFinite expressions and null fallbacks. normalizeNullableBoolean and asBoolean have identical expressions. Only buildEditorLineageMetadata calls the normalize variants; metadata readers already call the as variants. Use asFiniteNumber and asBoolean at lines 120-121; delete the two duplicate normalize helpers. |
| ST-03 | remove | `src/lineage/LineageStore.ts` | Whole tracked-tree search finds no consumer importing SQLiteLineageMetadataPort from LineageStore. AuraPersistence imports the implementation directly; LineageStore imports it solely to re-export it. Delete the implementation import and unused value re-export; preserve the factory, store interface, metadata-port type and LineageStep type re-exports, all of which have callers. |
| ST-04 | simplify | `src/archive/ArchiveTransfer.ts` | Transfer local mask reader duplicates exported readEditorLineageTransformMask in editorLineageMetadata.ts:233-236, including nested-first versus legacy fallback, record guarding, accepted empty-string behavior, assetId null fallback and image/png default. The duplicated transfer asset interface has the same fields as EditorLineageTransformMaskAsset. Both uses are within ZIP export/import; the existing shared reader already serves Editor replay. Import readEditorLineageTransformMask and type EditorLineageTransformMaskAsset; use the reader at both callsites, use the existing type in setTransformMaskAsset, delete the local interface and duplicate read helpers. Keep setTransformMaskAsset and its asRecord helper, which still update both typed and legacy fields. |
| ROOT-05 | simplify | `scripts/verify-archive-lineage.cjs` | After Vite hot reload, the direct unversioned import and the app had different lineageStore instances; injection-module.json records sameStore false. Patch the loaded module URL using the existing generation verification pattern. Three archive recovery browser scenarios passed after the fix. |

## Verification

Local evidence root: [/tmp/aura-deslop/](/tmp/aura-deslop/). These artifacts are not committed; the commands below reproduce the checks. Browser launches required sandbox escalation. Provider HTTP was intercepted; archive metadata, IndexedDB, OPFS, canvas rendering and ZIP downloads used the real app stack. ZIP import used `importArchiveZip`, because the app has no import UI.

| Check | Baseline | Final |
| --- | --- | --- |
| Lint | Passed | Passed |
| TypeScript / production build | Passed through build | Explicit typecheck and build passed |
| Existing Vitest suite | 256 tests, 35 files passed | 256 tests, 35 files passed |
| Save/reload Playwright E2E | 1 passed | 1 passed; trace and screenshot retained |
| Generation browser checks | 10 checkpoints passed | 10 passed; scenario summaries identical |
| Archive/lineage recovery | Generation, overwrite, copy passed | All 3 passed; summaries identical |
| App workflows | 24 checkpoints passed | 26 passed; adds actual synthetic deletion and generation during navigation |
| Cost/model contracts | Snapshot captured | Exact match across 6 ledgers and 7 legacy/invalid aspect ratios |
| Responsive layout | Four views at 320, 390, 800, 1440 px | All 16 screenshots pixel-identical; no page overflow |
| Loading boundaries | Separate EditorView and ArchiveExport chunks | Both remain separate build chunks |
| Coverage | 152 base paths accounted for | 155 union paths: 152 original plus 3 added; no missing or duplicate paths |
| Diff and script syntax | Clean starting app tree | `git diff --check` and both changed scripts' syntax checks passed |

Logs: [baseline](/tmp/aura-deslop/baseline/), [final](/tmp/aura-deslop/final/). Final artifacts: [save/reload E2E](/tmp/aura-deslop/final/e2e-artifacts/), [generation](/tmp/aura-deslop/final/generation/), [recovery](/tmp/aura-deslop/final/archive-lineage/), [app workflows](/tmp/aura-deslop/final/workflows/), [layout comparison](/tmp/aura-deslop/final/layout-comparison.json).

The app workflow check covers layer upload/name/lock/visibility/blend/opacity, keyboard moves, undo/redo, adjustments, masks, mocked AI edits, draft reload, copy saves, ZIP assets and lineage round-trip, replay/fork/create-similar, archive search/favorites/selection, delete cancellation/focus and confirmed deletion, settings validation/persistence, and navigation during generation. The last two checkpoints were added at final verification; the other 24 also ran before application changes. Existing unit tests were retained; test fixtures for removed APIs were migrated and passed before production edits.

Repeat after starting an authorized isolated Vite instance:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
node scripts/verify-generation-batch.cjs http://127.0.0.1:5177 /tmp/aura-deslop/recheck/generation
node scripts/verify-archive-lineage.cjs http://127.0.0.1:5177 /tmp/aura-deslop/recheck/archive-lineage
node scripts/verify-app-workflows.cjs http://127.0.0.1:5177 /tmp/aura-deslop/recheck/workflows
git diff --check
```

### Batch results and review

| Batch | Resolved scope | Evidence |
| --- | --- | --- |
| A | Dead APIs, template files, obsolete type stub | 256 tests, build, generation and 24 workflow checkpoints |
| B | UI forwarding and redundant cost guards | Typecheck, 24 workflow checkpoints; contract snapshot identical |
| C | Model mapping, cost sanitization, response usage | Typecheck, 148 focused tests and generation browser checks |
| D | Editor result adapter, duplicate lineage readers | Typecheck, 98 focused tests, 24 workflow checkpoints and 3 recovery scenarios |
| E | CSS, documentation, verification reliability | Full final checks and 16 identical responsive screenshots |

The [independent diff and comment review](/tmp/aura-deslop/final-review.md) found no production blockers. Its evidence follow-ups were addressed: confirmed deletion and navigation have repeatable artifacts, and the [decision log](/tmp/aura-deslop/decisions.tsv) includes batches D/E and final results. The owner also inspected the complete change set.

## File coverage

Statuses describe audit coverage, not execution of each behavior. Binary assets were reviewed through ownership and references. Generated lockfile data was checked for consistency, not stylistically rewritten.

| Path | Status | Findings | Review / exclusion reason |
| --- | --- | --- | --- |
| `.claude/settings.local.json` | excluded | - | Machine-specific permission or skill installation metadata; schema inspected, policy/content rewriting outside app cleanup. |
| `.github/FUNDING.yml` | reviewed | - | Read source and references; no focused cleanup justified. |
| `.gitignore` | reviewed | - | Read source and references; no focused cleanup justified. |
| `AGENTS.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `CLAUDE.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `CONTEXT.md` | findings | ROOT-04 | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `LICENSE` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `README.md` | findings | ROOT-04 | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/DESIGN.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/agents/domain.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/agents/issue-tracker.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/agents/triage-labels.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/archive-lineage-validation.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/generation-batch-validation.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/product-polish-validation.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `docs/screens/Archive.png` | reviewed | - | Asset ownership and references checked; documentation screenshots and fixture preserved. |
| `docs/screens/Detail.png` | reviewed | - | Asset ownership and references checked; documentation screenshots and fixture preserved. |
| `docs/screens/Editor.png` | reviewed | - | Asset ownership and references checked; documentation screenshots and fixture preserved. |
| `docs/screens/Generate.png` | reviewed | - | Asset ownership and references checked; documentation screenshots and fixture preserved. |
| `docs/todo.md` | reviewed | - | Read guidance/reference content; preserve documented contracts, historical evidence, policy and licensing. |
| `e2e/fixtures/four-colors.png` | reviewed | - | Asset ownership and references checked; documentation screenshots and fixture preserved. |
| `e2e/generate-save-reload.spec.ts` | reviewed | - | Read source and references; no focused cleanup justified. |
| `eslint.config.js` | reviewed | - | Read source and references; no focused cleanup justified. |
| `index.html` | reviewed | - | Read source and references; no focused cleanup justified. |
| `package-lock.json` | findings | ROOT-03 | Root manifest consistency checked; generated lock entries updated only for dependency removal. |
| `package.json` | findings | ROOT-03 | Read source and references; no focused cleanup justified. |
| `playwright.config.ts` | reviewed | - | Read source and references; no focused cleanup justified. |
| `public/vite.svg` | reviewed | - | Asset ownership and references checked; documentation screenshots and fixture preserved. |
| `scripts/qwen-sd-server.sh` | reviewed | - | Read complete script and its invocation; preserve provider blocking, disposable profiles and validation artifacts. Local-server lifecycle script inspected without running. |
| `scripts/verify-archive-lineage.cjs` | findings | ROOT-05 | Fault injection targets the loaded Vite module; generation, overwrite and copy recovery passed. |
| `scripts/verify-generation-batch.cjs` | reviewed | - | Read complete script and its invocation; preserve provider blocking, disposable profiles and validation artifacts. Local-server lifecycle script inspected without running. |
| `skills-lock.json` | excluded | - | Machine-specific permission or skill installation metadata; schema inspected, policy/content rewriting outside app cleanup. |
| `src/App.css` | findings | ROOT-01 | Deleted: unreferenced empty stylesheet. |
| `src/App.tsx` | reviewed | - | Keep mounted hidden Generate and lazy Editor lifetime, persisted-view fallback and selected-image callback guards. |
| `src/app/CompletionNotificationPort.test.ts` | reviewed | - | Readiness states are distinct browser contracts; retain. |
| `src/app/CompletionNotificationPort.ts` | reviewed | - | Keep notification readiness/security/permission gates, environment seam and browser permission normalization. |
| `src/app/providerKeys.test.ts` | reviewed | - | Raw/JSON/invalid/whitespace/URL behavior cases are distinct; retain. |
| `src/app/providerKeys.ts` | reviewed | - | Keep raw/JSON key compatibility and URL validation at storage boundary. |
| `src/app/types.ts` | reviewed | - | Shared AppView domain type has real consumers; retain. |
| `src/app/useAppController.ts` | findings | UI-02 | Keep busy gates, save failure propagation, post-save draft clearing, StrictMode recovery ref, replay availability handling and image override/persisted-ID distinction. |
| `src/app/useAppNotifications.ts` | reviewed | - | Error narrowing and toast IDs serve behavior; retain. |
| `src/app/useAppPreferences.ts` | findings | UI-01 | Keep legacy migration and URL normalization. Setter wrappers alone are not defects; useLocalStorage setters are render-dependent. |
| `src/archive/ArchiveAssets.ts` | reviewed | - | Keep snapshot/restore helpers and null guards: save/remove compensation needs complete touched reference and layer assets. Small key helpers express durable formats. |
| `src/archive/ArchiveExport.ts` | reviewed | - | Keep lazy-loading module boundary (ArchiveView dynamically imports it), JSZip dependency and typed-byte Blob normalization. |
| `src/archive/ArchiveManifest.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/archive/ArchiveManifest.ts` | reviewed | - | Keep version/schema parsing and legacy omissions at imported ZIP/manifests boundary. No blanket cast/guard deletion. |
| `src/archive/ArchiveStore.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/archive/ArchiveStore.ts` | reviewed | - | Keep metadata/blob separation, orphan recovery, durable URL stripping, existing-image overwrite and compensating rollback. Same field mapping in save/return/hydrate serves different formats. |
| `src/archive/ArchiveTransfer.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/archive/ArchiveTransfer.ts` | findings | ST-04 | Reviewed implementation and callers; accepted removal or shared-parser reuse is covered by the finding and batch checks. |
| `src/archive/SQLiteArchiveMetadataPort.ts` | reviewed | - | Keep historical ALTER migrations/catches and optional field parsers. Row list/get mapping duplication is not an accepted edit; persistence behavior outweighs a new helper here. |
| `src/archive/recoverArchiveMetadata.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/archive/recoverArchiveMetadata.ts` | reviewed | - | Keep missing-blob skips and shared manifest validation; called from app URL-driven recovery. |
| `src/archive/saveArchiveImage.ts` | reviewed | - | Keep nested rollback catch/AggregateError, previous persisted record snapshot, copy vs overwrite timestamp/id and layered adjustments. Mapping wrapper is meaningful domain translation, not dead. |
| `src/archive/useArchiveController.ts` | reviewed | - | Keep filtered selection versus detail selection, delete confirmation state and post-success pruning. Missing image/empty selection guards cover changing archive state. |
| `src/assets/react.svg` | findings | ROOT-01 | Asset ownership and references checked; documentation screenshots and fixture preserved. |
| `src/autopilot/AutopilotSession.test.ts` | findings | GEN-08 | Useful loop, ties, snapshots, cancellation, partial failure and aggregate-cost behavior coverage; retain in-memory lineage port and transport mocks. |
| `src/autopilot/AutopilotSession.ts` | reviewed | - | Keep settings and per-iteration reference/control copies: mutation isolation is demonstrated by its tests. Keep cancel-after-current-iteration semantics, partial completed lineage, tie ordering and cumulative run costs. Running-best callback and final cost-bearing best result have different roles. |
| `src/autopilot/GoalPromptTranslator.test.ts` | reviewed | - | Retain operation-specific usage-to-cost behavior assertion. |
| `src/autopilot/GoalPromptTranslator.ts` | reviewed | - | Keep operation-specific prompt, blank-response rejection, optional cost metadata and small factory. Duplicated cost wrapper alone does not justify a new abstraction. |
| `src/autopilot/PromptRefiner.test.ts` | reviewed | - | Retain prompt-refinement cost behavior assertion. |
| `src/autopilot/PromptRefiner.ts` | reviewed | - | Keep feedback prompt formatting, blank-result boundary check and operation-specific cost label. No factory removal solely for size. |
| `src/autopilot/ReasoningClient.test.ts` | reviewed | - | Retain request vision/schema, HTTP transport, text extraction and numeric usage behavior checks. |
| `src/autopilot/ReasoningClient.ts` | reviewed | - | Keep transport adapter and model identity; binding via method forwarding is safe. Gemini numeric-only usage intentionally differs from image modality metadata. Response casts suggest possible validation gaps, not cleanup deletions. |
| `src/autopilot/SatisfactionEvaluator.test.ts` | reviewed | - | Retain malformed-response fallback, cost ledger and score/feedback normalization behavior checks. |
| `src/autopilot/SatisfactionEvaluator.ts` | reviewed | - | Keep JSON parse fallback, score clamping and feedback normalization at model-output boundary; prompts and cost operation remain distinct. |
| `src/components/ActualParametersPanel.tsx` | reviewed | - | Rows, elapsed and rewritten prompt provide distinct visible details; retain. |
| `src/components/ConfirmModal.tsx` | reviewed | - | Keep busy/error state and cancel blocking during async confirm; retain native focus behavior. |
| `src/components/CostSummaryPanel.tsx` | findings | UI-03 | Keep historical ledger shape guard, calculated/unavailable handling, partial labels and needed export suppression. |
| `src/components/ImageCard.tsx` | reviewed | - | Keep propagation boundaries, favorite/selection semantics, lazy decoding and accessible labels. |
| `src/components/ImageDetailModal.test.ts` | reviewed | - | Archive ledger preference over lineage cost is a substantive contract; retain. |
| `src/components/ImageDetailModal.tsx` | reviewed | - | Keep timeline cancellation guard during navigation, loading/error/retry, historical model handling and fallback artwork. Shared helpers/suppression remain useful. |
| `src/components/Modal.tsx` | reviewed | - | Keep native focus confinement/restoration, Escape/backdrop handling and rationale comment. |
| `src/components/PaletteSelect.tsx` | reviewed | - | Keep active/selected distinction, keyboard typeahead and focus handling. Native select would change color-preview UI. |
| `src/components/ReferenceImageModal.tsx` | reviewed | - | Optional callbacks and availability support distinct navigation states; retain. |
| `src/components/Sidebar.tsx` | reviewed | - | Keep typed navigation and persisted collapse state. |
| `src/components/Toast.tsx` | reviewed | - | useEffectEvent avoids timer restart when closures change; keep persistent error toasts and status/alert roles. |
| `src/costs/apiCost.test.ts` | reviewed | - | Retain costs, provider usage, request allocation, imported historical ledgers and formatting behavior. Partial-status coverage should be established before GEN-05 if needed. |
| `src/costs/apiCost.ts` | findings | GEN-05, GEN-06 | Keep provider usage normalization, unavailable versus zero distinction, shared-request allocation, historical pricing snapshots, import validation, unique line-item IDs and sub-cent formatting. |
| `src/db/AuraPersistence.ts` | reviewed | - | Keep cached init promise coordinating SQLite ports and shared database lifetime. |
| `src/db/types.ts` | reviewed | - | Keep archive/storage schemas and blend-mode vocabulary. Validation cast in includes does not bypass runtime membership checking. |
| `src/download/download.ts` | reviewed | - | Keep URL download helpers and delayed Blob URL revocation; image-card/detail/generated callers have distinct filenames. |
| `src/editor/EditorCanvas.tsx` | findings | ED-02 | Reviewed fully. Keep image-load cancellation, transformer attach/detach and exportDataUrl path. No rendering-frequency cleanup proposed. |
| `src/editor/LayerPanel.tsx` | reviewed | - | Reviewed fully. Keep editable/base/lock distinctions and drag-reorder clamping. Repeated small booleans do not justify churn. |
| `src/editor/aiTransform.test.ts` | reviewed | - | Reviewed fully. Tests cover distinct selected/whole-composition inputs, reference reservation and non-destructive insertion/history. |
| `src/editor/aiTransform.ts` | findings | ED-08 | Reviewed fully. Preserve mask asset conversion, optional metadata omission and target/source/context separation. |
| `src/editor/editorDraftStorage.test.ts` | reviewed | - | Reviewed fully. Behavior test proves failed migration retains legacy draft and large drafts avoid localStorage. |
| `src/editor/editorDraftStorage.ts` | findings | ED-07 | Reviewed fully. Retain migration and clear ordering; do not rewrite storage boundary in cleanup. |
| `src/editor/layers.test.ts` | reviewed | - | Reviewed fully. Each scenario covers relevant dimensions, locked/base behavior, order, bounded history or target fallback; retain. |
| `src/editor/layers.ts` | findings | ED-01 | Reviewed fully. Keep historical square-size repair, normalization, opacity clamping, locked-patch allowlist, base protection and immutable history. No helper extraction or casts rewrite warranted. |
| `src/editor/renderLayerStack.ts` | reviewed | - | Reviewed fully. Keep ordered sequential compositing, transform/filter handling and explicit canvas/image errors. Blob conversion is real AI input path. |
| `src/editor/saveEditedImage.test.ts` | reviewed | - | Reviewed fully. Retain copy/overwrite/AI lineage, costs, masks, layered reopening, explicit parent and failed save contracts. |
| `src/editor/shortcuts.test.ts` | reviewed | - | Reviewed fully. Distinct text-input and modifier-arrow boundaries are useful behavior checks. |
| `src/editor/shortcuts.ts` | reviewed | - | Reviewed fully. Modifier order affects redo/save semantics; no abstraction or switch rewrite needed. |
| `src/editor/transformMask.test.ts` | reviewed | - | Reviewed fully. Empty/painted alpha checks cover meaningful mask semantics. |
| `src/editor/transformMask.ts` | reviewed | - | Reviewed fully. Keep early alpha scan and pixel-length bound; no speculative rewrite. |
| `src/editor/useEditorController.test.ts` | findings | ED-04 | Reviewed fully. Update stale string mock only if ED-04 accepted; retain provenance behavior assertions and injection. |
| `src/editor/useEditorController.ts` | findings | ED-04, ED-05, ED-06 | Reviewed fully. Keep synchronous operation ref, awaited save, error/finally recovery, request snapshot and provenance construction. |
| `src/editor/useEditorSession.ts` | findings | ED-03 | Reviewed fully. Keep bounded immutable history, selection filtering, gesture coalescing/latest-draft ref, loading guard, async restore cancellation, draft failure notice and beforeunload warning. serializeReferences promise API kept: removing forwarding changes multiple boundaries for minor benefit. |
| `src/generate-session/GenerateSession.test.ts` | findings | GEN-02 | Retain draft migration, Qwen lineage restoration, per-model controls, reference/run snapshots, transfer clearing and persisted legacy-batch behavior. Adapt unused convenience-method calls without deleting behavior coverage. |
| `src/generate-session/GenerateSession.ts` | findings | GEN-02, GEN-03 | Keep storage migration, legacy keys and fallback; boundary sanitizers and visited-lineage cycle guard are purposeful. Existing server-safe fallback is used by node tests; do not delete solely as browser-only speculation. |
| `src/generate-session/actualParameters.ts` | reviewed | - | Keep provider-reported versus requested fields, finite elapsed time, changed labels and empty-state helper. No field inference should be added. |
| `src/generate-session/runGenerateAutopilot.test.ts` | reviewed | - | Retain mutable-reference isolation and mixed-provider cost/credential/lineage behavior checks. |
| `src/generate-session/runGenerateAutopilot.ts` | reviewed | - | Keep single-image coercion, used-reference snapshots, best-result draft/control capture and lineage parent. Single-image helper duplicates some default Autopilot code but each owns a distinct workflow injection seam; shared extraction is not worth added API. |
| `src/generate-session/saveGeneratedImage.test.ts` | reviewed | - | Retain replay settings, provenance, explicit/latest parent semantics, captured batch parent and save-failure behavior. Fixture port is deliberately real in-memory storage. |
| `src/generate-session/useGenerateController.test.ts` | reviewed | - | Retain partial-save retry, per-slot behavior, stale-preview gating, reference lineage/capacity and exact provider-used metadata. SSR hook harness exercises public generation action but does not substitute for browser state verification. |
| `src/generate-session/useGenerateController.ts` | reviewed | - | Keep synchronous refs alongside UI state to block overlapping work; live preview separate from durable completed batch; completed image published before persistence; per-save onSaved progress, snapshot fallbacks and run-ID partial gating. Single-slot save/download aliases have real GenerateView callers. |
| `src/hooks/useImageArchive.ts` | reviewed | - | Keep addImage: used for favorites at useAppController.ts:133; generation/editor writes use saveArchiveImage then publishSavedImage. Keep failure propagation and async load state. |
| `src/hooks/useLocalStorage.ts` | reviewed | - | Keep double cast/raw-string fallback: hook reads historical raw storage as well as JSON and has mixed primitive/null callers. Tightening fallback to initial type would change existing boundary behavior and is outside cleanup. |
| `src/image-models/ImageModelControls.test.ts` | reviewed | - | Retain observable mappings, invalid-value defaults, 32-pixel/local budget constraints, reference order/capacity and archived dimensions. |
| `src/image-models/ImageModelControls.ts` | findings | GEN-04 | Keep boundary coercion, model/control discrimination, reference limits, local edit pixel budget and provider-specific distinctions. Identical-looking switch arms preserve overload narrowing; broad grouping can weaken types. No table/factory rewrite. |
| `src/image-workflow/ImageProvider.ts` | reviewed | - | Keep Google per-slot catch for partial batches, separate image usage modality details and transport request mapping. File-to-base64 duplication has a different output seam from dataURL utility; no new helper justified. |
| `src/image-workflow/ImageWorkflow.test.ts` | findings | GEN-01 | Retain boundary request, metadata/cost, masked editing, partial streaming gates, missing-image and Google fanout isolation checks. Remove only obsolete parameters fixture fields for GEN-01. |
| `src/image-workflow/ImageWorkflow.ts` | reviewed | - | Keep provider lookup errors, batch slot positions and partial error preservation, one-image error policy, partial callback protection, elapsed parameters, native model-control mapping and edit target ordering. Small private helpers alone are not slop. |
| `src/image-workflow/LocalImageProvider.ts` | reviewed | - | Keep connection result distinctions, URL trimming, no-key transport, CLEAR_INIT_IMAGE sd-server compatibility, reference caps and JSON/error response validation. |
| `src/image-workflow/LocalImageWorkflow.test.ts` | reviewed | - | Retain local HTTP errors, batching, target order, masks omitted, sd-server init reset, transparency template, model routing, dimensions and connection semantics. Identical generateInput branches retain discriminated-union narrowing without casts. |
| `src/index.css` | findings | ROOT-02 | Dead selectors and duplicate rules removed; responsive screenshots unchanged. |
| `src/lineage/LineageNavigator.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/lineage/LineageNavigator.ts` | reviewed | - | Keep missing step/image outcomes and navigation store seam, used by app replay/fork handlers. |
| `src/lineage/LineageStore.ts` | findings | ST-03 | Reviewed implementation and callers; accepted removal or shared-parser reuse is covered by the finding and batch checks. |
| `src/lineage/SQLiteLineageMetadataPort.ts` | reviewed | - | Keep SQL initialization/indexes, deterministic order and malformed historical JSON fallback. |
| `src/lineage/autopilotLineageMetadata.ts` | reviewed | - | Keep typed plus legacy fields/readers: ZIP historical format and replay/timeline metadata retain them. |
| `src/lineage/editorLineageMetadata.ts` | findings | ST-02 | Reviewed implementation and callers; accepted removal or shared-parser reuse is covered by the finding and batch checks. |
| `src/lineage/generateLineageMetadata.ts` | reviewed | - | Keep retired model support, typed and legacy fields, Qwen draft controls; repeated model switch return shapes preserve TypeScript variant correlation. |
| `src/lineage/lineageCostLedger.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/lineage/lineageCostLedger.ts` | reviewed | - | Keep unavailable charged-step items and archive fallback by item count; these are accounting behavior. |
| `src/lineage/lineageMetadata.ts` | reviewed | - | Keep per-step validation and optional legacy fields at imported manifest boundary. |
| `src/lineage/loadLineageTimeline.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/lineage/loadLineageTimeline.ts` | reviewed | - | Keep ancestor cycle detection/missing-parent behavior and legacy/readable summaries. No splitting based on file size. |
| `src/lineage/replayLineageStep.test.ts` | reviewed | - | Read all test cases and fixtures. Keep behavioral coverage: serialization/import, asset ownership/recovery, replay, metadata compatibility or costs; no duplicate test removal justified. |
| `src/lineage/replayLineageStep.ts` | reviewed | - | Keep typed/legacy/retired model resolution and model-specific controls; compatibility behavior is covered by behavioral tests. |
| `src/lineage/types.ts` | reviewed | - | Keep generation/editor typed metadata views plus generic stored lineage interface; domain schemas support old records. |
| `src/main.tsx` | reviewed | - | Root assertion matches index.html root; retain. |
| `src/references/clipboard.test.ts` | reviewed | - | Clipboard item and file fallback inputs differ; retain. |
| `src/references/clipboard.ts` | reviewed | - | Keep item/files fallback, nullable getAsFile and MIME validation at clipboard boundary. |
| `src/references/useReferenceImageCollection.ts` | reviewed | - | Keep File/preview distinction, hydration/serialization and blob URL cleanup/ref. One-array rewrite would move complexity into callers. |
| `src/services/StorageService.ts` | findings | ST-01 | Reviewed implementation and callers; accepted removal or shared-parser reuse is covered by the finding and batch checks. |
| `src/utils/file.test.ts` | reviewed | - | Retain decoded-content round-trip, malformed URL/base64 and whitespace/MIME parameter behavior checks. |
| `src/utils/file.ts` | reviewed | - | Keep data URL syntax/MIME parsing, embedded-whitespace support and malformed-base64 rejection at file boundary; conversion loops avoid large spread argument limits. |
| `src/utils/openai.test.ts` | reviewed | - | Retain native request body, edit/form ordering, streaming events and fallback, batch gating, provider errors and reasoning usage/output checks. |
| `src/utils/openai.ts` | findings | GEN-07 | Keep JSON-versus-SSE fallback, incremental UTF-8/event framing, preview exceptions protection, completion requirement and inherited actual-parameter/usage allocation logic. |
| `src/utils/openaiModels.test.ts` | reviewed | - | Retain retired versus active model compatibility and inherited/non-string key rejection at storage/model boundaries. |
| `src/utils/openaiModels.ts` | findings | GEN-01 | Keep active versus retired stored model vocabulary, own-key guard against prototype keys, capabilities/endpoints and reasoning preference migration. Removed parameters is only a dead mapping, not request settings. |
| `src/views/ArchiveView.tsx` | reviewed | - | Keep lazy ZIP import, isZipping finally recovery, hidden selected count and distinct empty/error/filter states. |
| `src/views/EditorView.tsx` | reviewed | - | All 713 lines read. Keep canvas/mask boundary guards, empty-mask check, active-view/modal keyboard gates, replay and draft/error states. Duplicate old mask URL revocation has different setter/effect timing; defer removal. Do not split solely by length. |
| `src/views/GenerateView.tsx` | reviewed | - | All 805 lines read. Keep run snapshot/draft distinction, success/failure results, unsaved confirmation, translation cost matching, capacity checks and heterogeneous model-control casts. Do not split solely by length. |
| `src/views/SettingsView.tsx` | reviewed | - | Keep unsaved provider/server draft separate from persisted props, URL validation, connection testing finally, notification readiness and native inputs. No confirmed behavior-preserving cleanup. |
| `tsconfig.app.json` | reviewed | - | Read source and references; no focused cleanup justified. |
| `tsconfig.json` | reviewed | - | Read source and references; no focused cleanup justified. |
| `tsconfig.node.json` | reviewed | - | Read source and references; no focused cleanup justified. |
| `tsconfig.tsbuildinfo` | findings | ROOT-01 | Deleted: obsolete root cache; current compiler cache remains under node_modules/.tmp. |
| `vite.config.ts` | reviewed | - | Read source and references; no focused cleanup justified. |

### Files added during this work

| Path | Status | Review |
| --- | --- | --- |
| `docs/app-deslop-plan.md` | reviewed | Approved scope and completion checklist. |
| `docs/app-deslop-audit.md` | reviewed | Findings, coverage and evidence checked against the file inventory and logs. |
| `scripts/verify-app-workflows.cjs` | reviewed | Repeatable editor, transfer, replay, settings, layout and navigation checks; synthetic data and blocked external requests. |
