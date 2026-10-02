# 🎨 Bead Studio · 拼豆Studio

> **Iron every spark of inspiration, bead by bead.** A professional online bead-pattern design tool — from pixels to physical beads, all in one place.

[![CI](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Aswellle/Pindou-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-BaaS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![i18n](https://img.shields.io/badge/i18n-4%20Languages-4A9B8E)](https://www.i18next.com)

[中文](README.md) · **English**

**6 bead brands · 1,000+ colors · 4 languages · 18 tutorials · Cloud accounts**

Bead Studio is a ready-to-use online bead-pattern design tool: free-hand drawing, image-to-pattern conversion, professional pattern export, a cloud template library and a full account system. Whether you just picked up your first pegboard or you chase exhibition-grade pieces, you'll find your rhythm here.

⭐ **If this project helps you, please consider giving it a [Star](https://github.com/Aswellle/Pindou-Studio) — it keeps the polishing going.**

---

## ✨ Highlights

| | What it gives you |
|---|---|
| 🖼️ | **One-click image → pattern** — turn a photo into a bead pattern in seconds, with automatic grid and color-count matching, Lab or OKLab color space |
| 📄 | **Professional export** — brand color codes, four-tier color list, row/column rulers — ready to follow bead by bead |
| 🎨 | **6 brand palettes (1,039 colors)** — COCO / MARD / MARD 291 / Perler / Hama / Artkal, with CIEDE2000 nearest-neighbor remapping between brands |
| ☁️ | **Cloud accounts** — email OTP or custom accounts (username + security key), cropped avatar upload, works synced across devices |
| 🌐 | **4 languages** — browser auto-detect, `?lang=` deep links; 911 UI strings, tutorials and exported sheets fully covered |
| 📖 | **18 illustrated tutorials × 4 languages** — beginner to advanced, including a "rescue manual" for failed fuses |
| 🛠️ | **Admin console** — template CRUD + JSON import + category management + user dashboard + message inbox + overview (growth trend / content health checks) |
| 📱 | **Mobile first** — two-finger pinch zoom, one-finger inertial panning; as comfortable on a phone as on a desktop |

---

## 🖊️ Core features

### Canvas drawing
- **Four tools** — pencil / eraser / fill bucket / hand; drag to draw with zero lag
- **Flexible sizes** — square presets 29 / 57 / 87 / 114 / 140 / 170; landscape & portrait rectangle presets; custom 9–200 per side
- **Pan / zoom** — desktop: wheel zoom toward the cursor + drag to pan; mobile: pinch to zoom + one-finger inertial panning
- **Undo / redo** — 50-step history at stroke granularity (`Ctrl+Z` / `Ctrl+Y`, `Cmd` on Mac)
- **Two-layer canvas rendering** — committed layer + overlay layer, so live strokes paint straight to the canvas instead of piling up React re-renders

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
- **Zero-copy** — Web Worker + Transferable ArrayBuffer, so quantization never blocks the UI thread

### 🎨 Six bead brand palettes

| Brand | Code range | Colors | Notes |
|------|---------|--------|------|
| COCO | A–Z group codes | 291 | 2.6 mm mini beads, grouped A–Z |
| MARD | 9 official color families | 221 | 5 mm, standard series |
| MARD 291 | Standard 221 + extended | 291 | 5 mm, more complete series |
| Perler | P01 – P80 | 80 | Widest color range, best for beginners |
| Hama | H01 – H56 | 56 | Soft Nordic tones |
| Artkal | C01 – C100 | 100 | Rich metallic / fluorescent colors |

Any pattern can be remapped to another brand by CIEDE2000 nearest color (the brand badge on a gallery card is the conversion entry point); drawing, gallery and export all follow the currently selected brand.

### 📄 Pattern export
- **New export engine (V2, on by default)** — a unified `PatternDocument` model rendered to PNG (raster) or SVG (vector); a single checkbox switches back to the legacy engine
- **Two styles** — professional (flat squares + brand color codes, for crafting) / realistic (3D-looking beads, for sharing)
- **Sheet-level information** — header (size / total beads / colors used / palette / date), row rulers on both sides plus a column ruler on top, color legend in four tiers (major / minor / accent / trace, with ⚠ purchase warnings for trace colors) and the Bead Studio brand mark
- **Quick trio** — PNG bitmap / SVG vector / plain-text color index
- **High-resolution output** — 3× supersampling of logical pixels (auto-degrades by device and canvas area), `toBlob` encoding to avoid doubling memory, with the actual resolution reported in the panel; optional physical-size DPI annotation
- **Long-task friendly** — renders in batches of 2,000 beads with progress reporting; closing the panel aborts the export (AbortSignal)

### ☁️ Accounts · Profile · Admin
- **Two registration methods** — email OTP (6-digit codes for sign-up / sign-in / reset, no external links needed) or custom accounts (username + password + optional security key for recovery)
- **Works synced across devices** — signed-in works live in the Supabase `works` table, otherwise in localStorage; the first sign-in migrates local works to the cloud and reports how many were synced
- **Standalone profile page** (`/profile`) — its own top bar and two-column layout, inheriting no site navigation: avatar upload with a hand-built circular cropper (drag / wheel / pinch, 240×240 webp output), nickname, password change with old-password verification, sign-out
- **Admin console** (`/admin`) — template CRUD, unified-protocol JSON import, category management, user dashboard (`admin_list_users` RPC: registration method / last sign-in / freeze & delete), message thread replies, and an overview (`/admin/dashboard`: user-growth KPIs, 14-day registration trend chart, library size and distribution, top templates, pending messages, content health checks and quick actions)
- **Shared gate** — `AdminGate` handles four states (cloud not configured / checking session / signed out / not an admin); tabs support deep links such as `/admin?tab=users`

### 📚 Gallery · Tutorials · i18n
- **Gallery V2** (`/gallery`) — favorites, my works, cloud/local dual mode, download counts, brand badge and conversion, export menu, URL-synced search and filters, plus a degraded banner with retry when the cloud is unavailable
- **Cloud template library** — anon read-only, admin write (enforced by RLS); templates carry size / difficulty / brand palette / download count
- **18 illustrated tutorials × 4 languages** — getting started, ironing explained, preventing warping, color design, advanced techniques, protecting finished pieces and a "rescue manual"
- **Complete i18n** — 911 UI strings × 4 languages; only `zh-CN` is bundled inline, while `en/ja/ko` (and tutorial data) load on demand

### 🔐 Security & compliance
- **Row-level security (RLS)** — templates/categories anon read-only, works readable and writable only by their owner, avatars writable only by their owner, admin write access
- **Function-level guards** — every admin RPC is `security definer` and checks `is_admin()` internally
- **Auth as the credential** — authentication via Supabase Auth (OTP / custom accounts); contact messages support Turnstile session trust plus rate limiting
- **Read-only metadata** — the user dashboard exposes only what operations need (email / nickname / role / confirmation state / registration and sign-in times), never sensitive fields

---

## 🗺️ Routes

| Path | Page |
|---|---|
| `/` | Canvas (default) |
| `/gallery` | Gallery V2 (template library + my works) |
| `/create/image` | Image → bead pattern (standalone page) |
| `/tutorials` | Illustrated tutorials |
| `/profile` | Profile (standalone page) |
| `/login` · `/admin/login` | User sign-in · admin sign-in (standalone pages) |
| `/admin` · `/admin/dashboard` | Admin console (templates / import / categories / users / messages) · Overview |
| `/privacy` · `/privacy/:versionId` · `/terms` · `/terms/:versionId` | Privacy policy · Terms of service (with version history) |
| `*` | Redirect to `/` |

Apart from the canvas, `/login` `/admin/login` `/privacy` `/terms` `/create/image` `/profile` are **standalone pages**: they render no site header and provide their own back/action layer.

---

## 🚀 Getting started

### Requirements
- Node.js 22+ (see `.nvmrc`)
- npm 10+

### Install & develop

```bash
git clone https://github.com/Aswellle/Pindou-Studio.git
cd Pindou-Studio
npm install
npm run dev
```

The dev server runs at **http://localhost:5280** (reachable on your LAN at `http://<your-ip>:5280`).

### Commands

```bash
npm run dev              # dev server (HMR)
npm run build            # production build (font CSS → bundle → prerendered subroute HTML)
npm run preview          # preview the build locally
npm run test             # tests (watch mode)
npm run test:run         # tests (single run, CI mode)
npm run test:ui          # Vitest browser UI
npm run check-i18n       # verify all 4 locale files share keys and interpolations
npm run check-migrations # verify Supabase migrations: unique versions + balanced $$

npx vitest run src/utils/imageGuard.test.js   # run one test file
```

### Cloud configuration (optional)

Without environment variables the app runs in **pure local mode** (built-in templates + localStorage) and the canvas, gallery, export and tutorials all work. Configure these to enable accounts and the cloud template library:

```bash
# .env.local
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

The database schema is defined by the 18 idempotent migration files under `supabase/migrations/`. Promote an admin by setting `profiles.role = 'admin'`.

---

## 🏗️ Tech stack

| Layer | Technology |
|----|------|
| Framework | React 18 + Vite 6 + React Router 7 (path routing, separate desktop/mobile layouts) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) + handcraft warm design tokens (CSS variables) |
| Backend | Supabase (PostgreSQL + Auth + Storage + RLS + security-definer RPCs) |
| i18n | react-i18next 26, 4 languages (`zh-CN` inline, others lazy-loaded) |
| Color science | CIEDE2000 / OKLab (K-means++ and color matching both inside a Web Worker) |
| Data visualization | Recharts 3 (registration trend chart on the admin overview, code-split) |
| State | React `useState` / `useReducer` (no global store; undo stack via reducer) |
| Icons / fonts | lucide-react; Noto Sans SC + LXGW WenKai (lazy-loaded on desktop only) |
| Testing | Vitest 4 + @testing-library/react (jsdom), 319 tests across 22 files |
| Monitoring | Vercel Analytics + Speed Insights |
| Deployment | Vercel (auto-deploy on push to `main`) + Supabase |

---

## 🔬 Image quantization pipeline

```
User uploads an image
    ↓ Selection gate (type / 30 MB / 40 MP; PNG IHDR · JPEG SOF header, rejected before decoding)
    ↓
useImageQuantizer.js (main-thread downscale to ≤3000 px, zero-copy Transferable ArrayBuffer)
    ↓
imageQuantizer.worker.js (Web Worker, never blocks the UI)
  1. Image features (unique colors / flatness / saturation / skin ratio / edge density) → type classification
  2. K-means++ palette selection (Lab; edge- and saliency-weighted sampling, budget adjusted by type)
  3. Regional mean color (Lab) + perceptual color matching (CIEDE2000 or OKLab ΔE)
  4. Energy function: edge/saliency protection map → fidelity weighting + error-diffusion gating
  5. Dithering: Floyd–Steinberg serpentine / Bayer 4×4 (type-driven by default)
  6. ICM spatial refinement (short side ≤120) + isolated-bead cleanup + checkerboard suppression
    ↓
handleQuantizerApply: brand ID ('P18') → resolveToHex() → hex('#F0B08A') → canvasData
```

> **Iron rule**: `canvasData` stores hex strings only, never brand IDs (`ctx.fillStyle = 'P18'` renders a black cell).

---

## 🧪 Tests

```bash
npm run test:run   # 319 tests / 22 files
```

| File | Coverage |
|------|------|
| `utils/colorDiff.test.js` | CIEDE2000 (Sharma's 34-pair dataset, locked against the worker implementation), rgbToLab, findClosestColorCIEDE2000 |
| `utils/imageGuard.test.js` | Selection gate: type/size/pixel boundaries, PNG IHDR & JPEG SOF header parsing (forged headers, truncation, invalid segment lengths), passthrough for unparsed formats, error-code ↔ i18n key parity |
| `utils/autoGrid.test.js` | Automatic grid recommendation and grid→color-count table |
| `utils/historyUtils.test.js` | pushHistory cap truncation, undo/redo round-trip |
| `utils/adminOverview.test.js` | Overview math: trend normalization, library statistics, content health rules |
| `services/colorUtils.test.js` | resolveToHex edge cases, hexToRgb, rgbToHex, getTextColor |
| `services/storageUrl.test.js` | Supabase storage base URL resolution (same-origin `/sb` proxy, avatar URL normalization) |
| `services/export/PatternDocument.test.js` | PatternDocument → PNG/SVG renderer consistency (grid/coordinates/legend/codes) |
| `hooks/useCanvasPainter.test.js` | Two-layer canvas painting, repaint on attach, overlay add/clear |
| `workers/imageQuantizer.worker.test.js` | Worker pipeline regressions: palette subset path, color stats, transparent pixels, rectangular output |
| `workers/imageQuantizer.quality.test.js` | Quality benchmarks: OKLab math, weighted ΔE, isolated-bead cleanup, checkerboard suppression, perf budget |
| `data/templates.test.js` | Template JSON validation (normalizeCustomTemplate: color normalization, rectangles, error branches) |
| `data/tutorials.test.js` | Tutorial loader: language fallback, structure, idempotency, flattening |
| `features/gallery/GalleryPage.test.jsx` | Gallery V2: cards, search filtering, favorites persistence, works view, cloud degradation and retry |
| `features/gallery/hooks/useDownloadCounts.test.js` | Download counts: local persistence, cloud max + optimistic delta, RPC-failure retention |
| `components/Canvas.test.jsx` | Component level: grid rendering, click-to-fill, pinch-doesn't-fill regression |
| `components/ProfilePage.test.jsx` | Standalone-page shape and constraints: no site navigation/login button, two columns, nickname dirty-state and async sync, redirect when signed out |
| `components/Tutorials.test.jsx` | Tutorials page async loading: loading state → rendered sections |
| `components/AdminPanel.test.jsx` | Admin gate regressions: never reads `user` when signed out; non-admin / checking / cloud-missing states |
| `components/AdminDashboardPage.test.jsx` | Overview page: four gate states, KPIs/trend chart/health checks/pending, quick-action deep links, retry on failure |
| `components/Header/LanguageSelector.test.jsx` | Language selector: switching and persistence |
| `App.test.jsx` | App smoke test: renders the full tree (MemoryRouter + HelmetProvider, canvas/matchMedia mocks) — catches "missing import → ReferenceError" white screens |

CI (`.github/workflows/ci.yml`) runs on every push / PR to `main`: `test:run` → `check-i18n` → `check-migrations` → `build` → verify the generated font CSS has no diff.

---

## 🗂 Data storage

**Local (localStorage)**:

| Key | Contents |
|-----|------|
| `saved-works` | Local works while signed out; migrated to the cloud and cleared on sign-in (~5 MB cap, warning at 4 MB) |
| `cloud-works-mirror` | `{ count }` so the gallery can say "works live in the cloud — sign in" after signing out |
| `bead_studio_settings` | `{ language }` preference |
| `gallery-favorites` | Favorited template IDs |
| `tutorial-progress` | Read tutorial IDs |
| `bead-studio-behavior` | `{ sessions, guideShown, quantizerVisited }`, driving the mobile first-use guide |
| `custom-templates` / `custom-categories` | Local custom templates and categories (fallback when the cloud is not configured) |

**Cloud (Supabase, defined by 18 migrations)**:

| Object | Contents |
|----|------|
| `profiles` | Nickname, avatar, `role` (admin); `security_key_hash` for custom accounts |
| `templates` / `categories` | Cloud template library and categories (`source` / `palette_id` / `download_count`); anon read-only, admin write |
| `works` | Signed-in users' works (unique on `user_id` + `saved_at` + `name`), own-row RLS |
| `contact_messages` | Threaded messages (participant = signed-in user or guest UUID, with `author` distinguishing user/admin) |
| `registration_notifications` | New-user registration feed (admin-only read; powers the overview trend) |
| `removed_accounts` | Tombstones for deleted accounts |
| `avatars` (Storage) | Avatar files, public read, owner write |
| RPCs | `increment_template_download`, `admin_overview`, `admin_user_stats`, `admin_list_users`, `admin_list_registrations`, `admin_list_contact_messages`, `admin_reply_contact`, `get_contact_thread`, `ensure_contact_nickname`, `user_account_status`, `admin_lock_user` / `admin_unlock_user` / `admin_delete_user`, `resolve_auth_email`, `username_exists`, `set_security_key`, `reset_password_custom` |

---

## 🚀 Deployment

- **Push to deploy** — the repo is linked to Vercel through its GitHub integration, so every push to `main` builds and ships
- **Canonical domain** — production runs on **https://tangnotes.site**; `vercel.json` permanently redirects the old `pindou-studio.vercel.app/*` to the new domain
- **Static prerendering** — the build emits static HTML for `index` plus `gallery` / `tutorials` / `privacy` / `terms` / `admin` (rewrites point `/gallery` etc. at those files); `admin` is marked `noindex`
- **Caching** — hashed `/assets/*` immutable for a year, everything else no-cache
- **SEO** — per-page `<Helmet>` meta and canonical, four-language `hreflang` alternates, Open Graph / Twitter cards, JSON-LD, plus `sitemap.xml` / `robots.txt` / `llms.txt` shipped from the repo

---

## 🤝 Contributing

1. Fork this repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Verify before committing:
   ```bash
   npm run test:run && npm run check-i18n && npm run check-migrations && npm run build
   ```
4. Push and open a Pull Request

Conventions:
- **New UI strings** must be added to all four locale files under `src/i18n/locales/` (`zh-CN` is the reference; `check-i18n` enforces identical keys and interpolation variables). **Admin-console copy** is hard-coded Chinese on purpose and needs no translation.
- **New tutorials** must be maintained in all four data files (`src/data/tutorials.{zh,en,ja,ko}.js`)
- **New standalone pages** (those that inherit no site navigation) must be registered in both the `currentPage` derivation and `isStandalonePage` in `App.jsx`
- **New migrations** must use unique filename version prefixes (a duplicate makes `supabase db push` fail on a primary-key conflict; `check-migrations` catches it early)
- Commit messages must not carry any AI co-author attribution

---

## 📄 License

[MIT](LICENSE) © 2026 Aswellle

---

*From your first bead to your hundredth — may every placement be one you'd choose again.*
