# Context — AURA AI

Glossary of the domain language used across this repo. Definitions only — no
implementation details. When code or docs name one of these concepts, use the
term exactly as defined here; don't drift to the listed synonyms-to-avoid.

## Image model

A user-selectable engine that turns a prompt (plus optional reference images)
into an image. The image model is chosen **per generation** in the Generate and
Editor views and is recorded on every saved image and every lineage step.

Current values: `gpt-image-2`, `nano-banana-pro`.

- Avoid calling it the "engine", "the AI", or "backend" — those are vaguer.
- Distinct from **provider**: the model is the user-facing choice; the provider
  is who hosts it.

## Provider

The external service that hosts a model and authenticates requests with its own
API key. Every model — image or reasoning — belongs to exactly one provider.

Current values: **OpenAI**, **Google**.

- One API key per provider, held locally in the browser.
- A run that mixes models from two providers needs both providers' keys.

## Reasoning model

The model Autopilot uses for its language/vision steps — goal-to-prompt
translation, satisfaction evaluation (which looks at the generated image), and
prompt refinement. Selected **independently of the image model**.

Current values: `gpt-5.4` (OpenAI), a Gemini text model (Google).

- Not the same thing as the **image model**. An Autopilot run pairs one image
  model with one reasoning model; they may belong to different providers.

## Reference image

An optional input image supplied alongside the prompt to guide generation or
editing. Distinct from the **source image** in the Editor (the canvas being
transformed), which is always the first image sent on an edit.
