import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function AuthModal({ mode, onClose, onLogin, onRegister, onSwitchMode }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isLogin = mode === 'login'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        await onLogin(email, password)
      } else {
        await onRegister(email, password, confirmPassword)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

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
          <h2>{isLogin ? t('auth.login') : t('auth.register')}</h2>
          <p>{isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}</p>
        </div>

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
            {error && !validateEmail(email) && (
              <span className="error-message">{t('errors.invalidEmail')}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={error && password.length < 6 ? 'error' : ''}
              required
            />
            {password.length > 0 && password.length < 6 && (
              <span className="hint">{t('errors.passwordTooShort')}</span>
            )}
          </div>

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={error && confirmPassword !== password ? 'error' : ''}
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

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading || (!isLogin && password !== confirmPassword)}
          >
            {loading ? t('auth.processing') : (isLogin ? t('auth.login') : t('auth.register'))}
          </button>
        </form>

        <div className="auth-footer">
          {isLogin ? (
            <>
              {t('auth.noAccount')}
              <button className="link-btn" onClick={() => onSwitchMode('register')}>
                {t('auth.registerNow')}
              </button>
            </>
          ) : (
            <>
              {t('auth.hasAccount')}
              <button className="link-btn" onClick={() => onSwitchMode('login')}>
                {t('auth.loginNow')}
              </button>
            </>
          )}
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
            font-size: 24px;
            margin-bottom: 4px;
          }
          .auth-header p {
            color: var(--text-muted);
            font-size: 14px;
          }
          .error-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background: #FFF0F0;
            border: 1px solid #FFD0D0;
            border-radius: 6px;
            color: var(--error);
            font-size: 13px;
            margin-bottom: 16px;
          }
          .auth-footer {
            text-align: center;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid var(--border-color);
            font-size: 14px;
            color: var(--text-secondary);
          }
          .link-btn {
            color: var(--accent);
            font-weight: 600;
            margin-left: 4px;
            background: none;
            border: none;
            cursor: pointer;
          }
          .link-btn:hover {
            text-decoration: underline;
          }
        `}</style>
      </div>
    </div>
  )
}
