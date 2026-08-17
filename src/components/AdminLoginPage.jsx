/**
 * 管理员专属登录面板(/admin/login)
 * 只用于后台鉴权:登录成功并检测为 admin 角色后才跳转 /admin;
 * 非管理员账号提示无权限。独立页(隐藏站点导航栏,只留 LOGO + 返回)。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabase'

export default function AdminLoginPage({ onLogin }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(email, password)
      // 登录成功:检测是否 admin 角色,是则进入后台,否则提示无权限
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { setError(t('errors.generic')); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle()
      if (profile?.role === 'admin') {
        navigate('/admin')
      } else {
        setError(t('admin.gate.notAdmin'))
      }
    } catch (err) {
      setError(/invalid login credentials/i.test(err?.message || '') ? t('errors.invalidCredentials') : (err?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page admin-login-page">
      <Link to="/" className="auth-logo" aria-label={t('app.title')}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect width="8" height="8" x="0" y="0" fill="#E53935"/><rect width="8" height="8" x="8" y="0" fill="#FDD835"/>
          <rect width="8" height="8" x="16" y="0" fill="#32CD32"/><rect width="8" height="8" x="24" y="0" fill="#1976D2"/>
          <rect width="8" height="8" x="0" y="8" fill="#F06292"/><rect width="8" height="8" x="8" y="8" fill="#BA68C8"/>
          <rect width="8" height="8" x="16" y="8" fill="#00BCD4"/><rect width="8" height="8" x="24" y="8" fill="#FF9800"/>
          <rect width="8" height="8" x="0" y="16" fill="#FFFFFF" stroke="#E0E0E0"/><rect width="8" height="8" x="8" y="16" fill="#9E9E9E"/>
          <rect width="8" height="8" x="16" y="16" fill="#000000"/><rect width="8" height="8" x="24" y="16" fill="#795548"/>
          <rect width="8" height="8" x="0" y="24" fill="#8D6E63"/><rect width="8" height="8" x="8" y="24" fill="#A1887F"/>
          <rect width="8" height="8" x="16" y="24" fill="#BDBDBD"/><rect width="8" height="8" x="24" y="24" fill="#6D4C41"/>
        </svg>
        <span className="auth-logo-text">{t('app.title')}</span>
      </Link>
      <div className="auth-card">
        <button className="auth-back" onClick={() => navigate('/')}>← {t('common.back')}</button>
        <div className="admin-login-badge">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>{t('admin.gate.loginTitle')}</span>
        </div>
        <p className="auth-sub-note">{t('admin.gate.loginHint')}</p>
        <form onSubmit={handleLogin} className="auth-form">
          <label className="auth-label">{t('auth.email')}</label>
          <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          <label className="auth-label">{t('auth.password')}</label>
          <input className="auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.loginBtn')}</button>
        </form>
      </div>

      <style>{`
        .auth-page {
          height: 100%;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 32px 16px 64px;
          background: var(--bg-primary);
          box-sizing: border-box;
        }
        .auth-logo {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin: 0 auto 18px;
          color: var(--text-primary);
          text-decoration: none;
        }
        .auth-logo-text { font-size: var(--text-xl); font-weight: var(--font-weight-semibold); }
        .auth-back {
          display: block;
          align-self: flex-start;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          padding: 0;
          margin-bottom: 10px;
        }
        .auth-back:hover { color: var(--accent); }
        .auth-card {
          width: 100%;
          max-width: 380px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 20px;
          box-shadow: var(--shadow-card);
          box-sizing: border-box;
        }
        .admin-login-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: var(--accent);
          font-size: var(--text-lg);
          font-weight: var(--font-weight-semibold);
          margin-bottom: 6px;
        }
        .auth-sub-note {
          text-align: center;
          font-size: var(--text-sm);
          color: var(--text-muted);
          margin: 0 0 14px;
        }
        .auth-form { display: flex; flex-direction: column; gap: 4px; }
        .auth-label { font-size: var(--text-sm); color: var(--text-secondary); font-weight: 600; margin-top: 6px; }
        .auth-input {
          width: 100%;
          padding: 9px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: var(--text-md);
          box-sizing: border-box;
        }
        .auth-input:focus { outline: 2px solid var(--accent); border-color: transparent; }
        .auth-error {
          background: #fdecea;
          color: #c0392b;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: var(--text-sm);
          margin-top: 8px;
        }
        .auth-btn-primary {
          margin-top: 14px;
          padding: 11px 0;
          border: none;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          font-size: var(--text-md);
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .auth-btn-primary:hover { background: var(--accent-hover); }
        .auth-btn-primary:disabled { opacity: 0.6; cursor: default; }
        @media (max-width: 640px) {
          .auth-page { padding: 16px 12px 48px; }
          .auth-card { padding: 18px 16px; }
        }
      `}</style>
    </div>
  )
}
