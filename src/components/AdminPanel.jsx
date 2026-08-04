import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, DIFFICULTIES, normalizeCustomTemplate } from '../data/templates'
import useCustomTemplates from '../hooks/useCustomTemplates'
import ThumbnailCanvas from './ThumbnailCanvas'

// 供 AI Agent / 手工上传参考的统一协议示例(可复制到「JSON 导入」直接导入)
const EXAMPLE_JSON = JSON.stringify({
  name: 'Duck',
  nameZh: '小鸭',
  category: 'animal',
  difficulty: 'easy',
  pattern: [
    [null, null, '#FFD700', '#FFD700', null, null],
    [null, '#FFD700', '#FFD700', '#FFD700', '#FFD700', null],
    ['#FFD700', '#FFD700', '#FF8C00', '#FF8C00', '#FFD700', '#FFD700'],
    [null, '#FFD700', '#000000', '#000000', '#FFD700', null],
    [null, null, '#FF8C00', '#FF8C00', null, null],
  ],
}, null, 2)

// ─────────────────────────────────────────────────────────────
// 管理密码门禁
// 无后端,账号注册可被任何人自建,故用「管理密码」保护后台:
// 密码以 SHA-256 哈希存 localStorage(admin-pin-hash);
// 解锁状态存 sessionStorage(admin-unlocked),刷新当前标签页需重新输入,
// 新建标签页需重新解锁,可手动锁定。
// ─────────────────────────────────────────────────────────────
const PIN_KEY = 'admin-pin-hash'
const UNLOCK_KEY = 'admin-unlocked'
const MIN_PIN_LENGTH = 4

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function AdminPanel() {
  const { t } = useTranslation()
  const store = useCustomTemplates()
  const [tab, setTab] = useState('templates')
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(UNLOCK_KEY) === '1')
  const [hasPin, setHasPin] = useState(() => !!localStorage.getItem(PIN_KEY))
  const [pinInput, setPinInput] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [setupPin2, setSetupPin2] = useState('')
  const [gateError, setGateError] = useState('')
  const [showChangePin, setShowChangePin] = useState(false)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [pinMessage, setPinMessage] = useState('')

  const handleUnlock = async () => {
    if (!pinInput) return
    const hash = await sha256(pinInput)
    if (hash === localStorage.getItem(PIN_KEY)) {
      sessionStorage.setItem(UNLOCK_KEY, '1')
      setUnlocked(true)
      setGateError('')
      setPinInput('')
    } else {
      setGateError(t('admin.gate.wrongPin'))
      setPinInput('')
    }
  }

  const handleSetup = async () => {
    if (setupPin.length < MIN_PIN_LENGTH) { setGateError(t('admin.gate.tooShort')); return }
    if (setupPin !== setupPin2) { setGateError(t('admin.gate.mismatch')); return }
    localStorage.setItem(PIN_KEY, await sha256(setupPin))
    sessionStorage.setItem(UNLOCK_KEY, '1')
    setHasPin(true)
    setUnlocked(true)
    setGateError('')
  }

  const handleChangePin = async () => {
    if ((await sha256(oldPin)) !== localStorage.getItem(PIN_KEY)) {
      setGateError(t('admin.gate.wrongPin'))
      return
    }
    if (newPin.length < MIN_PIN_LENGTH) { setGateError(t('admin.gate.tooShort')); return }
    if (newPin !== newPin2) { setGateError(t('admin.gate.mismatch')); return }
    localStorage.setItem(PIN_KEY, await sha256(newPin))
    setOldPin('')
    setNewPin('')
    setNewPin2('')
    setGateError('')
    setShowChangePin(false)
    setPinMessage(t('admin.gate.updated'))
    setTimeout(() => setPinMessage(''), 2000)
  }

  const handleLock = () => {
    sessionStorage.removeItem(UNLOCK_KEY)
    setUnlocked(false)
    setShowChangePin(false)
  }

  // 未解锁 → 密码门禁界面
  if (!unlocked) {
    return (
      <div className="admin-panel">
        <div className="admin-gate">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h1 className="admin-title">{hasPin ? t('admin.gate.title') : t('admin.gate.setTitle')}</h1>
          <p className="admin-subtitle">{hasPin ? t('admin.gate.hint') : t('admin.gate.setHint')}</p>

          {hasPin ? (
            <>
              <input
                className="admin-input"
                type="password"
                autoFocus
                placeholder={t('admin.gate.password')}
                value={pinInput}
                onChange={e => { setPinInput(e.target.value); setGateError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleUnlock() }}
              />
              <button className="admin-btn primary" onClick={handleUnlock}>{t('admin.gate.unlock')}</button>
            </>
          ) : (
            <>
              <input
                className="admin-input"
                type="password"
                autoFocus
                placeholder={t('admin.gate.password')}
                value={setupPin}
                onChange={e => { setSetupPin(e.target.value); setGateError('') }}
              />
              <input
                className="admin-input"
                type="password"
                placeholder={t('admin.gate.confirm')}
                value={setupPin2}
                onChange={e => { setSetupPin2(e.target.value); setGateError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSetup() }}
              />
              <button className="admin-btn primary" onClick={handleSetup}>{t('admin.gate.setBtn')}</button>
            </>
          )}

          {gateError && <div className="admin-gate-error">{gateError}</div>}
        </div>
        <style>{`
          .admin-gate {
            max-width: 360px;
            margin: 40px auto;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-card);
            padding: 28px 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            text-align: center;
          }
          .admin-gate svg { margin: 0 auto; }
          .admin-gate .admin-input { text-align: center; }
          .admin-gate .admin-btn { align-self: center; padding: 8px 32px; }
          .admin-gate-error {
            color: var(--error);
            font-size: var(--text-sm);
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1 className="admin-title">{t('admin.title')}</h1>
        <p className="admin-subtitle">{t('admin.subtitle')}</p>
        <div className="admin-actions" style={{ marginTop: 8 }}>
          <button className="admin-btn secondary small" onClick={() => { setShowChangePin(!showChangePin); setGateError('') }}>
            {t('admin.changePassword')}
          </button>
          <button className="admin-btn secondary small" onClick={handleLock}>
            {t('admin.lock')}
          </button>
        </div>
        {pinMessage && <div className="admin-result ok" style={{ marginTop: 8 }}>{pinMessage}</div>}
        {showChangePin && (
          <div className="admin-card" style={{ marginTop: 12 }}>
            <h3>{t('admin.changePasswordTitle')}</h3>
            <div className="admin-field">
              <label>{t('admin.oldPassword')}</label>
              <input className="admin-input" type="password" value={oldPin}
                onChange={e => { setOldPin(e.target.value); setGateError('') }} />
            </div>
            <div className="admin-grid-2">
              <div className="admin-field">
                <label>{t('admin.newPassword')}</label>
                <input className="admin-input" type="password" value={newPin}
                  onChange={e => { setNewPin(e.target.value); setGateError('') }} />
              </div>
              <div className="admin-field">
                <label>{t('admin.confirmNewPassword')}</label>
                <input className="admin-input" type="password" value={newPin2}
                  onChange={e => { setNewPin2(e.target.value); setGateError('') }} />
              </div>
            </div>
            {gateError && <div className="admin-gate-error">{gateError}</div>}
            <div className="admin-actions">
              <button className="admin-btn primary" onClick={handleChangePin}>{t('admin.save')}</button>
              <button className="admin-btn secondary" onClick={() => { setShowChangePin(false); setGateError('') }}>{t('admin.cancel')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
          {t('admin.tab.templates')}
        </button>
        <button className={`admin-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>
          {t('admin.tab.import')}
        </button>
        <button className={`admin-tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}>
          {t('admin.tab.categories')}
        </button>
      </div>

      {tab === 'templates' && <TemplateManager store={store} />}
      {tab === 'import' && <JsonImporter store={store} />}
      {tab === 'categories' && <CategoryManager store={store} />}

      <style>{`
        .admin-panel {
          max-width: 860px;
          margin: 0 auto;
          padding: 20px 16px 48px;
          font-size: var(--text-base);
        }
        .admin-header {
          margin-bottom: 16px;
        }
        .admin-title {
          font-size: var(--text-2xl);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
          margin: 0 0 4px;
        }
        .admin-subtitle {
          color: var(--text-muted);
          margin: 0;
          font-size: var(--text-sm);
        }
        .admin-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 10px;
        }
        .admin-tab {
          border: none;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          padding: 8px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 500;
          transition: all 0.2s;
        }
        .admin-tab:hover { background: var(--bg-hover); }
        .admin-tab.active {
          background: var(--accent);
          color: white;
        }
        .admin-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          padding: 16px;
          margin-bottom: 16px;
        }
        .admin-card h3 {
          margin: 0 0 12px;
          font-size: var(--text-lg);
        }
        .admin-input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: var(--text-base);
          font-family: inherit;
          background: var(--bg-primary);
          color: var(--text-primary);
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .admin-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 8px 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
          background: var(--bg-primary);
          color: var(--text-primary);
          min-height: 160px;
          resize: vertical;
        }
        .admin-field {
          margin-bottom: 12px;
        }
        .admin-field label {
          display: block;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }
        .admin-field-hint {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 4px;
        }
        .admin-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .admin-btn {
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: var(--text-sm);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .admin-btn.primary { background: var(--accent); color: white; }
        .admin-btn.primary:hover { background: var(--accent-hover); }
        .admin-btn.secondary { background: var(--bg-secondary); color: var(--text-primary); }
        .admin-btn.secondary:hover { background: var(--bg-hover); }
        .admin-btn.danger { background: var(--error); color: white; }
        .admin-btn.danger:hover { opacity: 0.9; }
        .admin-btn.small { padding: 4px 10px; font-size: 12px; }
        .admin-btn:disabled { opacity: 0.5; cursor: default; }
        .admin-errors {
          margin: 8px 0 0;
          padding: 10px 12px;
          background: rgba(229, 57, 53, 0.08);
          border: 1px solid var(--error);
          border-radius: 8px;
          color: var(--error);
          font-size: var(--text-sm);
          list-style: none;
        }
        .admin-errors li { margin: 2px 0; }
        .admin-search {
          margin-bottom: 12px;
        }
        .admin-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .admin-template-row {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          padding: 10px 12px;
        }
        .admin-template-row .thumb {
          flex-shrink: 0;
          background: #fff;
          border-radius: 6px;
          padding: 4px;
        }
        .admin-template-meta {
          flex: 1;
          min-width: 0;
        }
        .admin-template-name {
          font-weight: 600;
          font-size: var(--text-base);
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .admin-template-sub {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .admin-color-dots {
          display: flex;
          gap: 3px;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .admin-color-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid rgba(0,0,0,0.15);
          flex-shrink: 0;
        }
        .admin-empty {
          text-align: center;
          color: var(--text-muted);
          padding: 32px 0;
        }
        .admin-pre {
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 12px;
          font-size: 12px;
          line-height: 1.5;
          overflow: auto;
          max-height: 260px;
          white-space: pre;
          color: var(--text-primary);
        }
        .admin-result {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: var(--text-sm);
          border: 1px solid var(--border-color);
        }
        .admin-result.ok { border-color: var(--secondary-accent); background: rgba(76, 175, 80, 0.08); }
        .admin-result.warn { border-color: var(--error); background: rgba(229, 57, 53, 0.06); }
        .admin-category-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .admin-category-row:last-child { border-bottom: none; }
        .admin-category-id {
          font-family: ui-monospace, monospace;
          font-size: 13px;
          color: var(--text-secondary);
          min-width: 120px;
        }
        .admin-category-label { flex: 1; font-weight: 500; }
        .admin-row-form {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .admin-row-form .admin-input { flex: 1; }
        .admin-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 640px) {
          .admin-grid-2 { grid-template-columns: 1fr; }
          .admin-template-row { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 模板管理(列表 + 新增/编辑表单)
// ─────────────────────────────────────────────────────────────
function TemplateManager({ store }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null=不编辑, 'new'=新增, id=编辑某模板

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return store.templates.filter(tpl =>
      !q || tpl.name.toLowerCase().includes(q) || (tpl.nameZh || '').toLowerCase().includes(q)
    )
  }, [store.templates, search])

  const confirmDelete = (tpl) => {
    if (window.confirm(`${t('admin.deleteConfirm')}\n「${tpl.nameZh || tpl.name}」`)) {
      store.deleteTemplate(tpl.id)
    }
  }

  return (
    <div>
      <div className="admin-card">
        <input
          className="admin-input admin-search"
          placeholder={t('gallery.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="admin-actions">
          <button className="admin-btn primary" onClick={() => setEditing('new')}>
            {t('admin.addTemplate')}
          </button>
        </div>
      </div>

      {editing && (
        <TemplateForm
          store={store}
          editing={editing}
          initial={editing === 'new' ? null : store.templates.find(tpl => tpl.id === editing)}
          onDone={() => setEditing(null)}
        />
      )}

      {filtered.length === 0 ? (
        <div className="admin-empty">{t('admin.templatesEmpty')}</div>
      ) : (
        <div className="admin-list">
          {filtered.map(tpl => (
            <div key={tpl.id} className="admin-template-row">
              <div className="thumb">
                <ThumbnailCanvas pattern={tpl.pattern} size={tpl.size} />
              </div>
              <div className="admin-template-meta">
                <div className="admin-template-name">{tpl.nameZh || tpl.name}</div>
                <div className="admin-template-sub">
                  {t(`gallery.categories.${tpl.category}`, tpl.category)} · {tpl.size}×{tpl.size} ·{' '}
                  {t(`gallery.difficulties.${tpl.difficulty}`)}
                </div>
                <div className="admin-color-dots">
                  {tpl.colors.map((c, i) => (
                    <span key={i} className="admin-color-dot" style={{ backgroundColor: c }} title={c} />
                  ))}
                </div>
              </div>
              <div className="admin-actions">
                <button className="admin-btn secondary small" onClick={() => setEditing(tpl.id)}>
                  {t('admin.editTemplate')}
                </button>
                <button className="admin-btn danger small" onClick={() => confirmDelete(tpl)}>
                  {t('admin.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 新增 / 编辑表单:基础字段 + pattern JSON(实时校验 + 预览 + 自动识别颜色)
function TemplateForm({ store, editing, initial, onDone }) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial?.name || '')
  const [nameZh, setNameZh] = useState(initial?.nameZh || '')
  const [category, setCategory] = useState(initial?.category || 'animal')
  const [difficulty, setDifficulty] = useState(initial?.difficulty || 'easy')
  const [patternJson, setPatternJson] = useState(
    initial ? JSON.stringify(initial.pattern) : ''
  )
  const [errors, setErrors] = useState([])

  const categoryOptions = useMemo(() => {
    const ids = [...CATEGORIES.filter(c => c !== 'all'), ...store.categories.map(c => c.id)]
    return [...new Set(ids)]
  }, [store.categories])

  // 实时预览:解析 JSON → 规范化 → 缩略图 + 自动颜色
  const preview = useMemo(() => {
    try {
      const pattern = JSON.parse(patternJson || 'null')
      const res = normalizeCustomTemplate({ name, nameZh, category, difficulty, pattern })
      return res.ok ? res.template : null
    } catch {
      return null
    }
  }, [patternJson, name, nameZh, category, difficulty])

  const handleSave = () => {
    let pattern
    try {
      pattern = JSON.parse(patternJson)
    } catch (e) {
      setErrors([{ code: 'jsonParse', detail: e.message }])
      return
    }
    const input = { name, nameZh, category, difficulty, pattern }
    const res = editing === 'new' ? store.addTemplate(input) : store.updateTemplate(editing, input)
    if (!res.ok) {
      setErrors(res.errors)
      return
    }
    onDone()
  }

  return (
    <div className="admin-card">
      <h3>{editing === 'new' ? t('admin.addTemplate') : t('admin.editTemplate')}</h3>
      <div className="admin-grid-2">
        <div className="admin-field">
          <label>{t('admin.name')}</label>
          <input className="admin-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="admin-field">
          <label>{t('admin.nameZh')}</label>
          <input className="admin-input" value={nameZh} onChange={e => setNameZh(e.target.value)} />
        </div>
      </div>
      <div className="admin-grid-2">
        <div className="admin-field">
          <label>{t('admin.category')}</label>
          <select className="admin-input" value={category} onChange={e => setCategory(e.target.value)}>
            {categoryOptions.map(cat => (
              <option key={cat} value={cat}>
                {t(`gallery.categories.${cat}`, cat)}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label>{t('admin.difficulty')}</label>
          <select className="admin-input" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
            {DIFFICULTIES.filter(d => d !== 'all').map(d => (
              <option key={d} value={d}>{t(`gallery.difficulties.${d}`)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-field">
        <label>{t('admin.patternJson')}</label>
        <textarea
          className="admin-textarea"
          value={patternJson}
          onChange={e => setPatternJson(e.target.value)}
          placeholder='[[null, "#FFD700", "#FFD700", null], ...]'
        />
        <div className="admin-field-hint">{t('admin.patternJsonHint')}</div>
      </div>

      {preview && (
        <div className="admin-field">
          <label>{t('admin.colors')}<span className="admin-field-hint"> — {t('admin.colorsHint')}</span></label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 6, padding: 4, border: '1px solid var(--border-color)' }}>
              <ThumbnailCanvas pattern={preview.pattern} size={preview.size} />
            </div>
            <div className="admin-color-dots">
              {preview.colors.map((c, i) => (
                <span key={i} className="admin-color-dot" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="admin-errors">
          {errors.map((err, i) => (
            <li key={i}>{t(`admin.err.${err.code}`)} {err.detail || ''}</li>
          ))}
        </ul>
      )}

      <div className="admin-actions">
        <button className="admin-btn primary" onClick={handleSave}>{t('admin.save')}</button>
        <button className="admin-btn secondary" onClick={onDone}>{t('admin.cancel')}</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// JSON 导入(单条或数组,统一协议;AI Agent 生成后直接粘贴导入)
// ─────────────────────────────────────────────────────────────
function JsonImporter({ store }) {
  const { t } = useTranslation()
  const [json, setJson] = useState('')
  const [errors, setErrors] = useState([])
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleImport = () => {
    setResult(null)
    let parsed
    try {
      parsed = JSON.parse(json)
    } catch (e) {
      setErrors([{ code: 'jsonParse', detail: e.message }])
      return
    }
    setErrors([])
    const items = Array.isArray(parsed) ? parsed : [parsed]
    let ok = 0
    const failed = []
    items.forEach((item, index) => {
      const res = store.addTemplate(item)
      if (res.ok) ok++
      else failed.push({ index: index + 1, errors: res.errors })
    })
    setResult({ ok, failed })
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_JSON)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 剪贴板不可用时忽略 */ }
  }

  return (
    <div>
      <div className="admin-card">
        <h3>{t('admin.protocolTitle')}</h3>
        <p className="admin-field-hint" style={{ marginBottom: 8 }}>{t('admin.protocolHint')}</p>
        <div className="admin-pre">{EXAMPLE_JSON}</div>
        <div className="admin-actions">
          <button className="admin-btn secondary" onClick={handleCopy}>
            {copied ? t('admin.copied') : t('admin.copyExample')}
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h3>{t('admin.importJson')}</h3>
        <div className="admin-field">
          <textarea
            className="admin-textarea"
            value={json}
            onChange={e => setJson(e.target.value)}
            placeholder={t('admin.importJsonHint')}
          />
        </div>
        {errors.length > 0 && (
          <ul className="admin-errors">
            {errors.map((err, i) => (
              <li key={i}>{t(`admin.err.${err.code}`)} {err.detail || ''}</li>
            ))}
          </ul>
        )}
        <div className="admin-actions">
          <button className="admin-btn primary" onClick={handleImport}>{t('admin.importBtn')}</button>
        </div>
        {result && (
          <div className={`admin-result ${result.failed.length > 0 ? 'warn' : 'ok'}`}>
            {t('admin.importSuccess', { n: result.ok })}
            {result.failed.length > 0 && (
              <>
                <br />
                {t('admin.importFailed', { n: result.failed.length })}
                <ul className="admin-errors">
                  {result.failed.map(f => (
                    <li key={f.index}>
                      #{f.index}: {f.errors.map(err => t(`admin.err.${err.code}`)).join('; ')}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 分类管理(内置只读 + 自定义增删改)
// ─────────────────────────────────────────────────────────────
function CategoryManager({ store }) {
  const { t } = useTranslation()
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState([])

  const builtin = CATEGORIES.filter(c => c !== 'all')

  const handleSave = () => {
    const res = editingId === null
      ? store.addCategory({ id: id.trim(), label: label.trim() })
      : store.updateCategory(editingId, { id: id.trim(), label: label.trim() })
    if (!res.ok) {
      setErrors(res.errors)
      return
    }
    setErrors([])
    setId('')
    setLabel('')
    setEditingId(null)
  }

  const startEdit = (cat) => {
    setEditingId(cat.id)
    setId(cat.id)
    setLabel(cat.label)
    setErrors([])
  }

  return (
    <div>
      <div className="admin-card">
        <h3>{t('admin.builtinCategories')}</h3>
        <div>
          {builtin.map(cat => (
            <div key={cat} className="admin-category-row">
              <span className="admin-category-id">{cat}</span>
              <span className="admin-category-label">{t(`gallery.categories.${cat}`)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-card">
        <h3>{t('admin.customCategories')}</h3>
        {store.categories.length === 0 ? (
          <div className="admin-empty">{t('admin.noCustomCategories')}</div>
        ) : (
          <div>
            {store.categories.map(cat => (
              <div key={cat.id} className="admin-category-row">
                <span className="admin-category-id">{cat.id}</span>
                <span className="admin-category-label">{cat.label}</span>
                <button className="admin-btn secondary small" onClick={() => startEdit(cat)}>
                  {t('admin.editTemplate')}
                </button>
                <button
                  className="admin-btn danger small"
                  onClick={() => {
                    if (window.confirm(`${t('admin.deleteConfirm')}\n「${cat.label}」`)) store.deleteCategory(cat.id)
                  }}
                >
                  {t('admin.delete')}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="admin-row-form">
          <input
            className="admin-input"
            placeholder={t('admin.categoryId')}
            value={id}
            onChange={e => setId(e.target.value)}
          />
          <input
            className="admin-input"
            placeholder={t('admin.categoryLabel')}
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
          <button className="admin-btn primary" onClick={handleSave}>
            {editingId === null ? t('admin.addCategory') : t('admin.save')}
          </button>
          {editingId !== null && (
            <button className="admin-btn secondary" onClick={() => { setEditingId(null); setId(''); setLabel('') }}>
              {t('admin.cancel')}
            </button>
          )}
        </div>
        {errors.length > 0 && (
          <ul className="admin-errors">
            {errors.map((err, i) => (
              <li key={i}>{t(`admin.err.${err.code}`)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
