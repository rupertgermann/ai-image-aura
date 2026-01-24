# AGENTS.md

This file is guidance for agentic coding assistants working in this repo.
Keep it updated when tooling or conventions change.

## Quick commands
- `npm install` to install deps.
- `npm run dev` start Vite HMR server.
- `npm run build` run `tsc -b` and Vite build.
- `npm run lint` run ESLint (`eslint .`).
- `npm run preview` preview production build.
- Tests: no test runner configured in `package.json`.
- Single-test runs are not available until a test runner is added.
- If you add tests, document the runner and single-test syntax here.

## Project map
- `src/App.tsx` root app shell and view routing.
- `src/views/*` top-level screens (Generate, Archive, Editor, Settings).
- `src/components/*` reusable UI pieces and modals.
- `src/hooks/*` shared hooks (`useLocalStorage`, `useImageArchive`).
- `src/services/*` browser storage providers (`StorageService`).
- `src/db/*` SQLite adapter and types.
- `src/utils/*` helper utilities (OpenAI client, file helpers).
- `src/index.css` + `src/App.css` global styles and theme tokens.

## Runtime architecture
- App state lives in `src/App.tsx`: view, theme, API key, toasts.
- Views receive callbacks from App instead of global stores.
- `useImageArchive` loads/saves via `SQLiteAdapter`.
- Image binaries are stored separately via `StorageService` (`idb-keyval`).
- LocalStorage keys use `aura_` prefix for UI state.
- `crypto.randomUUID()` is used for image ids.

## Storage system
- Metadata in SQLite (`sqlocal`) via `src/db/SQLiteAdapter.ts`.
- Binary data in IndexedDB (`idb-keyval`) via `src/services/StorageService.ts`.
- `SQLiteAdapter.saveImage` stores `img_{id}` and `ref_{id}_{idx}`.
- `SQLiteAdapter.getImages` rehydrates binaries and references.
- Add schema changes with `ALTER TABLE` + try/catch (see migrations).
- Keep metadata and binary storage consistent when deleting or updating.

## OpenAI integration
- Standard generations call `https://api.openai.com/v1/images/generations`.
- Edits with reference images call `https://api.openai.com/v1/images/edits`.
- Use multipart `FormData` for edits; do not set `Content-Type` manually.
- Use JSON for generations; set `Content-Type: application/json`.
- Model is `gpt-image-1.5` (see `src/utils/openai.ts`).
- Handle `response.ok` and throw `Error` with API message.
- Prompt modifiers append style/lighting/palette in Generate view.

## TypeScript + linting
- TS config is strict (`tsconfig.app.json`).
- `noUnusedLocals`/`noUnusedParameters` are enabled; avoid dead code.
- Prefer `unknown` over `any`; narrow types explicitly.
- Use `import type` for type-only imports.
- ESLint config in `eslint.config.js` is the source of truth.
- Fix lint issues before commit; do not disable rules without reason.

## Component + hook conventions
- Components are function components, often `const Name: React.FC<Props> = (...) => {}`.
- Props are declared with `interface NameProps`.
- Hooks live in `src/hooks` and start with `use`.
- Keep hook logic pure; side effects go in `useEffect`.
- Expose async actions that throw after setting error state (see `useImageArchive`).
- Default export components; named exports for utilities/hooks.

## Imports
- Order imports: external packages, internal modules, then `import type` lines.
- Keep React import style consistent with the file you edit.
- Use relative paths (no path aliases configured).
- Avoid deep relative chains when a nearby file exists; refactor carefully if needed.
- Do not introduce circular dependencies between `views`, `components`, and `hooks`.

## Formatting
- Indent with 4 spaces.
- Use single quotes in TS/JS strings.
- JSX attribute values use double quotes.
- Semicolons are mixed across files; keep the file's existing style.
- Keep JSX props on new lines when the list is long.
- Group related state hooks and handlers with blank lines between sections.
- Do not reformat unrelated code.

## Naming
- Components, types, and interfaces are PascalCase.
- Variables, functions, and hooks are camelCase.
- Constants are UPPER_SNAKE_CASE (arrays, enums, option lists).
- CSS class names are kebab-case (`aura-btn`, `glass-panel`).
- File names: PascalCase for components, camelCase for hooks/utils.

## State + data conventions
- Use `ArchiveImage` for persisted images (`src/db/types.ts`).
- `AppView` union in `src/types/index.ts` controls navigation.
- Persist UI settings with `useLocalStorage` and `aura_` keys.
- Store large binary data via `storage.save` instead of `localStorage`.
- When transferring references between views, use `storage` key `generate_transferred_references`.

## Error handling
- Prefer early returns for invalid state (missing API key, null image).
- Wrap async operations in try/catch and set user-facing error state.
- Log diagnostics with `console.error` for failures.
- Throw `Error` with a clear message when upstream should handle it.
- Avoid swallowing errors silently unless intentionally safe (document why).
- Do not show raw API responses to users.

## UI + CSS
- Reuse existing class patterns (`view-header`, `glass-panel`, `aura-btn`).
- Use existing layout patterns: header, grid, panel sections.
- Keep icons from `lucide-react` and sizes consistent with neighbors.
- Prefer `className` over inline styles; inline only for one-off tweaks.
- When adding theme tokens, update `src/index.css`.
- Keep accessibility in mind: labels for inputs, button titles as needed.

## Data safety
- Avoid storing secrets in code or localStorage; API key stored via `useLocalStorage` only.
- Do not log API keys or raw auth headers.
- Keep image data URLs out of console logs.

## Files to check when changing behavior
- `src/App.tsx` for view routing, toasts, theme.
- `src/hooks/useImageArchive.ts` for archive operations.
- `src/db/SQLiteAdapter.ts` for schema and persistence.
- `src/services/StorageService.ts` for binary storage.
- `src/utils/openai.ts` for API calls.

## Adding a new view
- Add component in `src/views` and export default.
- Update `AppView` union in `src/types/index.ts`.
- Update `renderView` switch in `src/App.tsx`.
- Add navigation entry in `src/components/Sidebar.tsx`.
- Wire any localStorage keys with `aura_` prefix.

## Adding new metadata fields
- Add field to `ArchiveImage` in `src/db/types.ts`.
- Add column to SQLite via `ALTER TABLE` migration in `SQLiteAdapter.init`.
- Update `INSERT OR REPLACE` columns and values.
- Handle reading/writing in `saveImage` and `getImages`.
- Consider default values for older rows.

## Performance + cleanup
- Revoke object URLs created via `URL.createObjectURL`.
- Clean up event listeners in `useEffect` return.
- Avoid re-render loops by memoizing callbacks when passed to hooks.
- Do not store large arrays in localStorage.

## Dependencies
- UI icons use `lucide-react`.
- ZIP downloads use `jszip`.
- SQLite in browser uses `sqlocal` plus Vite plugin.
- Storage uses `idb-keyval`.
- React 19 + Vite 7 + TypeScript 5.9.

## Tests (future)
- No test directory or config found.
- If adding Vitest, prefer `*.test.tsx` colocated near source.
- If adding Jest, configure `jest.config` and update scripts.
- Keep tests deterministic and browser-safe.

## Cursor/Copilot rules
- No `.cursor/rules` directory present.
- No `.cursorrules` file present.
- No `.github/copilot-instructions.md` file present.
- If added, mirror their content here.

## Change discipline
- Keep edits focused; avoid drive-by formatting changes.
- Match existing patterns in the file you touch.
- Update `AGENTS.md` if you introduce new commands or tooling.
- Prefer small, composable helpers in `src/utils`.
- When adding dependencies, update `package.json` and note why.

## Local dev notes
- Vite uses `sqlocal/vite` plugin; do not remove from `vite.config.ts`.
- Run `npm run build` before release to catch TS errors.
- Use modern browsers that support IndexedDB and `crypto.randomUUID`.
- If `sqlocal` fails, clear site storage and reload.
