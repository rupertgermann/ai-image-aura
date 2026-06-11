# Context — AURA AI

Glossary of the domain language used across this repo. Definitions only — no
implementation details. When code or docs name one of these concepts, use the
term exactly as defined here; don't drift to the listed synonyms-to-avoid.

## Image model

A user-selectable engine that turns a prompt (plus optional reference images)
into an image. The image model is chosen **per generation** in the Generate view
and per AI transform in the Editor view. It is recorded on every saved image and
every lineage step.

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

Current values: `gpt-5.4` (OpenAI), `gemini-2.5-flash` (Google).

- Not the same thing as the **image model**. An Autopilot run pairs one image
  model with one reasoning model; they may belong to different providers.

## Reference image

An optional input image supplied alongside the prompt to guide generation or
editing. Distinct from the **source image** in the Editor (the canvas being
transformed), which is always the first image sent on an edit.

## Generation batch

The set of result slots produced by one Generate run. A generation batch uses
one prompt, image model, control set, and reference image snapshot, even when
some slots succeed and others fail.

## Batch result

One slot in a **generation batch**. A batch result may be a generated image or a
slot-level failure. Saving a successful batch result creates its own archive
image and lineage step while preserving the full run inputs.

## Favorite

A user-marked archive image kept easy to find with the Archive favorites filter.
It is a lightweight flag on an archive image, not a named collection.

## Image layer

A user-controlled image element that participates in the Editor composition as
part of the visible artwork and has stable identity within a layer stack.
Distinct from a **reference image**, which guides generation or editing without
becoming part of the visible composition, and from a **lineage step**, which
records creative history.

## Raster image layer

An image layer whose content is bitmap artwork. This is the only kind of image
layer in the first layered Editor experience.

## AI result layer

A raster image layer created from the result of an AI transform in the Editor.
It is added to the layer stack without destroying the AI transform target.
Distinct from an **AI edit** lineage step, which records creative history.

## AI transform target

The layer selection sent to an AI transform as the image content to change.
Distinct from **reference images** and composition context, which guide the AI
transform without defining the target layer content.

## Uploaded layer

A raster image layer created from an image file the user adds to the visible
Editor composition. Distinct from a **reference image**, which guides generation
or editing without becoming part of the visible artwork.

## Layer selection

The image layer or layers currently targeted by Editor layer operations. A layer
selection may include multiple layers for shared actions, while direct transform
handles target one primary non-base layer.

## Layer transform

The position, scale, and rotation of a non-base image layer within the Editor
composition. Distinct from a **composition adjustment**, which changes the
combined visual output.

## Base layer

The raster image layer created from the archive image opened in the Editor. It
anchors the layer stack, defines the composition bounds, and remains part of
every Editor composition.

## Layer stack

The ordered set of image layers that make up an editable Editor composition.
Distinct from the flattened image saved for browsing, sharing, and lineage
preview.

## Editor composition

The visible artwork produced by combining the layer stack and composition
adjustments. Its real pixel bounds are defined by the base layer, even when the
Editor displays it at a scaled screen size.

## Layered image

An archive image that has an editable layer stack in addition to its flattened
image. Its layer stack and composition adjustments are durable archive data, so
it can be reopened as editable artwork rather than only as a single flat source
image.

## Editor draft

Unsaved Editor work for an archive image. An Editor draft may include a layer
stack, but it is distinct from a **layered image** until the user saves it.

## Dirty draft

An Editor draft whose layer stack or composition adjustments differ from the
last saved state of the archive image.

## Edit history

The undoable and redoable sequence of changes inside an active Editor draft.
Distinct from an **Editor draft**, which may persist across reloads, and from
**lineage**, which records saved creative history across archive images.

## Composition adjustment

A visual adjustment applied to the Editor composition as a whole after the layer
stack is combined. It remains editable on a layered image and is distinct from
image-layer properties such as visibility, opacity, order, and transform.
