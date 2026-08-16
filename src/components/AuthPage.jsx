/**
 * 登录 / 注册 / 找回密码 独立页面(替代原 AuthModal 模态框)。
 * - 顶部登录/注册切换;注册支持邮箱 或 自定义用户名(+安全密钥)两种方式
 * - 自定义账号以 `用户名@custom.local` 合成邮箱映射到 Supabase Auth
 * - 忘记密码按账号注册方式切换(邮箱 OTP / 自定义用户名+安全密钥)
 */
import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 把登录标识区分为邮箱或用户名
const isEmailInput = (v) => EMAIL_RE.test(v || '')

export default function AuthPage({
  initialMode = 'login',
  onLogin,
  onRegister,
  loginByUsername,
  registerUsername,
  forgotPasswordCustom,
  resetPassword,
  onSendOtp,
  onVerifyOtp,
  onSetPassword,
  usernameExists,
  onUpdateProfile,
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // mode: login | register | forgot;email 流程内嵌 verify(验证码)视图
  const [mode, setMode] = useState(initialMode === 'register' ? 'register' : 'login')
  const [method, setMethod] = useState('email') // 注册方式: email | username
  const [forgotMethod, setForgotMethod] = useState('email') // 忘记密码方式

  // 登录
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  // 注册
  const [nickname, setNickname] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [username, setUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPassword2, setRegPassword2] = useState('')
  const [securityKey, setSecurityKey] = useState('')
  const [agreed, setAgreed] = useState(false)
  // 忘记密码
  const [forgotAccount, setForgotAccount] = useState('')
  const [forgotKey, setForgotKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  // 邮箱 OTP 验证
  const [verifyCode, setVerifyCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [pendingNickname, setPendingNickname] = useState('')
  const [pendingPassword, setPendingPassword] = useState('')
  const [verifyFor, setVerifyFor] = useState('register') // register | forgot

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [showNew, setShowNew] = useState(false)

  // 记住我偏好写入设置(useAuth 会话恢复时据此决定是否保留会话)
  const saveRemember = (remember) => {
    try {
      const cur = JSON.parse(localStorage.getItem('bead_studio_settings') || '{}')
      localStorage.setItem('bead_studio_settings', JSON.stringify({ ...cur, rememberMe: remember }))
    } catch { /* 忽略 */ }
  }

  const errMsg = (code) => {
    const map = {
      PASSWORD_MISMATCH: 'errors.passwordMismatch',
      PASSWORD_TOO_SHORT: 'errors.passwordTooShort',
      INVALID_USERNAME: 'errors.invalidUsername',
      USERNAME_TAKEN: 'errors.usernameTaken',
      USERNAME_NOT_FOUND: 'errors.usernameNotFound',
      INVALID_SECURITY_KEY: 'errors.invalidSecurityKey',
      INVALID_CREDENTIALS: 'errors.invalidCredentials',
    }
    const key = map[code]
    return key ? t(key) : (t('errors.generic') + (code ? ` (${code})` : ''))
  }

  const go = (p) => navigate(p)

  // ── 登录 ────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      saveRemember(remember)
      if (isEmailInput(account)) {
        await onLogin(account, password)
      } else {
        await loginByUsername(account, password)
      }
      go('/')
    } catch (err) {
      const msg = err?.message || ''
      setError(errMsg(
        /invalid login credentials/i.test(msg) ? 'INVALID_CREDENTIALS'
          : msg === 'USERNAME_NOT_FOUND' ? 'USERNAME_NOT_FOUND' : msg))
    } finally {
      setLoading(false)
    }
  }

  // ── 注册 ────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (!nickname.trim()) return setError(errMsg('INVALID_USERNAME')) // 昵称必填
    if (!agreed) return setError(t('auth.agreeRequired'))
    if (regPassword !== regPassword2) return setError(errMsg('PASSWORD_MISMATCH'))
    if (regPassword.length < 6) return setError(errMsg('PASSWORD_TOO_SHORT'))
    setLoading(true)
    try {
      if (method === 'email') {
        if (!EMAIL_RE.test(regEmail)) return setError(t('errors.invalidEmail'))
        // 邮箱注册:先发验证码,验证邮箱归属后设置密码
        setPendingEmail(regEmail)
        setPendingNickname(nickname)
        setPendingPassword(regPassword)
        setVerifyFor('register')
        await onSendOtp(regEmail, true)
        setMode('verify')
      } else {
        // 自定义用户名注册:直接创建(合成邮箱映射)+ 安全密钥
        await registerUsername({ username, nickname, password: regPassword, securityKey })
        go('/')
      }
    } catch (err) {
      setError(errMsg(err?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  // 验证码提交(邮箱注册 / 邮箱找回密码)
  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onVerifyOtp(pendingEmail, verifyCode)
      if (verifyFor === 'register') {
        await onSetPassword(pendingPassword)
        if (pendingNickname) { try { await onUpdateProfile({ nickname: pendingNickname }) } catch {} }
        go('/')
      } else {
        // 找回密码(邮箱):验证码通过后进入设置新密码视图
        setError('')
        setMode('setNewPwd')
      }
    } catch (err) {
      setError(errMsg(err?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  // ── 忘记密码 ───────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault()
    setError('')
    if (forgotMethod === 'email') {
      if (!EMAIL_RE.test(forgotAccount)) return setError(t('errors.invalidEmail'))
      setPendingEmail(forgotAccount)
      setVerifyFor('forgot')
      setLoading(true)
      try { await onSendOtp(forgotAccount, false); setMode('verify') }
      catch (err) { setError(errMsg(err?.message || '')) }
      finally { setLoading(false) }
    } else {
      // 自定义用户名找回:安全密钥校验 + 重置密码
      if (newPassword !== newPassword2) return setError(errMsg('PASSWORD_MISMATCH'))
      if (newPassword.length < 6) return setError(errMsg('PASSWORD_TOO_SHORT'))
      setLoading(true)
      try {
        await forgotPasswordCustom(forgotAccount, forgotKey, newPassword)
        setError(t('auth.resetDone'))
        setMode('login')
      } catch (err) {
        const msg = err?.message || ''
        setError(errMsg(/invalid security key/i.test(msg) ? 'INVALID_SECURITY_KEY' : msg))
      } finally { setLoading(false) }
    }
  }

  // 邮箱找回密码:验证码通过后设置新密码
  const handleSetNewPwd = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== newPassword2) return setError(errMsg('PASSWORD_MISMATCH'))
    if (newPassword.length < 6) return setError(errMsg('PASSWORD_TOO_SHORT'))
    setLoading(true)
    try {
      await onSetPassword(newPassword)
      setMode('login')
      setError('')
    } catch (err) {
      setError(errMsg(err?.message || ''))
    } finally { setLoading(false) }
  }

  const goBack = () => go('/')

  const switchMode = (m) => { setMode(m); setError('') }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-back" onClick={goBack}>← {t('common.back')}</button>
        {/* 顶部登录/注册切换 */}
        {mode === 'login' || mode === 'register' ? (
          <div className="auth-mode-switch">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>{t('auth.login')}</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>{t('auth.register')}</button>
          </div>
        ) : mode === 'forgot' ? <h2 className="auth-title">{t('auth.forgotTitle')}</h2> : null}

        {error && <div className="auth-error" role="alert">{error}</div>}

        {/* ── 登录 ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <label className="auth-label">{t('auth.account')}</label>
            <input className="auth-input" value={account} onChange={e => setAccount(e.target.value)} placeholder={t('auth.accountPlaceholder')} autoComplete="username" required />
            <label className="auth-label">{t('auth.password')}</label>
            <div className="password-input-wrap">
              <input className="auth-input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowPwd(!showPwd)} aria-label={t('auth.togglePassword')}>{showPwd ? '🙈' : '👁'}</button>
            </div>
            <div className="auth-row">
              <label className="auth-remember">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span>{t('auth.rememberMe')}</span>
              </label>
              <button type="button" className="auth-link" onClick={() => { setForgotMethod(isEmailInput(account) ? 'email' : 'username'); setMode('forgot') }}>{t('auth.forgotPassword')}</button>
            </div>
            <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.loginBtn')}</button>
            <p className="auth-agree">
              <Trans i18nKey="auth.agreeNote" components={{ privacy: <Link to="/privacy" className="auth-policy-link" />, terms: <Link to="/terms" className="auth-policy-link" /> }} />
            </p>
          </form>
        )}

        {/* ── 注册 ── */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            {/* 昵称置顶(个人主页展示) */}
            <label className="auth-label">{t('auth.nickname')}</label>
            <input className="auth-input" value={nickname} onChange={e => setNickname(e.target.value)} placeholder={t('auth.nicknamePlaceholder')} autoComplete="nickname" required />

            {/* 注册方式切换 */}
            <div className="auth-method-switch">
              <button type="button" className={method === 'email' ? 'active' : ''} onClick={() => setMethod('email')}>{t('auth.methodEmail')}</button>
              <button type="button" className={method === 'username' ? 'active' : ''} onClick={() => setMethod('username')}>{t('auth.methodUsername')}</button>
            </div>

            {method === 'email' ? (
              <>
                <label className="auth-label">{t('auth.email')}</label>
                <input className="auth-input" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </>
            ) : (
              <>
                <label className="auth-label">{t('auth.username')}</label>
                <input className="auth-input" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('auth.usernamePlaceholder')} autoComplete="username" required />
                {/* 安全密钥(占位提示已足够,无需问号按钮) */}
                <label className="auth-label">{t('auth.securityKey')}</label>
                <input className="auth-input" type={showPwd ? 'text' : 'password'} value={securityKey} onChange={e => setSecurityKey(e.target.value)} placeholder={t('auth.securityKeyPlaceholder')} autoComplete="off" />
              </>
            )}

            <label className="auth-label">{t('auth.password')}</label>
            <div className="password-input-wrap">
              <input className="auth-input" type={showNew ? 'text' : 'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)} autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)} aria-label={t('auth.togglePassword')}>{showNew ? '🙈' : '👁'}</button>
            </div>
            <label className="auth-label">{t('auth.confirmPassword')}</label>
            <input className="auth-input" type={showNew ? 'text' : 'password'} value={regPassword2} onChange={e => setRegPassword2(e.target.value)} autoComplete="new-password" required />

            <label className="auth-remember">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span>
                <Trans i18nKey="auth.agreeText" components={{ privacy: <Link to="/privacy" className="auth-policy-link" />, terms: <Link to="/terms" className="auth-policy-link" /> }} />
              </span>
            </label>

            <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.registerBtn')}</button>
          </form>
        )}

        {/* ── 忘记密码 ── */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="auth-form">
            <div className="auth-method-switch">
              <button type="button" className={forgotMethod === 'email' ? 'active' : ''} onClick={() => setForgotMethod('email')}>{t('auth.methodEmail')}</button>
              <button type="button" className={forgotMethod === 'username' ? 'active' : ''} onClick={() => setForgotMethod('username')}>{t('auth.methodUsername')}</button>
            </div>
            {forgotMethod === 'email' ? (
              <>
                <label className="auth-label">{t('auth.email')}</label>
                <input className="auth-input" type="email" value={forgotAccount} onChange={e => setForgotAccount(e.target.value)} placeholder="you@example.com" required />
              </>
            ) : (
              <>
                <label className="auth-label">{t('auth.username')}</label>
                <input className="auth-input" value={forgotAccount} onChange={e => setForgotAccount(e.target.value)} placeholder={t('auth.usernamePlaceholder')} required />
                <label className="auth-label">{t('auth.securityKey')}</label>
                <input className="auth-input" type="password" value={forgotKey} onChange={e => setForgotKey(e.target.value)} autoComplete="off" required />
                <label className="auth-label">{t('auth.newPassword')}</label>
                <input className="auth-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />
                <label className="auth-label">{t('auth.confirmPassword')}</label>
                <input className="auth-input" type="password" value={newPassword2} onChange={e => setNewPassword2(e.target.value)} autoComplete="new-password" required />
              </>
            )}
            <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.resetBtn')}</button>
          </form>
        )}

        {/* ── 邮箱验证码 ── */}
        {mode === 'verify' && (
          <form onSubmit={handleVerify} className="auth-form">
            <p className="auth-verify-hint">{t('auth.otpHint', { email: pendingEmail })}</p>
            <label className="auth-label">{t('auth.otpCode')}</label>
            <input className="auth-input" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="123456" maxLength="6" inputMode="numeric" required />
            <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.verifyBtn')}</button>
          </form>
        )}

        {/* ── 邮箱找回密码:设置新密码 ── */}
        {mode === 'setNewPwd' && (
          <form onSubmit={handleSetNewPwd} className="auth-form">
            <h2 className="auth-title">{t('auth.setPasswordTitle')}</h2>
            <label className="auth-label">{t('auth.newPassword')}</label>
            <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />
            <label className="auth-label">{t('auth.confirmPassword')}</label>
            <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword2} onChange={e => setNewPassword2(e.target.value)} autoComplete="new-password" required />
            <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.setPasswordBtn')}</button>
          </form>
        )}
      </div>

      <style>{`
        /* 页面高度=主内容区,内部滚动,避免被 .app/.main-content 的 overflow:hidden 裁剪 */
        .auth-page {
          height: 100%;
          overflow-y: auto;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 32px 16px 64px;
          background: var(--bg-primary);
          box-sizing: border-box;
        }
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
          padding: 24px;
          box-shadow: var(--shadow-card);
        }
        .auth-title { text-align: center; margin: 0 0 16px; font-size: var(--text-lg); }
        .auth-mode-switch {
          display: flex;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border-color);
          margin-bottom: 20px;
        }
        .auth-mode-switch button {
          flex: 1;
          padding: 10px 0;
          border: none;
          background: var(--bg-primary);
          color: var(--text-secondary);
          font-size: var(--text-md);
          font-weight: 600;
          cursor: pointer;
        }
        .auth-mode-switch button.active {
          background: var(--accent);
          color: white;
        }
        .auth-method-switch {
          display: flex;
          gap: 8px;
          margin: 4px 0 14px;
        }
        .auth-method-switch button {
          flex: 1;
          padding: 8px 0;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
        }
        .auth-method-switch button.active {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-soft);
        }
        .auth-form { display: flex; flex-direction: column; gap: 6px; }
        .auth-label { font-size: var(--text-sm); color: var(--text-secondary); font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 6px; }
        .auth-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: var(--text-md);
          box-sizing: border-box;
        }
        .auth-input:focus { outline: 2px solid var(--accent); border-color: transparent; }
        .password-input-wrap { position: relative; }
        .password-input-wrap .auth-input { padding-right: 44px; }
        .password-toggle {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 14px;
        }
        .auth-row { display: flex; align-items: center; justify-content: space-between; margin: 8px 0 4px; }
        .auth-remember { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer; }
        .auth-link { background: none; border: none; color: var(--accent); font-size: var(--text-sm); cursor: pointer; }
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
        .auth-agree { font-size: var(--text-xs); color: var(--text-muted); text-align: center; margin-top: 12px; }
        .auth-error {
          background: #fdecea;
          color: #c0392b;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: var(--text-sm);
          margin-bottom: 12px;
        }
        /* 隐私政策/服务条款可点击链接 */
        .auth-policy-link {
          color: var(--accent);
          text-decoration: underline;
          cursor: pointer;
        }
        .auth-policy-link:hover {
          color: var(--accent-hover);
        }
        .auth-verify-hint { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 8px; }
        @media (max-width: 640px) {
          .auth-page { padding: 16px 12px 48px; }
          .auth-card { padding: 18px 16px; }
        }
      `}</style>
    </div>
  )
}
