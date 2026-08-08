import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'

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
    if (/signup|sign up|not found/i.test(msg)) return t('errors.emailNotFound')
    return msg
  }
}

const RESEND_COOLDOWN = 60 // 重新发送验证码倒计时(秒)

export default function AuthModal({ mode, onClose, onLogin, onRegister, onSwitchMode, onNavigatePage, onSendOtp, onVerifyOtp, onSetPassword }) {
  const { t } = useTranslation()
  const mapError = useErrorMapper()
  // 视图:login | register | reset | verify(验证码输入) | setPassword(设置新密码)
  const [view, setView] = useState(mode === 'register' ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [token, setToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [pendingPassword, setPendingPassword] = useState('')
  const [verifyMode, setVerifyMode] = useState('register') // register | reset
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef(null)

  useEffect(() => {
    if (cooldown <= 0) return
    cooldownRef.current = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(cooldownRef.current)
  }, [cooldown])

  const switchView = (v) => {
    setView(v)
    setError('')
    if (v === 'login' || v === 'register') onSwitchMode(v)
  }

  // 发送验证码 — 返回是否成功,调用方按返回值决定流程(不再依赖过期闭包里的 error state)
  const sendCode = async (targetEmail, shouldCreateUser) => {
    setError('')
    setLoading(true)
    try {
      await onSendOtp(targetEmail, shouldCreateUser)
      setCooldown(RESEND_COOLDOWN)
      return true
    } catch (err) {
      setError(mapError(err))
      return false
    } finally {
      setLoading(false)
    }
  }

  // ── 登录(邮箱+密码) ─────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(email, password)
      onClose()
    } catch (err) {
      setError(mapError(err))
    } finally {
      setLoading(false)
    }
  }

  // ── 注册:先验证码验证邮箱,验证通过后设置密码 ──────────────
  const handleRegister = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError(t('errors.passwordMismatch'))
      return
    }
    if (password.length < 6) {
      setError(t('errors.passwordTooShort')) // 发码前拦截,与重置路径一致
      return
    }
    setPendingEmail(email.trim())
    setPendingPassword(password)
    setVerifyMode('register')
    const ok = await sendCode(email.trim(), true)
    if (ok) setView('verify')
  }

  // ── 忘记密码:验证码验证 → 设置新密码 ──────────────────────
  const handleReset = async (e) => {
    e.preventDefault()
    setPendingEmail(email.trim())
    setVerifyMode('reset')
    const ok = await sendCode(email.trim(), false)
    if (ok) setView('verify')
  }

  // ── 验证码提交 ──────────────────────────────────────────
  const handleVerify = async (e) => {
    e.preventDefault()
    if (token.trim().length < 6) {
      setError(t('auth.codeInvalid'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await onVerifyOtp(pendingEmail, token.trim())
      if (verifyMode === 'register') {
        // 注册:验证码证明邮箱归属,设置注册密码
        await onSetPassword(pendingPassword)
        onClose()
      } else {
        setView('setPassword')
      }
    } catch (err) {
      setError(mapError(err))
    } finally {
      setLoading(false)
    }
  }

  // ── 设置新密码(重置流程) ────────────────────────────────
  const handleSetPassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setError(t('errors.passwordTooShort'))
      return
    }
    if (newPassword !== newPassword2) {
      setError(t('errors.passwordMismatch'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await onSetPassword(newPassword)
      onClose()
    } catch (err) {
      setError(mapError(err))
    } finally {
      setLoading(false)
    }
  }

  const validateEmail = (em) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)

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
            {view === 'login' ? t('auth.login')
              : view === 'register' ? t('auth.register')
              : view === 'reset' ? t('auth.resetTitle')
              : view === 'verify' ? t('auth.verifyTitle')
              : t('auth.setPasswordTitle')}
          </h2>
          <p>
            {view === 'login' ? t('auth.welcomeBack')
              : view === 'register' ? t('auth.createAccount')
              : view === 'reset' ? t('auth.resetHint')
              : view === 'verify' ? t('auth.verifyHint', { email: pendingEmail })
              : t('auth.setPasswordHint')}
          </p>
        </div>

        {/* ── 验证码输入视图 ─────────────────────────────── */}
        {view === 'verify' ? (
          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label htmlFor="token">{t('auth.code')}</label>
              <input
                id="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className="code-input"
                autoFocus
                required
              />
              <span className="hint">{t('auth.codeHint')}</span>
            </div>

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

            <button type="submit" className="btn btn-primary btn-full" disabled={loading || token.length < 6}>
              {loading ? t('auth.processing') : t('auth.verifyBtn')}
            </button>

            <div className="resend-row">
              <button
                type="button"
                className="link-btn"
                disabled={cooldown > 0 || loading}
                onClick={() => sendCode(pendingEmail, verifyMode === 'register')}
              >
                {cooldown > 0 ? t('auth.resendIn', { n: cooldown }) : t('auth.resend')}
              </button>
            </div>
          </form>
        ) : view === 'setPassword' ? (
          /* ── 设置新密码视图(重置流程) ─────────────────── */
          <form onSubmit={handleSetPassword}>
            <div className="form-group">
              <label htmlFor="newPassword">{t('auth.newPassword')}</label>
              <div className="password-input-wrap">
                <input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowNew(!showNew)}
                  aria-label={showNew ? t('auth.hidePassword') : t('auth.showPassword')}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="newPassword2">{t('auth.confirmPassword')}</label>
              <div className="password-input-wrap">
                <input
                  id="newPassword2"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              {newPassword2 && newPassword2 !== newPassword && (
                <span className="error-message">{t('errors.passwordMismatch')}</span>
              )}
            </div>

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

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? t('auth.processing') : t('auth.setPasswordBtn')}
            </button>
          </form>
        ) : (
          /* ── 登录 / 注册 / 重置 表单视图 ───────────────── */
          <form onSubmit={view === 'login' ? handleLogin : view === 'register' ? handleRegister : handleReset}>
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
                <div className="password-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {view === 'register' && (
              <div className="form-group">
                <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
                <div className="password-input-wrap">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? t('auth.hidePassword') : t('auth.showPassword')}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading
                ? t('auth.processing')
                : view === 'login' ? t('auth.login')
                : view === 'register' ? t('auth.register')
                : t('auth.sendCode')}
            </button>
          </form>
        )}

        <div className="auth-footer">
          {view === 'login' && (
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
          )}
          {view === 'register' && (
            <>
              {t('auth.hasAccount')}
              <button className="link-btn" onClick={() => switchView('login')}>
                {t('auth.loginNow')}
              </button>
            </>
          )}
          {view === 'reset' && (
            <button className="link-btn" onClick={() => switchView('login')}>
              {t('auth.loginNow')}
            </button>
          )}
          {view === 'verify' && (
            <button className="link-btn" onClick={() => switchView(verifyMode === 'register' ? 'register' : 'reset')}>
              {t('auth.changeEmail')}
            </button>
          )}
          {view === 'setPassword' && (
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
            word-break: break-all;
          }
          .password-input-wrap {
            position: relative;
          }
          .password-input-wrap input {
            padding-right: 44px;
          }
          .password-toggle {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            padding: 6px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.15s, background 0.15s;
          }
          .password-toggle:hover {
            color: var(--text-primary);
            background: var(--bg-secondary);
          }
          .code-input {
            text-align: center;
            font-size: 24px !important;
            letter-spacing: 12px;
            font-variant-numeric: tabular-nums;
          }
          .resend-row {
            text-align: center;
            margin-top: 16px;
          }
          .resend-row .link-btn:disabled {
            color: var(--text-muted);
            cursor: default;
            text-decoration: none;
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
