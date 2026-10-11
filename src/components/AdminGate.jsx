import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import LoadingScreen from './LoadingScreen'

/**
 * 后台门禁 —— 云端未配置 / 会话检查中 / 未登录 / 非管理员 / 需两步验证 五种前置状态
 * 统一处理,通过后渲染 children。AdminPanel(/admin)与 AdminDashboardPage(/admin/dashboard)
 * 共用同一实现:此前 /admin/dashboard 完全没有门禁,未登录访客也能打开,
 * 概览数据虽由 RPC 的 is_admin() 兜底拒绝,但页面本身不该对非管理员可见。
 *
 * 两步验证分支:客户端判据只有 role,而服务端 is_admin()(0019)还要求白名单 +
 * 可选强制 aal2 —— 已绑定 TOTP 的管理员若从普通登录页进来(aal1 会话),直接放行
 * 会在每个 RPC 上被拒且页面无从解释。这里在放行前查一次会话 Assurance,
 * nextLevel 为 aal2 时引导去 /admin/login 完成动态码校验;接口不可用时不阻断
 * (真正的强制仍由服务端 is_admin() 兜底)。
 *
 * 样式自带(admin-gate-* 前缀,见 index.css),不依赖 AdminPanel 的 inline 样式,
 * 因此两个页面都能独立渲染。
 *
 * children 传函数(render prop)而非 JSX:JSX 子节点会在父组件渲染时**提前求值**,
 * 未登录时 AdminPanel 头部会直接读 user.email → 空指针白屏。授权分支才调用 children()。
 */
export default function AdminGate({ cloudEnabled, authLoading, user, isAdmin, onLogin, onLogout, children }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  // pending → checking → ok | required(仅 user+isAdmin 分支关心;其余分支在它之前返回)
  const [assurance, setAssurance] = useState('pending')

  useEffect(() => {
    if (!user || !isAdmin) { setAssurance('ok'); return undefined }
    let alive = true
    setAssurance('checking')
    ;(async () => {
      try {
        if (!supabase) return
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (alive) setAssurance(data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2' ? 'required' : 'ok')
      } catch {
        if (alive) setAssurance('ok') // AAL 接口不可用:不做阻断,服务端会兜底
      }
    })()
    return () => { alive = false }
  }, [user, isAdmin])

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

  if (assurance === 'pending' || assurance === 'checking') {
    return wrap(<LoadingScreen text={t('admin.gate.checking')} />)
  }

  if (assurance === 'required') {
    return wrap(
      <div className="admin-gate">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          <circle cx="12" cy="15" r="1.4" fill="var(--accent)" stroke="none" />
        </svg>
        <h1>{t('admin.gate.mfaRequiredTitle')}</h1>
        <p>{t('admin.gate.mfaRequiredHint')}</p>
        <button type="button" className="admin-gate-btn primary" onClick={() => navigate('/admin/login')}>
          {t('admin.gate.mfaRequiredBtn')}
        </button>
      </div>,
    )
  }

  return typeof children === 'function' ? children() : children
}
