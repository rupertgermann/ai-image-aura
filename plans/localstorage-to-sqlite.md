# Plan: Migrate persistent localStorage session state to SQLite

> Source PRD: [Issue #16](https://github.com/rupertgermann/ai-image-aura/issues/16) — "PRD: Migrate persistent localStorage session state to SQLite"

## Architectural decisions

Durable decisions that apply across all phases. Do not re-litigate these in individual phases.

- **Storage split**
  - **SQLite owns** persistent session data: API key, generate draft, autopilot settings, lineage source.
  - **`localStorage` retains** transient UI state: `aura_current_view`, `aura_theme`, `archive_search`, `archive_detail_lineage_collapsed`, and per-image `editor_<imageId>_*` keys. Plus a single new migration-decision key: `aura_storage_migration_decision`.
  - **IndexedDB (`idb-keyval`) is untouched** for image blobs and the existing `generate_current_result` / `generate_transferred_references` blobs.

- **SQLite schema (all singleton tables, `CHECK(id = 1)`)**
  - `app_credentials(id INTEGER PRIMARY KEY CHECK(id=1), openai_api_key TEXT)`
  - `generate_draft(id INTEGER PRIMARY KEY CHECK(id=1), prompt TEXT, quality TEXT, aspect_ratio TEXT, background TEXT, style TEXT, lighting TEXT, palette TEXT, is_saved INTEGER)`
  - `autopilot_settings(id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT, goal TEXT, max_iterations INTEGER, satisfaction_threshold REAL)`
  - `generate_lineage_source(id INTEGER PRIMARY KEY CHECK(id=1), archive_image_id TEXT, step_id TEXT)`
  - All tables live in the existing `aura_database.sqlite3` OPFS database.

- **Key domain models**
  - `ApiKey` (string).
  - `GenerateDraft` (existing type, preserved).
  - `AutopilotSettings` (new type: `mode`, `goal`, `maxIterations`, `satisfactionThreshold`).
  - `GenerateLineageSource` (existing type, preserved).

- **Port pattern**
  - Each domain has its own typed SQLite port with `init() / load() / save() / clear()` semantics, following the established pattern of `SQLiteArchiveMetadataPort` and `SQLiteLineageMetadataPort`.
  - Ports are injected into consumers via a `deps` object so they can be replaced with in-memory doubles in tests.

- **Async/sync bridge: Bootstrap gate**
  - On app start, a `SessionHydrator` awaits `initializeAuraPersistence()` and loads all session ports in parallel into an in-memory snapshot.
  - The snapshot is exposed through a React `SessionContext`. Components read **synchronously** from context; writes fan out to the port **async** and update the snapshot optimistically.
  - A hydration loader is shown until the snapshot is ready.

- **Migration decision marker**
  - Single `localStorage` key: `aura_storage_migration_decision`.
  - Values: `'migrated' | 'declined' | null`.
  - Intentionally outside SQLite so the flag survives OPFS loss or reset.

- **Migration flow contract**
  - On startup, after hydration, if `getDecision() === null` AND `detect()` returns any migratable data, render `MigrationPrompt`.
  - **Migrate**: per-field atomic — successful writes remove their source `localStorage` key, failed writes leave their source key intact. Decision is set to `'migrated'` after the loop completes regardless of per-field success.
  - **Decline**: decision set to `'declined'`; `localStorage` data left intact (not deleted).
  - **Re-run migration** (in Settings) calls `resetDecision()` and re-renders the prompt immediately.

- **Cross-origin scope**
  - Per-origin only. Each origin has its own OPFS-backed SQLite and runs its own migration. No cross-origin bridging, no JSON export/import in this plan.

- **Security**
  - Moving the API key from `localStorage` to OPFS-backed SQLite is lateral (both origin-scoped plaintext). No encryption introduced.
  - `MigrationPrompt` must never render raw API key content; only presence/absence per category.

- **Dependencies**
  - No new runtime dependencies. Uses existing `sqlocal`.

- **Testing conventions (established in the codebase)**
  - Vitest with in-memory port doubles and `vi.fn()` for dependency-injected collaborators (see `saveGeneratedImage.test.ts`, `LineageStore.test.ts`).
  - Tests assert on public behavior of the module under test, not internal SQL or cache layout.

---

## Phase 1: Tracer bullet — API Key end-to-end

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 20, 21, 22, 23, 24, 25, 26, 27, plus partial 14, 17, 18.

### What to build

A complete end-to-end vertical slice for the API Key domain that also establishes all the shared infrastructure the remaining phases will plug into.

Behavior at the end of this phase:

- On app start the app briefly shows a hydration loader, then renders normally.
- If the current origin's `localStorage` contains an API key (either the current `aura_openapi_key` or the legacy `openai_api_key` fallback) and no migration decision has been recorded, a `MigrationPrompt` modal is shown. It lists the API key as "present" (without revealing the value) and offers **Migrate** and **Decline**.
- Choosing **Migrate** writes the API key into the `app_credentials` SQLite singleton, deletes the source `localStorage` key, and sets the decision to `'migrated'`.
- Choosing **Decline** sets the decision to `'declined'` and leaves the `localStorage` data intact.
- Settings exposes a "Re-run migration" action that clears the decision and re-renders the prompt immediately.
- After migration, the app reads and writes the API key exclusively through the SQLite-backed session context. Reloads find the API key in SQLite, not `localStorage`.
- Generate draft, autopilot settings, and lineage source continue to use `localStorage` unchanged.

The infrastructure delivered here (hydrator, provider, context, migrator skeleton, prompt modal, decision flag, loader) is designed to be extended domain-by-domain in subsequent phases.

### Acceptance criteria

- [ ] New SQLite table `app_credentials` created and initialized alongside existing archive and lineage tables.
- [ ] Typed SQLite port for the API key exists and round-trips a string value through save/load.
- [ ] `SessionHydrator` runs after `initializeAuraPersistence` and exposes a hydrated snapshot containing the API key.
- [ ] `SessionProvider` wraps the app; a hydration loader is shown until the snapshot is ready.
- [ ] Components read the API key synchronously via a dedicated React adapter hook; writes fan out to the port and update the snapshot optimistically.
- [ ] `useAppPreferences` no longer manages the API key directly (it defers to the new hook). `currentView` and `theme` remain on `useLocalStorage`.
- [ ] `LocalStorageMigrator` detects both `aura_openapi_key` and legacy `openai_api_key`. `detect()` returns a structured snapshot indicating presence/absence per category.
- [ ] Migrator's `migrate()` writes through the credentials port, removes successful source keys, and leaves failing ones intact.
- [ ] Migration decision marker is stored in `localStorage` under `aura_storage_migration_decision`.
- [ ] `MigrationPrompt` modal renders when decision is `null` and any migratable data is detected. It lists the API key by presence only, never by value.
- [ ] Settings contains a "Re-run migration" control that resets the decision and re-shows the prompt immediately.
- [ ] A long-time user with `openai_api_key` (legacy) set but no `aura_openapi_key` can migrate and ends up with the key stored in SQLite.
- [ ] After migration, a manual `localStorage` inspection shows both `aura_openapi_key` and `openai_api_key` removed; the `app_credentials` table has a single row with the key.
- [ ] Declining migration leaves both legacy and current `localStorage` keys untouched and suppresses the prompt until "Re-run migration" is clicked.
- [ ] No new runtime dependencies added to `package.json`.
- [ ] Tests (Vitest):
  - [ ] Credentials port — save/load round trip, overwrite, empty-table load, singleton `CHECK(id=1)` enforcement.
  - [ ] Migrator — detect with no data / legacy-only / current-only / both; migrate success; migrate with port failure leaves source key intact; decline preserves data and flips flag; `resetDecision()` restores prompt eligibility; idempotency of `migrate()` with nothing left to migrate.
  - [ ] Hydrator — hydrates empty state to defaults; hydrates populated state correctly; setters fan out to the port.
  - [ ] API key adapter hook — reflects provider state; setter updates snapshot optimistically and calls the port; port failure surfaces through the provider's error channel without corrupting the snapshot.

---

## Phase 2: Generate Draft domain

**User stories**: 10, 13, plus partial 14, 17, 18, 19.

### What to build

Extend the infrastructure established in Phase 1 to cover the generate draft domain.

Behavior at the end of this phase:

- The `MigrationPrompt` now lists a "Generate draft" row alongside the API key row, showing presence/absence.
- Users with `aura_generate_draft` set, or with any of the 8 legacy per-field keys (`aura_generate_prompt`, `aura_generate_quality`, `aura_generate_aspect_ratio`, `aura_generate_background`, `aura_generate_style`, `aura_generate_lighting`, `aura_generate_palette`, `aura_generate_is_saved`), can migrate their draft into SQLite. The legacy per-field keys are composed into a single `GenerateDraft` during detection.
- After migration, `GenerateSessionStore.readDraft()` and `writeDraft()` route through the generate-draft port (via the session context), and the corresponding `localStorage` keys are gone.
- `GenerateView` and the existing `saveGeneratedImage` code path continue to work without source-level changes to their public contracts — the refactor is internal to `GenerateSessionStore`.
- Drafts persist across page reloads via SQLite.

### Acceptance criteria

- [ ] New SQLite table `generate_draft` created and initialized.
- [ ] Typed SQLite port for the generate draft exists and round-trips a full `GenerateDraft` value.
- [ ] `SessionHydrator` now loads and exposes the generate draft in its snapshot.
- [ ] A dedicated React adapter hook for the generate draft reads from context synchronously and writes through the port.
- [ ] `GenerateSessionStore.readDraft/writeDraft` internally consume the draft port. The interface of `GenerateSessionStore` is unchanged for its consumers.
- [ ] `LocalStorageMigrator.detect()` recognizes `aura_generate_draft` AND the 8 legacy per-field keys (composing them into a single draft), and reports draft presence in its snapshot.
- [ ] `MigrationPrompt` lists a "Generate draft" row with presence/absence and is included in the migrate/decline flow.
- [ ] After migration, `aura_generate_draft` and all 8 legacy per-field keys are removed from `localStorage`; the `generate_draft` table contains a single row reflecting the migrated values.
- [ ] Existing tests in `saveGeneratedImage.test.ts` continue to pass unchanged.
- [ ] Tests (Vitest):
  - [ ] Generate draft port — round-trip, overwrite, empty-table load, singleton enforcement.
  - [ ] Migrator draft branches — detection of current-only, legacy-only, mixed, and none; legacy composition into a single draft; migrate success removes all relevant source keys; partial failure leaves only the failing key behind.
  - [ ] Generate draft adapter hook — reflects provider state; setter optimistic update + port call; error surfacing.

---

## Phase 3: Autopilot Settings domain

**User stories**: 11, plus partial 14, 17, 18.

### What to build

Extend the infrastructure to cover autopilot settings.

Behavior at the end of this phase:

- The `MigrationPrompt` now lists an "Autopilot settings" row alongside the existing rows.
- Users with any of `generate_mode`, `generate_autopilot_goal`, `generate_autopilot_max_iterations`, `generate_autopilot_threshold` set can migrate them into SQLite as a single `AutopilotSettings` row.
- After migration, the four `useLocalStorage` call sites in `GenerateView` are replaced by a single autopilot-settings adapter hook driven by the session context.
- Settings persist across reloads through SQLite.

### Acceptance criteria

- [ ] New SQLite table `autopilot_settings` created and initialized.
- [ ] Typed SQLite port for autopilot settings exists and round-trips a full `AutopilotSettings` value including defaults for unset fields.
- [ ] `SessionHydrator` loads and exposes autopilot settings in its snapshot.
- [ ] A dedicated React adapter hook exposes autopilot settings to `GenerateView`; the four existing `useLocalStorage` calls for mode / goal / max iterations / threshold are removed.
- [ ] `LocalStorageMigrator.detect()` recognizes all four autopilot keys and reports autopilot presence in its snapshot.
- [ ] `MigrationPrompt` includes an "Autopilot settings" row.
- [ ] After migration, the four autopilot `localStorage` keys are removed; `autopilot_settings` has a single row with the migrated values.
- [ ] Defaults from `DEFAULT_AUTOPILOT_MAX_ITERATIONS` and `DEFAULT_AUTOPILOT_SATISFACTION_THRESHOLD` are preserved for users who never set those keys.
- [ ] Tests (Vitest):
  - [ ] Autopilot port — round-trip, defaults, overwrite, singleton enforcement.
  - [ ] Migrator autopilot branches — detection of any subset of the four keys; migrate success; partial failure isolation.
  - [ ] Autopilot adapter hook — reflects provider state; setters update snapshot and call port.

---

## Phase 4: Lineage Source domain

**User stories**: 19 (closes), plus closes 14, 17, 18.

### What to build

Extend the infrastructure to cover the final migrated domain: the generate lineage source.

Behavior at the end of this phase:

- The `MigrationPrompt` now lists a "Lineage source" row alongside the others.
- Users with `generate_lineage_source` set can migrate it into SQLite.
- After migration, `GenerateSessionStore.{load,save,clear}LineageSource` route through the lineage-source port. The interface of `GenerateSessionStore` is unchanged for consumers like `saveGeneratedImage`.
- After this phase, zero migratable keys remain in `localStorage` — only the retained UI state keys (`aura_current_view`, `aura_theme`, `archive_search`, `archive_detail_lineage_collapsed`, `editor_<imageId>_*`) and the `aura_storage_migration_decision` flag remain.
- The migration feature as a whole is complete: all four domains are SQLite-backed, all covered user stories are satisfied.

### Acceptance criteria

- [ ] New SQLite table `generate_lineage_source` created and initialized.
- [ ] Typed SQLite port for the lineage source exists and round-trips a full `GenerateLineageSource`, distinguishing "row absent" from "row present with NULL fields."
- [ ] `SessionHydrator` loads and exposes the lineage source in its snapshot (may be `null`).
- [ ] A dedicated React adapter hook exposes lineage source state. `GenerateSessionStore.{load,save,clear}LineageSource` internally consume the port; the `GenerateSessionStore` interface is unchanged for consumers.
- [ ] `LocalStorageMigrator.detect()` recognizes `generate_lineage_source` and reports lineage source presence.
- [ ] `MigrationPrompt` includes a "Lineage source" row.
- [ ] After migration, `generate_lineage_source` is removed from `localStorage`; the corresponding SQLite row reflects the migrated value.
- [ ] Existing tests in `saveGeneratedImage.test.ts` and related lineage tests continue to pass unchanged.
- [ ] An end-to-end manual check confirms: in a fresh origin with no migratable data, no prompt appears; in an origin with all four migratable domains, a single prompt migrates all of them in one click; after migration, `localStorage` contains only the retained UI keys plus the decision flag.
- [ ] Tests (Vitest):
  - [ ] Lineage source port — round-trip (including `null` handling), overwrite, clear, singleton enforcement.
  - [ ] Migrator lineage branches — detection, migrate success, partial failure isolation, and the combined all-four-domains migration path.
  - [ ] Lineage source adapter hook — reflects provider state; setters update snapshot and call port; `clear` semantics surface correctly.
