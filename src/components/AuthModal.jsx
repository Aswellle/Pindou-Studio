import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// 将 Supabase 错误映射为本地化文案
function useErrorMapper() {
  const { t } = useTranslation()
  return (err) => {
    const msg = err?.message || ''
    if (msg === 'PASSWORD_MISMATCH') return t('errors.passwordMismatch')
    if (msg === 'CLOUD_NOT_CONFIGURED') return t('errors.cloudNotConfigured')
    if (/invalid login credentials/i.test(msg)) return t('errors.invalidCredentials')
    if (/email not confirmed/i.test(msg)) return t('errors.emailNotConfirmed')
    if (/already registered/i.test(msg)) return t('errors.emailInUse')
    if (/rate limit/i.test(msg)) return t('errors.tooManyAttempts')
    return msg
  }
}

export default function AuthModal({ mode, onClose, onLogin, onRegister, onResetPassword, onSwitchMode, onNavigatePage }) {
  const { t } = useTranslation()
  const mapError = useErrorMapper()
  const [view, setView] = useState(mode === 'register' ? 'register' : 'login') // login | register | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false) // 注册成功待邮箱验证
  const [resetSent, setResetSent] = useState(false)

  const switchView = (v) => {
    setView(v)
    setError('')
    setRegistered(false)
    setResetSent(false)
    if (v === 'login' || v === 'register') onSwitchMode(v)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (view === 'login') {
        await onLogin(email, password)
        onClose()
      } else if (view === 'register') {
        await onRegister(email, password, confirmPassword)
        // 邮箱验证开启:注册成功但尚未登录,提示去邮箱验证
        setRegistered(true)
      } else {
        await onResetPassword(email)
        setResetSent(true)
      }
    } catch (err) {
      setError(mapError(err))
    } finally {
      setLoading(false)
    }
  }

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="auth-header">
          <h2>
            {view === 'login' ? t('auth.login') : view === 'register' ? t('auth.register') : t('auth.resetTitle')}
          </h2>
          <p>
            {view === 'login' ? t('auth.welcomeBack') : view === 'register' ? t('auth.createAccount') : t('auth.resetHint')}
          </p>
        </div>

        {registered ? (
          <div className="auth-verify">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M22 2 11 13"/>
              <path d="M22 2 15 22l-4-9-9-4 20-7z"/>
            </svg>
            <p>{t('auth.verifyEmailTitle')}</p>
            <p className="hint">{t('auth.verifyEmailHint')}</p>
            <button className="btn btn-primary btn-full" onClick={() => switchView('login')}>
              {t('auth.loginNow')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">{t('auth.email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className={error && !validateEmail(email) ? 'error' : ''}
                required
              />
            </div>

            {view !== 'reset' && (
              <div className="form-group">
                <label htmlFor="password">{t('auth.password')}</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            {view === 'register' && (
              <div className="form-group">
                <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                {confirmPassword && confirmPassword !== password && (
                  <span className="error-message">{t('errors.passwordMismatch')}</span>
                )}
              </div>
            )}

            {error && (
              <div className="error-banner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {resetSent && (
              <div className="auth-verify hint">{t('auth.resetSent')}</div>
            )}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading
                ? t('auth.processing')
                : view === 'login' ? t('auth.login')
                : view === 'register' ? t('auth.register')
                : t('auth.sendReset')}
            </button>
          </form>
        )}

        <div className="auth-footer">
          {view === 'login' ? (
            <>
              {t('auth.noAccount')}
              <button className="link-btn" onClick={() => switchView('register')}>
                {t('auth.registerNow')}
              </button>
              <div>
                <button className="link-btn" onClick={() => switchView('reset')}>
                  {t('auth.forgotPassword')}
                </button>
              </div>
            </>
          ) : view === 'register' ? (
            <>
              {t('auth.hasAccount')}
              <button className="link-btn" onClick={() => switchView('login')}>
                {t('auth.loginNow')}
              </button>
            </>
          ) : (
            <button className="link-btn" onClick={() => switchView('login')}>
              {t('auth.loginNow')}
            </button>
          )}
        </div>

        <div className="auth-legal">
          <button className="legal-link-btn" onClick={() => onNavigatePage('privacy')}>隐私政策</button>
          <span className="legal-divider">·</span>
          <button className="legal-link-btn" onClick={() => onNavigatePage('terms')}>服务条款</button>
        </div>

        <style>{`
          .close-btn {
            position: absolute;
            top: 16px;
            right: 16px;
            padding: 4px;
            border-radius: 4px;
            color: var(--text-muted);
            transition: all 0.2s;
          }
          .close-btn:hover {
            color: var(--text-primary);
            background: var(--bg-secondary);
          }
          .auth-header {
            text-align: center;
            margin-bottom: 24px;
          }
          .auth-header h2 {
            font-size: var(--text-2xl);
            margin-bottom: 4px;
          }
          .auth-header p {
            color: var(--text-muted);
            font-size: var(--text-md);
          }
          .error-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background: var(--error-bg);
            border: 1px solid var(--error-border);
            border-radius: 6px;
            color: var(--error);
            font-size: var(--text-base);
            margin-bottom: 16px;
          }
          .auth-verify {
            text-align: center;
            padding: 16px 0;
          }
          .auth-verify svg {
            margin: 0 auto 12px;
          }
          .auth-verify p {
            margin: 6px 0;
          }
          .auth-verify .hint {
            color: var(--text-muted);
            font-size: var(--text-md);
            margin-bottom: 16px;
          }
          .auth-footer {
            text-align: center;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid var(--border-color);
            font-size: var(--text-md);
            color: var(--text-secondary);
          }
          .auth-legal {
            text-align: center;
            margin-top: 16px;
            font-size: var(--text-sm);
            color: var(--text-muted);
          }
          .legal-link-btn {
            color: var(--text-muted);
            background: none;
            border: none;
            cursor: pointer;
            padding: 0 4px;
            font-size: inherit;
            font-family: inherit;
          }
          .legal-link-btn:hover {
            color: var(--accent);
            text-decoration: underline;
          }
          .legal-divider {
            color: var(--text-muted);
            margin: 0 2px;
          }
          .link-btn {
            color: var(--accent);
            font-weight: var(--font-weight-semibold);
            margin-left: 4px;
            background: none;
            border: none;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
          }
          .link-btn:hover {
            text-decoration: underline;
          }
          .hint {
            color: var(--text-muted);
            font-size: var(--text-md);
          }
        `}</style>
      </div>
    </div>
  )
}
