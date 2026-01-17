# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aura is an AI image manager application built with React 19 + TypeScript + Vite. It uses OpenAI's GPT-Image-1.5 API for image generation and editing, with a local SQLite database (via SQLocal) for persistence.

## Commands

```bash
npm run dev      # Start development server (Vite HMR)
npm run build    # TypeScript check + production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

## Architecture

### Data Flow
- **App.tsx** is the root component managing global state: current view, theme, API key, toasts, and image archive
- Views receive callbacks from App and call services/hooks for data operations
- **useImageArchive** hook provides images state and CRUD operations via SQLiteAdapter
- **useLocalStorage** hook persists UI settings (prompt, quality, theme, etc.)

### Storage Layer (Two-Part System)
1. **SQLiteAdapter** (`src/db/SQLiteAdapter.ts`) - Metadata storage in IndexedDB-backed SQLite via SQLocal
   - Stores image metadata (prompt, quality, aspectRatio, style, timestamps)
   - Uses `INSERT OR REPLACE` for upserts
   - Handles schema migrations via `ALTER TABLE` with error catching
2. **StorageService** (`src/services/StorageService.ts`) - Binary blob storage via idb-keyval
   - Stores actual image data URLs with `img_{id}` keys
   - Stores reference images with `ref_{id}_{index}` keys

### Views
- **GenerateView** - Image generation with prompt (with example suggestions), quality, aspect ratio, background, style/lighting/palette options, and reference images
- **EditorView** - Canvas-based image editing with brightness/contrast/saturation sliders, filters, and AI-powered transformations
- **ArchiveView** - Image gallery with search, bulk selection, ZIP download, and delete
- **SettingsView** - API key configuration

### Key Patterns
- Reference images are passed to OpenAI API via multipart form-data when present (uses `/images/edits` endpoint)
- Standard generation uses JSON body to `/images/generations` endpoint
- Style, lighting, and palette selections are appended to prompts (e.g., "35mm film still, golden hour, color palette: copper + teal + cream")
- Example prompts dropdown provides creative subject suggestions
- "Create Similar" feature transfers all generation settings + reference images to GenerateView via localStorage

### Vite Configuration
The project uses `sqlocal/vite` plugin which is required for SQLite WASM to work properly in the browser.

## Types

- `ArchiveImage` (`src/db/types.ts`) - Core image entity with id, url, prompt, quality, aspectRatio, background, timestamp, model, width, height, references, style, lighting, palette
- `AppView` (`src/types/index.ts`) - Navigation views: 'generate' | 'archive' | 'editor' | 'settings'

## LocalStorage Keys

All app settings use `aura_` prefix:
- `aura_current_view`, `aura_openapi_key`, `aura_theme`
- `aura_generate_prompt`, `aura_generate_quality`, `aura_generate_aspect_ratio`, `aura_generate_background`, `aura_generate_style`, `aura_generate_lighting`, `aura_generate_palette`, `aura_generate_is_saved`
- `editor_brightness`, `editor_contrast`, `editor_saturation`, `editor_filter`
