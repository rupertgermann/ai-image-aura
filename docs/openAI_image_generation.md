# OpenAI Image Generation Integration

This project uses the OpenAI Images API directly from the browser.

## Integration Summary

- Model: `gpt-image-1.5`
- Client location: `src/utils/openai.ts`
- Generate flow entry point: `src/views/GenerateView.tsx`
- Edit flow entry point: `src/views/EditorView.tsx`
- Settings entry point: `src/views/SettingsView.tsx`

The application uses two request shapes depending on whether image files are included in the request.

## Request Routing

### Prompt-only generation

Prompt-only generation uses:

- Endpoint: `POST https://api.openai.com/v1/images/generations`
- Content type: `application/json`
- Output handling: base64 image payload converted to a data URL

This path is used when the Generate view has no uploaded reference images.

### Reference-based generation and editing

Reference-based generation and editor transforms use:

- Endpoint: `POST https://api.openai.com/v1/images/edits`
- Content type: `multipart/form-data`
- Input images: files uploaded in the browser
- Output handling: base64 image payload converted to a data URL

This path is used when:

- the Generate view includes one or more reference images
- the Editor view sends the current canvas image together with optional reference images

## Supported User Controls

The current UI exposes the following OpenAI-facing controls:

- `prompt`
- `quality`
- `size`
- `background`
- `image[]` inputs for reference-based requests

The app also exposes higher-level creative controls that are merged into the text prompt before the request is sent:

- `style`
- `lighting`
- `palette`

## Current Behavior

- The browser stores the API key locally and sends it as a bearer token on each OpenAI request
- The app requests a single image per operation
- The app expects base64 image output from OpenAI responses
- Generated and edited images are previewed immediately and can be saved to the local archive
- Sensitive request payloads are not written to the browser console

## Error Handling

- Non-2xx responses are parsed and surfaced as user-facing error messages when the API returns an error payload
- Empty success payloads are treated as failures
- Generation and editing states remain local to the browser UI

## Related Files

- `src/utils/openai.ts`
- `src/views/GenerateView.tsx`
- `src/views/EditorView.tsx`
- `docs/openAI_create_image.md`