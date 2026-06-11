# Image Provider Integration

This project calls image and reasoning providers directly from the browser. The provider registry maps user-facing model choices to the provider endpoint, provider key, API model name, and request parameters required by each model.

## Integration Summary

- Image models: `gpt-image-2`, `nano-banana-pro`
- Reasoning models: `gpt-5.4`, `gemini-2.5-flash`
- Provider registry: `src/utils/openaiModels.ts`
- OpenAI client helpers: `src/utils/openai.ts`
- Google image provider: `src/image-workflow/ImageProvider.ts`
- Reasoning clients: `src/autopilot/ReasoningClient.ts`
- Image workflow boundary: `src/image-workflow/ImageWorkflow.ts`
- Generate flow entry point: `src/views/GenerateView.tsx`
- Editor flow entry point: `src/views/EditorView.tsx`
- Autopilot orchestration: `src/autopilot/` and `src/generate-session/runGenerateAutopilot.ts`

## Providers and Keys

Provider API keys are stored locally in browser `localStorage`.

- OpenAI keys enable `gpt-image-2` image requests and `gpt-5.4` reasoning requests.
- Google keys enable `nano-banana-pro` image requests and `gemini-2.5-flash` reasoning requests.
- Autopilot can pair an image model from one provider with a reasoning model from another provider. That run requires both provider keys.

## Request Routing

The app uses provider-specific request paths behind the shared `ImageWorkflow` and `ReasoningClient` boundaries.

### OpenAI Prompt-Only Generation

Prompt-only `gpt-image-2` generation uses:

- Endpoint: `POST https://api.openai.com/v1/images/generations`
- Content type: `application/json`
- Model: `gpt-image-2`
- Authorization: bearer token from the locally stored OpenAI key
- Output handling: base64 image payload converted to a data URL

This path is used when the Generate view has no uploaded reference images and the active image model is `gpt-image-2`.

### OpenAI Reference Generation and Editing

Reference-based `gpt-image-2` generation and editor transforms use:

- Endpoint: `POST https://api.openai.com/v1/images/edits`
- Content type: `multipart/form-data`
- Model: `gpt-image-2`
- Input images: browser `File` objects appended as `image[]`
- Optional mask: Editor transform masks are appended as the separate `mask`
  multipart field when present
- Output handling: base64 image payload converted to a data URL

This path is used when:

- the Generate view includes one or more reference images with `gpt-image-2`
- the Editor view sends the full composition or selected-layer target as the first `image[]` entry
- the Editor view appends the visible composition context and optional reference images after the edit target when applicable

### Google Image Generation and Editing

`nano-banana-pro` maps to Google's `gemini-3-pro-image-preview` API model and uses:

- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`
- Content type: `application/json`
- Authentication: `x-goog-api-key` from the locally stored Google key
- Input parts: prompt text plus optional `inline_data` image parts
- Output handling: image data from `candidates[].content.parts[].inlineData.data` or `inline_data.data`

Generate requests include:

- `generationConfig.responseModalities: ["IMAGE"]`
- `generationConfig.imageConfig.aspectRatio`
- `generationConfig.imageConfig.imageSize`

Editor transform requests preserve the source composition dimensions by omitting Google image sizing controls. `nano-banana-pro` uses the first `14` reference images for generation and editing.

### Autopilot Reasoning

Autopilot language and vision steps use the selected reasoning model:

- OpenAI `gpt-5.4`: `POST https://api.openai.com/v1/responses`
- Google `gemini-2.5-flash`: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

This path is used for:

- goal-to-prompt translation before or during an Autopilot run
- image satisfaction scoring against the user goal
- prompt refinement between Autopilot iterations

The evaluator includes the generated image with the reasoning request. OpenAI receives it as `input_image` content; Google receives it as an inline image part.

## Supported User Controls

The Generate view exposes model selection and model-specific image controls.

`gpt-image-2` controls:

- `prompt`
- `quality`: `low`, `medium`, `high`
- `size`: `auto`, `1024x1024`, `1536x1024`, `1024x1536`
- `background`: `auto`, `opaque`, `transparent`
- `image[]` inputs for reference-based requests

`nano-banana-pro` controls:

- `prompt`
- `aspectRatio`: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`
- `imageSize`: `1K`, `2K`, `4K`
- inline image references, capped to the first `14` images

The app also exposes higher-level creative controls that are merged into the text prompt before an image request is sent:

- `style`
- `lighting`
- `palette`

Autopilot adds app-level controls that shape request cadence and reasoning:

- `goal`
- `reasoningModel`
- `maxIterations`
- `satisfactionThreshold`

## Current Behavior

- GPT Image 2 Generate runs may request a batch of 1-4 images with the native
  `n` parameter; edit operations and Autopilot iterations request one image.
- Image responses are expected as base64 payloads and converted into browser data URLs.
- Prompt modifiers are concatenated into the final prompt in `ImageWorkflow`.
- Generate and Editor previews update immediately after a successful provider response.
- Autopilot runs can perform up to three provider calls per iteration: generate, evaluate, and refine.
- Sensitive request payloads are not written to the browser console by the provider helpers.

## Error Handling

- Non-2xx responses are parsed and surfaced as user-facing error messages when the provider returns an error payload.
- Empty success payloads are treated as failures.
- Missing or malformed reasoning text is surfaced as an Autopilot or helper error.
- Satisfaction evaluation falls back to a score of `0` with generic feedback when the returned JSON cannot be parsed.

## Related Files

- `src/utils/openaiModels.ts`
- `src/utils/openai.ts`
- `src/image-workflow/ImageProvider.ts`
- `src/image-workflow/ImageWorkflow.ts`
- `src/autopilot/ReasoningClient.ts`
- `src/views/GenerateView.tsx`
- `src/views/EditorView.tsx`
- `src/autopilot/GoalPromptTranslator.ts`
- `src/autopilot/SatisfactionEvaluator.ts`
- `src/autopilot/PromptRefiner.ts`
- `src/generate-session/runGenerateAutopilot.ts`
- `docs/openAI_create_image.md`
