# Plan: Telepathic Instruments UI Rebrand

> Source PRD: https://github.com/rupertgermann/ai-image-aura/issues/18

## Architectural decisions

- **Single source of truth:** `src/index.css` `:root` holds all DESIGN.md tokens verbatim. Components reference tokens, never hardcoded hex.
- **No theme switching:** `[data-theme]` block deleted. Light canvas is the only theme.
- **Font substitution at CSS variable level:** `--font-suisse-intl` and `--font-suisse-intl-mono` stacks include licensed font names first so a future swap requires editing one stack only.
- **Button variants:** CSS utility classes (`.btn-primary`, `.btn-amber`, `.btn-ghost`, `.btn-text-link`). No new component wrapper needed.
- **Sidebar width:** `--sidebar-width: 280px` preserved.
- **Delivery:** All phases land in one PR (big-bang rebrand, atomic diff).
- **Glass blur exception:** backdrop blur allowed only in hero overlays or full-screen image viewers, nowhere else.

---

## Phase 1: Token Foundation

**User stories:** 1, 4, 5, 24, 26, 27, 28, 32

### What to build

Replace the entire `:root` block in `src/index.css` with DESIGN.md tokens verbatim. Update the Google Fonts `@import` to load Inter + JetBrains Mono. Set `body` to Canvas background, Charcoal text, Suisse Intl font stack. Delete `[data-theme="light"]` block and all dead tokens: `--accent-gradient`, `--accent-primary`, `--accent-secondary`, `--glass-blur`, `--glass-shadow`, `--bg-card`, `--border-glass`, `--bg-deep`, `--bg-main`. Keep `--sidebar-width: 280px` and `body { overflow: hidden }`.

After this phase the app will look broken (components still reference old token names) but every downstream phase has a clean foundation to target.

### Acceptance criteria

- [ ] `src/index.css` `:root` contains exactly the tokens from DESIGN.md Quick Start block and no others (except `--sidebar-width`, `--content-max-width`, transition helpers).
- [ ] Google Fonts URL loads `Inter` and `JetBrains+Mono` in one `<link>` (or `@import`).
- [ ] `--font-suisse-intl` stack: `'Suisse Intl', 'Inter', ui-sans-serif, system-ui, ...`
- [ ] `--font-suisse-intl-mono` stack: `'Suisse Intl Mono', 'JetBrains Mono', ui-monospace, ...`
- [ ] `body` uses `var(--color-canvas)` bg, `var(--color-charcoal)` color, `var(--font-suisse-intl)` family.
- [ ] `[data-theme="light"]` block is gone.
- [ ] All six deleted token names grep-zero in `src/index.css`.

---

## Phase 2: App Shell + Sidebar

**User stories:** 8, 9, 10, 11, 12, 31

### What to build

Remove the dark/light theme toggle from `src/App.tsx` and any persistence logic in `src/app/useAppPreferences.ts`. Strip the toggle's DOM node and any `data-theme` attribute setting. Restyle `src/components/Sidebar.tsx`: Charcoal (`--color-charcoal`) background, Snow (`--color-snow`) text, `--font-suisse-intl-mono` at 16px, 6px horizontal padding between items, hover → Steel text, active item → Amber Glow background or text per spec. Width stays 280px. Remove any glass blur or gradient from sidebar surface.

### Acceptance criteria

- [ ] No theme toggle rendered anywhere in the app.
- [ ] No `data-theme` attribute set anywhere in JS.
- [ ] Sidebar background = `#000000` (Charcoal).
- [ ] Sidebar nav items use Snow text, JetBrains Mono / Suisse Intl Mono, 16px.
- [ ] Active nav item highlighted in Amber Glow (`#ff6c2f`).
- [ ] Sidebar hover state changes to Steel (`#a3a3a3`).
- [ ] No `backdrop-filter` or `blur` on sidebar surface.
- [ ] No purple/cyan gradient in sidebar or app shell.
- [ ] `src/App.css` contains no glass, gradient, or theme-switching styles.

---

## Phase 3: Button System

**User stories:** 2, 3, 7, 14, 15, 18, 29, 30

### What to build

Define four button variant utility classes in `src/index.css`:

- `.btn-primary` — Charcoal bg, Snow text, 24px radius, 14px/16px padding, Suisse Intl 400.
- `.btn-amber` — Amber Glow bg, Snow text, 24px radius, 14px/16px padding, Suisse Intl 400.
- `.btn-ghost` — Transparent bg, Snow text, 0px radius, 8px padding, 1px Steel border, Suisse Intl Mono 400.
- `.btn-text-link` — Transparent bg, Charcoal text, 24px radius, 0px vertical / 16px horizontal padding, Suisse Intl 400.

Apply mapping across all views and components:
- Generate (main action), Save/Apply (Editor), Confirm-destructive → `.btn-amber`
- Standard primary adds (Add, Open, Submit non-CTA) → `.btn-primary`
- Cancel, dismiss, secondary → `.btn-ghost`
- Inline nav, "see more", textual jumps → `.btn-text-link`

Document the old-to-new class mapping in the PR description (not in code).

### Acceptance criteria

- [ ] Four CSS classes defined in `src/index.css`, no hardcoded hex values (all via tokens).
- [ ] Generate view: "Generate" button uses `.btn-amber`.
- [ ] Editor view: Save/Apply = `.btn-amber`, Cancel = `.btn-ghost`.
- [ ] ConfirmModal: destructive action = `.btn-amber` or `.btn-primary` per severity, cancel = `.btn-ghost`.
- [ ] No button anywhere still uses old gradient or glass styling.
- [ ] `grep -r 'accent-gradient\|A855F7\|06B6D4' src/` returns zero hits.

---

## Phase 4: Components

**User stories:** 6, 16, 17, 20, 21, 22

### What to build

Restyle four shared components:

**ImageCard** (`src/components/ImageCard.tsx`): transparent background, 0px radius, no box-shadow, no padding on card frame, image flush to edges, caption below in Suisse Intl Mono 12px Steel (`--color-steel`), element gap 8–12px.

**Modals** (`src/components/ConfirmModal.tsx`, `ImageDetailModal.tsx`, `ReferenceImageModal.tsx`): Snow card (`--color-snow`) centered on Canvas overlay (`rgba(229,231,235,0.85)` or similar). 0px border radius. No box-shadow. Button variants per Phase 3 mapping.

**Toast** (`src/components/Toast.tsx`): Charcoal surface, Snow mono text, 24px border radius.

**CustomSelect** (used in `src/views/GenerateView.tsx`): strip color swatches entirely. Values rendered in Suisse Intl Mono. Dropdown panel = Snow surface, 0px radius, 1px Steel border. Selected/hovered row: Charcoal text on Mercury or Amber Glow background.

### Acceptance criteria

- [ ] ImageCard: `border-radius: 0`, no shadow, transparent bg, Steel mono caption at 12px.
- [ ] All three modals: Snow card, Canvas/translucent overlay, 0px radius, no shadow.
- [ ] Toast: Charcoal bg, Snow text, 24px radius, mono font.
- [ ] CustomSelect: no color swatches in DOM, mono font for values, Snow dropdown panel, 0px radius.
- [ ] No `backdrop-filter` on any of these components.
- [ ] ReferenceImageModal inner cards match flat Snow style.

---

## Phase 5: Form Inputs + View Spacing

**User stories:** 19, 23, 25

### What to build

Apply Form Input spec to every `<input>`, `<textarea>`, and `<select>` across `GenerateView.tsx`, `EditorView.tsx`, and `SettingsView.tsx`: transparent background, Steel bottom border only (`border-bottom: 1px solid var(--color-steel)`), 0px border radius, 0px vertical padding / 12px horizontal padding, Suisse Intl Mono font, Steel placeholder color.

Apply spacing system across all views: 40px section gaps between major blocks, 8px element gap, 12px card padding where content blocks exist. Remove any remaining glass blur or gradient decoration from view-level containers.

### Acceptance criteria

- [ ] All form inputs: transparent bg, Steel bottom border, 0px radius, mono font, Steel placeholder.
- [ ] No visible border on top/left/right of inputs (bottom-only).
- [ ] Section gaps between major content blocks = 40px across Generate, Editor, Archive, Settings views.
- [ ] No `backdrop-filter` on any view-level container.
- [ ] No remaining purple/cyan gradient in any view.
- [ ] Display headline (if used) at 100px, -0.03em tracking.

---

## Phase 6: QA Pass

**User stories:** 33, 34

### What to build

Final sweep to close gaps and verify the rebrand is complete and ship-ready. Run the toolchain. Fill the manual visual walkthrough checklist (copy from PRD into PR description and check each item).

### Acceptance criteria

- [ ] `npm run lint` — zero errors.
- [ ] `npm run typecheck` — zero errors.
- [ ] `npm test` — all existing Vitest tests pass.
- [ ] `npm run build` — clean build, no warnings about missing tokens.
- [ ] Manual checklist fully signed off:
  - [ ] App boots on Canvas background, Charcoal text, no theme toggle visible.
  - [ ] Sidebar: Charcoal bg, Snow mono items, Amber Glow active state, 280px width.
  - [ ] Generate view: Generate button = Amber Glow; secondary = Ghost or Charcoal; CustomSelect text-only mono.
  - [ ] Editor view: Save/Apply = Amber Glow; Cancel = Ghost.
  - [ ] Archive view: tiles flat, 0px radius, mono captions in Steel.
  - [ ] Settings view: form inputs flat with Steel bottom border, mono values.
  - [ ] Modals (Confirm, ImageDetail, ReferenceImage): flat Snow card on Canvas overlay, 0px radius, no shadow.
  - [ ] Toast: Charcoal surface, Snow mono text.
  - [ ] No purple/cyan gradient anywhere in chrome.
  - [ ] No glass blur on cards, sidebar, modals, dropdowns.
  - [ ] `grep -r 'A855F7\|06B6D4\|accent-gradient\|glass-blur\|glass-shadow\|data-theme' src/` returns zero hits.
