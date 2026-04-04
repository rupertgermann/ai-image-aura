# OpenAI Image Generation Integration

This project uses the OpenAI API directly from the browser for image generation, image editing, and Autopilot reasoning.

## Integration Summary

- Image model: `gpt-image-1.5`
- Responses model: `gpt-5.4`
- Client location: `src/utils/openai.ts`
- Image workflow boundary: `src/image-workflow/ImageWorkflow.ts`
- Generate flow entry point: `src/views/GenerateView.tsx`
- Editor flow entry point: `src/views/EditorView.tsx`
- Autopilot orchestration: `src/autopilot/` and `src/generate-session/runGenerateAutopilot.ts`

## Request Routing

The app uses three request paths.

### Prompt-only generation

Prompt-only generation uses:

- Endpoint: `POST https://api.openai.com/v1/images/generations`
- Content type: `application/json`
- Model: `gpt-image-1.5`
- Output handling: base64 image payload converted to a data URL

This path is used when the Generate view has no uploaded reference images.

### Reference-based generation and editing

Reference-based generation and editor transforms use:

- Endpoint: `POST https://api.openai.com/v1/images/edits`
- Content type: `multipart/form-data`
- Model: `gpt-image-1.5`
- Input images: browser `File` objects appended as `image[]`
- Output handling: base64 image payload converted to a data URL

This path is used when:

- the Generate view includes one or more reference images
- the Editor view exports the current canvas and sends it as the first `image[]` entry
- the Editor view appends any optional reference images after the canvas image

### Autopilot reasoning

Autopilot language and vision steps use:

- Endpoint: `POST https://api.openai.com/v1/responses`
- Content type: `application/json`
- Model: `gpt-5.4`

This path is used for:

- goal-to-prompt translation before or during an Autopilot run
- image satisfaction scoring against the user goal
- prompt refinement between Autopilot iterations

The evaluator includes the generated image as `input_image` content when scoring an iteration.

## Supported User Controls

The current UI exposes these OpenAI-facing image controls:

- `prompt`
- `quality`
- `size`
- `background`
- `image[]` inputs for reference-based requests

The app also exposes higher-level creative controls that are merged into the text prompt before an image request is sent:

- `style`
- `lighting`
- `palette`

Autopilot adds app-level controls that shape request cadence rather than request fields:

- `goal`
- `maxIterations`
- `satisfactionThreshold`

## Current Behavior

- The browser stores the API key locally and sends it as a bearer token on each OpenAI request
- The app requests a single image per generation or edit operation
- Image responses are expected in `b64_json` form and are converted into browser data URLs
- Prompt modifiers are concatenated into the final prompt in `ImageWorkflow`
- Generate and Editor previews update immediately after a successful OpenAI response
- Autopilot runs can perform up to three OpenAI calls per iteration: generate, evaluate, and refine
- Sensitive request payloads are not written to the browser console

## Error Handling

- Non-2xx responses are parsed and surfaced as user-facing error messages when the API returns an error payload
- Empty success payloads are treated as failures
- Missing or malformed Responses API text is surfaced as an Autopilot or helper error
- Satisfaction evaluation falls back to a score of `0` with generic feedback when the returned JSON cannot be parsed

## Related Files

- `src/utils/openai.ts`
- `src/image-workflow/ImageWorkflow.ts`
- `src/views/GenerateView.tsx`
- `src/views/EditorView.tsx`
- `src/autopilot/GoalPromptTranslator.ts`
- `src/autopilot/SatisfactionEvaluator.ts`
- `src/autopilot/PromptRefiner.ts`
- `src/generate-session/runGenerateAutopilot.ts`
- `docs/openAI_create_image.md`
