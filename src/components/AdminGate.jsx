import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadingScreen from './LoadingScreen'

/**
 * 后台门禁 —— 云端未配置 / 会话检查中 / 未登录 / 非管理员 四种前置状态统一处理,
 * 通过后渲染 children。AdminPanel(/admin)与 AdminDashboardPage(/admin/dashboard)
 * 共用同一实现:此前 /admin/dashboard 完全没有门禁,未登录访客也能打开,
 * 概览数据虽由 RPC 的 is_admin() 兜底拒绝,但页面本身不该对非管理员可见。
 *
 * 样式自带(admin-gate-* 前缀,见 index.css),不依赖 AdminPanel 的 inline 样式,
 * 因此两个页面都能独立渲染。
 *
 * children 传函数(render prop)而非 JSX:JSX 子节点会在父组件渲染时**提前求值**,
 * 未登录时 AdminPanel 头部会直接读 user.email → 空指针白屏。授权分支才调用 children()。
 */
export default function AdminGate({ cloudEnabled, authLoading, user, isAdmin, onLogin, onLogout, children }) {
  const { t } = useTranslation()
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const wrap = (node) => <div className="admin-gate-page">{node}</div>

  if (!cloudEnabled) {
    return wrap(
      <div className="admin-gate">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h1>{t('admin.gate.setupTitle')}</h1>
        <p>{t('admin.gate.setupHint')}</p>
      </div>,
    )
  }

  if (authLoading) {
    return wrap(<LoadingScreen text={t('admin.gate.checking')} />)
  }

  if (!user) {
    return wrap(
      <div className="admin-gate">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h1>{t('admin.gate.loginTitle')}</h1>
        <p>{t('admin.gate.loginHint')}</p>
        <button type="button" className="admin-gate-btn primary" onClick={onLogin}>{t('admin.gate.loginBtn')}</button>
      </div>,
    )
  }

  if (!isAdmin) {
    return wrap(
      <div className="admin-gate">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <h1>{t('admin.gate.noPermission')}</h1>
        <p>{t('admin.gate.noPermissionHint')}</p>
        <button type="button" className="admin-gate-btn secondary" onClick={() => setConfirmSignOut(true)}>{t('admin.signOut')}</button>
        {confirmSignOut && (
          <div className="admin-modal-overlay" onClick={() => setConfirmSignOut(false)}>
            <div className="admin-gate-confirm" onClick={(e) => e.stopPropagation()}>
              <h3>{t('admin.confirmSignOutTitle')}</h3>
              <p>{t('admin.confirmSignOutHint')}</p>
              <div className="admin-gate-confirm-actions">
                <button type="button" className="admin-gate-btn secondary" onClick={() => setConfirmSignOut(false)}>{t('admin.cancel')}</button>
                <button type="button" className="admin-gate-btn danger" onClick={() => { setConfirmSignOut(false); onLogout() }}>{t('admin.signOut')}</button>
              </div>
            </div>
          </div>
        )}
      </div>,
    )
  }

  return typeof children === 'function' ? children() : children
}
