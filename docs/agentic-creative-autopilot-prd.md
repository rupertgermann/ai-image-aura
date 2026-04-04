# PRD: Agentic Creative Autopilot

## Problem Statement

AURA AI already gives creators a powerful local-first studio for generating and editing images, but the core interaction model places all creative burden on the user. To get a strong result, you must know how to write prompts — choosing the right descriptors, adjusting modifiers, and iterating manually through trial and error. Each failed attempt is a dead end: the image is discarded, the prompt is tweaked by hand, and no institutional memory of what worked or what didn't is preserved.

This creates a frustrating gap between creative intent and creative output:

- A user who knows exactly what they want visually may not know how to express it as a generation prompt
- Successful prompts are discovered by accident and are difficult to reconstruct later
- Failed iterations are thrown away rather than used to guide the next attempt
- The gap between a rough creative brief and a finished image requires skill and patience that not every user has or wants to develop

For a local-first image studio that aspires to feel like a creative operating system, this is a strategic ceiling. The next major leap is not better prompts — it is removing the need to write them at all.

## Solution

Introduce an Agentic Creative Autopilot mode that allows users to state a creative **goal** in plain language and let AURA autonomously iterate toward it.

When Autopilot is active, the user describes what they are trying to create — not just a prompt, but a multi-sentence statement of intent. AURA then runs a closed loop:

1. Translate the goal into an initial generation prompt
2. Generate an image using the existing image workflow
3. Evaluate the result against the goal using GPT-4o vision
4. Produce a structured critique: a satisfaction score and specific, actionable feedback
5. Refine the prompt using the critique
6. Generate again from the refined prompt
7. Repeat until the satisfaction score meets a configurable threshold, or a maximum iteration count is reached

Every iteration is captured automatically as a node in the Creative Lineage Graph, producing a branching history of the full creative process. At any point the user can pause, inspect intermediate results, fork from any earlier attempt, or save the best result.

The product shift is from **user as prompt engineer** to **user as creative director**. The user states intent. AURA figures out how to realise it.

## User Stories

1. As a creator, I want to describe my image idea in plain sentences rather than a technical prompt, so that I can focus on my creative vision instead of prompt syntax.
2. As a creator, I want AURA to automatically translate my creative goal into an initial generation prompt, so that I have a useful starting point without needing to write one myself.
3. As a creator, I want AURA to evaluate each generated image against my stated goal, so that I can see whether the result is moving in the right direction.
4. As a creator, I want the evaluation to produce a satisfaction score, so that I have a concrete signal of how close the current result is to my intent.
5. As a creator, I want the evaluation to produce specific, readable feedback, so that I understand what the system is trying to improve at each step.
6. As a creator, I want the prompt to be automatically refined between iterations using the evaluator's feedback, so that each generation attempt is meaningfully better than the last.
7. As a creator, I want the autopilot loop to stop early when a result is good enough, so that I am not charged for unnecessary generations once my goal is met.
8. As a creator, I want to configure the satisfaction threshold that triggers early stopping, so that I can trade off quality against cost based on my current needs.
9. As a creator, I want to configure the maximum number of iterations, so that I have an explicit cost ceiling on any autopilot run.
10. As a creator, I want to see the current iteration number and the evaluator's feedback as the loop runs, so that I understand what is happening in real time.
11. As a creator, I want to see each intermediate image as it is generated, so that I can watch the creative evolution unfold.
12. As a creator, I want to pause the autopilot loop at any point, so that I can inspect the current state before committing to more iterations.
13. As a creator, I want to fork from any intermediate image in the autopilot run, so that I can explore a branch that looked promising even if the loop continued past it.
14. As a creator, I want the best-scoring result to be presented at the end of a run, not necessarily the final one, so that I always receive the strongest output rather than the last one.
15. As a creator, I want every autopilot iteration to be recorded in my Creative Lineage Graph, so that the full evolution of the image is preserved as a first-class creative artifact.
16. As a creator, I want each lineage node produced by autopilot to include the prompt used, the evaluator score, and the evaluator feedback, so that I can understand what changed at each step.
17. As a creator, I want to see the complete autopilot lineage in the archive detail view, so that I can revisit and understand any past run.
18. As a creator, I want to replay a prior autopilot iteration back into the Generate workflow, so that I can continue refining from any point in a previous session.
19. As a creator, I want to be shown an explicit cost warning before an autopilot run starts, so that I understand that each run uses multiple API calls.
20. As a creator, I want the estimated number of API calls to be displayed before I start a run, so that I can make an informed decision about whether to proceed.
21. As a creator, I want to switch freely between Single Shot and Autopilot mode in the Generate view, so that I can use whichever approach suits my current task.
22. As a creator, I want my goal text to be preserved between sessions, so that I can return to an interrupted run without retyping my intent.
23. As a creator, I want the auto-populated prompt to remain editable, so that I can adjust or override it if I want finer control before a run starts.
24. As a creator, I want to save the final result of an autopilot run to the archive with a single action, so that my best output is preserved alongside its full lineage.
25. As a creator, I want autopilot runs that reach the iteration limit without converging to tell me so explicitly, so that I understand the result may not fully satisfy my goal.
26. As a creator, I want the generation settings (quality, aspect ratio, background) I configured before switching to Autopilot to carry over into the run, so that I do not have to reconfigure them.
27. As a creator, I want errors during an autopilot run — such as a failed generation or a failed evaluation — to be surfaced clearly, so that I understand what went wrong and can try again.
28. As a creator, I want a partial run that encountered an error to preserve whatever lineage nodes were completed before the failure, so that successful iterations are not lost.
29. As a power user, I want to see the raw evaluator feedback for each iteration rather than just a score, so that I can understand the model's reasoning in detail.
30. As a power user, I want the lineage export to include autopilot metadata — goal text, per-iteration scores, and feedback — so that I can analyse past runs outside the app.
31. As a maintainer, I want the autopilot orchestration to be cleanly separated from image generation, evaluation, and prompt refinement, so that each concern can be tested and evolved independently.
32. As a maintainer, I want the GPT-4o evaluation call to use a stable, versioned system prompt, so that changes to the evaluator behaviour are explicit and reviewable.
33. As a maintainer, I want the satisfaction score parsing to be isolated in a dedicated module, so that changes to the response format do not cascade across the codebase.
34. As a maintainer, I want autopilot runs to be cancellable from the UI, so that a runaway loop can always be stopped without requiring a page reload.

## Implementation Decisions

- Introduce a dedicated `AutopilotSession` module that owns the generate → evaluate → refine loop. It accepts a goal, generation settings, an API key, and callbacks for iteration progress. It returns the ranked list of results when complete or cancelled.
- Introduce a `PromptRefiner` module that takes a goal, the current prompt, and evaluator feedback, and returns a refined prompt. It calls GPT-4o with a fixed system prompt designed to produce a single improved generation prompt as output.
- Introduce a `SatisfactionEvaluator` module that takes an image data URL and a goal, calls GPT-4o vision, and returns a structured result: a numeric score from 0 to 100 and an array of specific, human-readable feedback sentences. The system prompt for this call is versioned and centrally owned by the module.
- `ImageWorkflow.generate()` is called unchanged at each iteration. The Autopilot is pure orchestration above the existing workflow boundary and does not modify it.
- Each iteration within an autopilot run is recorded as a lineage step with a `parent_step_id` pointing to the previous iteration's step. The first iteration's parent is the step that initiated the run (if any).
- Lineage step records for autopilot iterations include additional autopilot-specific metadata: the goal text, the iteration number, the evaluator score, and the evaluator feedback text.
- `useGenerateController` gains an `autopilot` action that delegates to `AutopilotSession`. The existing `generate` action is unchanged.
- The Generate view gains a mode toggle between "Single Shot" and "Autopilot". Mode selection is persisted in the existing local state store.
- Autopilot mode shows a goal field (multi-line, free text) and a prompt field. The prompt field is auto-populated by translating the goal into an initial prompt via a lightweight GPT-4o call on demand, but remains fully editable by the user.
- A live iteration panel displays the current iteration count, the active evaluator feedback, and a thumbnail strip of all intermediate images generated so far.
- The autopilot loop is cancellable at any point. Cancellation preserves all lineage nodes produced before the cancel and presents the best-scored result to date.
- Max iterations is configurable per run, with a default of 4 and a hard ceiling of 8. This setting is persisted in local state.
- Satisfaction threshold is configurable per run, with a default of 90 (out of 100). This setting is persisted in local state.
- When the loop terminates — whether by convergence, cancellation, or reaching the iteration limit — the result presented to the user is the iteration with the highest evaluator score, not necessarily the final iteration.
- A cost disclosure panel is shown before each autopilot run starts, stating the configured max iterations and the resulting maximum number of API calls. The user must confirm before the run begins.
- The existing generation settings (quality, aspect ratio, background, style, lighting, palette) apply to every iteration within a run. They are not changed between iterations.
- GPT-4o is used for both evaluation and prompt refinement. The same API key the user already configured for image generation is used. No additional credentials are required.
- Generation in Autopilot mode uses `gpt-image-1.5` via the existing `imageWorkflow.generate()` path. No new image model is introduced.
- Goal text and the last-used autopilot settings (max iterations, threshold) are persisted in the existing local storage layer between sessions.
- Errors during generation or evaluation stop the current run at the failed iteration. All successfully completed iteration lineage nodes are retained. The error is surfaced in the UI with a clear message.

## Testing Decisions

- Good tests validate observable behaviour through stable module interfaces, not internal implementation details or storage mechanics.
- `AutopilotSession` should be tested by asserting on the sequence of iteration callbacks it produces, the termination condition it applies, and the result it returns, given injected mock implementations of `generate`, `evaluate`, and `refine`.
- `SatisfactionEvaluator` should be tested by asserting that it correctly parses structured GPT-4o responses into a score and feedback array, and that it handles malformed or partial responses gracefully without throwing.
- `PromptRefiner` should be tested by asserting that it returns a non-empty string prompt given a goal and feedback input, and that it propagates errors from the underlying API call correctly.
- Lineage capture for autopilot iterations should be tested by asserting that each completed iteration produces a lineage step with the correct `parent_step_id` chain, iteration metadata, and score.
- Early stopping should be tested by asserting that `AutopilotSession` halts and returns the best-scored result as soon as the satisfaction threshold is met, without proceeding to the next iteration.
- Cancellation should be tested by asserting that in-flight runs stop cleanly after the current iteration completes, preserve completed lineage nodes, and surface the best result to date.
- Error handling should be tested by asserting that a generation or evaluation failure stops the run and preserves prior lineage without throwing an unhandled exception.
- Prior art for module-level tests should be drawn from existing tests around `ImageWorkflow`, `GenerateSession`, and the lineage store once those suites are established.
- Integration tests covering the full autopilot flow from goal input through final result selection should be run through the `AutopilotSession` public interface with real or realistic injected dependencies, not through UI component tests.

## Out of Scope

- Support for image generation models other than `gpt-image-1.5` in the autopilot loop.
- Support for evaluation models other than GPT-4o.
- Multi-user collaboration, cloud sync, or cross-device history sharing.
- Batch autopilot: running an autopilot session across multiple goals or prompts simultaneously.
- Saving or sharing autopilot "recipes" (goal + settings combinations) as reusable presets — planned for a future release.
- Automated style transfer or reference-guided autopilot runs in the first release.
- Archive-level autopilot: applying the loop to existing archive images without user involvement.
- Any AI-generated ranking, tagging, or critique of archive images outside of an active autopilot session.
- A fully visual interactive node-graph interface for the autopilot lineage — the first release uses the existing lineage timeline view.
- Non-local storage backends or server-side orchestration of the loop.

## Further Notes

- This feature is most valuable when the Creative Lineage Graph feature is already in place. The lineage graph provides the storage and replay infrastructure that makes autopilot runs durable and reusable. The Autopilot should be treated as a dependent feature that builds directly on top of the lineage graph rather than a standalone capability.
- The quality of the evaluator system prompt is the single largest determinant of feature quality. The feedback it produces must be specific, actionable, and visually grounded — not generic. Iteration on this prompt should be treated as a first-class engineering and product concern, not a configuration detail.
- Cost transparency is a non-negotiable design constraint. Users who are accustomed to single-shot generation will be surprised by a run that makes eight API calls. The cost disclosure step before each run is not optional.
- The feature should degrade gracefully when the evaluator produces low-quality or inconsistent scores. If the score variance across iterations is very low, the system should not get stuck in a loop making marginal changes — the max iterations hard ceiling is the primary protection against this.
- A successful first release should demonstrate that a non-technical user can describe an image in plain English, press Autopilot, and receive a result that meaningfully matches their intent without touching the prompt field — with the full creative evolution saved to their lineage graph. That is the north star for all design and quality decisions.
