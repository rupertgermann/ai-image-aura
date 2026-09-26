# AURA AI

AURA AI is a local-first browser studio for generating, organizing, editing, and iterating on AI images with OpenAI, Google, and a user-run Qwen Image 2.1 server.

The app runs entirely in the browser. Provider API keys, the local server URL, generated images, reference images, layer assets, working session state, archive metadata, and lineage history stay on the local device instead of passing through an application backend.

The interface follows the Telepathic Instruments-inspired visual system documented in `docs/DESIGN.md`: stark panels, monochrome surfaces, amber action emphasis, compact controls, and typography tuned for a focused creative tool rather than a marketing page.

## Screens

| Generate | Archive |
|----------|---------|
| ![Generate view](docs/screens/Generate.png) | ![Archive view](docs/screens/Archive.png) |

| Editor | Detail |
|--------|--------|
| ![Editor view](docs/screens/Editor.png) | ![Detail view](docs/screens/Detail.png) |

## Highlights

- Prompt-based image generation with `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, `nano-banana-pro`, and locally hosted `qwen-image-2.1`
- `Single Shot` and `Autopilot` generation modes
- Batch generation of up to four images per run with a per-slot result grid, save-all, and per-result reuse actions
- Streaming partial-image previews during single-shot generation for models that support it
- Reuse any generated result as a reference image with a single action
- Actual generation parameter reporting for values returned by the provider or measured by AURA
- Goal-to-prompt translation, iterative scoring, and prompt refinement with selectable reasoning models: `gpt-6-sol` and `gemini-2.5-flash`
- Provider API key storage for OpenAI and Google, plus a server URL and connection test for Local server
- Prompt enhancement controls for style, lighting, palette, and model-specific output settings
- Shared image-model facts for Generate and Editor controls, provider routing, capabilities, reference limits, and archive metadata
- Reference-image workflows for guided generation and AI-assisted edits, including clipboard paste
- Qwen Image 2.1 controls for aspect ratio, 1K/2K resolution, and auto/transparent background requests
- Transform-mask painting for targeted AI edits, persisted in lineage and replayable into the editor
- Creative lineage tracking across generation, create-similar, editor saves, AI edits, save-as-copy branches, and Autopilot iterations
- Local archive with search, favorites filtering, multi-select actions, layer-aware ZIP export/import, manifest recovery, lineage-aware detail view, replay actions, fork actions, and keyboard navigation
- Layered in-browser editor with image layers, blend modes, layer locking, drag reordering, keyboard nudging, live composition adjustments, AI result layers, non-destructive drafts, undo/redo, overwrite, save-as-copy, reset, and revert controls
- Background completion notifications for finished generation runs
- Persistent local UI state for prompts, model-specific generation settings, Autopilot settings, archive search and favorites filter, editor drafts, editor controls, and notification preferences
- Local-first persistence powered by SQLocal and IndexedDB
- $0.00 API cost reporting for local image inference

## Tech Stack

- React 19
- TypeScript
- Vite 7
- SQLocal for browser-local SQLite metadata
- `idb-keyval` for binary and transient IndexedDB storage
- JSZip for archive export bundles
- Konva and React Konva for the layered editor canvas
- Lucide React for iconography
- Vitest for module and workflow tests

## Runtime Requirements

- Node.js `20.19+` or `22.12+`
- npm `10+`

## Getting Started

```bash
npm install
npm run dev
```

Open the app in your browser, go to **Settings**, and configure the providers for the models you want to use. OpenAI powers `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` for images, and `gpt-6-sol` for reasoning; Google powers `nano-banana-pro` and `gemini-2.5-flash`. Qwen Image 2.1 uses a Local server URL instead of an API key.

### Qwen Image 2.1 local server

Quick path: `scripts/qwen-sd-server.sh setup`, then `start`, then `test` in a second terminal. The manual steps are below.

Build [stable-diffusion.cpp's `sd-server`](https://github.com/leejet/stable-diffusion.cpp/tree/master/examples/server), then download these weights:

1. A Qwen Image 2.1 diffusion GGUF, such as [`qwen_image_2.1-Q4_K.gguf`](https://huggingface.co/leejet/Qwen-Image-2.1-GGUF/tree/main).
2. The matching [`qwen_image_2.1_vae_bf16.safetensors`](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/tree/main/vae). Earlier Qwen Image and Wan VAEs are not interchangeable with it.
3. A [Qwen3-VL-8B-Instruct text encoder GGUF](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/tree/main), such as `Qwen3VL-8B-Instruct-Q4_K_M.gguf`, and `mmproj-Qwen3VL-8B-Instruct-F16.gguf` from the same repository. The mmproj vision weights are required for every request containing images, including Generate references and Editor AI transforms.

From the stable-diffusion.cpp repository root, adjust the paths and launch the server (the binary path may differ on Windows):

```bash
./build/bin/sd-server \
  --diffusion-model /path/to/qwen_image_2.1-Q4_K.gguf \
  --vae /path/to/qwen_image_2.1_vae_bf16.safetensors \
  --llm /path/to/Qwen3VL-8B-Instruct-Q4_K_M.gguf \
  --llm_vision /path/to/mmproj-Qwen3VL-8B-Instruct-F16.gguf \
  --cfg-scale 6.0 --sampling-method euler \
  --diffusion-fa --offload-to-cpu -v
```

The [Qwen Image 2.1 guide](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_2.1.md) recommends CFG scale 6, Euler sampling, verbose logging, and CPU offloading; the [server guide](https://github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/README.md) documents flash attention and the default address `http://127.0.0.1:1234`. Enter that address in **Settings → Local Server (stable-diffusion.cpp)**, save it, and use **Test connection**. AURA sends requests directly to its OpenAI-compatible images API without an API key.

If `sd-server` runs behind [llama-swap](https://github.com/mostlygeek/llama-swap/blob/main/docs/configuration.md), enter the llama-swap URL instead and name the model `qwen-image-2.1` in its config, or add that exact alias. AURA sends `qwen-image-2.1` as the model ID for every local image request.

## Available Scripts

```bash
npm run dev
npm run test
npm run typecheck
npm run build
npm run lint
npm run audit
npm run audit:fix
npm run preview
```

### Script Reference

- `npm run dev`
  Starts the Vite development server.

- `npm run dev -- --port 5175`
  Starts the Vite development server on a custom port.

- `npm run test`
  Runs the Vitest suite in non-watch mode.

- `npm run typecheck`
  Runs the TypeScript project build in type-check mode.

- `npm run build`
  Type-checks the app and creates a production build.

- `npm run lint`
  Runs ESLint across the repository.

- `npm run audit`
  Runs `npm audit` against the current lockfile.

- `npm run audit:fix`
  Applies lockfile-only audit remediations for transitive vulnerabilities.

- `npm run preview`
  Serves the production build locally with Vite preview.

- `npm run preview -- --port 4174`
  Serves the production build on a custom preview port.

## Application Overview

### Generate

The Generate view supports:

- Image model selection among `GPT Image 2.5 Flare`, `GPT Image 2.5 Sunburst`, `Nano Banana Pro`, `Qwen Image 2.1`, and `FLUX.2 klein 4B` directly in Generate
- Mode toggle between `Single Shot` and `Autopilot`
- Free-form text prompts plus example prompt presets
- Goal-to-prompt translation for Autopilot mode
- Reasoning model selection between `GPT 6 Sol` and `Gemini 2.5 Flash` in Autopilot mode
- GPT Image 2.5 quality options: `low`, `medium`, `high`, `xhigh`, `max`, `auto` (default: `medium`)
- GPT Image 2.5 size options: `auto`, `1024x1024`, `1536x1024`, `1024x1536`
- GPT Image 2.5 background options: `auto`, `opaque`, `transparent`
- `Nano Banana Pro` aspect ratio options: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`
- `Nano Banana Pro` resolution options: `1K`, `2K`, `4K`
- `Qwen Image 2.1` aspect ratios: `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `16:9`, `9:16`
- `Qwen Image 2.1` resolution options: `1K`, `2K`; background options: `Auto`, `Transparent`
- GPT Image 2.5 batch size options: `1`, `2`, `3`, `4`
- `Nano Banana Pro` batch size options: `1`, `2`, `3`, `4`
- `Qwen Image 2.1` batch size options: `1`, `2`, `3`, `4`
- Style, lighting, and palette modifiers that are merged into the request prompt
- Configurable Autopilot iteration count from `1` to `8`
- Configurable Autopilot satisfaction threshold from `50` to `100`
- Cost disclosure and confirmation before each Autopilot run, including the selected image and reasoning models
- Live Autopilot progress, best-iteration highlighting, and stopping after the current iteration
- Multiple reference image uploads through file picker, drag-and-drop, and clipboard paste
- `Nano Banana Pro` reference inputs are capped to the first `14` images for provider compatibility
- `Qwen Image 2.1` reference inputs are capped to the first `10` images
- Reference preview modal with next and previous navigation
- Streaming partial-image previews during single-shot generation for models that support partial streaming
- A batch result grid for multi-image runs with per-slot save, download, use-as-reference, and isolated per-slot failure reporting
- Save all and Clear results actions for batch runs, with confirmation before discarding unsaved images
- Use as Reference to feed a generated result back into the reference set while preserving lineage
- Actual parameter panels that surface provider-reported values and measured elapsed time without inventing unavailable values
- Save-to-archive, download, and clear-result actions

Prompt-only GPT Image 2.5 generations use the OpenAI generations endpoint. GPT Image 2.5 requests with reference images use the OpenAI edits endpoint so the request can include uploaded image inputs. `Nano Banana Pro` generation and reference-guided generation use Google Gemini `generateContent` requests with text and inline image parts. `Qwen Image 2.1` uses the local server's OpenAI-compatible image generations and edits endpoints. For Transparent background, AURA adds Qwen's RGBA wording to the request prompt while keeping the saved prompt unchanged; PNG results preserve any alpha channel the model returns.

Batch runs request multiple images per generation. `Nano Banana Pro` fans batch requests out into parallel `generateContent` calls so a failed slot stays isolated while the rest of the batch succeeds. `Qwen Image 2.1` requests the whole batch in one local call, so a failed call marks every slot failed.

Saved Generate results use the provider-run reference image snapshot, so archive metadata and lineage reflect the exact images sent to the model even if the visible reference collection changes later.

Autopilot reuses the current image model settings and provider-used reference snapshot for every iteration, evaluates results against the goal with the selected reasoning model, refines the prompt between iterations, and keeps the best-scoring result as the primary output. Autopilot result slots carry lineage and actual parameter metadata like regular generated results. With `Qwen Image 2.1`, image inference has no API charge; the selected OpenAI or Google reasoning model may still incur a charge.

Flare is the default image model. Flare and Sunburst share quality, size, background, batch, streaming-preview, and transform-mask controls. Existing `gpt-image-2` archive images and lineage remain labelled **GPT Image 2 (retired)**; replay and editing use Flare while retaining compatible controls. Stored archive, lineage, and cost records are not migrated. Legacy Generate drafts retain their GPT Image controls, and saved `gpt-5.4` reasoning preferences fall back to GPT 6 Sol.

### Archive

The Archive view supports:

- Prompt-based search with persisted search text
- Favorites toggle on each image card with a persisted favorites-only filter
- Multi-select image management
- Select-all and deselect-all actions scoped to the current filtered result set
- ZIP export for selected images together with archive manifests, lineage manifests, reference images, flattened images, and layer assets
- Bulk deletion with confirmation
- Image detail modal with prompt copy, metadata display, reference previews, lineage timeline, and step selection
- Model-aware detail metadata for saved image model settings and actual generation parameters
- Lineage replay into Generate for generation, reference-generation, and Autopilot steps
- Lineage replay into Editor for replayable edit branches
- Fork-from-step actions for branching future saves from any recorded lineage step
- Autopilot lineage metadata including goal, iteration number, score, and evaluator feedback
- Previous and next navigation from the detail modal with keyboard arrow support
- Create Similar to transfer prompt, image model, model-specific controls, style controls, and references back into Generate

The lineage detail view can display the currently selected archive image, an ancestor step, or a stored Autopilot iteration preview from the lineage metadata. Archive transfer helpers validate ZIP imports and report missing assets or broken parent references, while the app also supports manifest-based metadata recovery through URL parameters.

Layered archive imports tolerate older and partial archive bundles by recovering the flattened image, available layer assets, manifest metadata, lineage steps, actual parameters, favorites, and reference assets that are present.

### Editor

The Editor view supports:

- A Konva-backed layered canvas with a locked base layer for the opened archive image
- Uploaded raster image layers that become part of the visible composition
- Layer selection, multi-selection, rename, visibility, opacity, lock, blend mode, reorder, move up/down, duplicate, and delete actions
- Layer blend modes: `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `soft-light`, and `difference`
- Drag reordering of non-base layers and locking to protect a layer from transform edits
- Direct move, scale, and rotation handles for the primary selected non-base layer
- Keyboard nudging of selected layers by `1` pixel, or `10` pixels with `Shift`
- Brightness, contrast, and saturation controls applied live to the full composition
- Quick filters: `Normal`, `B&W`, `Sepia`, and `Soft`, applied live to the canvas
- Collapsible Adjustments and Filters sections
- AI transformation prompts with selectable image models
- AI transform model selection that can inherit the source image model while still allowing an explicit override
- AI transforms targeted to selected visible non-base layers, or to the whole visible composition when no editable layer is selected
- AI transform requests separate the editable source image, composition context, and optional user reference images before provider mapping
- Transform-mask painting with brush and eraser tools and an adjustable brush size for models that support masked edits
- `Qwen Image 2.1` AI transforms send the target, composition context, then references (up to ten images total); its mask controls are hidden
- AI result layers inserted non-destructively above the targeted layer selection
- Optional visual context reference images for edit guidance through file picker, drag-and-drop, or clipboard paste
- Unsaved editor drafts persisted per archive image
- Undo and redo for layer, adjustment, reference, and AI result changes
- Save changes in place
- Save as copy
- Reset adjustments and undoable Revert to saved image controls

Editor saves are recorded in lineage as overwrite, save-as-copy, manual-edit, or AI-edit steps depending on the action taken. Transform masks used for AI edits are stored with the lineage step and replayed back into the editor when an edit branch is reopened. Layered images keep durable layer stack metadata, composition adjustments, and per-layer image assets alongside the flattened archive preview. Single-layer saves bake adjustments into the image. The editor restores the last opened image after a reload.

Editor lineage metadata records the target plan, source image, composition context, reference images, output layer, transform mask, layer stack summary, and save mode needed to summarize or replay an edit branch.

### Settings

The Settings view supports:

- Local OpenAI API key storage in the browser
- Local Google Gemini API key storage in the browser
- Local server URL storage and a connection test that lists reported model IDs or explains HTTP and reachability errors
- Saved-key status feedback, masked key entry, and removal by clearing and saving the field
- Immediate model availability once the matching provider key or Local server URL is stored
- A completion notifications toggle that surfaces a desktop notification when a run finishes while the app is in the background
- Notification readiness status that reflects unsupported browsers and insecure contexts

The sidebar includes a collapsible navigation rail.

## Storage Model

The application is designed as a local-first web app.

- Provider API keys and the Local server URL are stored in browser `localStorage`
- View state, generation drafts, model-specific generation settings, Autopilot settings, archive search, archive favorites filter, completion notification preference, and the last editor image ID are stored in browser `localStorage`
- Current generated batch results, transferred reference payloads, and editor drafts are stored in IndexedDB via `idb-keyval`; older editor drafts migrate from `localStorage` when opened
- Archive image metadata is stored in a browser-local SQLite database via SQLocal
- Qwen archive metadata includes its model, aspect ratio, resolution, background, and requested dimensions
- Layer stack metadata is stored with archive image metadata in SQLocal
- Flattened images, reference images, and per-layer image assets are stored in IndexedDB via `idb-keyval`
- Lineage metadata, including typed Generate, Editor, Autopilot, transform-mask, and actual-parameter metadata, is stored in a browser-local SQLite database via SQLocal
- Favorite flags are stored with archive image metadata in SQLocal
- Archive ZIP bundles contain image files, reference files, layer asset files, `archive-manifest.json`, and `lineage-manifest.json`
- Archive import, export, delete, copy, and metadata recovery flows share the same archive manifest and asset ownership language

There is no custom backend service in this repository.

## Provider Integration

The app calls provider APIs directly from the browser.

- OpenAI image generation uses `POST /v1/images/generations`
- OpenAI reference-based generation and editor transforms use `POST /v1/images/edits`
- OpenAI Autopilot reasoning uses `POST /v1/responses`
- Google image generation and editing use Gemini `generateContent`
- Google Autopilot reasoning uses Gemini `generateContent`
- Local server generation uses `POST /v1/images/generations`; reference-based generation and Editor AI transforms use `POST /v1/images/edits`; the Settings connection test uses `GET /v1/models`
- Local image requests send the model ID `qwen-image-2.1` with no Authorization header or hosted-provider key
- Image models: `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, `nano-banana-pro`, `qwen-image-2.1`
- Reasoning models: `gpt-6-sol`, `gemini-2.5-flash`
- Shared image-model control facts drive UI choices, default values, validation, provider request mapping, reference limits, mask capability, streaming capability, and archive metadata
- The app requests between one and four images per generation, fanning `Nano Banana Pro` batches out into isolated parallel requests
- Local server image inference has a calculated $0.00 API cost; Autopilot totals still include hosted reasoning calls
- Single-image OpenAI generations can stream partial-image previews when the model supports it
- Editor AI transforms can include a painted mask for models that support masked edits
- Image responses are consumed as base64 payloads and converted into browser-safe data URLs for preview and persistence
- Actual generation parameters contain only values reported by the provider or measured by AURA; Qwen runs record elapsed time only

Additional implementation details live in:

- `docs/openAI_image_generation.md`
- `docs/openAI_create_image.md`

## Privacy and Security

- The project is designed for local use in the browser
- Secrets are not committed to the repository
- The repository does not ship with embedded API keys, `.env` files, or private key material
- Sensitive provider request payloads are not logged by the client helpers

If you fork this project, keep the same standard for your own commits and issues.

## Project Structure

```text
src/
  app/             App-level controller, notifications, and persisted preferences
  archive/         Archive storage, ZIP export/import helpers, and archive controllers
  autopilot/       Autopilot orchestration and reasoning-model helper modules
  components/      Reusable UI components and modals
  db/              SQLocal bootstrap and persistence types
  download/        Local download helpers for images and ZIP bundles
  editor/          Canvas editing, editor sessions, and save flows
  generate-session Generate draft persistence, save logic, and Autopilot glue
  hooks/           Shared React hooks for local storage and archive state
  image-models/    Image-model control facts, validation, limits, and provider request mapping
  image-workflow/  Provider request orchestration for generate and edit flows
  lineage/         Lineage storage, replay, timelines, and metadata helpers
  references/      Reference image collection state and hydration helpers
  services/        IndexedDB-backed storage adapters
  utils/           Provider model constants, OpenAI helpers, and file conversion helpers
  views/           Generate, Archive, Editor, and Settings views
docs/
  agentic-creative-autopilot-prd.md
  creative-lineage-autopilot-qa-plan.md
  creative-lineage-graph-prd.md
  DESIGN.md
  adr/
  openAI_create_image.md
  openAI_image_generation.md
plans/
  creative-lineage-and-autopilot.md
  layered-editor.md
  localstorage-to-sqlite.md
  telepathic-instruments-rebrand.md
```

## Documentation

- `CONTEXT.md` defines the repo's domain vocabulary for image models, providers, lineage, and layered editor concepts
- `docs/DESIGN.md` defines the Telepathic Instruments-inspired visual design language used by the app
- `docs/openAI_image_generation.md` describes the current provider integration and request routing
- `docs/openAI_create_image.md` maps Generate, Editor, and Autopilot flows to the request payloads used by the app
- `docs/adr/` captures durable architecture decisions for archive assets, Konva canvas rendering, editor history, copy semantics, AI transform targeting, and layered-image adjustments
- `docs/creative-lineage-graph-prd.md` captures the lineage product requirements
- `docs/agentic-creative-autopilot-prd.md` captures the Autopilot product requirements
- `docs/creative-lineage-autopilot-qa-plan.md` outlines QA coverage for lineage and Autopilot flows
- `plans/creative-lineage-and-autopilot.md` summarizes the implementation plan behind the current lineage and Autopilot architecture
- `plans/layered-editor.md` summarizes the implementation plan behind the current layered editor architecture

## License

This project is released under the MIT License. See `LICENSE` for details.
