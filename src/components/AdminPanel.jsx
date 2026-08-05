import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, DIFFICULTIES, TEMPLATES, normalizeCustomTemplate } from '../data/templates'
import ThumbnailCanvas from './ThumbnailCanvas'

// 门禁/提示卡片的共用样式
function GateStyle() {
  return (
    <style>{`
      .admin-gate {
        max-width: 420px;
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
      .admin-gate .admin-btn { align-self: center; padding: 0 32px; }
      .admin-gate .admin-subtitle { line-height: 1.6; }
    `}</style>
  )
}

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
// 后台访问门禁(真实账号体系)
// · 云端未配置 → 显示配置指引
// · 未登录 → 引导通过 AuthModal 登录/注册(注册需邮箱验证)
// · 非 admin 账号 → 无权限提示
// · admin → 管理内容(云端模板库 CRUD,RLS 服务端强制 admin 权限)
// ─────────────────────────────────────────────────────────────
export default function AdminPanel({ user, isAdmin, authLoading, onLogin, onLogout, onResetPassword, cloudStore }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('templates')
  const [resetMsg, setResetMsg] = useState('')

  const cloudEnabled = !!cloudStore?.enabled

  if (!cloudEnabled) {
    return (
      <div className="admin-panel">
        <div className="admin-gate">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h1 className="admin-title">{t('admin.gate.setupTitle')}</h1>
          <p className="admin-subtitle">{t('admin.gate.setupHint')}</p>
        </div>
        <GateStyle />
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="admin-panel">
        <div className="admin-empty">{t('admin.gate.checking')}</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="admin-panel">
        <div className="admin-gate">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h1 className="admin-title">{t('admin.gate.loginTitle')}</h1>
          <p className="admin-subtitle">{t('admin.gate.loginHint')}</p>
          <button className="admin-btn primary" onClick={onLogin}>{t('admin.gate.loginBtn')}</button>
        </div>
        <GateStyle />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-panel">
        <div className="admin-gate">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <h1 className="admin-title">{t('admin.gate.noPermission')}</h1>
          <p className="admin-subtitle">{t('admin.gate.noPermissionHint')}</p>
          <button className="admin-btn secondary" onClick={onLogout}>{t('admin.signOut')}</button>
        </div>
        <GateStyle />
      </div>
    )
  }

  const handleResetPassword = () => {
    if (!user?.email) return
    onResetPassword(user.email)
      .then(() => setResetMsg(t('admin.resetSent')))
      .catch(() => setResetMsg(''))
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-header-main">
          <h1 className="admin-title">{t('admin.title')}</h1>
          <p className="admin-subtitle">{t('admin.subtitle')}</p>
          {resetMsg && <div className="admin-result ok">{resetMsg}</div>}
        </div>
        <div className="admin-header-actions">
          <span className="admin-account">{user.email} · Admin</span>
          <button className="admin-btn secondary small" onClick={handleResetPassword}>
            {t('admin.resetPassword')}
          </button>
          <button className="admin-btn secondary small" onClick={onLogout}>
            {t('admin.signOut')}
          </button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'templates'} className={`admin-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
          {t('admin.tab.templates')}
        </button>
        <button role="tab" aria-selected={tab === 'import'} className={`admin-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>
          {t('admin.tab.import')}
        </button>
        <button role="tab" aria-selected={tab === 'categories'} className={`admin-tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}>
          {t('admin.tab.categories')}
        </button>
      </div>

      <div className="admin-tab-content" key={tab}>
        {tab === 'templates' && <TemplateManager store={cloudStore} />}
        {tab === 'import' && <JsonImporter store={cloudStore} />}
        {tab === 'categories' && <CategoryManager store={cloudStore} />}
      </div>

      <style>{`
        .admin-panel {
          max-width: 860px;
          margin: 0 auto;
          padding: 20px 16px 48px;
          font-size: var(--text-base);
          /* PC 端父容器(.main-content overflow:hidden)内自持滚动;
             scrollbar-gutter 常驻滚动条空间,避免 tab 切换时视口宽度抖动 */
          height: 100%;
          overflow-y: auto;
          scrollbar-gutter: stable;
          box-sizing: border-box;
        }
        .admin-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .admin-header-main { min-width: 0; }
        .admin-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .admin-account {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 999px;
          padding: 3px 12px;
          font-size: 12px;
          color: var(--text-secondary);
          font-family: ui-monospace, monospace;
          white-space: nowrap;
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
          gap: 6px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 10px;
          overflow-x: auto;
        }
        .admin-tab {
          border: none;
          background: transparent;
          color: var(--text-secondary);
          height: 36px;
          padding: 0 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 500;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .admin-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
        .admin-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .admin-tab.active {
          background: var(--accent);
          color: white;
          box-shadow: 0 2px 8px rgba(43, 36, 32, 0.18);
        }
        .admin-tab-content {
          min-height: 55vh;
          animation: adminFadeIn 0.18s ease;
        }
        @keyframes adminFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: none; }
        }
        .admin-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          padding: 16px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(43, 36, 32, 0.05);
        }
        .admin-card h3 {
          margin: 0 0 12px;
          font-size: var(--text-lg);
          font-weight: var(--font-weight-semibold);
        }
        .admin-input {
          width: 100%;
          box-sizing: border-box;
          height: 38px;
          padding: 0 10px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: var(--text-base);
          font-family: inherit;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(229, 57, 53, 0.12);
        }
        .admin-input::placeholder { color: var(--text-muted); }
        select.admin-input { cursor: pointer; }
        .admin-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
          background: var(--bg-primary);
          color: var(--text-primary);
          min-height: 160px;
          resize: vertical;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .admin-textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(229, 57, 53, 0.12);
        }
        .admin-field {
          margin-bottom: 14px;
        }
        .admin-field label {
          display: block;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .admin-field-hint {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 6px;
          line-height: 1.5;
        }
        .admin-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .admin-btn {
          border: none;
          border-radius: 8px;
          height: 36px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-sm);
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.15s, box-shadow 0.15s, transform 0.1s, opacity 0.15s;
        }
        .admin-btn:active { transform: translateY(1px); }
        .admin-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .admin-btn.primary { background: var(--accent); color: white; }
        .admin-btn.primary:hover { background: var(--accent-hover); box-shadow: 0 2px 8px rgba(43, 36, 32, 0.18); }
        .admin-btn.secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); }
        .admin-btn.secondary:hover { background: var(--bg-hover); }
        .admin-btn.danger { background: var(--error); color: white; }
        .admin-btn.danger:hover { background: var(--error); opacity: 0.9; }
        .admin-btn.small { height: 28px; padding: 0 10px; font-size: 12px; }
        .admin-btn:disabled { opacity: 0.5; cursor: not-allowed; }
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
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .admin-template-row:hover {
          border-color: var(--accent);
          box-shadow: var(--shadow-card);
        }
        .admin-template-row .thumb {
          flex-shrink: 0;
          background: #fff;
          border-radius: 6px;
          padding: 4px;
          border: 1px solid var(--border-color);
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
          padding: 10px 0;
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
          flex-wrap: wrap;
        }
        .admin-row-form .admin-input { flex: 1; min-width: 140px; }
        .admin-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 640px) {
          /* 移动端由 .mobile-page-area 负责滚动,容器自身不滚动 */
          .admin-panel { height: auto; overflow: visible; }
          .admin-grid-2 { grid-template-columns: 1fr; }
          .admin-template-row { flex-wrap: wrap; }
          .admin-header-actions { width: 100%; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 模板管理(列表 + 新增/编辑表单)
// ─────────────────────────────────────────────────────────────
// 本地数据一次性迁移到云端(内置模板 + 本机自定义模板/分类)
function MigrationCard({ store }) {
  const { t } = useTranslation()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const localCustomCount = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('custom-templates') || '[]').length
    } catch {
      return 0
    }
  }, [])

  const run = async () => {
    setRunning(true)
    setResult(null)
    const res = await store.migrateLocalToCloud()
    setRunning(false)
    setResult(res)
  }

  return (
    <div className="admin-card">
      <h3>{t('admin.cloud.migrateTitle')}</h3>
      <p className="admin-field-hint">{t('admin.cloud.migrateHint')}</p>
      <p className="admin-field-hint">
        {t('admin.cloud.localCounts', { builtin: TEMPLATES.length, custom: localCustomCount })}
      </p>
      <div className="admin-actions">
        <button className="admin-btn primary" disabled={running} onClick={run}>
          {running ? t('auth.processing') : t('admin.cloud.migrateBtn')}
        </button>
      </div>
      {result?.ok && (
        <div className="admin-result ok" style={{ marginTop: 8 }}>
          {t('admin.cloud.migrateDone', { n: result.count })}
        </div>
      )}
      {result && !result.ok && (
        <div className="admin-result warn" style={{ marginTop: 8 }}>
          {t('admin.cloud.migrateFail', { detail: result.message })}
        </div>
      )}
    </div>
  )
}

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
      <MigrationCard store={store} />
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

  const handleSave = async () => {
    let pattern
    try {
      pattern = JSON.parse(patternJson)
    } catch (e) {
      setErrors([{ code: 'jsonParse', detail: e.message }])
      return
    }
    const input = { name, nameZh, category, difficulty, pattern }
    const res = editing === 'new'
      ? await store.addTemplate(input)
      : await store.updateTemplate(editing, input)
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

  const handleImport = async () => {
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
    for (let index = 0; index < items.length; index++) {
      const res = await store.addTemplate(items[index])
      if (res.ok) ok++
      else failed.push({ index: index + 1, errors: res.errors })
    }
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

  const handleSave = async () => {
    const res = editingId === null
      ? await store.addCategory({ id: id.trim(), label: label.trim() })
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
