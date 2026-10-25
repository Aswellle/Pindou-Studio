# 🎨 Bead Studio · 拼豆Studio

> **Iron every spark of inspiration, bead by bead.** A professional online bead-pattern design tool — from pixels to physical beads, all in one place.

[![CI](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml)
[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/Aswellle/badge.svg)](https://hub.xerj.org/contributors/Aswellle)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-BaaS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![i18n](https://img.shields.io/badge/i18n-4%20Languages-4A9B8E)](https://www.i18next.com)
[![Tests](https://img.shields.io/badge/tests-1891%20passing-4A9B8E)](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml)

[中文](README.md) · **English**

**6 bead brands · 1,039 colors · 4 languages · 24 tutorials · Cloud accounts & personal bead inventory**

Bead Studio is a ready-to-use online bead-pattern tool. It doesn't stop at drawing — it connects every step between "a photo / someone else's finished piece / a vague idea" and "a sheet you can actually follow at the table": freehand drawing, image-to-pattern conversion, screenshot recognition, brand remapping, personal bead inventory, professional export, a cloud template library, and version history for your works.

**No account needed.** Drawing, conversion, chart import and export all work offline. An account is only for syncing works across devices and managing your personal bead palettes.

⭐ **If this project helps you, please consider giving it a [Star](https://github.com/Aswellle/Pindou-Studio) — it keeps the polishing going.**

---

## ✨ Highlights

| | What it gives you |
|---|---|
| 🖼️ | **One-click image → pattern** — turn a photo into a bead pattern in seconds, with automatic grid and color-count matching; `lab` (CIEDE2000) or `oklab` color space; accepts PNG / JPEG / WebP / GIF / AVIF / **HEIC** / **PDF** |
| 📐 | **Read an existing chart from a photo** — shoot someone's finished piece or scan a printed chart; the grid is detected automatically, with **four-point perspective correction** and per-cell manual fixes when it gets one wrong |
| 📄 | **Professional export** — brand color codes, four-tier color list, row/column rulers, physical DPI — ready to follow bead by bead |
| 🎨 | **6 brand palettes (1,039 colors)** — COCO / MARD / MARD 291 / Perler / Hama / Artkal, with CIEDE2000 nearest-neighbor remapping between brands |
| 🧺 | **Personal palettes & inventory** — build your own palettes, bulk-import CSV/JSON, record how many of each color you own, match a pattern against your stock, and optionally deduct on export |
| ☁️ | **Cloud accounts** — email OTP or custom accounts (username + security key), cropped avatar upload, works synced across devices, and **version history you can roll back** |
| 🌐 | **4 languages** — browser auto-detect, `?lang=` deep links; 1,708 UI strings, tutorials and exported sheets fully covered |
| 📖 | **24 illustrated tutorials × 4 languages** — six sections, from "what is a fuse bead" to a "rescue manual" for failed fuses, fact-checked against official sources |
| 🛠️ | **Admin console** — template CRUD + JSON import + category management + **theme/collection curation** + gallery home layout + user dashboard + message inbox |
| 📱 | **Mobile first** — pinch zoom, one-finger inertial panning, and selection commands that label every action and wrap instead of hiding; as comfortable on a phone as on a desktop |

---

## 🖊️ Core features

### Canvas drawing

- **Seven tools** — pencil / eraser / fill bucket / hand / eyedropper / **rectangular selection** / **freehand lasso**
- **Flexible sizes** — square presets 29 / 57 / 87 / 114 / 140 / 170; landscape & portrait rectangle presets; custom 9–200 per side
- **Pan / zoom** — desktop: wheel zoom toward the cursor + drag to pan; mobile: pinch to zoom + one-finger inertial panning; 0.3×–5× range
- **Undo / redo** — 50-step history at stroke granularity (`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`, `Cmd` on Mac)
- **Two-layer canvas rendering** — committed layer + overlay layer, so live strokes paint straight to the canvas instead of piling up React re-renders
- **Autosaved drafts** — written to IndexedDB 2 s after you stop; reopening the canvas after a refresh or an accidental close offers to restore
- **Brand-switch preview** — see the per-color mapping and impact before committing, then choose "re-label only" or "convert colors and switch"

### 🎯 Selection editing (rectangle + lasso)

- **Two kinds of selection** — drag a rectangle, or trace any shape with the lasso; the lasso is a bitmap mask, so concave and holed shapes are followed exactly
- **Drag to move** — press inside the selection and drag to move its contents; one history entry on release. Out-of-bounds offsets are **clamped, not clipped**, so nothing silently falls off the canvas
- **Eight resize handles** — four corners plus four edge midpoints, with the opposite anchor pinned; the hit area adapts to the pointer type (24 px touch / 10 px mouse)
- **Copy-drag** — `Alt`/`Option` + drag on desktop, or the "Drag copy" switch on the toolbar (touch has no modifier keys)
- **Commands** — fill / erase / copy / cut / paste / mirror horizontally / mirror vertically / rotate CW / rotate CCW / clear selection
- **Long-press menu** — on mobile, press and hold inside the selection for a context menu (500 ms; cancelled once the finger moves more than 10 px)
- **Edge snapping (off by default)** — snaps to existing bead edges; off by default because it fights the pointer, on when you want pixel-exact edges
- **Live preview** — the marquee tracks your pointer frame by frame and keeps marching after it lands; line weight and dashes are compensated by zoom, so it looks the same at 0.3× and 5×

### 🖼️ Image → pattern (color-science grade)

- **Automatic grid** — content analysis (edge density + unique-color ratio) suggests a long side of 57 / 87 / 114 / 140, capped by source resolution (≈2 source pixels per bead minimum)
- **Automatic color budget** — 12 / 24 / 36 / 48 / 64 colors suggested from the grid's long side, kept in sync with size
- **Image-type adaptation** — detects logo / illustration / portrait / landscape and adjusts the color budget and dithering strategy accordingly
- **Selectable color space** — `lab` (CIEDE2000 perceptual difference, default) or `oklab` (OKLab Euclidean)
- **K-means++ palette selection** — optional edge/saliency-weighted sampling; 7×7 px per output cell, 3000 px input cap
- **Energy-function protection** — edge strength + saliency build a protection map used by palette sampling, ICM fidelity weighting and error-diffusion gating
- **Dithering** — Floyd–Steinberg serpentine / Bayer 4×4 ordered, chosen by image type by default
- **Spatial refinement** — ICM iterations when the short side is ≤120, plus isolated-bead cleanup and checkerboard suppression
- **Selection-time gate** — type + 30 MB + 40 megapixel checks; pixel count is read from the **PNG IHDR / JPEG SOF header before decoding** (catches flat-color pixel art that is tiny on disk but huge in pixels), with a visible, localized message when rejected
- **HEIC / PDF read directly** — iPhone-native photos and printed chart PDFs need no pre-conversion; the two decoders (heic-vendor ~3.2 MB, pdf-vendor ~0.5 MB) load on demand as separate chunks and never enter the main bundle
- **Zero-copy** — Web Worker + Transferable ArrayBuffer, so quantization never blocks the UI thread

### 📐 Chart import (`/import`)

Two kinds of input go through **two different pipelines** — deliberately not merged:

- **Project file** — a `.pindou.json` project or a template JSON: validate → preview → save as a private work or load straight into the canvas. On failure the canvas and storage are untouched; you get a categorized error instead
- **Chart screenshot** — a photo or scan of an existing bead chart: detect the row/column grid and its borders → **four-point perspective correction** to undo camera skew → adjust dimensions, drag the frame, switch palette, toggle blank detection → fix individual cells by hand → load or save
- **Cross-session recovery** — manual corrections are remembered, so an accidental close doesn't throw away the fixing work

### 🎨 Six bead brand palettes

| Brand | Code range | Colors | Notes |
|------|---------|--------|------|
| COCO | A–Z group codes | 291 | 2.6 mm mini beads, grouped A–Z |
| MARD | 9 official color families | 221 | 5 mm, the de-facto standard in the Chinese chart ecosystem |
| MARD 291 | Standard 221 + extended | 291 | 5 mm, more complete series |
| Perler | P01 – P80 | 80 | Widest color range, best for beginners |
| Hama | H01 – H56 | 56 | Soft Nordic tones |
| Artkal | C01 – C100 | 100 | Rich metallic / fluorescent colors |

Any pattern can be remapped to another brand by CIEDE2000 nearest color (the brand badge on a gallery card is the conversion entry point); drawing, gallery and export all follow the currently selected brand.

### 🧺 Personal palettes & inventory (`/my/beads`)

Three workspaces; data lands in Supabase when signed in (RLS: own rows only) and on the device otherwise:

- **My palettes** — create, duplicate a built-in palette, full color CRUD; each color can record where its hex came from (official / measured / eyeballed)
- **My inventory** — record "do I own it" and "how many" per color, as a draft you commit when ready, so it never interrupts editing
- **Pattern matching** — pick a target palette, see what your stock can cover, preview temporarily, then apply explicitly; both missing colors and short quantities are called out
- **Bulk import** — CSV / JSON with a downloadable template; the import previews "N importable / problem rows" and writes nothing unless every row is valid
- **Backup & restore** — export/import your palettes and inventory. Import is a **merge, not an overwrite**: same-id entries are skipped, and an invalid file is rejected wholesale
- **Export bookkeeping** — an optional switch (off by default): after a successful export, deduct the pattern's actual bead counts from inventory, auto-marking colors at zero as out of stock

> **The canvas stores hex only.** Deleting a personal palette can never turn a saved pattern black.

### 📄 Pattern export

- **New export engine (V2, on by default)** — a unified `PatternDocument` model rendered to PNG (raster) or SVG (vector), with identical color, coordinate, numbering, legend and layout semantics; a single checkbox switches back to the legacy engine
- **Two styles** — professional (flat squares + brand color codes, for crafting) / realistic (3D-looking beads, for sharing)
- **Sheet-level information** — header (size / total beads / colors used / palette / date), row rulers on both sides plus a column ruler on top, color legend in four tiers (major / minor / accent / trace, with ⚠ purchase warnings for trace colors) and the brand mark
- **Quality presets** — screen 300 DPI / high 432 DPI / print 576 DPI, which genuinely drive the supersampling factor and report the one actually used
- **Five outputs** — pattern PNG / pattern SVG / quick PNG / quick SVG / plain-text color index, plus a `.pindou.json` project file for further editing
- **High-resolution output** — 3× supersampling of logical pixels (auto-degrades by device and canvas area), `toBlob` encoding to avoid doubling memory, with the actual resolution reported in the panel
- **Long-task friendly** — renders in batches of 2,000 beads with progress reporting; closing the panel aborts the export (AbortSignal)

### ☁️ Accounts · Profile · Admin

- **Two registration methods** — email OTP (6-digit codes for sign-up / sign-in / reset, no external links needed) or custom accounts (username + password + optional security key for recovery)
- **Works synced across devices** — signed-in works live in the Supabase `works` table, otherwise in IndexedDB on the device; the first sign-in migrates local works to the cloud and reports how many were synced
- **Version history** — **one explicit save = one version**, up to 20 kept per work; compare, roll back, and the rollback itself becomes a version (otherwise a wrong rollback would be unrecoverable)
- **Profile** (`/profile`) — three sections: overview (stats and shortcuts) / my works (grid, search, version history, delete) / my favorites
- **Avatar** — a hand-built circular cropper (drag / wheel / pinch, 240×240 webp output) uploading to Supabase Storage
- **Admin console** (`/admin`) — six tabs: template CRUD, JSON import, category management, **content curation** (themes/collections + gallery home sections + content health checks), user dashboard, message thread replies
- **Admin overview** (`/admin/dashboard`) — user-growth KPIs, a 14-day registration trend chart, library size and distribution, top templates, pending messages, content health checks and quick actions
- **Shared gate** — `AdminGate` handles four states (cloud not configured / checking session / signed out / not an admin); tabs support deep links such as `/admin?tab=users`

### 📚 Gallery · Tutorials · i18n

- **Gallery** (`/gallery`) — the template library only: URL-synced search / category / difficulty / **color-count** filters, favorites, download counts, brand badge and conversion, export menu, plus a degraded banner with retry when the cloud is unavailable
- **Curated content** — theme pages (`/gallery/theme/:slug`), collection pages (`/gallery/collection/:slug`) and pattern detail pages (`/gallery/pattern/:id`); themes support **two levels of nesting** (sub-themes + related collections), so the hierarchy can't grow without bound
- **Configurable home** — the admin decides which sections the gallery home shows, in what order, how many items each, and with what title; a theme or collection can be pulled out as its own section
- **24 illustrated tutorials × 4 languages** — six sections: getting started / ironing / preventing warping / color design / advanced techniques / protecting finished pieces
- **Complete i18n** — 1,708 UI strings × 4 languages; only `zh-CN` is bundled inline, while `en/ja/ko` (and tutorial data) load on demand

### 🔐 Security & compliance

- **Row-level security (RLS)** — templates/categories anon read-only, works readable and writable only by their owner, avatars and personal palettes/inventory writable only by their owner, admin write access
- **Function-level guards** — every admin RPC is `security definer` and checks `is_admin()` internally
- **Auth as the credential** — authentication via Supabase Auth (OTP / custom accounts); contact messages support Turnstile session trust plus rate limiting
- **Two independent admin criteria** — `is_admin()` requires the `admin` role **and** membership in the `admin_allowlist` table (no client policies on it; maintained by service_role only, with atomic helpers `admin_grant_by_email` / `admin_revoke_by_email`). **Flipping `profiles.role` alone no longer grants admin access.**
- **Two-factor authentication for admins** — `/admin/login` supports TOTP: once a factor is enrolled, an aal2 verification is required before reaching the console. After enrolling, set `security_settings.admin_require_mfa = true` and the **server** enforces aal2 on every admin request.
- **Audit trail** — role changes and allowlist edits are written by database triggers (`admin_audit_log`, unforgeable from the client) and readable by admins through `admin_list_audit()`
- **Read-only metadata** — the user dashboard exposes only what operations need (email / nickname / role / confirmation state / registration and sign-in times), never sensitive fields
- **Privilege-verification script** — `scripts/verify-rls.mjs` runs against a real Supabase project, checking cross-user read/write, anonymous rejection and admin RPC boundaries

---

## 🚀 Getting started

### Requirements

- Node.js 22+ (see `.nvmrc`; CI pins 22.x)
- npm 10+

### Install & develop

```bash
git clone https://github.com/Aswellle/Pindou-Studio.git
cd Pindou-Studio
npm install
npm run dev
```

The dev server runs at **http://localhost:5280** (also reachable on your LAN at `http://<your-ip>:5280`).

### Commands

```bash
npm run dev              # dev server (HMR)
npm run build            # production build (font CSS → bundle → prerender → share cards)
npm run preview          # preview the production build

npm run test             # tests (watch)
npm run test:run         # tests (single run, CI mode)
npm run test:ui          # Vitest browser UI

npm run check-i18n       # verify all 4 locale files share the same keys and interpolation vars
npm run check-migrations # verify Supabase migrations: unique versions + balanced $$
npm run lint             # Biome static analysis

npx vitest run src/utils/imageGuard.test.js   # run a single test file
```

### Cloud configuration (optional)

Without environment variables the site runs in **pure local mode** (built-in templates + IndexedDB + localStorage) — canvas, export, tutorials and import all work. Configure it to enable accounts, the cloud template library and personal palettes:

```bash
# .env.local
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_TURNSTILE_SITE_KEY=<optional-turnstile-site-key>
```

The schema is defined by **27 migration files** under `supabase/migrations/` (idempotent — safe to re-run). **Do not set `profiles.role` by hand** to create an admin — use `select public.admin_grant_by_email('your@email')`, which writes the allowlist and the audit log atomically.

---

## 🏗️ Tech stack

| Layer | Technology |
|----|------|
| Framework | React 18 + Vite 6 + React Router 7 (path routing, separate desktop/mobile layouts) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) + handcrafted warm design tokens (CSS variables) |
| Cloud | Supabase (PostgreSQL + Auth + Storage + RLS + `security definer` RPC) |
| i18n | react-i18next 17 / i18next 26, 4 languages (`zh-CN` inline, the rest lazy-loaded) |
| Color science | CIEDE2000 / OKLab (K-means++ and color matching both inside a Web Worker) |
| Image decoding | libheif-js (HEIC) + pdfjs-dist (PDF), dynamically imported and code-split |
| Data viz | Recharts 3 (admin overview registration trend, lazy-loaded) |
| State | React `useState` / `useReducer` (no global store; the undo stack is a reducer) |
| Local storage | IndexedDB primary (works / drafts / versions) + a localStorage compatibility layer and preferences |
| Icons / fonts | lucide-react; Noto Sans SC + LXGW WenKai (desktop-only, dynamically loaded) |
| Testing | Vitest 4 + @testing-library/react (jsdom), **1,891 tests / 115 files** |
| Static analysis | Biome 2 |
| Monitoring | Vercel Analytics + Speed Insights |
| Deployment | Vercel (auto-deploy on push to `main`) + Supabase |

---

## 🔬 Image quantization pipeline

```
User uploads an image
    ↓ selection gate (type / 30 MB / 40 MP; PNG IHDR · JPEG SOF header read before decoding)
    ↓ HEIC / PDF rasterized to PNG first (dynamic import, never in the main bundle)
useImageQuantizer.js (downsamples to ≤3000 px on the main thread, Transferable ArrayBuffer)
    ↓
imageQuantizer.worker.js (Web Worker, never blocks the UI)
  1. Extract image features (unique colors / flatness / saturation / skin-tone ratio / edge density) → type classification
  2. K-means++ palette selection (Lab; edge- and saliency-weighted sampling, budget adjusted by type)
  3. Regional mean color (Lab) + perceptual matching (CIEDE2000 or OKLab ΔE)
  4. Energy function: edge/saliency protection map → fidelity weights + error-diffusion gating
  5. Dithering: Floyd–Steinberg serpentine / Bayer 4×4 (chosen by type by default)
  6. ICM spatial refinement (short side ≤120) + isolated-bead cleanup + checkerboard suppression
    ↓
handleQuantizerApply: brand ID ('P18') → resolveToHex() → hex ('#F0B08A') → canvasData
```

> **Hard rule**: `canvasData` stores hex strings only, never brand IDs (`ctx.fillStyle = 'P18'` renders black).

### Chart recognition pipeline (`/import`, screenshot mode)

```
Chart photo / scan
    ↓ imageGuard gate + HEIC/PDF normalization
    ↓ Four-point perspective correction (undoes camera skew; the four points are draggable)
    ↓ Grid detection (columns / rows / borders; endpoint trimming so a row or column isn't lost)
    ↓ Per-cell sampling → nearest color in the target palette (switchable)
    ↓ Manual correction (tap a cell to change its color or mark it blank; drag the frame), persisted across sessions
    ↓ Load into the canvas, or save as one of my works
```

---

## 🧪 Tests

```bash
npm run test:run   # 1,891 tests / 115 files
```

Tests are organized around **contracts** rather than chasing a coverage number — many files lock in "behaviour that must not regress" instead of implementation details:

| Area | What it covers |
|------|---------|
| Color science | CIEDE2000 against Sharma's 34 reference pairs, rgbToLab, cross-brand nearest mapping, export/statistics consistency |
| Image processing | Worker pipeline regressions (palette subset / color stats / transparent pixels / rectangular output), quality baselines (OKLab math / isolated-bead cleanup / performance budget), header parsing (forged headers / truncation / invalid segment lengths) |
| Chart recognition | Grid detection, per-cell sampling, pointer mapping, perspective transform, HEIC/PDF conversion end to end |
| Selection | Rectangle and lasso geometry, mask commands (fill / mirror / rotate / copy / cut / move / paste), resize handles, edge snapping, marquee drawing and drag preview |
| Project & storage | Project model validation, import/export round-trips, version-history semantics, local repository (IndexedDB + localStorage fallback), cloud sync |
| Personal beads | Palette/color validation, inventory matching and deduction, CSV/JSON import, backup merge semantics |
| Gallery | Card layout contract, scroll container contract, discovery rails, OG snapshots, download counts, content-page load timing |
| UI contracts | Overlay accessibility (Esc to close / focus return / IME composition), mobile overlay click catchers, avatar circular contract, import page contract |
| Page level | `App.test.jsx` smoke test renders the whole tree — catching "missing import → ReferenceError" production white-screens |

CI (`.github/workflows/ci.yml`) runs on push / PR to `main`: `test:run` → `check-i18n` → `check-migrations` → `build` → verify the generated font CSS is unchanged.

---

## 🗂 Data storage

**On device (IndexedDB primary, localStorage for preferences and compatibility)**:

| Key / store | Contents |
|-----|------|
| IndexedDB `works` | Works while signed out; migrated to the cloud on sign-in and cleared locally (legacy localStorage data is moved over automatically on first run) |
| IndexedDB `drafts` | Autosaved draft, 2 s debounce; **never enters the undo stack and never triggers a cloud write** |
| IndexedDB `versions` | Work version snapshots, up to 20 per work |
| `cloud-works-mirror` | `{ count }` — lets Gallery say "your works are in the cloud, sign in to view" after signing out |
| `bead_studio_settings` | `{ language }` |
| `gallery-favorites` | Favorited template IDs |
| `tutorial-progress` | Read tutorial IDs |
| `bead-studio-behavior` | `{ sessions, guideShown, quantizerVisited }`, driving the mobile first-use guide |
| `custom-templates` / `custom-categories` | Local-mode templates and categories (fallback when the cloud is not configured) |

---

## 🚀 Deployment

- **Push to deploy** — the repo is connected to Vercel's GitHub integration; every push to `main` builds and ships
- **Canonical domain** — production is bound to a custom domain; `vercel.json` permanently redirects the previous domain to the current one
- **Static prerendering** — build-time HTML for `gallery` / `tutorials` / `privacy` / `terms` / `admin`, each with its own title / description / canonical / hreflang / OG (`admin` is `noindex`)
- **Dynamic content snapshots** — build-time fetch of published content produces static HTML plus a **1200×630 share card** per theme / collection / pattern; content published after the build still falls through to the SPA, so nothing 404s
- **Caching** — hashed `/assets/*` immutable for a year, everything else no-cache

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Verify before committing:
   ```bash
   npm run test:run && npm run check-i18n && npm run check-migrations && npm run build
   ```
4. Push and open a Pull Request

### Code style

**The existing code style is the de-facto standard.** When any tool's default conflicts with it, the code wins:

- Never reformat existing files repo-wide, and never produce a mechanical commit that touches the whole tree
- When adding or editing a file, imitate that file and its neighbours (indentation, quotes, semicolons, wrapping, comment density)
- Linter autofixes are acceptable only for enumerable, semantically equivalent tweaks — and review the diff line by line before committing

### Conventions

- **New UI strings** must be added to all four files under `src/i18n/locales/` (`zh-CN` is the reference; `check-i18n` verifies key sets and interpolation variables). **Admin console** copy is hard-coded Chinese and is intentionally not localized
- **New tutorial content** must be maintained in all four data files (`src/data/tutorials.{zh,en,ja,ko}.js`)
- **New migrations** must use a unique version number (duplicates break `supabase db push` with a primary-key conflict; `check-migrations` catches it early)
- **Font changes affect the build** — after touching fonts, run `node scripts/generate-fonts-css.js` and commit the regenerated `src/styles/fonts-all.css`; CI verifies the two match

---

## 📄 License

[MIT](LICENSE) © 2026 Aswellle

---

## 📝 Changelog

User-facing changes live in [CHANGELOG.md](CHANGELOG.md).

The most important recent behaviour change: **filling a selection no longer fills blank cells by default** — turn on the "Include empty" switch on the selection bar if you want to flood the whole area.

---

*From the first bead to the hundredth — may every placement land exactly where you meant it.*
