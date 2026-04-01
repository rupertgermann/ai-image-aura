# AURA AI

AURA AI is a local-first browser studio for generating, organizing, and editing AI images with the OpenAI Images API.

The app runs entirely in the browser. API keys, generated images, reference images, and archive metadata stay on the local device instead of passing through an application backend.

## Highlights

- Prompt-based image generation with `gpt-image-1.5`
- Prompt enhancement controls for style, lighting, palette, quality, aspect ratio, and background
- Reference-image workflows for guided generation and AI-assisted edits
- Local archive with search, image detail view, prompt copy, and keyboard navigation
- Bulk archive actions including multi-select, ZIP export, and bulk delete
- In-browser editor with brightness, contrast, saturation, filters, AI transforms, reset, overwrite, and save-as-copy flows
- Persistent UI state for theme, prompts, generation options, and editor controls
- Local-first storage powered by SQLocal and IndexedDB

## Tech Stack

- React 19
- TypeScript
- Vite 7
- SQLocal for browser-local SQLite metadata
- `idb-keyval` for binary and transient IndexedDB storage
- JSZip for ZIP downloads

## Runtime Requirements

- Node.js `20.19+` or `22.12+`
- npm `10+`

## Getting Started

```bash
npm install
npm run dev
```

Open the app in your browser, go to **Settings**, and enter an OpenAI API key to enable generation and editing.

## Available Scripts

```bash
npm run dev
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

## Application Overview

### Generate

The Generate view supports:

- Free-form text prompts
- Example prompt presets
- Quality options: `low`, `medium`, `high`
- Aspect ratio options: `auto`, `1024x1024`, `1536x1024`, `1024x1536`
- Background options: `auto`, `opaque`, `transparent`
- Style presets
- Lighting presets
- Palette presets
- Multiple reference image uploads via file picker or drag-and-drop
- Save-to-archive, download, and clear-result actions

When reference images are attached, the app switches from the image generation endpoint to the image edit endpoint so the request can include uploaded image inputs.

### Archive

The Archive view supports:

- Prompt-based search
- Multi-select image management
- Select-all and deselect-all actions
- ZIP export for selected images
- Bulk deletion with confirmation
- Image detail modal with prompt copy, metadata display, and reference preview
- Previous and next navigation from the detail modal with keyboard arrow support
- Create Similar to transfer prompt settings and references back into Generate

### Editor

The Editor view supports:

- Brightness, contrast, and saturation controls
- Quick visual filters
- AI transformation prompts applied to the current image
- Optional reference images for edit guidance
- Save changes in place
- Save as copy
- Reset controls back to defaults

Editor settings persist locally between sessions.

### Settings

The Settings view supports:

- Local OpenAI API key storage in the browser
- Immediate generation/edit availability once a key is stored

The sidebar also includes a persistent light and dark theme toggle.

## Storage Model

The application is designed as a local-first web app.

- OpenAI API keys are stored in browser `localStorage`
- View state and generation/editor preferences are stored in browser `localStorage`
- Generated images and reference image payloads are stored in IndexedDB via `idb-keyval`
- Archive metadata is stored in a browser-local SQLite database via SQLocal

There is no custom backend service in this repository.

## OpenAI Integration

The app calls the OpenAI Images API directly from the browser.

- Prompt-only generations use `POST /v1/images/generations`
- Reference-based generations and editor transforms use `POST /v1/images/edits`
- The configured model is `gpt-image-1.5`
- The app expects base64 image output and converts it to browser-safe data URLs for preview and persistence

Additional implementation details live in:

- `docs/openAI_image_generation.md`
- `docs/openAI_create_image.md`

## Privacy and Security

- This project is designed for local use in the browser
- Secrets are not committed to the repository
- The repository does not ship with embedded API keys, `.env` files, or private key material
- Sensitive OpenAI request payloads are not logged by the client helper

If you fork this project, keep the same standard for your own commits and issues.

## Project Structure

```text
src/
  components/      Reusable UI components
  db/              SQLocal adapter and archive types
  hooks/           Local state and archive hooks
  services/        IndexedDB-backed storage service
  utils/           OpenAI and file helpers
  views/           Generate, Archive, Editor, and Settings views
docs/
  10x-improvement-plan.md
  openAI_create_image.md
  openAI_image_generation.md
```

## Documentation

- `docs/10x-improvement-plan.md` outlines the roadmap
- `docs/openAI_image_generation.md` describes the current OpenAI integration model
- `docs/openAI_create_image.md` maps UI actions to the request formats used by the app

## License

This project is released under the MIT License. See `LICENSE` for details.
