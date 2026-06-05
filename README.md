# AURA AI

AURA AI is a local-first browser studio for generating, organizing, editing, and iterating on AI images with OpenAI and Google-hosted image models.

The app runs entirely in the browser. Provider API keys, generated images, reference images, layer assets, working session state, archive metadata, and lineage history stay on the local device instead of passing through an application backend.

## Screens

| Generate | Archive |
|----------|---------|
| ![Generate view](docs/screens/Generate.png) | ![Archive view](docs/screens/Archive.png) |

| Editor | Detail |
|--------|--------|
| ![Editor view](docs/screens/Editor.png) | ![Detail view](docs/screens/Detail.png) |

## Highlights

- Prompt-based image generation with `gpt-image-2` and `nano-banana-pro`
- `Single Shot` and `Autopilot` generation modes
- Goal-to-prompt translation, iterative scoring, and prompt refinement with selectable reasoning models: `gpt-5.4` and `gemini-2.5-flash`
- Provider-specific API key storage for OpenAI and Google
- Prompt enhancement controls for style, lighting, palette, and model-specific output settings
- Reference-image workflows for guided generation and AI-assisted edits
- Creative lineage tracking across generation, create-similar, editor saves, AI edits, save-as-copy branches, and Autopilot iterations
- Local archive with search, multi-select actions, layer-aware ZIP export, lineage-aware detail view, replay actions, fork actions, and keyboard navigation
- Layered in-browser editor with image layers, composition adjustments, AI result layers, non-destructive drafts, undo/redo, overwrite, save-as-copy, reset, and revert controls
- Persistent local UI state for prompts, model-specific generation settings, Autopilot settings, archive search, editor drafts, and editor controls
- Local-first persistence powered by SQLocal and IndexedDB

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

Open the app in your browser, go to **Settings**, and enter the provider keys for the models you want to use. OpenAI powers `gpt-image-2` and `gpt-5.4`; Google powers `nano-banana-pro` and `gemini-2.5-flash`.

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

- Image model selection between `GPT Image 2` and `Nano Banana Pro`
- Mode toggle between `Single Shot` and `Autopilot`
- Free-form text prompts plus example prompt presets
- Goal-to-prompt translation for Autopilot mode
- Reasoning model selection between `GPT 5.4` and `Gemini 2.5 Flash` in Autopilot mode
- `GPT Image 2` quality options: `low`, `medium`, `high`
- `GPT Image 2` size options: `auto`, `1024x1024`, `1536x1024`, `1024x1536`
- `GPT Image 2` background options: `auto`, `opaque`, `transparent`
- `Nano Banana Pro` aspect ratio options: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`
- `Nano Banana Pro` resolution options: `1K`, `2K`, `4K`
- Style, lighting, and palette modifiers that are merged into the request prompt
- Configurable Autopilot iteration count from `1` to `8`
- Configurable Autopilot satisfaction threshold from `50` to `100`
- Cost disclosure and confirmation before each Autopilot run, including the selected image and reasoning models
- Live Autopilot progress, best-iteration highlighting, and pause/cancel support
- Multiple reference image uploads through file picker and drag-and-drop
- `Nano Banana Pro` reference inputs are capped to the first `14` images for provider compatibility
- Reference preview modal with next and previous navigation
- Save-to-archive, download, and clear-result actions

Prompt-only `GPT Image 2` generations use the OpenAI generations endpoint. `GPT Image 2` requests with reference images use the OpenAI edits endpoint so the request can include uploaded image inputs. `Nano Banana Pro` generation and reference-guided generation use Google Gemini `generateContent` requests with text and inline image parts.

Autopilot reuses the current image model settings for every iteration, evaluates results against the goal with the selected reasoning model, refines the prompt between iterations, and keeps the best-scoring result as the primary output.

### Archive

The Archive view supports:

- Prompt-based search with persisted search text
- Multi-select image management
- Select-all and deselect-all actions scoped to the current filtered result set
- ZIP export for selected images together with archive manifests, lineage manifests, reference images, flattened images, and layer assets
- Bulk deletion with confirmation
- Image detail modal with prompt copy, metadata display, reference previews, lineage timeline, and step selection
- Lineage replay into Generate for generation, reference-generation, and Autopilot steps
- Lineage replay into Editor for replayable edit branches
- Fork-from-step actions for branching future saves from any recorded lineage step
- Autopilot lineage metadata including goal, iteration number, score, and evaluator feedback
- Previous and next navigation from the detail modal with keyboard arrow support
- Create Similar to transfer prompt settings and references back into Generate

The lineage detail view can display the currently selected archive image, an ancestor step, or a stored Autopilot iteration preview from the lineage metadata. Archive transfer helpers validate ZIP imports and report missing assets or broken parent references, while the app also supports manifest-based metadata recovery through URL parameters.

### Editor

The Editor view supports:

- A Konva-backed layered canvas with a locked base layer for the opened archive image
- Uploaded raster image layers that become part of the visible composition
- Layer selection, multi-selection, rename, visibility, opacity, move up/down, duplicate, and delete actions
- Direct move, scale, and rotation handles for the primary selected non-base layer
- Brightness, contrast, and saturation controls applied to the full composition
- Quick filters: `Normal`, `B&W`, `Sepia`, and `Soft`
- Collapsible Adjustments and Filters sections
- AI transformation prompts with selectable image models
- AI transforms targeted to selected visible non-base layers, or to the whole visible composition when no editable layer is selected
- AI result layers inserted non-destructively above the targeted layer selection
- Optional visual context reference images for edit guidance
- Unsaved editor drafts persisted per archive image
- Undo and redo for layer, adjustment, reference, and AI result changes
- Save changes in place
- Save as copy
- Reset Adjustments and Revert Draft controls

Editor saves are recorded in lineage as overwrite, save-as-copy, manual-edit, or AI-edit steps depending on the action taken. Layered images keep durable layer stack metadata and per-layer image assets alongside the flattened archive preview.

### Settings

The Settings view supports:

- Local OpenAI API key storage in the browser
- Local Google Gemini API key storage in the browser
- Saved-key status feedback and masked key entry
- Immediate model availability once the matching provider key is stored

The sidebar includes a collapsible navigation rail.

## Storage Model

The application is designed as a local-first web app.

- Provider API keys are stored in browser `localStorage`
- View state, generation drafts, model-specific generation settings, Autopilot settings, archive search, and editor drafts are stored in browser `localStorage`
- Current generated results and transferred reference payloads are stored in IndexedDB via `idb-keyval`
- Archive image metadata is stored in a browser-local SQLite database via SQLocal
- Layer stack metadata is stored with archive image metadata in SQLocal
- Flattened images, reference images, and per-layer image assets are stored in IndexedDB via `idb-keyval`
- Lineage metadata is stored in a browser-local SQLite database via SQLocal
- Archive ZIP bundles contain image files, reference files, layer asset files, `archive-manifest.json`, and `lineage-manifest.json`

There is no custom backend service in this repository.

## Provider Integration

The app calls provider APIs directly from the browser.

- OpenAI image generation uses `POST /v1/images/generations`
- OpenAI reference-based generation and editor transforms use `POST /v1/images/edits`
- OpenAI Autopilot reasoning uses `POST /v1/responses`
- Google image generation and editing use Gemini `generateContent`
- Google Autopilot reasoning uses Gemini `generateContent`
- Image models: `gpt-image-2`, `nano-banana-pro`
- Reasoning models: `gpt-5.4`, `gemini-2.5-flash`
- The app requests a single image per generation or edit operation
- Image responses are consumed as base64 payloads and converted into browser-safe data URLs for preview and persistence

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
