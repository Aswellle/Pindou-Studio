# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

> **See also**: `../AGENTS.md` for the broader repository overview.

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server on port 5280 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `node scripts/check-i18n.js` | Validate all 4 locale files have matching keys (zh-CN is the reference) |
| `npm run test` | Run tests in watch mode (Vitest) |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run test:ui` | Open Vitest browser UI |

## Critical: Color Resolution

canvasData stores **hex strings**, never brand IDs. The worker outputs brand IDs (`'P18'`), but `handleQuantizerApply` resolves them before storing:

```
Worker output: 'P18'  →  handleQuantizerApply resolveToHex()  →  '#F0B08A'  →  canvasData
ctx.fillStyle = '#F0B08A' ✓     ctx.fillStyle = 'P18' ✗ (renders black / NaN crash)
```

`ExportPanel` and `Gallery` each have their own local `resolveToHex` helper for canvas rendering.

## Canvas Data Format

```js
canvasData[y][x] = '#F0B08A'  // filled cell (hex string)
canvasData[y][x] = null        // empty cell
```

## Grid State

- `gridSize` — max dimension (used for square grids)
- `gridWidth` / `gridHeight` — actual dimensions (`null` = use `gridSize`)
- `cols = gridWidth || gridSize`, `rows = gridHeight || gridSize`

Square presets: 29, 57, 87, 114, 140, 170. Rectangular presets: 57×29, 87×58, 114×87, 140×105, 170×115 (landscape) and 29×57, 58×87, 87×114, 105×140, 115×170 (portrait). Custom: 9–200 per dimension (prompt accepts `WxH` or `W` for square).

## Tools

Four tools (stored in `App.jsx` `tool` state): `pencil`, `eraser`, `fill`, `hand`.

- **pencil** — click/drag to paint cells with `selectedColor`
- **eraser** — click/drag to clear cells (set to `null`)
- **fill** — flood-fill connected region of same color
- **hand** — pure pan mode; left-click anywhere pans, no drawing

`Tools.jsx` is a collapsible drawer — receives `collapsed` (bool) + `onToggleCollapse` props from `App.jsx`. When collapsed, width shrinks to 56px and content fades out; a chevron toggle button stays visible at the right edge.

## Canvas Pan/Zoom Interaction

Transform state: `{ scale, cx, cy }` where `cx/cy` = canvas center offset from container center.

Canvas.jsx constants: `CELL_SIZE = 16`, `MIN_SCALE = 0.3`, `MAX_SCALE = 5`, `BOUNDS_BOOST = 200`, `MOMENTUM_FRICTION = 0.88`.

**PC:**
- Grid starts centered (cx=0, cy=0)
- Mouse wheel: zoom in-place toward cursor
- **Hand tool active**: left-click anywhere → pan (no drawing at all)
- **Other tools**: left-click on canvas → draw; left-click drag off canvas → pan; left-click drag on canvas (pencil/eraser) → continue drawing stroke, pan only if cursor leaves grid
- Pan bounds: soft resistance via `BOUNDS_BOOST`. Grid can be freely dragged; bounce-back only kicks in when grid would disappear off-screen entirely (not a hard clamp to 0)

**Mobile:**
- Two-finger pinch: zoom toward pinch center (Apple Files PDF-style)
- Single tap on empty cell: fill with selected color
- Single finger on white space: pan with momentum/inertia
- Single finger on grid with drag >10px: pan mode (no batch fill while dragging)
- **Hand tool**: `gridPos` is not computed on touch start — entire surface pans

**Reset:** Double-click or "重置" button → scale=1, cx=0, cy=0

**Note:** `src/hooks/useGestures.js` is defined but **not actually used** — Canvas.jsx implements pan/zoom independently using refs and its own state (`transform = { scale, cx, cy }`).

All live canvas state lives in `App.jsx` `useState`. There is no separate store layer (an earlier Zustand-based `src/stores/` was removed) — read/write canvas state through `App.jsx` only.

## Image Quantization Algorithm

`src/workers/imageQuantizer.worker.js` — runs off the main thread via `src/hooks/useImageQuantizer.js`:

- **Palette selection**: K-means++ in Lab space
- **Color matching**: CIEDE2000 (not Euclidean)
- **Source sampling**: 7×7 px per output cell, max 3000px input
- **Dithering**: Floyd-Steinberg serpentine OR Bayer 4×4 ordered (on L channel)
- **Post-processing**: ICM spatial refinement when `outW ≤ 120`
- **Transfer**: Transferable ArrayBuffer (zero-copy)
- **Adjustments**: Brightness/contrast in linear RGB before Lab conversion

`src/utils/colorDiff.js` also exports standalone `rgbToLab`, `ciede2000`, and `findClosestColorCIEDE2000` — use these for UI-side color math instead of reimplementing.

## Palette Format

```js
{ id: 'P01', name: 'White', nameZh: '白色', hex: '#F2F2F2', rgb: { r: 242, g: 242, b: 242 }, category: 'neutral' }
```

Brand ID ranges: Perler `P01–P77`, Hama `H01–H56`, Artkal `C01–C72`.

`src/data/palettes/index.js` exports `findClosestColor(targetHex, paletteId)` with Lab caching.

## Templates

`src/data/templates.js` exports `TEMPLATES`, `CATEGORIES`, and `DIFFICULTIES`. Each template:

```js
{ id: 1, nameKey: 'bear', size: 29, difficulty: 'easy', category: 'animal', colors: ['#8D6E63', ...], pattern: [[...]] }
```

`nameKey` is the i18n lookup key: `t('templates.names.${template.nameKey}')`. Template names are **never stored as raw strings** — always resolve via `useTranslation()` before displaying or filtering.

## Responsive / Mobile Layout

`src/hooks/useResponsive.js` breakpoints: mobile `<640px`, tablet `640–1024px`, desktop `≥1024px`.

Mobile and tablet use separate component variants:
- `src/components/Tools/MobileToolbar.jsx` — replaces `Tools.jsx`
- `src/components/ColorPalette/MobileColorPalette.jsx` — replaces `ColorPalette.jsx`

`App.jsx` selects between desktop and mobile components based on `isMobile` / `isTablet`.

## i18n

Four locales in `src/i18n/locales/`: `zh-CN` (default fallback), `en-US`, `ja-JP`, `ko-KR`. Language is saved to and loaded from `localStorage` key `bead_studio_settings` (`{ language: 'zh-CN' }`). Use `useTranslation()` from `react-i18next` for all UI strings.

## localStorage Keys

| Key | Contents |
|-----|----------|
| `saved-works` | `Array<{ id, name, canvasData, gridSize, gridWidth, gridHeight, paletteId, savedAt }>` — Gallery saved works (managed via `useSavedWorks.js`) |
| `bead_studio_settings` | `{ language }` — app settings |
| `bead_studio_auth` | `{ id, email, name, createdAt }` — persisted auth session |
| `gallery-favorites` | `Array<number>` — favorited template IDs |
| `tutorial-progress` | `Array<string>` — tutorial IDs marked as read |

Old saved-works entries from before the schema gained `id`/`name`/`gridWidth`/`gridHeight`/`savedAt` are read with fallbacks (`work.gridWidth || work.gridSize`, `work.name || '作品 N'`, etc.) — see `Gallery.jsx`'s work-card rendering. `localStorage` has a ~5MB cap; `useSavedWorks.js` warns above 4MB and catches `QuotaExceededError`.

The Dexie (`src/services/db.js`) layer is present but **unused by Gallery** — Gallery reads/writes localStorage directly via the `saved-works` key through `useSavedWorks.js`. The Dexie schema defines `works`, `templates`, `settings`, and `favorites` tables if you want to migrate later.

## Undo / Redo State

History is managed by `src/hooks/useHistory.js` via `useReducer` + pure helpers in `src/utils/historyUtils.js`. The hook exposes `{ canvasData, canUndo, canRedo, setCanvas, resetCanvas, undo, redo }` and is the single source of truth for canvas state in `App.jsx`.

- `setCanvas(data)` — user draw operation; pushed onto undo stack (capped at 50 entries)
- `resetCanvas(data)` — destructive replace for template load, quantizer apply, grid resize
- `DRAW` dispatch — updates display without creating a history entry (used during drag strokes before mouseup)

## Desktop vs Mobile toolbar difference

Desktop `Tools.jsx` receives both `onUndo` and `onRedo`. Mobile `MobileToolbar.jsx` also receives both. Keyboard shortcuts (`Ctrl+Z` undo, `Ctrl+Y` / `Ctrl+Shift+Z` redo; `Cmd` on Mac) are registered in `App.jsx` via a `useEffect` on `window`.

## Canvas drawing: stroke vs display

Canvas.jsx distinguishes two phases of a drawing operation to keep history entries at stroke granularity (one entry per mouseDown→mouseUp, not per cell):

- **Mid-stroke** (`paintToStroke` / `applyFill`): mutates `strokeAccumRef.current` and calls `onDraw` → `drawCanvas` → `DRAW` dispatch (updates display, no history entry)
- **Commit** (`commitStroke`): called on `mouseUp`, `mouseLeave`, or when drag switches to pan — calls `onCanvasChange` → `setCanvas` → `PUSH` dispatch (creates the single undo step)

`startStroke()` snapshots `canvasData` into `strokeAccumRef` at `mouseDown`. `applyFill` reads and writes `strokeAccumRef.current` (not the `canvasData` prop) so repeated calls within threshold movement are idempotent.

## Known Issues

- **Auth**: localStorage-only regex validation, no backend.
- **useGestures unused**: The `useGestures.js` hook is defined but not imported anywhere — Canvas.jsx has its own separate pan/zoom implementation.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | All primary state and event handlers |
| `src/components/Canvas.jsx` | Grid rendering + pan/zoom interaction (see below) |
| `src/components/ImageQuantizer/ImageQuantizer.jsx` | Upload → quantize → apply modal |
| `src/hooks/useImageQuantizer.js` | Web Worker bridge |
| `src/workers/imageQuantizer.worker.js` | Core quantization algorithm |
| `src/data/palettes/index.js` | Palette data + CIEDE2000 matching with caching |
| `src/utils/colorDiff.js` | Standalone CIEDE2000 utilities (`rgbToLab`, `ciede2000`, `findClosestColorCIEDE2000`) |
| `src/services/BeadPatternExporter.js` | PNG/SVG export with realistic bead rendering |
| `src/services/colorUtils.js` | Color utilities (`resolveToHex`, `rgbToHex`, etc.) |
| `src/components/ExportPanel.jsx` | Export UI |
| `src/components/Gallery.jsx` | Template browser + saved works |
| `src/hooks/useResponsive.js` | Breakpoint detection |
| `src/i18n/index.js` | i18next setup + language persistence |
| `src/data/templates.js` | Built-in template patterns |
| `src/data/tutorials.js` | Tutorial definitions |
| `src/hooks/useHistory.js` | Canvas undo/redo via `useReducer`; exposes `setCanvas`, `resetCanvas`, `undo`, `redo` |
| `src/utils/historyUtils.js` | Pure history helpers (`pushHistory`, `undoHistory`, `redoHistory`) — tested independently |
| `src/hooks/useSavedWorks.js` | Saved-works localStorage sync with 4MB quota warning + `QuotaExceededError` handling |
| `src/hooks/useAuth.js` | localStorage-only auth (no backend) |
| `src/hooks/useGestures.js` | Mobile gesture hook (defined but **unused** — Canvas.jsx has its own implementation) |
| `src/components/ColorStatsBar.jsx` | Bead/color count + top-6 swatches; reads dims from `canvasData.length` not `gridSize` |
| `src/components/Tools/MobileToolbar.jsx` | Mobile toolbar (replaces `Tools.jsx` on mobile) |
| `src/components/ColorPalette/MobileColorPalette.jsx` | Mobile palette (replaces `ColorPalette.jsx` on mobile) |
| `开发报告.md` | Full changelog of recent upgrades (Chinese) |
| `系统架构与DB设计.md` | Full architecture doc (Chinese) |
| `重构PRD.md` | Product requirements (Chinese) |
| `prep-zoom.js` | One-off debug script (browser console paste) — not part of the app |

## Bead Pattern Export Styles

`BeadPatternExporter.js` (`generateBeadPatternSheet`) supports two rendering modes via `beadStyle`:

- **`'realistic'`** — radial-gradient circles with crescent highlight + center hole; for sharing/display
- **`'professional'`** — flat filled squares with brand color-code labels (e.g. `P18`); for crafting reference

`showCodes` (defaults to `true` when `beadStyle === 'professional'`) controls whether codes appear on each bead cell. `textColorForBg(hex)` picks `#1a1a1a` or `#b8b8b8` text via ITU-R BT.601 luminance. Professional mode adds bold gridlines every 10 cells after drawing beads.

The color legend panel groups colors into four tiers via `groupColorStats()`:
- **major** — ≥5% of total beads
- **minor** — 1–5%
- **accent** — <1% but ≥5 beads
- **trace** — <5 beads (flagged ⚠, red — buy carefully)

Bead rendering batches via `requestAnimationFrame` every 2000 beads; `onProgress('beads', 0–1)` feeds the progress bar in `ExportPanel`.

`ExportPanel` defaults `beadStyle` to `'professional'` and shows a style-selector dropdown. Three simpler exports (quick PNG circle-only, quick SVG, plain-text grid) bypass `BeadPatternExporter` entirely.

## Auth

`useAuth.js` is localStorage-only (no backend). Error messages use i18n keys (`errors.invalidEmail`, `errors.passwordTooShort`, `errors.passwordMismatch`) via `i18n.t()`.

## Vite Configuration

`vite.config.js` sets `port: 5280` and `host: true` — dev server is LAN-accessible on port 5280.

## Tailwind v4

Uses `@tailwindcss/postcss` plugin (not `tailwind.config.js` purge). Config only sets fonts and content paths via CSS `@theme` directive in `src/index.css`.
