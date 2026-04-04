# QA Plan: Creative Lineage + Agentic Creative Autopilot

## Scope

This checklist covers the shipped work from:

- Creative Lineage Graph
- Archive import/export with lineage manifests
- Agentic Creative Autopilot

## Preconditions

- App loads locally with a valid OpenAI API key configured in `Settings`
- Browser storage is available
- At least one successful generation can be completed

## 1. Single Shot Regression

- Open `Generate` in `Single Shot` mode
- Generate an image with a normal prompt
- Save it to the archive
- Confirm the preview, save, download, and clear actions still work
- Open the saved image in archive detail
- Confirm metadata still renders correctly and no Autopilot-only UI leaks into the normal flow
- Use `Replay into Generate` from a normal generation step and confirm prompt/settings are restored

## 2. Core Lineage Flows

- From an archived image, use `Create Similar`
- Generate and save the new result
- Confirm the saved result has a lineage parent pointing back to the source branch
- Open an archived image in `Editor`
- Save one edit as `overwrite`
- Save another edit as `save as copy`
- Confirm archive detail shows:
  - timeline entries in order
  - parent indicator
  - descendant badge
  - replay actions
  - fork action
  - side-by-side comparison when selecting a prior step

## 3. Replay and Fork Behavior

- In archive detail, replay a generation step into `Generate`
- Confirm prompt and generation settings are hydrated correctly
- Replay an editor-compatible step into `Editor`
- Confirm the correct image opens in the editor
- Use `Fork from this step`
- Save a subsequent generation or edit
- Confirm the new lineage step uses the forked step as its parent

## 4. ZIP Export and Import Round Trip

- Select multiple related images in the archive
- Export them as ZIP
- Confirm the archive contains:
  - image files
  - `archive-manifest.json`
  - `lineage-manifest.json`
- Import or restore the exported ZIP
- Confirm images are restored locally
- Confirm lineage timeline and parent-child relationships are preserved
- Confirm replay/fork still works on restored items

## 5. Autopilot Happy Path

- Switch `Generate` to `Autopilot`
- Enter a goal in plain language
- Use `Translate to Prompt`
- Confirm the prompt field is populated and still editable
- Set max iterations and satisfaction threshold
- Start a run and confirm cost disclosure appears before execution
- Confirm the live panel shows:
  - iteration progress
  - evaluator feedback
  - intermediate thumbnails
- Let the run complete successfully
- Confirm the best-scoring result is shown as the primary output
- Save the result to archive

## 6. Autopilot Cancellation and Failure Handling

- Start an Autopilot run
- Click `Pause / Cancel` during the run
- Confirm the run stops after the current iteration completes
- Confirm the best result so far remains visible
- Confirm completed intermediate iterations are still represented in lineage after save
- If feasible, trigger an API failure during Autopilot
- Confirm the UI shows a clear error and indicates which iteration failed
- Confirm any completed iterations remain available as partial results

## 7. Autopilot Lineage in Archive Detail

- Open an archived image produced from Autopilot
- Confirm the lineage timeline shows autopilot-specific metadata:
  - goal text
  - iteration number
  - evaluator score
  - evaluator feedback
- Confirm steps from the same run are visually grouped or labelled consistently
- Select an autopilot step and confirm comparison preview works

## 8. Autopilot Replay

- From archive detail, click `Replay into Generate` on an `autopilot-iteration` step
- Confirm `Generate` opens with the iteration prompt and settings restored
- Confirm the user can continue manually from that point
- Save a new result and confirm it branches correctly from the replayed lineage step

## 9. Persistence Checks

- Refresh the app after using both Single Shot and Autopilot modes
- Confirm persisted values survive refresh:
  - selected generate mode
  - goal text
  - max iterations
  - satisfaction threshold
  - latest saved archive state
  - lineage history

## Exit Criteria

- No regressions in normal Single Shot generation or editor save flows
- Lineage timeline, replay, fork, and comparison work across normal and autopilot-generated assets
- ZIP export/import preserves both archive images and lineage metadata
- Autopilot runs, cancels, saves, and replays successfully
- Archive detail correctly renders autopilot metadata without breaking non-autopilot history
