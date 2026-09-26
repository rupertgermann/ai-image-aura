# Product polish validation

Validated on 26 September 2026 in the isolated `feat/product-polish` worktree and browser origin `http://localhost:5175`.

## Changes

- Simplified Generate and Settings: model selection beside the work, native selects, optional details collapsed, visible result actions, and fewer duplicate controls.
- Made navigation, dialogs, cards, sliders, focus, status messages, and narrow layouts usable with a keyboard and small screens.
- Kept generation and editing alive across navigation; guarded overlapping jobs and saves; preserved successful slots when a batch save partially fails.
- Matched archive navigation to its filters, exposed hidden selections, and added useful loading, empty, and retry states.
- Preserved layered adjustments through save and ZIP transfer. Flat saves bake adjustments; reopening a saved image no longer reapplies its old draft.
- Moved editor drafts to IndexedDB with safe migration from localStorage. A real 5,072,908-byte PNG layer exceeded localStorage's quota before this fix.
- Deferred the editor and ZIP exporter until needed; added no dependencies.

## Browser evidence

| Path | Verified outcome |
| --- | --- |
| Local Qwen single image and two-image batch | Completed, saved to archive, and remained after reload |
| Navigation during generation | Run continued; starting conflicting transfer was blocked with an explanation |
| Unsaved result confirmation | Cancel preserved the generated image |
| Filtered archive detail | Previous/next stayed within matching images and disabled at boundaries |
| Selection and delete dialog | Hidden selected count was explicit; cancel restored focus |
| Reference dialog | Keyboard navigation, Escape, focus containment, and return to the trigger worked |
| Editor | Layer upload, rename, visibility, adjustments, undo/redo, save, and save-as-copy worked |
| Layered save | Brightness/filter values persisted; reopening showed a clean saved state |
| Large draft | Hidden layer and brightness change survived opening another image and returning; save and reload preserved them without the quota error |
| Settings | Missing-provider path and invalid local URL feedback were clear |
| Responsive layout | Checked 320, 390, 800, and 1440 px; no horizontal page overflow; mobile canvas and result actions remained reachable |

## Automated checks and limits

Type checking, ESLint, all **373 tests across 40 files**, production build, and `git diff --check` passed. Focused additions cover partial batch-save recovery, layered adjustment persistence/ZIP transfer, and draft migration/storage failure.

Paid image/reasoning providers and paid Autopilot runs were not called live. Existing provider/Autopilot contract tests passed. Permanent deletion was inspected through confirmation and cancellation only. The in-app browser could not capture download events, so downloaded image/ZIP artifacts were not verified through that browser; ZIP serialization and import round trips passed in tests.
