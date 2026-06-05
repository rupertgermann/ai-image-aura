# Plan: Layered Editor

> Source conversation: grill-with-docs session on adding Photoshop-style image layers to the Editor.
> Domain language: [CONTEXT.md](../CONTEXT.md)
> Decisions: [ADR 0001](../docs/adr/0001-store-layer-stacks-as-archive-assets.md), [ADR 0002](../docs/adr/0002-use-konva-for-layered-editor-canvas.md), [ADR 0003](../docs/adr/0003-use-snapshot-history-for-editor-undo-redo.md), [ADR 0004](../docs/adr/0004-duplicate-layer-assets-on-save-as-copy.md), [ADR 0005](../docs/adr/0005-target-ai-transforms-to-layer-selection.md), [ADR 0006](../docs/adr/0006-preserve-adjustments-only-for-layered-images.md)

## Architectural decisions

Durable decisions that apply across all phases. Do not re-litigate these in individual implementation slices.

- **Layer model**: v1 supports raster image layers only. Text layers, vector shapes, masks, erasing, clipping, blend modes, adjustment layers, skew, warp, perspective, and per-layer color adjustments are out of scope.
- **Base layer**: opening an archive image creates a locked base layer that defines the Editor composition bounds. Existing non-layered images open as a single-base-layer composition without mutating archive data.
- **Layered image**: a saved archive image becomes layered only after the user saves a composition with more than the base layer or non-default layer stack state. Opening an image alone must not create durable layer data.
- **Flattened preview**: every archive image still has a flattened image URL for browsing, lineage previews, sharing, export, and compatibility.
- **Durable layer data**: layered images store layer stack metadata with the archive image record and store each layer bitmap as a separate archive asset through the existing blob-store pattern.
- **Copy semantics**: `Save as Copy` duplicates layer bitmap assets for the new archive image instead of sharing them with the source image.
- **Composition adjustments**: brightness, contrast, saturation, and filter remain whole-composition adjustments. They are editable durable data only for layered images; simple single-base-layer saves continue to bake them into the flattened image.
- **Canvas engine**: the layered Editor uses Konva via React bindings. The outer Editor boundary remains stable: it receives an `ArchiveImage` and emits a flattened data URL plus save context.
- **Canvas sizing**: the Editor composition has real pixel bounds from the base layer. The on-screen stage may scale to fit the UI, but save/export/AI transforms render at real pixel dimensions.
- **Layer operations**: v1 supports select, multi-select for shared actions, primary-layer transform handles, add uploaded layer, duplicate, delete, rename, visibility, opacity, move up/down, reorder, and direct move/uniform-scale/rotate for one primary non-base layer.
- **Layer panel**: Layers live at the top of the right sidebar above Adjustments, AI Transform, references, and save actions. Narrow screens may stack the sidebar below the canvas.
- **Editor draft**: unsaved layer stack state persists per archive image across navigation or reload, but remains distinct from durable archive data until save.
- **Dirty draft**: layer stack or adjustment changes create a dirty draft. Reset behavior is split into "Reset Adjustments" and "Revert Draft".
- **Edit history**: undo/redo is required for v1 and uses a bounded in-memory stack of serializable draft snapshots. The current draft may persist across reloads, but undo/redo history does not.
- **AI transform targeting**: if layers are selected, AI transforms target the layer selection. If no layer is selected, AI transforms target the full visible composition for compatibility.
- **AI context**: selected layer targets are flattened into a bounded target image. The full visible composition is sent as contextual reference, followed by user-supplied reference images.
- **AI result layer**: AI output becomes a new non-destructive raster image layer placed directly above the topmost targeted layer. Non-base target layers are hidden by default; the base layer remains visible if targeted.
- **Lineage boundary**: lineage keeps existing step types and records compact layer-aware metadata. It does not store the full layer stack.
- **Archive transfer**: ZIP export/import must round-trip flattened preview images, reference images, lineage, layer stack metadata, and per-layer image assets.

---

## Phase 1: Layer stack domain model

### What to build

Introduce serializable layer stack types and pure operations with no React, Konva, storage, or OpenAI dependencies.

Suggested domain shape:

- `LayerStack`
  - `version`
  - `compositionWidth`
  - `compositionHeight`
  - `adjustments`
  - `layers` ordered bottom-to-top
- `ImageLayer`
  - `id`
  - `kind`: `base` | `uploaded` | `ai-result`
  - `name`
  - `assetKey` or equivalent asset reference
  - `visible`
  - `opacity`
  - `locked`
  - intrinsic `width` / `height`
  - `transform`: `x`, `y`, uniform `scale`, `rotation`
  - optional AI metadata for AI result layers
- `LayerSelection`
  - selected layer ids
  - primary selected layer id

Core operations:

- Create a base-only stack from an `ArchiveImage`
- Add uploaded layer centered and scaled to fit
- Add AI result layer at target bounds
- Duplicate non-base layers
- Delete selected non-base layers
- Rename layer
- Toggle visibility
- Set opacity
- Move layer up/down
- Select, multi-select, clear selection, set primary selection
- Apply move/uniform-scale/rotate transform to the primary selected non-base layer
- Compute layer bounds and combined selection bounds
- Compute whether a stack is durable layered state
- Summarize stack for lineage metadata

### Acceptance criteria

- [ ] Existing archive images can be represented as a base-only layer stack without changing archive records.
- [ ] Base layer is locked, always defines composition bounds, and cannot be deleted or transformed.
- [ ] Uploaded layers are centered, scaled to fit within composition bounds, visible, selected, and 100% opacity by default.
- [ ] AI result layers can be inserted directly above the topmost targeted layer.
- [ ] Non-base target layers can be hidden after AI result insertion while the base layer remains visible if targeted.
- [ ] Layer ordering is deterministic and bottom-to-top.
- [ ] Selection supports multiple layers and a primary selected layer.
- [ ] Transform operations apply only to the primary selected non-base layer.
- [ ] Layer summaries include `isLayered`, `layerCount`, visible layer count, and AI result layer identity where relevant.
- [ ] Tests cover every pure operation, including base-layer guardrails and multi-selection edge cases.

---

## Phase 2: Snapshot edit history

### What to build

Create an `EditorHistory` module that records bounded snapshots of serializable Editor draft state. A snapshot should include layer stack state, layer selection, composition adjustments, AI prompt state where appropriate, and reference-image state if reference add/remove is undoable.

The history module should be independent from React and storage.

Rules:

- Push one snapshot per user-level action.
- Coalesce noisy pointer updates into a single transform action when a drag/scale/rotate gesture completes.
- Cap history length, for example 50 snapshots.
- Undo restores the previous draft snapshot.
- Redo restores the next draft snapshot.
- Saving does not need to preserve undo/redo history.
- Reloading restores the current draft snapshot only, not history.

### Acceptance criteria

- [ ] Undo/redo covers add/delete/duplicate/reorder/rename layer operations.
- [ ] Undo/redo covers visibility, opacity, transform, and composition adjustments.
- [ ] Undo/redo covers AI result layer creation as one action.
- [ ] Undo/redo covers uploaded layer creation as one action.
- [ ] Undo/redo covers reference-image add/remove if those controls remain part of the Editor draft.
- [ ] Pointer-drag transform changes do not flood the history stack with every mousemove.
- [ ] History is capped and drops the oldest snapshots when the cap is exceeded.
- [ ] Tests cover undo, redo, redo invalidation after a new action, cap behavior, and gesture coalescing.

---

## Phase 3: Archive persistence for layered images

### What to build

Extend archive storage so `ArchiveImage` can optionally carry durable layer stack metadata and reference layer bitmap assets.

Suggested implementation direction:

- Add serializable layer stack metadata to the archive image record, likely as a JSON column in `images`.
- Store layer bitmaps in the same blob store used for flattened images and reference images.
- Use deterministic layer asset keys scoped to archive image id and layer id.
- Hydrate layered archive images by loading the flattened image, references, layer metadata, and layer bitmap data or data URLs.
- Save layered images by writing the flattened preview first, then layer assets, then metadata.
- On overwrite, remove layer assets that are no longer referenced by the saved stack.
- On remove/delete image, remove flattened image, references, and all layer assets.
- On save-as-copy, duplicate all layer assets for the new image id.
- Preserve old non-layered archive records and fallback cleanly when layer metadata is missing.

### Acceptance criteria

- [ ] Non-layered images list, open, save, overwrite, delete, export, and import exactly as before.
- [ ] Layered archive records hydrate with their editable layer stack.
- [ ] Layer bitmaps are stored outside SQLite metadata.
- [ ] Save-as-copy creates a new archive image with its own layer assets.
- [ ] Overwrite updates the flattened preview and durable layer stack for the same archive image id.
- [ ] Removing a layered image removes its flattened image, references, and layer assets.
- [ ] Failed saves restore prior metadata and blob state where practical, following the existing archive-store rollback pattern.
- [ ] Tests cover save, overwrite, save-as-copy, stale asset cleanup, delete cleanup, and non-layered backwards compatibility.

---

## Phase 4: Archive ZIP export/import

### What to build

Extend `ArchiveTransfer` so layered images round-trip through ZIP export/import.

Suggested manifest changes:

- Increment or extend the archive manifest version in a backwards-compatible way.
- Add optional layer stack metadata to each manifest image entry.
- Add per-layer image files to the ZIP.
- Keep the flattened preview image as the existing `imageFileName`.
- Continue exporting references and `lineage-manifest.json`.
- On import, validate layer manifest entries and report missing layer assets in `missingAssetFiles`.
- Import old ZIP files without layer metadata.

### Acceptance criteria

- [ ] Exported ZIP for layered images includes flattened preview, layer assets, references, and lineage manifest.
- [ ] Archive manifest records enough layer metadata to restore order, identity, names, visibility, opacity, transforms, kinds, and asset file names.
- [ ] Import restores layered images with stable layer ids.
- [ ] Import reports missing layer files without silently dropping the whole archive.
- [ ] Old version-1 archive ZIPs without layers still import.
- [ ] Tests verify layered image ZIP round-trip and broken layer asset reporting.

---

## Phase 5: Konva canvas renderer and export

### What to build

Replace the current one-image canvas drawing hook with a Konva-backed layered renderer while preserving the Editor's outer contract.

Tasks:

- Add `konva` and `react-konva` dependencies.
- Build a `LayeredEditorCanvas` component that renders the layer stack.
- Scale the Konva stage to fit the available UI while preserving real composition coordinates.
- Render visible layers in stack order with opacity and transforms.
- Support click selection by topmost visible layer under the pointer.
- Support layer panel selection as the reliable fallback.
- Render transform handles for the primary selected non-base layer.
- Support dragging, uniform scaling, and rotation.
- Export flattened visible composition at real pixel dimensions.
- Export selected-layer target bounds at real pixel dimensions.
- Export full visible composition as contextual reference for targeted AI transforms.
- Exclude hidden layers from all flattened outputs.
- Apply composition adjustments to flattened outputs as shown in the Editor.

### Acceptance criteria

- [ ] Stage display scale never changes real export resolution.
- [ ] Clicking the canvas selects the topmost visible non-base layer under the pointer.
- [ ] The base layer can be selected from the layer panel but is not transformable.
- [ ] Transform handles only appear for the primary selected non-base layer.
- [ ] Move, uniform scale, and rotation update layer transform state.
- [ ] Hidden layers remain editable in the stack but are excluded from preview/export/AI outputs.
- [ ] Flatten export matches visible stage output at real pixel dimensions.
- [ ] Tests cover export and pure geometry where possible; visual/manual QA verifies selection and transform behavior.

---

## Phase 6: Editor draft persistence and dirty-state UX

### What to build

Replace the current editor session internals with an Editor draft model that can persist unsaved layered work per archive image while keeping outer app navigation stable.

Tasks:

- Load durable layer stack if the archive image is layered.
- Otherwise initialize a base-only stack from the archive image.
- Restore unsaved draft state keyed by archive image id when available.
- Persist current draft state across navigation/reload.
- Keep undo/redo history in memory only.
- Mark draft dirty when layer stack or composition adjustments differ from last saved state.
- Warn before discarding a dirty draft when opening another image, reverting, resetting the draft, or leaving the Editor.
- Split existing reset behavior into `Reset Adjustments` and `Revert Draft`.
- Add keyboard shortcuts:
  - `Cmd/Ctrl+Z`
  - `Cmd/Ctrl+Shift+Z`
  - `Cmd/Ctrl+Y`
  - `Delete` / `Backspace`
  - `Cmd/Ctrl+D`
  - `Cmd/Ctrl+S`
  - `Escape`

### Acceptance criteria

- [ ] Unsaved layered drafts survive route changes and page reload.
- [ ] Undo/redo works during the active Editor session and resets after reload.
- [ ] Opening an existing non-layered image does not mutate archive data.
- [ ] Dirty-draft warnings appear before destructive draft loss.
- [ ] `Reset Adjustments` affects only brightness/contrast/saturation/filter.
- [ ] `Revert Draft` restores the last saved archive state after confirmation when dirty.
- [ ] Keyboard shortcuts work without stealing input from text fields.
- [ ] Tests cover draft dirty checks, persisted draft restore, revert behavior, and shortcut handlers where practical.

---

## Phase 7: Layer panel and Editor controls

### What to build

Add a compact layer panel to the top of the Editor sidebar and separate visible layer uploads from AI reference uploads.

Layer panel controls:

- Add image layer from upload
- Layer list in top-to-bottom visual order
- Selected and multi-selected state
- Visibility toggle
- Layer name
- Opacity control
- Duplicate
- Delete
- Move up/down

Editor sidebar order:

1. Layers
2. Adjustments
3. AI Transform
4. Visual Context / references
5. Save actions

Rules:

- Uploaded image layers appear in the visible composition.
- Reference images remain AI guidance only and do not appear on the canvas.
- Base layer appears in the panel and can be selected, but cannot be deleted or transformed.
- Up/down buttons are required; drag-to-reorder can be deferred unless cheap.
- Narrow screens can stack the sidebar below the canvas.

### Acceptance criteria

- [ ] Users can add uploaded image layers through a control distinct from reference-image upload.
- [ ] Users can distinguish visible image layers from AI reference images in the UI.
- [ ] Layer list shows stable order, name, visibility, selected state, and base-layer locked state.
- [ ] Users can rename, duplicate, delete, move, hide/show, and adjust opacity for non-base layers.
- [ ] Users can select multiple layers for shared actions.
- [ ] Layer panel works with keyboard shortcuts.
- [ ] Layout remains usable on desktop and mobile widths.

---

## Phase 8: Targeted AI transforms

### What to build

Update `useEditorController` and `imageWorkflow.edit` integration so AI transforms target layer selection.

Rules:

- If no layers are selected, flatten the visible composition and run AI transform as today's whole-canvas flow.
- If one or more layers are selected, flatten the selected visible layers into a target image.
- Use the selected layers' combined bounding box, expanded by a small transparent padding, rendered at real pixel scale.
- Send the target image as the first edit image.
- Send the full visible composition as contextual reference after the target image.
- Append user-supplied reference images after the composition context.
- Insert the AI result as a new raster image layer directly above the topmost targeted layer.
- Position the AI result layer over the target bounds.
- Hide non-base target layers by default.
- Keep the base layer visible if it was targeted.
- Make AI result layer creation one undoable action.

### Acceptance criteria

- [ ] Whole-composition AI transform still works when no layer is selected.
- [ ] Selected-layer AI transform sends only selected layer content as editable target.
- [ ] Full visible composition is included as context for selected-layer AI transforms.
- [ ] User reference images still participate in AI transforms after the composition context.
- [ ] AI result layer is inserted at the correct stack position and selected.
- [ ] Non-base target layers are hidden by default after AI result insertion.
- [ ] Base layer remains visible when targeted.
- [ ] Undo removes the AI result layer and restores prior target-layer visibility.
- [ ] Lineage metadata records target mode, target layer count, and AI result layer id/name without storing the full stack.
- [ ] Tests cover request construction, target bounds, result layer insertion, visibility changes, and undo behavior.

---

## Phase 9: Save flows and lineage metadata

### What to build

Extend editor save context and `saveEditedImage` so all save flows understand layered images while preserving existing step types.

Save behavior:

- `Save Changes` writes a flattened preview and durable layer stack for the current image when layered.
- `Save as Copy` creates a new archive image with flattened preview and duplicated layer stack assets.
- Simple single-base-layer saves without durable layer state behave like today and bake composition adjustments into the flattened image.
- Layered saves preserve composition adjustments as editable data.

Lineage behavior:

- Keep existing step types: `ai-edit`, `overwrite`, `save-as-copy`.
- Add compact layer metadata:
  - `isLayered`
  - `layerCount`
  - `visibleLayerCount`
  - `targetMode`: `composition` | `layer-selection`
  - `targetLayerCount`
  - `aiResultLayerId`
  - `aiResultLayerName`
- Do not store full layer stack in lineage.

### Acceptance criteria

- [ ] Existing editor save tests still pass for non-layered flows.
- [ ] Layered `Save Changes` preserves layer stack and writes flattened preview.
- [ ] Layered `Save as Copy` branches lineage and duplicates layer assets.
- [ ] AI edits use `ai-edit` lineage steps with layer-aware metadata.
- [ ] Manual layered saves use existing overwrite/save-as-copy step types.
- [ ] Lineage timeline summaries can display useful layer-aware labels without reading full layer stacks.
- [ ] Tests extend `saveEditedImage.test.ts` for layered overwrite, layered copy, AI result layer metadata, and non-layered compatibility.

---

## Phase 10: QA, polish, and migration safety

### What to build

Finish with regression passes across editor, archive, lineage, export/import, and AI transform workflows.

Manual QA scenarios:

- Open old non-layered image, adjust brightness, save changes, verify it remains simple.
- Open old non-layered image, add uploaded layer, save, reopen, verify layers restore.
- Save layered image as copy, delete original, verify copy still opens with layers.
- Export/import layered archive, verify layer stack and lineage restore.
- Target one uploaded layer with AI, verify result placement and hidden source layer.
- Target base layer with AI, verify base remains visible.
- Run undo/redo across upload, transform, opacity, AI result, delete, and adjustment changes.
- Refresh with unsaved draft, verify draft restores and undo history resets.
- Revert dirty draft, verify last saved archive state restores.

### Acceptance criteria

- [ ] `npm run test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] No existing archive image is migrated or mutated merely by opening the Editor.
- [ ] Non-layered archive export/import remains compatible.
- [ ] Layered archive export/import preserves flattened preview, layer assets, references, and lineage.
- [ ] Editor remains usable at desktop and narrow mobile widths.
- [ ] Browser/manual QA screenshots confirm canvas framing, layer panel usability, and transform handles.

---

## Out of scope for v1

- Text layers
- Vector shapes
- Masks
- Erasing
- Cropping
- Clipping groups
- Blend modes
- Adjustment layers
- Per-layer brightness/contrast/saturation/filter
- Multi-layer transform bounding boxes
- Drag-to-reorder if up/down controls are sufficient
- Persisting undo/redo history across reloads
- Shared layer assets between archive images
- Fully interactive visual node graph editing
