# Plan: Creative Lineage Graph + Agentic Creative Autopilot

> Source PRDs: docs/creative-lineage-graph-prd.md, docs/agentic-creative-autopilot-prd.md

## Architectural decisions

Decisions that apply across all phases:

- **LineageStep model**: A dedicated `LineageStep` type, stored separately from `ArchiveImage`. Archive images are user-facing assets; lineage steps are immutable workflow records. The two are linked by a stable `archiveImageId` reference, not by embedding.
- **Lineage storage**: A new `lineageStore` module backed by the existing dual-storage pattern — a new SQLite table for lineage metadata (step id, parent id, step type, summary, archiveImageId, timestamp, metadata JSON) and no new blob storage (image blobs are already in IndexedDB keyed by `archiveImageId`).
- **Step types**: `generation` | `reference-generation` | `ai-edit` | `manual-edit` | `overwrite` | `save-as-copy` | `autopilot-iteration`. Human-readable labels and summaries are derived from step type + stored fields, not stored separately.
- **Provenance capture location**: Workflow-layer modules (`useGenerateController`, `useEditorController`) call a thin `captureProvenance()` coordinator after each save. UI handlers do not assemble lineage records directly.
- **Parent linking**: Each `LineageStep` carries an optional `parentStepId`. `save-as-copy` creates a branch by pointing to the source step. `overwrite` creates a new step pointing to the previous step for that image. Branching is represented by multiple children sharing the same parent — no separate branch table.
- **Archive export manifest**: A versioned `lineage-manifest.json` (field `"version": 1`) is added to the existing ZIP export alongside image blobs. Manifest structure is stable enough to serve as a contract for future import, restore, and migration tooling.
- **Autopilot modules**: `AutopilotSession`, `SatisfactionEvaluator`, and `PromptRefiner` are standalone modules with injected dependencies. They sit above the existing `imageWorkflow` boundary and do not modify it.
- **Autopilot lineage**: Each autopilot iteration is a `autopilot-iteration` lineage step. Its metadata JSON carries: `goalText`, `iterationNumber`, `evaluatorScore`, `evaluatorFeedback[]`. The first iteration's parent is the step that initiated the run (if any).
- **No server dependency**: All lineage, autopilot orchestration, and export remains fully local-first.

---

## Phase 1: Lineage storage foundation

**User stories (Lineage)**: 13, 14, 23, 24, 29, 30

### What to build

Introduce the `LineageStep` domain model and a `LineageStore` module with full CRUD: `save(step)`, `getById(id)`, `getByArchiveImageId(imageId)`, `getChildren(stepId)`, `remove(id)`. The store creates and owns a new `lineage_steps` SQLite table in the existing SQLocal database. It is wired into the storage initialisation path so the table exists before any workflow runs.

Graceful degradation is built in from the start: `getById` and `getChildren` return `null` / `[]` rather than throwing when a parent is missing. The store does not depend on any UI code.

### Acceptance criteria

- [ ] `lineage_steps` table is created on first storage init and persists across page refreshes
- [ ] `LineageStore.save()` writes a step and returns it with a stable `id`
- [ ] `LineageStore.getById()` returns `null` for unknown ids without throwing
- [ ] `LineageStore.getByArchiveImageId()` returns all steps associated with an image, ordered by timestamp
- [ ] `LineageStore.getChildren()` returns all steps whose `parentStepId` equals the given id
- [ ] `LineageStore.remove()` deletes a step without affecting sibling or child steps
- [ ] All operations tolerate a missing or empty table gracefully
- [ ] Module-level tests cover save, read, children lookup, and missing-parent scenarios using injected storage dependencies

---

## Phase 2: Provenance capture at the generate-and-save boundary

**User stories (Lineage)**: 1, 2, 21, 23

### What to build

Wire lineage capture into the `useGenerateController` save path. After `archiveStore.save()` succeeds, a `captureProvenance()` call writes a `generation` or `reference-generation` step that records the prompt, generation settings, reference relationships (by archiveImageId), and the id of the saved archive image.

Convert "Create Similar" into a lineage-aware fork: when the user opens a similar-generation flow from an archive image, the resulting save sets `parentStepId` to the source image's most recent lineage step.

This phase adds no UI. Lineage steps are written silently in the background. The only observable change is that lineage data is present in the store for Phase 4 to read.

### Acceptance criteria

- [ ] Saving a generated image writes a `generation` lineage step linked to the new archive image id
- [ ] A generation with reference images writes a `reference-generation` step that records reference ids in metadata
- [ ] Saving a "Create Similar" result writes a step whose `parentStepId` points to the source image's prior step
- [ ] A failed `archiveStore.save()` does not write a lineage step (provenance is not captured for failed saves)
- [ ] Workflow-level tests assert that generate-and-save produces the correct step type, fields, and parent link

---

## Phase 3: Provenance capture at editor boundaries

**User stories (Lineage)**: 3, 4, 5, 6, 23

### What to build

Wire lineage capture into `useEditorController` for all four save paths:

- **AI edit + save**: `ai-edit` step recording the edit prompt, the source image id, and the output image id
- **Manual edit + save-as-copy**: `save-as-copy` step with `parentStepId` pointing to the source image's prior step; creates a new branch
- **Manual edit + overwrite**: `overwrite` step on the same archive image id with `parentStepId` pointing to the previous step for that image
- **AI edit + overwrite**: `ai-edit` step marked as overwrite in metadata

Each step records the editor adjustments that were applied where available (from canvas state). Capture happens after a successful `archiveStore.save()`, mirroring Phase 2.

### Acceptance criteria

- [ ] An AI edit saved as a new copy produces an `ai-edit` lineage step with the edit prompt and correct parent
- [ ] A manual edit saved as a new copy produces a `save-as-copy` step branching from the source
- [ ] An overwrite save produces a new lineage step pointing to the previous step for that image, leaving the archive image id unchanged
- [ ] Each editor save path is covered by workflow-level tests asserting step type, parent link, and key metadata fields
- [ ] A failed save does not write a lineage step

---

## Phase 4: Lineage timeline UI in archive detail

**User stories (Lineage)**: 7, 8, 12, 18, 19, 25

### What to build

Add a read-only lineage timeline panel to the archive image detail modal. The panel lists the lineage steps associated with the selected image, in chronological order, each showing:

- Step type label (e.g. "Generated", "AI Edit", "Saved as Copy")
- Human-readable summary (prompt excerpt, edit description, or "Branched from …")
- Timestamp

If the image has a parent step, a "From: [parent image thumbnail or label]" indicator is shown. If the image has descendant steps, a count badge indicates "N version(s) from this image".

Missing parents or broken references render as a muted "Origin unknown" entry rather than an error state. This phase is read-only — no replay or fork actions yet.

### Acceptance criteria

- [ ] Archive detail modal shows a lineage panel for images that have lineage steps
- [ ] Each step entry displays its type label, summary, and timestamp
- [ ] A parent link indicator is shown when the image's earliest step has a `parentStepId`
- [ ] A descendant count badge is shown when other steps reference this image's steps as parent
- [ ] Missing or broken parent references render a graceful fallback, not an error
- [ ] Images with no lineage steps show a neutral "No history recorded" state
- [ ] The panel is readable and does not block or obscure the main image view

---

## Phase 5: Replay and fork actions

**User stories (Lineage)**: 9, 10, 11, 20, 27

### What to build

Add actionable controls to the lineage timeline panel:

- **Replay into Generate**: loads the step's prompt and generation settings back into the Generate draft, navigates to GenerateView. For `generation` and `reference-generation` steps.
- **Replay into Editor**: loads the step's source image into the Editor canvas, navigates to EditorView. For `ai-edit` and `save-as-copy` steps.
- **Fork from this step**: sets this step as the `parentStepId` for the next save action, regardless of which workflow the user proceeds in. The user is informed that their next save will branch from this point.

Add a side-by-side comparison control to the detail modal: selecting any step in the timeline highlights the delta between that step's image and the current image (via an overlay or split view using the stored image blobs).

### Acceptance criteria

- [ ] "Replay into Generate" populates the Generate draft with the correct prompt, settings, and reference ids, then navigates to GenerateView
- [ ] "Replay into Editor" loads the correct image into the Editor canvas and navigates to EditorView
- [ ] "Fork from this step" marks the chosen step as the pending parent for the next save, and that parent link is written correctly when the user saves
- [ ] Replay from a step with missing blobs shows a clear error message rather than loading a broken state
- [ ] Comparison view shows the selected step's image alongside the current image
- [ ] Workflow tests assert that replay correctly hydrates draft state and that fork correctly sets the parent link on the next save

---

## Phase 6: Archive export and import with lineage manifest

**User stories (Lineage)**: 15, 16, 17, 28

### What to build

Extend the existing ZIP export to include a `lineage-manifest.json` file at the archive root. The manifest is a versioned JSON document (`"version": 1`) containing an array of all lineage steps for the exported images, with all fields needed to reconstruct parent-child relationships and replay metadata.

Add an import/restore path that reads the manifest on ZIP import, validates that parent-child references are internally consistent, and writes the lineage steps to the local `lineageStore`. Broken references (steps whose parent is not in the manifest) are flagged in an import summary rather than silently dropped.

### Acceptance criteria

- [ ] Exported ZIP contains a `lineage-manifest.json` with `"version": 1` and a complete array of lineage steps for all exported images
- [ ] Manifest includes all step fields: id, parentStepId, archiveImageId, stepType, timestamp, and metadata
- [ ] A fresh import of an exported ZIP restores both images and their lineage steps, preserving all parent-child relationships
- [ ] An import with broken parent references reports the broken links in a validation summary rather than failing silently
- [ ] Export and import tests verify round-trip fidelity for generate, edit, overwrite, and save-as-copy step types

---

## Phase 7: `SatisfactionEvaluator` and `PromptRefiner` modules

**User stories (Autopilot)**: 3, 4, 5, 6, 32, 33

### What to build

Introduce two standalone, dependency-injected modules:

**`SatisfactionEvaluator`**: accepts an image data URL, a goal string, and an API key. Calls GPT-4o vision with a versioned, centrally-owned system prompt. Returns `{ score: number, feedback: string[] }`. Handles malformed or partial responses without throwing — returns a low score with a generic feedback entry on parse failure. The system prompt version is a named constant in the module.

**`PromptRefiner`**: accepts a goal string, a current prompt string, and a feedback array. Calls GPT-4o with a fixed system prompt designed to return a single improved generation prompt. Returns the refined prompt string. Propagates API errors to the caller. The system prompt is versioned and owned by the module.

Neither module has any UI dependency. Both accept an injected API client so they are fully testable with mocked responses.

### Acceptance criteria

- [ ] `SatisfactionEvaluator` returns a `{ score, feedback }` object for a valid GPT-4o response
- [ ] `SatisfactionEvaluator` returns a graceful low-score result (no throw) when the response is malformed or missing required fields
- [ ] `PromptRefiner` returns a non-empty string prompt given a goal and feedback
- [ ] `PromptRefiner` propagates API errors correctly to the caller
- [ ] Both modules have versioned system prompt constants that are reviewable as source-controlled strings
- [ ] Module-level tests cover happy path, malformed response, and API error scenarios using injected mock clients

---

## Phase 8: `AutopilotSession` orchestration and lineage integration

**User stories (Autopilot)**: 7, 12, 13, 15, 16, 28, 31, 34

### What to build

Introduce `AutopilotSession`, an orchestration module that owns the generate → evaluate → refine loop. It accepts: a goal string, an initial prompt, generation settings, an API key, injected `generate` / `evaluate` / `refine` implementations, a `lineageStore` reference, and progress callbacks.

The loop:
1. Call `generate()` with the current prompt and settings
2. Call `evaluate()` on the result image and goal
3. Record an `autopilot-iteration` lineage step with iteration number, score, feedback, and `parentStepId` pointing to the previous iteration's step
4. If score ≥ threshold → stop early
5. If iteration count ≥ maxIterations → stop
6. Call `refine()` with goal, current prompt, and feedback → new prompt
7. Repeat

Cancellation: a `cancel()` method stops the loop after the current iteration completes. Completed lineage nodes are always preserved. The session returns the iteration with the highest score as the final result, not necessarily the last one.

Generation errors or evaluation errors stop the run at the failed iteration. All prior lineage steps are retained. The error is surfaced via a progress callback.

Default config: maxIterations = 4, ceiling = 8, satisfactionThreshold = 90.

Wire `AutopilotSession` into `useGenerateController` as a new `runAutopilot()` action alongside the existing `generate()` action. The existing `generate()` action is unchanged.

### Acceptance criteria

- [ ] `AutopilotSession` runs the full generate → evaluate → refine loop for the configured number of iterations
- [ ] Early stopping halts the loop as soon as the satisfaction threshold is met, without proceeding to the next iteration
- [ ] The session returns the highest-scoring iteration result, not necessarily the final one
- [ ] Each completed iteration writes an `autopilot-iteration` lineage step with the correct `parentStepId` chain, iteration number, score, and feedback
- [ ] Cancellation stops the loop after the current iteration, preserves all completed lineage steps, and returns the best result to date
- [ ] A generation or evaluation failure stops the run, retains all prior lineage steps, and surfaces the error via callback without throwing unhandled exceptions
- [ ] `AutopilotSession` tests use injected mock generate/evaluate/refine implementations and assert on the callback sequence, termination condition, and returned result
- [ ] `useGenerateController.runAutopilot()` delegates to `AutopilotSession`; the existing `generate()` action is unmodified

---

## Phase 9: Autopilot UI in Generate view

**User stories (Autopilot)**: 1, 2, 8, 9, 10, 11, 14, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29

### What to build

Add a mode toggle to `GenerateView` with two options: **Single Shot** (existing behavior) and **Autopilot**. The selected mode is persisted in the existing local state store.

**Autopilot mode UI**:
- Goal field: multi-line free-text input for the creative intent statement. Goal text is persisted between sessions.
- Prompt field: auto-populated by a lightweight GPT-4o translation of the goal on demand, but fully editable by the user.
- Settings carry over from the existing generation settings panel (quality, aspect ratio, background, style, lighting, palette) — no re-configuration needed.
- Cost disclosure panel: shown before each run, stating configured max iterations and maximum API call count. User must confirm before the run begins.
- Max iterations control (default 4, ceiling 8) and satisfaction threshold control (default 90/100), both persisted in local state.

**Live iteration panel** (shown during a run):
- Current iteration number out of max
- Active evaluator feedback text
- Thumbnail strip of all intermediate images generated so far
- Pause/cancel button

**Post-run state**:
- Best-scored result is presented as the primary output
- Run that hit max iterations without converging shows an explicit notice
- Run that was cancelled shows the best result to date
- Save action works the same as Single Shot, archiving the selected result

**Error states**:
- Generation or evaluation failure shows a clear error message with the iteration number where the failure occurred
- Partial runs present whatever intermediate results were completed

### Acceptance criteria

- [ ] Mode toggle switches between Single Shot and Autopilot; selection persists across sessions
- [ ] Autopilot mode shows goal field, auto-populated prompt field, and settings controls
- [ ] Goal text persists between sessions
- [ ] Cost disclosure panel is shown before each run and requires explicit confirmation
- [ ] Live iteration panel updates with iteration number, feedback, and thumbnails as the run progresses
- [ ] Cancel button stops the run after the current iteration and presents the best result to date
- [ ] Post-run state presents the highest-scoring result with a clear label
- [ ] Runs that hit the iteration limit without converging display an explicit notice
- [ ] Generation or evaluation errors surface a clear per-iteration error message
- [ ] The existing Single Shot generate flow is completely unaffected

---

## Phase 10: Autopilot metadata in lineage export and archive detail

**User stories (Autopilot)**: 17, 18, 30

### What to build

Extend the lineage timeline panel in the archive detail modal to display autopilot-specific metadata for `autopilot-iteration` steps: goal text, iteration number, evaluator score, and evaluator feedback sentences. The panel makes it clear which steps belong to the same autopilot run (shared goal text and sequential iteration numbers).

Add a "Replay into Generate" action for autopilot iteration steps: hydrates the Generate draft with the iteration's prompt and generation settings, navigates to GenerateView, and allows the user to continue refining manually from that point.

Extend the `lineage-manifest.json` export schema to include autopilot metadata fields for `autopilot-iteration` steps. The manifest version remains `1` as this is additive; existing importers that do not know the autopilot fields can ignore them.

### Acceptance criteria

- [ ] Archive detail lineage timeline shows goal text, iteration number, score, and feedback for `autopilot-iteration` steps
- [ ] Steps belonging to the same autopilot run are visually grouped or labelled consistently
- [ ] "Replay into Generate" on an autopilot iteration step loads the correct prompt and settings into the Generate draft
- [ ] Exported `lineage-manifest.json` includes autopilot metadata fields for all `autopilot-iteration` steps
- [ ] Import of a manifest containing autopilot steps restores the full metadata without error
- [ ] Existing non-autopilot lineage behaviour is unaffected
