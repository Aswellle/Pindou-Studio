import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from './Toast'
import { CATEGORIES, DIFFICULTIES, normalizeCustomTemplate } from '../data/templates'
import ThumbnailCanvas from './ThumbnailCanvas'
import LoadingScreen from './LoadingScreen'
import UserManager from './UserManager'

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

// 后台共用模态框:全屏遮罩 + 居中卡片 + 标题栏 + 内容区自滚动。
// 新增/编辑/删除确认等操作统一走模态框,减少页面纵向滚动。
function AdminModal({ title, onClose, wide, children }) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className={`admin-modal${wide ? ' wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>{title}</h3>
          <button className="admin-modal-close" onClick={onClose} aria-label="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
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
// · 未登录 → 引导前往 /login 登录/注册(注册需邮箱验证)
// · 非 admin 账号 → 无权限提示
// · admin → 管理内容(云端模板库 CRUD,RLS 服务端强制 admin 权限)
// ─────────────────────────────────────────────────────────────
export default function AdminPanel({ user, isAdmin, authLoading, onLogin, onLogout, onChangePassword, cloudStore }) {
  const toast = useToast()
  const { t } = useTranslation()
  const [tab, setTab] = useState('templates')

  // iOS Safari 已知 bug:overflow 滚动容器内的 input/textarea 聚焦时,
  // 键盘弹起瞬间容器重排,偶发整段内容白屏。修复:聚焦瞬间把滚动容器
  // overflow-y 切 hidden 再恢复,强制 iOS 重新布局重绘(用户无感知)。
  useEffect(() => {
    if (!/iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return
    const handler = (e) => {
      const el = e.target
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return
      const scroller = el.closest('.admin-panel')
      if (scroller) {
        scroller.style.overflowY = 'hidden'
        requestAnimationFrame(() => { scroller.style.overflowY = '' })
      }
    }
    document.addEventListener('focusin', handler, true)
    return () => document.removeEventListener('focusin', handler, true)
  }, [])
  // 修改密码(旧密码验证)模态框状态
  const [showChangePw, setShowChangePw] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  // 退出登录确认(防误触)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const renderSignOutConfirm = () => confirmSignOut && (
    <AdminModal title={t('admin.confirmSignOutTitle')} onClose={() => setConfirmSignOut(false)}>
      <p className="admin-modal-text">{t('admin.confirmSignOutHint')}</p>
      <div className="admin-actions">
        <button className="admin-btn secondary" onClick={() => setConfirmSignOut(false)}>{t('admin.cancel')}</button>
        <button className="admin-btn danger" onClick={() => { setConfirmSignOut(false); onLogout() }}>{t('admin.signOut')}</button>
      </div>
    </AdminModal>
  )

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
        <LoadingScreen text={t('admin.gate.checking')} />
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
          <button className="admin-btn secondary" onClick={() => setConfirmSignOut(true)}>{t('admin.signOut')}</button>
          {renderSignOutConfirm()}
        </div>
        <GateStyle />
      </div>
    )
  }

  // 修改密码:旧密码验证 + 新密码(与个人资料一致,不再发邮件)
  const handleChangePassword = async () => {
    if (!oldPw) { setPwError(t('profile.oldPasswordRequired')); return }
    if (newPw.length < 6) { setPwError(t('errors.passwordTooShort')); return }
    if (newPw !== newPw2) { setPwError(t('errors.passwordMismatch')); return }
    setPwBusy(true)
    setPwError('')
    try {
      await onChangePassword(user.email, oldPw, newPw)
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2000)
      setOldPw('')
      setNewPw('')
      setNewPw2('')
      setShowChangePw(false)
    } catch {
      setPwError(t('profile.wrongPassword'))
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-header-main">
          <h1 className="admin-title">{t('admin.title')}</h1>
          <p className="admin-subtitle">{t('admin.subtitle')}</p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-account">
            <span className="admin-avatar">{(user.email || 'A')[0].toUpperCase()}</span>
            <span className="admin-account-name">{user.email}</span>
            <span className="admin-role-badge">ADMIN</span>
          </span>
          <button className="admin-btn secondary" onClick={() => { setShowChangePw(true); setPwError('') }}>
            {t('profile.changePassword')}
          </button>
          <button className="admin-btn secondary" onClick={() => setConfirmSignOut(true)}>
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
        <button role="tab" aria-selected={tab === 'users'} className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          {t('admin.tab.users')}
        </button>
      </div>

      <div className="admin-tab-content" key={tab}>
        {/* 用户管理不依赖云端模板库:切到该标签时不应被模板加载态阻塞 */}
        {tab === 'users' ? (
          <UserManager />
        ) : cloudStore.loading ? (
          <LoadingScreen text={t('gallery.cloudLoading')} />
        ) : (
          <>
            {tab === 'templates' && <TemplateManager store={cloudStore} />}
            {tab === 'import' && <JsonImporter store={cloudStore} />}
            {tab === 'categories' && <CategoryManager store={cloudStore} />}
          </>
        )}
      </div>

      {/* 修改密码 → 模态框(旧密码验证 + 新密码) */}
      {showChangePw && (
        <AdminModal title={t('profile.changePasswordTitle')} onClose={() => setShowChangePw(false)}>
          <div className="admin-field">
            <label>{t('profile.oldPassword')}</label>
            <input
              className="admin-input"
              type="password"
              value={oldPw}
              onChange={e => { setOldPw(e.target.value); setPwError('') }}
              autoComplete="current-password"
            />
          </div>
          <div className="admin-field">
            <label>{t('profile.newPassword')}</label>
            <input
              className="admin-input"
              type="password"
              value={newPw}
              onChange={e => { setNewPw(e.target.value); setPwError('') }}
              autoComplete="new-password"
            />
          </div>
          <div className="admin-field">
            <label>{t('profile.confirmNewPassword')}</label>
            <input
              className="admin-input"
              type="password"
              value={newPw2}
              onChange={e => { setNewPw2(e.target.value); setPwError('') }}
              autoComplete="new-password"
            />
          </div>
          {pwError && <div className="admin-result warn">{pwError}</div>}
          {pwSaved && <div className="admin-result ok">{t('profile.passwordUpdated')}</div>}
          <div className="admin-actions">
            <button className="admin-btn primary" disabled={pwBusy} onClick={handleChangePassword}>
              {pwBusy ? t('auth.processing') : t('common.save')}
            </button>
            <button className="admin-btn secondary" disabled={pwBusy} onClick={() => setShowChangePw(false)}>
              {t('admin.cancel')}
            </button>
          </div>
        </AdminModal>
      )}

      {renderSignOutConfirm()}

      <style>{`
        .admin-panel {
          max-width: 860px;
          margin: 0 auto;
          padding: 20px 16px 48px;
          font-size: var(--text-base);
          /* 后台全屏布局:在 flex 容器内占满并自持滚动(桌面 main-content 与
             移动端 mobile-layout 均无顶部导航时);scrollbar-gutter 常驻滚动条
             空间,避免 tab 切换时视口宽度抖动 */
          width: 100%;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          /* 注意:不加 -webkit-overflow-scrolling:touch —— iOS 15+ 默认即该
             行为,显式设置与滚动容器内 input 聚焦存在已知白屏冲突 bug */
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
          gap: 10px;
          background: linear-gradient(135deg, var(--bg-secondary), var(--bg-hover));
          border: 1px solid var(--border-color);
          border-radius: 999px;
          padding: 6px 18px 6px 6px;
          font-size: var(--text-base);
          color: var(--text-primary);
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(43, 36, 32, 0.08);
        }
        .admin-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          font-size: 15px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.15);
        }
        .admin-account-name {
          font-weight: 600;
          font-size: var(--text-md);
        }
        .admin-role-badge {
          background: var(--accent);
          color: white;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.6px;
          border-radius: 999px;
          padding: 3px 10px;
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
          /* 仅透明度过渡:不使用 transform 动画 —— iOS Safari 在输入框聚焦
             时若页面仍在播放 transform 动画,会触发渲染层失效导致局部白板 */
          animation: adminFadeIn 0.15s ease;
        }
        @keyframes adminFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
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
          transition: border-color 0.15s;
          /* iOS Safari 输入框渲染稳定性:禁用原生外观 + 建立独立渲染层,
             避免聚焦时触发整段内容白板的已知 bug */
          -webkit-appearance: none;
          appearance: none;
          position: relative;
          z-index: 1;
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--accent);
          /* 聚焦光圈用 border 颜色表达,不用 box-shadow 扩散 ——
             iOS 上 input 聚焦 + box-shadow 重绘偶发渲染异常 */
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
        /* ── 模态框 ───────────────────────────────────────── */
        .admin-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
          box-sizing: border-box;
        }
        .admin-modal {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(43, 36, 32, 0.22);
          width: min(480px, 100%);
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: adminModalIn 0.18s ease;
        }
        .admin-modal.wide { width: min(720px, 100%); }
        @keyframes adminModalIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        .admin-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
        }
        .admin-modal-header h3 {
          margin: 0;
          font-size: var(--text-lg);
          font-weight: var(--font-weight-semibold);
        }
        .admin-modal-close {
          border: none;
          background: var(--bg-secondary);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .admin-modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
        .admin-modal-body {
          padding: 20px;
          overflow-y: auto;
          min-height: 0;
        }
        .admin-modal-text {
          margin: 0 0 4px;
          font-size: var(--text-base);
          color: var(--text-primary);
          word-break: break-all;
        }
        /* 卡片标题行:标题 + 右侧操作按钮 */
        .admin-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .admin-card-head h3 { margin: 0; }

        @media (max-width: 640px) {
          .admin-grid-2 { grid-template-columns: 1fr; }
          .admin-template-row { flex-wrap: wrap; }
          .admin-header-actions { width: 100%; }
          .admin-account { width: 100%; justify-content: flex-start; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 模板管理(列表 + 新增/编辑表单)
// ─────────────────────────────────────────────────────────────
// 模板库统计概览(替代已不再需要的「本地数据迁移到云端」卡片)
function TemplateStats({ store }) {
  const { t } = useTranslation()
  const stats = useMemo(() => {
    const tpls = store.templates
    return {
      total: tpls.length,
      builtin: tpls.filter(x => x.source === 'builtin').length,
      custom: tpls.filter(x => x.source !== 'builtin').length,
      categories: store.categories.length,
      downloads: tpls.reduce((sum, x) => sum + (x.downloadCount || 0), 0),
    }
  }, [store.templates, store.categories])

  const cards = [
    { label: t('admin.stats.totalTemplates'), value: stats.total, tone: 'accent' },
    { label: t('admin.stats.builtin'), value: stats.builtin, tone: 'ok' },
    { label: t('admin.stats.custom'), value: stats.custom, tone: 'warn' },
    { label: t('admin.stats.totalCategories'), value: stats.categories, tone: 'accent' },
    { label: t('admin.stats.totalDownloads'), value: stats.downloads.toLocaleString(), tone: 'ok' },
  ]

  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <h3>{t('admin.stats.title')}</h3>
      </div>
      <div className="tpl-stats">
        {cards.map(c => (
          <div key={c.label} className={`tpl-stat-card ${c.tone}`}>
            <span className="tpl-stat-value">{c.value ?? '—'}</span>
            <span className="tpl-stat-label">{c.label}</span>
          </div>
        ))}
      </div>
      <style>{`
        .tpl-stats {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }
        .tpl-stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 14px 8px;
          border-radius: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
        }
        .tpl-stat-card.accent { border-color: var(--accent); background: var(--accent-soft); }
        .tpl-stat-card.ok { border-color: var(--secondary-accent); background: rgba(74, 155, 142, 0.08); }
        .tpl-stat-card.warn { border-color: var(--warning); background: var(--warning-bg); }
        .tpl-stat-value {
          font-size: var(--text-2xl);
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .tpl-stat-label {
          font-size: 11px;
          color: var(--text-secondary);
          text-align: center;
        }
        @media (max-width: 640px) {
          .tpl-stats { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}

function TemplateManager({ store }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  // 'new' 或模板 id → 打开新增/编辑模态框;null 关闭
  const [editing, setEditing] = useState(null)
  // 待删除确认的模板 → 打开删除确认模态框
  const [deleting, setDeleting] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return store.templates.filter(tpl =>
      !q || tpl.name.toLowerCase().includes(q) || (tpl.nameZh || '').toLowerCase().includes(q)
    )
  }, [store.templates, search])

  return (
    <div>
      <TemplateStats store={store} />
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
                <button className="admin-btn danger small" onClick={() => setDeleting(tpl)}>
                  {t('admin.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑模板 → 模态框(不插入列表顶部,列表位置保持不变) */}
      {editing && (
        <AdminModal
          title={editing === 'new' ? t('admin.addTemplate') : t('admin.editTemplate')}
          onClose={() => setEditing(null)}
          wide
        >
          <TemplateForm
            store={store}
            editing={editing}
            initial={editing === 'new' ? null : store.templates.find(tpl => tpl.id === editing)}
            onDone={() => setEditing(null)}
          />
        </AdminModal>
      )}

      {/* 删除确认 → 模态框(替代 window.confirm) */}
      {deleting && (
        <AdminModal title={t('admin.deleteConfirm')} onClose={() => setDeleting(null)}>
          <p className="admin-modal-text">
            「{deleting.nameZh || deleting.name}」
          </p>
          <div className="admin-actions">
            <button
              className="admin-btn danger"
              onClick={async () => {
                const res = await store.deleteTemplate(deleting.id)
                if (!res?.ok) { toast(res?.errors?.[0]?.detail || t('admin.deleteFailed'), 'error'); return }
                setDeleting(null)
              }}
            >
              {t('admin.delete')}
            </button>
            <button className="admin-btn secondary" onClick={() => setDeleting(null)}>
              {t('admin.cancel')}
            </button>
          </div>
        </AdminModal>
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
    <div>
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
  const toast = useToast()
  const [json, setJson] = useState('')
  const [errors, setErrors] = useState([])
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef(null)

  // 从本机 .json 文件读取内容填入文本区(不自动导入,便于用户先核对再点导入)
  const MAX_IMPORT_BYTES = 1024 * 1024 // 1MB 上限,防超大 JSON 同步解析冻结主线程
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许连续选择同一文件
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) return toast(t('admin.fileTooLarge'), 'error')
    const reader = new FileReader()
    reader.onload = () => {
      setJson(String(reader.result || ''))
      setErrors([])
      setResult(null)
    }
    reader.onerror = () => toast(t('admin.fileReadError'), 'error')
    reader.readAsText(file)
  }

  const handleClear = () => {
    setJson('')
    setErrors([])
    setResult(null)
  }

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
    if (items.length === 0) { setErrors([{ code: 'importEmpty', detail: t('admin.importEmpty') }]); return }
    if (items.length > 50) { setErrors([{ code: 'importTooMany', detail: t('admin.importTooMany') }]); return }
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
        <div className="admin-card-head">
          <h3>{t('admin.importJson')}</h3>
          <div className="admin-actions" style={{ marginTop: 0 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <button className="admin-btn secondary small" onClick={() => fileInputRef.current?.click()}>
              {t('admin.importFromFile')}
            </button>
            <button className="admin-btn secondary small" onClick={handleClear} disabled={!json}>
              {t('admin.clear')}
            </button>
          </div>
        </div>
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
  const [showForm, setShowForm] = useState(false) // 新增/编辑分类模态框
  const [deleting, setDeleting] = useState(null)   // 待删除确认的分类

  const builtin = CATEGORIES.filter(c => c !== 'all')

  const handleSave = async () => {
    const res = editingId === null
      ? await store.addCategory({ id: id.trim(), label: label.trim() })
      : await store.updateCategory(editingId, { id: id.trim(), label: label.trim() })
    if (!res?.ok) {
      setErrors(res?.errors || [])
      return
    }
    setErrors([])
    setId('')
    setLabel('')
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (cat) => {
    setEditingId(cat.id)
    setId(cat.id)
    setLabel(cat.label)
    setErrors([])
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setId('')
    setLabel('')
    setErrors([])
  }

  return (
    <div>
      <div className="admin-card">
        <div className="admin-card-head">
          <h3>{t('admin.builtinCategories')}</h3>
        </div>
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
        <div className="admin-card-head">
          <h3>{t('admin.customCategories')}</h3>
          <button className="admin-btn primary small" onClick={() => { setEditingId(null); setId(''); setLabel(''); setErrors([]); setShowForm(true) }}>
            {t('admin.addCategory')}
          </button>
        </div>
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
                <button className="admin-btn danger small" onClick={() => setDeleting(cat)}>
                  {t('admin.delete')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增/编辑分类 → 模态框 */}
      {showForm && (
        <AdminModal
          title={editingId === null ? t('admin.addCategory') : t('admin.editTemplate')}
          onClose={closeForm}
        >
          <div className="admin-field">
            <label>{t('admin.categoryId')}</label>
            <input
              className="admin-input"
              placeholder={t('admin.categoryId')}
              value={id}
              onChange={e => setId(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label>{t('admin.categoryLabel')}</label>
            <input
              className="admin-input"
              placeholder={t('admin.categoryLabel')}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          {errors.length > 0 && (
            <ul className="admin-errors">
              {errors.map((err, i) => (
                <li key={i}>{t(`admin.err.${err.code}`)}</li>
              ))}
            </ul>
          )}
          <div className="admin-actions">
            <button className="admin-btn primary" onClick={handleSave}>{t('admin.save')}</button>
            <button className="admin-btn secondary" onClick={closeForm}>{t('admin.cancel')}</button>
          </div>
        </AdminModal>
      )}

      {/* 删除确认 → 模态框 */}
      {deleting && (
        <AdminModal title={t('admin.deleteConfirm')} onClose={() => setDeleting(null)}>
          <p className="admin-modal-text">「{deleting.label}」</p>
          <div className="admin-actions">
            <button
              className="admin-btn danger"
              onClick={async () => {
                const res = await store.deleteCategory(deleting.id)
                if (!res?.ok) { toast(res?.errors?.[0]?.detail || t('admin.deleteFailed'), 'error'); return }
                setDeleting(null)
              }}
            >
              {t('admin.delete')}
            </button>
            <button className="admin-btn secondary" onClick={() => setDeleting(null)}>
              {t('admin.cancel')}
            </button>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
