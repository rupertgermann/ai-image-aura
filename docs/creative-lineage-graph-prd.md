# PRD: Creative Lineage Graph

## Problem Statement

AURA AI is already strong at local-first generation, archive management, and lightweight editing, but it currently preserves images more reliably than it preserves creative process.

From a user perspective, this creates a real gap:

- a great result can be saved, but the sequence of decisions that produced it is not preserved as a first-class artifact
- edits, save-as-copy actions, and "create similar" flows feel related in the UI but are not represented as a durable branching history
- users can revisit an image, but they cannot reliably answer "what exact recipe made this?", "what did I change from the parent?", or "which version should I branch from next?"
- archive export preserves image files, but not enough workflow context to make the archive portable as a reusable creative project

This limits the product in four ways:

- it weakens reproducibility because successful outputs are difficult to recreate exactly
- it weakens iteration because branching and comparison are implicit rather than explicit
- it weakens learning because users cannot inspect the chain of prompts, references, and edits behind a strong result
- it weakens long-term retention because the archive behaves more like a flat gallery than a creative memory system

For a local-first image studio, this is a strategic gap. The next major leap is not only making images easier to create, but making the full evolution of an image durable, explorable, and reusable over time.

## Solution

Introduce a local-first Creative Lineage Graph that records the provenance of every meaningful creation step in AURA AI.

Each generated or edited image should belong to a branching history that captures:

- how it was created
- what inputs were used
- which image or workflow step it came from
- what changed at each stage
- how the user can replay, fork, compare, or export that creative path later

From the user perspective, this feature should make AURA feel like a creative operating system rather than a simple image gallery.

The user should be able to:

- see the parent-child history of an image
- inspect the recipe used at each step, including prompts, settings, references, and editor adjustments when available
- replay a prior step back into the Generate or Editor workflows
- fork from any prior point to explore a new branch without losing the old one
- distinguish between overwriting an existing image and creating a new branch as copy
- export an archive package that preserves not only image assets but also the workflow history that connects them

The implementation should preserve AURA's current product principles:

- local-first by default
- no custom backend dependency
- durable storage in browser-local persistence layers
- small, understandable workflow boundaries between generation, editing, archive, and export

The first version should prioritize durable provenance capture and useful recovery actions over a highly visual node-graph interface.

## User Stories

1. As a creator, I want every generated image to remember the exact prompt and generation settings that produced it, so that I can reproduce successful results later.
2. As a creator, I want reference-guided generations to preserve which references were used, so that I can understand the visual inputs behind the result.
3. As a creator, I want AI edits to record the source image and edit prompt, so that I can trace how an image changed over time.
4. As a creator, I want manual editor adjustments to be captured as part of lineage, so that I can see which non-AI edits were applied.
5. As a creator, I want save-as-copy actions to create explicit branches, so that I can explore variations without losing the original path.
6. As a creator, I want overwrite saves to preserve historical provenance internally, so that I can update an image without erasing how I got there.
7. As a creator, I want to open an image and see its parent step, so that I can understand where it came from.
8. As a creator, I want to see whether an image has descendants, so that I can understand which version became the foundation for later work.
9. As a creator, I want to replay an earlier generation recipe into the Generate workflow, so that I can iterate from a proven starting point.
10. As a creator, I want to replay an earlier edit context into the Editor workflow, so that I can continue refining from a known step.
11. As a creator, I want to fork from an older step in the lineage, so that I can try a new direction without disturbing the current branch.
12. As a creator, I want the archive detail view to explain how an image was made, so that each saved image feels like a recoverable project, not only a final file.
13. As a creator, I want lineage information to survive page refreshes and browser restarts, so that my history is durable.
14. As a creator, I want lineage data to remain local to my device, so that my creative process stays private.
15. As a creator, I want archive exports to preserve lineage metadata as well as image payloads, so that I can restore or transfer a complete project later.
16. As a creator, I want imports or restores to validate lineage references, so that broken parent-child relationships are detected instead of silently lost.
17. As a creator, I want the app to handle missing parents or missing image blobs gracefully, so that partial local corruption does not make the entire archive unusable.
18. As a creator, I want to distinguish clearly between generation steps, AI edit steps, and manual edit steps, so that the history is understandable at a glance.
19. As a creator, I want each lineage step to include a human-readable summary, so that I can scan my history quickly.
20. As a creator, I want to compare an image against its parent step, so that I can understand what changed.
21. As a creator, I want "Create Similar" to behave like a first-class lineage action, so that it becomes part of a coherent creative system instead of a one-off convenience.
22. As a creator, I want copied images to retain enough lineage context to remain discoverable and explorable later, so that branch history does not disappear after saving.
23. As a creator, I want lineage capture to happen automatically, so that I do not need to remember to document my process manually.
24. As a creator, I want lineage storage to remain fast and reliable for typical local usage, so that the feature does not make everyday generation and editing feel slower or more fragile.
25. As a creator, I want the first version of lineage browsing to be simple and readable, so that I get immediate value without needing to learn a complex graph tool.
26. As a power user, I want the archive to become more valuable over time as my process history accumulates, so that the product compounds in usefulness with continued use.
27. As a power user, I want to identify the strongest branch in a chain of experiments, so that I can continue from the best step rather than guessing.
28. As a power user, I want exported lineage metadata to be structured and stable, so that future restore, analysis, and migration features can build on it.
29. As a maintainer, I want provenance capture to happen at clear workflow boundaries, so that the feature remains testable and understandable.
30. As a maintainer, I want lineage storage to be modeled separately from user-facing archive images, so that the product can evolve provenance without destabilizing basic image storage.

## Implementation Decisions

- Introduce a dedicated lineage domain model separate from the existing archive image shape.
- Treat archive images as user-facing assets and lineage steps as immutable workflow records that describe how assets were produced.
- Represent lineage as a parent-linked graph that supports branching rather than as a flat event log.
- Capture provenance at every creation boundary: prompt generation, reference-based generation, AI edit, manual edit save, overwrite save, and save-as-copy.
- Give each lineage step its own durable identifier and persist explicit relationships between the step, its parent step when present, and the output asset it produced.
- Persist the data needed to replay meaningful prior work, including prompts, generation settings, reference relationships, edit metadata, and manual editor adjustments when available.
- Preserve the distinction between the current visible archive image and the underlying historical sequence that produced it.
- Model save-as-copy as branch creation rather than as an unrelated new asset.
- Model overwrite saves as a new historical step even when the user-facing archive entry remains the same current artifact.
- Convert the current "Create Similar" behavior into a lineage-aware replay or fork action backed by persisted provenance.
- Add a lineage-oriented view to image inspection so users can see where an image came from, what changed, and what actions are available next.
- Favor a simple timeline or step list for the first user interface rather than a fully interactive graph canvas.
- Include human-readable labels for step type and summary so the history is understandable without exposing raw storage details.
- Extend archive portability to package workflow metadata alongside binary image payloads.
- Design exported lineage metadata as a versioned manifest so future archive import, migration, and integrity tooling can build on a stable contract.
- Keep the feature fully local-first and avoid introducing any server dependency for lineage persistence or replay.
- Prefer a small number of deep modules with narrow interfaces over scattering provenance logic across view components.
- Centralize provenance capture in workflow-layer modules rather than relying on individual UI handlers to assemble records ad hoc.
- Keep replay behavior focused on restoring user intent into existing generate and editor flows instead of introducing separate duplicate workflows.
- Ensure lineage reading tolerates incomplete local state, including missing blobs or broken parent references, and surfaces graceful degraded behavior instead of hard failure.

## Testing Decisions

- Good tests should validate observable behavior from the user's perspective and from stable module interfaces, not implementation details or incidental storage internals.
- Lineage capture should be tested through the workflow boundaries that create images or save edits.
- Replay behavior should be tested by asserting that prior lineage steps hydrate the expected draft state, references, and editor context.
- Archive persistence tests should verify that an image and its lineage can be saved, listed, loaded, and removed consistently.
- Export tests should verify that archive packages include both image payloads and lineage metadata, and that the metadata preserves relationships and required fields.
- Error-handling tests should verify graceful behavior when lineage references are incomplete, missing, malformed, or partially corrupted.
- Schema evolution tests should verify that older stored data can coexist with or migrate into the new lineage model without breaking existing archive behavior.
- Module-level tests should focus on the lineage store, provenance capture orchestration, replay hydration, and archive export manifest generation.
- Integration-oriented tests should cover generate-to-save, edit-to-save, overwrite, save-as-copy, and create-similar flows end to end at the controller or workflow level.
- If the repo adds broader UI coverage later, image detail and replay interactions should be validated through user-visible behaviors such as seeing lineage information and invoking replay actions.
- Prior art in the codebase should come from existing tests around storage, workflow helpers, controllers, and export boundaries once those suites are established or expanded.

## Out of Scope

- A fully interactive visual node-graph editor in the first release.
- Multi-user collaboration, cloud sync, or shared lineage across devices.
- AI-generated critiques, auto-tagging, or automated branch ranking based on lineage data.
- Major archive browsing upgrades unrelated to provenance, such as broad taxonomy systems or large-scale virtualization work.
- A complete archive import system unless it is needed directly to validate the new export manifest contract.
- Non-local storage backends.
- Rewriting the existing generate, editor, or archive experiences beyond the changes needed to expose lineage and replay behavior.

## Further Notes

- This feature should be treated as a product-level capability, not just a metadata enhancement.
- The main product shift is from storing outputs to storing recoverable creative process.
- The first release should optimize for durability, clarity, and replay usefulness.
- If successful, this foundation can support future features such as richer comparisons, best-branch discovery, saved recipes, import and restore, and more advanced archive intelligence.
- The primary success criterion is that users can return to a strong image weeks later and reliably understand, replay, and branch from the work that produced it.
