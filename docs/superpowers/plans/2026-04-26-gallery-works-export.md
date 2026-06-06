# Gallery / My Works / Template Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Gallery to 3-column grid, add named-work save flow with Header button + dialog + toast, fix rectangular-work thumbnails, and add per-template export menu.

**Architecture:** All changes stay in existing files — no new files, no new dependencies. App.jsx owns save/load state; Gallery is a pure display component receiving `savedWorks`, `onSaveWork`, and new `onLoadWork` props. Header gains `onSave` prop rendered only on the canvas page.

**Tech Stack:** React 18, react-i18next, existing `BeadPatternExporter.exportAsPNG`, localStorage `saved-works` key.

---

## File Map

| File | What changes |
|------|-------------|
| `src/i18n/locales/zh-CN.json` | Add 7 new gallery keys |
| `src/i18n/locales/en-US.json` | Same keys in English |
| `src/i18n/locales/ja-JP.json` | Same keys in Japanese |
| `src/i18n/locales/ko-KR.json` | Same keys in Korean |
| `src/components/Header.jsx` | Add `onSave` prop + save button (canvas page only) |
| `src/App.jsx` | Save dialog state, `handleOpenSaveDialog`, `handleConfirmSave`, `handleLoadWork`, wire props to Header + Gallery |
| `src/components/Gallery.jsx` | 3-col grid CSS, works thumbnail fix, card display upgrade, `onLoadWork` prop, template export menu |

---

## Task 1: i18n — add new keys to all 4 locales

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en-US.json`
- Modify: `src/i18n/locales/ja-JP.json`
- Modify: `src/i18n/locales/ko-KR.json`

- [ ] **Step 1: Add keys to zh-CN.json**

In `src/i18n/locales/zh-CN.json`, inside the `"gallery"` object, append these 7 keys after `"myWorksSectionTitle"`:

```json
"saveTitle": "保存作品",
"saveNameLabel": "作品名称",
"saveNamePlaceholder": "请输入作品名称",
"saveConfirm": "确认保存",
"savedToast": "已保存到我的作品",
"exportProfessional": "专业模式（方格 + 色号）",
"exportRealistic": "展示模式（拟真珠子）"
```

- [ ] **Step 2: Add keys to en-US.json**

In `src/i18n/locales/en-US.json`, inside the `"gallery"` object, same position:

```json
"saveTitle": "Save Work",
"saveNameLabel": "Work Name",
"saveNamePlaceholder": "Enter a name for your work",
"saveConfirm": "Confirm",
"savedToast": "Saved to My Works",
"exportProfessional": "Professional (Grid + Color IDs)",
"exportRealistic": "Display (Realistic Beads)"
```

- [ ] **Step 3: Add keys to ja-JP.json**

In `src/i18n/locales/ja-JP.json`, inside the `"gallery"` object:

```json
"saveTitle": "作品を保存",
"saveNameLabel": "作品名",
"saveNamePlaceholder": "作品名を入力してください",
"saveConfirm": "保存する",
"savedToast": "マイ作品に保存しました",
"exportProfessional": "専門モード（グリッド＋色番号）",
"exportRealistic": "展示モード（リアルなビーズ）"
```

- [ ] **Step 4: Add keys to ko-KR.json**

In `src/i18n/locales/ko-KR.json`, inside the `"gallery"` object:

```json
"saveTitle": "작품 저장",
"saveNameLabel": "작품 이름",
"saveNamePlaceholder": "작품 이름을 입력하세요",
"saveConfirm": "저장",
"savedToast": "내 작품에 저장되었습니다",
"exportProfessional": "전문 모드 (격자 + 색상 ID)",
"exportRealistic": "전시 모드 (사실적인 비드)"
```

- [ ] **Step 5: Validate all 4 locale files**

```bash
cd D:\Chrome_Downloads\AI_Coding\8.拼豆图纸在线设计网站更新仓库\bead-studio
node scripts/check-i18n.js
```

Expected: no missing-key errors. Fix any mismatches before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/locales/
git commit -m "i18n: add save-dialog, toast, and export-menu keys to all 4 locales"
```

---

## Task 2: Header.jsx — save button on canvas page

**Files:**
- Modify: `src/components/Header.jsx`

The current signature is:
```js
export default function Header({ user, onLogin, onRegister, onLogout, currentPage, onPageChange }) {
```

- [ ] **Step 1: Add `onSave` prop and save button**

Replace the entire `Header.jsx` with the following (only two additions: `onSave` in the prop list, and the save button block in `header-right` before `<LanguageSelector />`):

```jsx
import { useTranslation } from 'react-i18next'
import LanguageSelector from './Header/LanguageSelector'

export default function Header({ user, onLogin, onRegister, onLogout, currentPage, onPageChange, onSave }) {
  const { t } = useTranslation()

  const navItems = [
    { id: 'canvas', label: t('nav.canvas') },
    { id: 'gallery', label: t('nav.gallery') },
    { id: 'tutorials', label: t('nav.tutorials') }
  ]

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="8" height="8" x="0" y="0" fill="#E53935"/>
            <rect width="8" height="8" x="8" y="0" fill="#FDD835"/>
            <rect width="8" height="8" x="16" y="0" fill="#32CD32"/>
            <rect width="8" height="8" x="24" y="0" fill="#1976D2"/>
            <rect width="8" height="8" x="0" y="8" fill="#F06292"/>
            <rect width="8" height="8" x="8" y="8" fill="#BA68C8"/>
            <rect width="8" height="8" x="16" y="8" fill="#00BCD4"/>
            <rect width="8" height="8" x="24" y="8" fill="#FF9800"/>
            <rect width="8" height="8" x="0" y="16" fill="#FFFFFF" stroke="#E0E0E0"/>
            <rect width="8" height="8" x="8" y="16" fill="#9E9E9E"/>
            <rect width="8" height="8" x="16" y="16" fill="#000000"/>
            <rect width="8" height="8" x="24" y="16" fill="#795548"/>
            <rect width="8" height="8" x="0" y="24" fill="#8D6E63"/>
            <rect width="8" height="8" x="8" y="24" fill="#A1887F"/>
            <rect width="8" height="8" x="16" y="24" fill="#BDBDBD"/>
            <rect width="8" height="8" x="24" y="24" fill="#6D4C41"/>
          </svg>
          <span className="logo-text">{t('app.title')}</span>
        </div>
      </div>

      <div className="header-center">
        <nav className="nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => onPageChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="header-right">
        {currentPage === 'canvas' && onSave && (
          <button onClick={onSave} className="btn btn-ghost save-work-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {t('gallery.saveTitle')}
          </button>
        )}
        <LanguageSelector />
        {user ? (
          <div className="user-menu">
            <span className="user-name">{user.name}</span>
            <button onClick={onLogout} className="btn btn-ghost">
              {t('auth.logout')}
            </button>
          </div>
        ) : (
          <div className="auth-buttons">
            <button onClick={onLogin} className="btn btn-ghost">{t('auth.login')}</button>
            <button onClick={onRegister} className="btn btn-primary">{t('auth.register')}</button>
          </div>
        )}
      </div>

      <style>{`
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-primary);
          height: 60px;
        }
        .header-left, .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-text {
          font-size: 18px;
          font-weight: 600;
        }
        .nav {
          display: flex;
          gap: 8px;
        }
        .nav-link {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          color: var(--text-secondary);
          transition: all 0.2s;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .nav-link:hover {
          color: var(--text-primary);
          background: var(--bg-secondary);
        }
        .nav-link.active {
          color: var(--text-primary);
          font-weight: 600;
          background: var(--bg-secondary);
        }
        .auth-buttons {
          display: flex;
          gap: 8px;
        }
        .user-menu {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .user-name {
          font-size: 14px;
          color: var(--text-secondary);
        }
        .save-work-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }
      `}</style>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Header.jsx
git commit -m "feat: add save-work button to Header (canvas page only)"
```

---

## Task 3: App.jsx — save dialog, toast, and new save format

**Files:**
- Modify: `src/App.jsx`

Current `handleSaveWork` at line ~99 receives a pre-built `works` array (used by Gallery's delete button). Keep it. Add new state + handlers for the dialog-driven save flow.

- [ ] **Step 1: Add three new state variables**

After the existing `const [designName, setDesignName] = useState('拼豆图案')` line, add:

```js
const [showSaveDialog, setShowSaveDialog] = useState(false)
const [saveInputName, setSaveInputName] = useState('')
const [saveToast, setSaveToast] = useState(false)
```

- [ ] **Step 2: Add `handleOpenSaveDialog` and `handleConfirmSave`**

After the existing `handleClearCanvas` function, add:

```js
const handleOpenSaveDialog = () => {
  setSaveInputName(designName)
  setShowSaveDialog(true)
}

const handleConfirmSave = () => {
  const newWork = {
    id: Date.now(),
    name: saveInputName.trim() || designName,
    canvasData,
    gridSize,
    gridWidth: gridWidth ?? null,
    gridHeight: gridHeight ?? null,
    paletteId: currentPalette,
    savedAt: new Date().toISOString()
  }
  const updated = [...savedWorks, newWork]
  setSavedWorks(updated)
  localStorage.setItem('saved-works', JSON.stringify(updated))
  setShowSaveDialog(false)
  setSaveToast(true)
  setTimeout(() => setSaveToast(false), 1500)
}
```

- [ ] **Step 3: Wire `onSave` prop to Header in `renderDesktopLayout`**

Find the `<Header` JSX call inside `renderDesktopLayout` (around line 332). It currently reads:

```jsx
<Header
  user={user}
  onLogin={openLogin}
  onRegister={openRegister}
  onLogout={logout}
  currentPage={currentPage}
  onPageChange={handlePageChange}
/>
```

Replace with:

```jsx
<Header
  user={user}
  onLogin={openLogin}
  onRegister={openRegister}
  onLogout={logout}
  currentPage={currentPage}
  onPageChange={handlePageChange}
  onSave={handleOpenSaveDialog}
/>
```

- [ ] **Step 4: Add save dialog modal and toast JSX**

Inside `renderDesktopLayout`, after the `{showQuantizer && <ImageQuantizer ... />}` block, add:

```jsx
{showSaveDialog && (
  <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
    <div className="save-dialog" onClick={e => e.stopPropagation()}>
      <h3>{t('gallery.saveTitle')}</h3>
      <label>{t('gallery.saveNameLabel')}</label>
      <input
        autoFocus
        type="text"
        value={saveInputName}
        onChange={e => setSaveInputName(e.target.value)}
        placeholder={t('gallery.saveNamePlaceholder')}
        onKeyDown={e => e.key === 'Enter' && handleConfirmSave()}
      />
      <div className="save-dialog-actions">
        <button className="btn btn-ghost" onClick={() => setShowSaveDialog(false)}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={handleConfirmSave}>
          {t('gallery.saveConfirm')}
        </button>
      </div>
    </div>
  </div>
)}
{saveToast && (
  <div className="save-toast">{t('gallery.savedToast')}</div>
)}
```

- [ ] **Step 5: Add dialog and toast CSS**

Inside the existing `<style>{` ... `}</style>` block in `renderDesktopLayout`, append:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
}
.save-dialog {
  background: var(--bg-primary);
  border-radius: 12px;
  padding: 24px;
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18);
}
.save-dialog h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.save-dialog label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: -4px;
}
.save-dialog input {
  padding: 10px 12px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.save-dialog input:focus {
  border-color: var(--accent);
  outline: none;
  background: var(--bg-primary);
}
.save-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.save-toast {
  position: fixed;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  color: white;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  pointer-events: none;
  white-space: nowrap;
}
```

- [ ] **Step 6: Verify in browser**

Start dev server: `npm run dev` (port 5280). Navigate to canvas page. Click the "保存作品" button in the header. Confirm the dialog appears with the default name pre-filled, Enter key submits, toast appears for 1.5s and disappears. Then navigate to Gallery → My Works to confirm the entry appears.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: save-work dialog with toast, new saved-works format (id/name/gridWidth/gridHeight/savedAt)"
```

---

## Task 4: App.jsx — handleLoadWork + wire to Gallery

**Files:**
- Modify: `src/App.jsx`

The current Gallery "加载" button calls `onLoadTemplate(work.canvasData, work.gridSize)` which loses rectangular dimensions. We need `handleLoadWork` that restores all grid state.

- [ ] **Step 1: Add `handleLoadWork`**

After `handleLoadTemplate`, add:

```js
const handleLoadWork = (work) => {
  setGridSize(work.gridSize)
  setGridWidth(work.gridWidth ?? null)
  setGridHeight(work.gridHeight ?? null)
  setCanvasData(work.canvasData)
  setCurrentPalette(work.paletteId || 'perler')
  setCurrentPage('canvas')
}
```

- [ ] **Step 2: Pass `onLoadWork` to Gallery**

Find the `<Gallery` JSX in `renderPage` (the `case 'gallery':` branch). It currently reads:

```jsx
<Gallery
  onLoadTemplate={handleLoadTemplate}
  onSaveWork={handleSaveWork}
  savedWorks={savedWorks}
/>
```

Replace with:

```jsx
<Gallery
  onLoadTemplate={handleLoadTemplate}
  onSaveWork={handleSaveWork}
  onLoadWork={handleLoadWork}
  savedWorks={savedWorks}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: handleLoadWork restores rectangular grid dims when loading saved works"
```

---

## Task 5: Gallery.jsx — works section upgrade + 3-col grid

**Files:**
- Modify: `src/components/Gallery.jsx`

Changes: accept `onLoadWork` prop, fix thumbnail canvas to use actual w×h, show work name/size/date on card, change both grids to 3-column.

- [ ] **Step 1: Update component signature**

Change line 15 from:
```js
export default function Gallery({ onLoadTemplate, onSaveWork, savedWorks = [] }) {
```
to:
```js
export default function Gallery({ onLoadTemplate, onSaveWork, onLoadWork, savedWorks = [] }) {
```

- [ ] **Step 2: Fix works thumbnail canvas**

Locate the works-grid canvas block (around line 146–168). Replace the entire `<div key={index} className="work-card">` block with:

```jsx
{savedWorks.map((work, index) => {
  const w = work.gridWidth || work.gridSize
  const h = work.gridHeight || work.gridSize
  const displayName = work.name || (t('gallery.workName') + ' ' + (index + 1))
  const displayDate = work.savedAt ? work.savedAt.slice(0, 10) : ''
  return (
    <div key={work.id ?? index} className="work-card">
      <div className="work-thumbnail">
        <canvas
          width={w * CELL_SIZE}
          height={h * CELL_SIZE}
          style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '160px' }}
          ref={(canvas) => {
            if (!canvas) return
            const ctx = canvas.getContext('2d')
            const palette = getPalette(work.paletteId || 'perler')
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, w * CELL_SIZE, h * CELL_SIZE)
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const hex = resolveToHex(work.canvasData[y]?.[x], palette)
                if (hex) {
                  ctx.fillStyle = hex
                  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1)
                }
              }
            }
          }}
        />
      </div>
      <div className="work-info">
        <span className="work-name">{displayName}</span>
        <span className="work-size">{w} × {h}</span>
        {displayDate && <span className="work-date">{displayDate}</span>}
      </div>
      <div className="work-actions">
        <button
          className="work-btn load"
          onClick={() => onLoadWork ? onLoadWork(work) : onLoadTemplate(work.canvasData, work.gridSize)}
        >
          {t('gallery.load')}
        </button>
        <button
          className="work-btn delete"
          onClick={() => {
            const newWorks = savedWorks.filter((_, i) => i !== index)
            onSaveWork(newWorks)
          }}
        >
          {t('gallery.delete')}
        </button>
      </div>
    </div>
  )
})}
```

- [ ] **Step 3: Update CSS — 3-column grids + work-date style**

In the `<style>` block at the bottom of Gallery.jsx, find:

```css
.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}
```

Change to:

```css
.templates-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
```

Find:

```css
.works-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
```

Change to:

```css
.works-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
```

After the `.work-size` rule, add:

```css
.work-date {
  font-size: 11px;
  color: var(--text-muted);
}
```

Also update `.work-info` to stack vertically (it currently uses `justify-content: space-between` for name+size in a row). Change:

```css
.work-info {
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

to:

```css
.work-info {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

- [ ] **Step 4: Verify in browser**

Navigate to Gallery → My Works. Confirm:
- Previously saved works show name (or fallback "作品 N"), dimensions, and date
- Thumbnails render with correct w×h (especially for rectangular canvases)
- Clicking "加载" restores the canvas page with correct grid dimensions
- Template grid shows 3 columns

- [ ] **Step 5: Commit**

```bash
git add src/components/Gallery.jsx
git commit -m "feat: gallery 3-col grid, works card shows name/size/date, thumbnail fix for rect grids"
```

---

## Task 6: Gallery.jsx — template export menu

**Files:**
- Modify: `src/components/Gallery.jsx`

Add a download icon button at the bottom-right of each template thumbnail. Clicking opens a two-option floating menu (professional / realistic). Exporting shows a spinner; menu closes on outside click.

- [ ] **Step 1: Add import for BeadPatternExporter**

At the top of `Gallery.jsx`, after the existing imports, add:

```js
import { exportAsPNG } from '../services/BeadPatternExporter'
```

- [ ] **Step 2: Add export state variables**

After the existing `const [showMyWorks, setShowMyWorks] = useState(false)` line, add:

```js
const [exportMenuId, setExportMenuId] = useState(null)
const [exportingId, setExportingId] = useState(null)
```

- [ ] **Step 3: Add document-click handler to close export menu**

After the existing `useEffect` that persists favorites, add:

```js
useEffect(() => {
  if (!exportMenuId) return
  const close = () => setExportMenuId(null)
  document.addEventListener('click', close)
  return () => document.removeEventListener('click', close)
}, [exportMenuId])
```

- [ ] **Step 4: Add `handleExportTemplate`**

After the `getDifficultyColor` function, add:

```js
const handleExportTemplate = async (template, beadStyle, e) => {
  e.stopPropagation()
  setExportMenuId(null)
  setExportingId(template.id)
  try {
    const palette = getPalette('perler')
    await exportAsPNG(
      template.pattern,
      template.size,
      'perler',
      t(`templates.names.${template.nameKey}`, template.nameKey),
      palette,
      { beadStyle, gridWidth: null, gridHeight: null }
    )
  } finally {
    setExportingId(null)
  }
}
```

- [ ] **Step 5: Add export button + menu inside `.template-thumbnail`**

Inside each template card's `.template-thumbnail` div, after the existing `<button className="favorite-btn" ...>` block, add:

```jsx
<button
  className="export-btn"
  onClick={e => {
    e.stopPropagation()
    setExportMenuId(exportMenuId === template.id ? null : template.id)
  }}
  disabled={exportingId === template.id}
  title="导出图纸"
>
  {exportingId === template.id ? (
    <svg className="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )}
</button>

{exportMenuId === template.id && (
  <div className="export-menu" onClick={e => e.stopPropagation()}>
    <button onClick={e => handleExportTemplate(template, 'professional', e)}>
      {t('gallery.exportProfessional')}
    </button>
    <button onClick={e => handleExportTemplate(template, 'realistic', e)}>
      {t('gallery.exportRealistic')}
    </button>
  </div>
)}
```

- [ ] **Step 6: Add CSS for export button and menu**

In the `<style>` block, after the `.favorite-btn:hover` rule, add:

```css
.export-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s;
  cursor: pointer;
  color: #555;
}
.export-btn:hover:not(:disabled) {
  transform: scale(1.1);
}
.export-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.export-menu {
  position: absolute;
  bottom: 44px;
  right: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.14);
  z-index: 10;
  overflow: hidden;
  min-width: 210px;
}
.export-menu button {
  display: block;
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  font-size: 13px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-primary);
}
.export-menu button:hover {
  background: var(--bg-secondary);
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spinning {
  animation: spin 1s linear infinite;
}
```

- [ ] **Step 7: Verify in browser**

Navigate to Gallery. Confirm:
- Each template card has a download icon in the bottom-right corner
- Clicking it opens the two-option menu without navigating away
- Clicking outside the menu closes it
- Choosing an option triggers the export (PNG download starts), spinner shows during export, disappears when done
- Clicking the template card itself (not the buttons) still loads the template to canvas

- [ ] **Step 8: Commit**

```bash
git add src/components/Gallery.jsx
git commit -m "feat: template export menu (professional/realistic) with loading spinner"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] 3-col grid for templates → Task 5 Step 3
- [x] 3-col grid for My Works → Task 5 Step 3
- [x] Works thumbnail rect fix (gridWidth/gridHeight) → Task 5 Step 2
- [x] saved-works new format (id/name/gridWidth/gridHeight/savedAt) → Task 3 Step 2
- [x] Header save button (canvas page only) → Task 2
- [x] Save dialog with name input + Enter key + cancel → Task 3 Step 4
- [x] Toast 1.5s → Task 3 Step 2 (`handleConfirmSave`)
- [x] Works card shows name/size/date → Task 5 Step 2
- [x] Works card backward-compat fallback name → Task 5 Step 2
- [x] `handleLoadWork` with rect grid restore → Task 4
- [x] Works "加载" calls `onLoadWork` → Task 5 Step 2
- [x] Template export icon + floating menu → Task 6 Steps 5–6
- [x] Export menu closes on outside click → Task 6 Step 3
- [x] Loading spinner during export → Task 6 Step 5
- [x] `exportAsPNG` called with correct args → Task 6 Step 4
- [x] All 4 i18n locales updated → Task 1
- [x] `node scripts/check-i18n.js` validation step → Task 1 Step 5

**Type consistency:** `onLoadWork(work)` is passed from App.jsx (Task 4 Step 2) and called in Gallery (Task 5 Step 2) — both receive the full `work` object. `exportAsPNG` signature matches `BeadPatternExporter.js` line 513.
