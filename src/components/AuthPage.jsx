/**
 * 登录 / 注册 / 找回密码 独立页面。
 * - 顶部登录/注册切换;注册支持邮箱 或 自定义用户名(+安全密钥)两种方式
 * - 校验/引导错误统一用 toast 短暂气泡,不挤占表单布局
 * - 密码强度约束:过短/全同字符/连续字符/缺混合 → toast 提示
 * - 邮箱找回密码:发送验证码邮件 + 60s 重发倒计时
 */
import { useState, useEffect } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { useToast } from './Toast'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_COOLDOWN = 60
const isEmailInput = (v) => EMAIL_RE.test(v || '')

// 密码强度:过短 / 全同字符 / 连续序列 / 缺混合
const isWeakPassword = (p) => {
  if (p.length < 8) return 'PASSWORD_TOO_SHORT'
  if (/^(.)\1+$/.test(p)) return 'PASSWORD_REPEAT'
  if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(p)) return 'PASSWORD_SEQUENCE'
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'PASSWORD_MIX'
  return null
}

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
  const toast = useToast()
  const [mode, setMode] = useState(initialMode === 'register' ? 'register' : 'login')
  const [method, setMethod] = useState('email')
  const [forgotMethod, setForgotMethod] = useState('email')

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
  const [forgotCodeSent, setForgotCodeSent] = useState(false) // 邮箱方式:是否已发送验证码(展开下方输入)
  // 邮箱 OTP 验证 + 重发倒计时
  const [verifyCode, setVerifyCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [pendingNickname, setPendingNickname] = useState('')
  const [pendingPassword, setPendingPassword] = useState('')
  // 倒计时按流程独立计数(注册/找回各一个):任一流程发码不重置另一流程的等待
  const [regCooldown, setRegCooldown] = useState(0)
  const [forgotCooldown, setForgotCooldown] = useState(0)

  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)  // 登录密码
  const [showReg, setShowReg] = useState(false)  // 注册密码/确认
  const [showNew, setShowNew] = useState(false)  // 新密码/确认

  // 重发倒计时(注册/找回独立递减)
  useEffect(() => {
    if (regCooldown <= 0) return
    const timer = setTimeout(() => setRegCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [regCooldown])

  useEffect(() => {
    if (forgotCooldown <= 0) return
    const timer = setTimeout(() => setForgotCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [forgotCooldown])

  const errMsg = (code) => {
    // 冻结账号:给出冻结期限(如 ACCOUNT_FROZEN:7)
    if (code && code.startsWith('ACCOUNT_FROZEN:')) {
      const days = Number(code.split(':')[1]) || 7
      return t('errors.accountFrozen', { days })
    }
    const map = {
      PASSWORD_MISMATCH: 'errors.passwordMismatch',
      PASSWORD_TOO_SHORT: 'errors.passwordTooShort',
      PASSWORD_REPEAT: 'errors.passwordRepeat',
      PASSWORD_SEQUENCE: 'errors.passwordSequence',
      PASSWORD_MIX: 'errors.passwordMix',
      INVALID_USERNAME: 'errors.invalidUsername',
      USERNAME_TAKEN: 'errors.usernameTaken',
      USERNAME_NOT_FOUND: 'errors.usernameNotFound',
      INVALID_SECURITY_KEY: 'errors.invalidSecurityKey',
      ACCOUNT_DELETED: 'errors.accountDeleted',
      INVALID_CREDENTIALS: 'errors.invalidCredentials',
    }
    const key = map[code]
    return key ? t(key) : (t('errors.generic') + (code ? ` (${code})` : ''))
  }
  const toastError = (code, msg) => toast(msg || errMsg(code), 'error')
  const checkPwd = (p) => {
    const weak = isWeakPassword(p)
    if (weak) { toastError(weak); return false }
    return true
  }

  const go = (p) => navigate(p)
  const goBack = () => go('/')

  // ── 登录 ──
  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      saveRemember(remember)
      if (isEmailInput(account)) await onLogin(account, password)
      else await loginByUsername(account, password)
      go('/')
    } catch (err) {
      const msg = err?.message || ''
      toastError(/invalid login credentials/i.test(msg) ? 'INVALID_CREDENTIALS' : (msg === 'USERNAME_NOT_FOUND' ? 'USERNAME_NOT_FOUND' : msg))
    } finally { setLoading(false) }
  }

  // ── 注册 ──
  const handleRegister = async (e) => {
    e.preventDefault()
    if (!nickname.trim()) return toastError('INVALID_USERNAME', t('auth.nicknameRequired'))
    if (!agreed) return toastError('', t('auth.agreeRequired'))
    if (regPassword !== regPassword2) return toastError('PASSWORD_MISMATCH')
    if (!checkPwd(regPassword)) return
    setLoading(true)
    try {
      if (method === 'email') {
        if (!EMAIL_RE.test(regEmail)) return toastError('', t('errors.invalidEmail'))
        setPendingEmail(regEmail); setPendingNickname(nickname); setPendingPassword(regPassword)
        await onSendOtp(regEmail, true, { nickname })
        setRegCooldown(RESEND_COOLDOWN)
        setMode('verify')
      } else {
        await registerUsername({ username, nickname, password: regPassword, securityKey })
        go('/')
      }
    } catch (err) {
      toastError(err?.message || '')
    } finally { setLoading(false) }
  }

  // 验证码提交(邮箱注册专属:找回密码已改为内联流程,走 handleForgotVerify)
  const handleVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onVerifyOtp(pendingEmail, verifyCode)
      await onSetPassword(pendingPassword)
      if (pendingNickname) { try { await onUpdateProfile({ nickname: pendingNickname }) } catch {} }
      go('/')
    } catch (err) {
      toastError(err?.message || '')
    } finally { setLoading(false) }
  }

  // 重发验证码(60s 冷却,邮箱注册专属)
  const resendCode = async () => {
    if (regCooldown > 0 || loading) return
    setLoading(true)
    try {
      await onSendOtp(pendingEmail, true, { nickname: pendingNickname })
      setRegCooldown(RESEND_COOLDOWN)
      toast(t('auth.codeSent'), 'success')
    } catch (err) {
      toastError(err?.message || '')
    } finally { setLoading(false) }
  }

  // ── 忘记密码(邮箱):点击输入框右侧"发送验证码",该位置切换为倒计时,下方展开验证码输入 ──
  const handleSendForgotCode = async () => {
    if (forgotCooldown > 0 || loading) return
    if (!EMAIL_RE.test(forgotAccount)) return toastError('', t('errors.invalidEmail'))
    setPendingEmail(forgotAccount)
    setLoading(true)
    try {
      await onSendOtp(forgotAccount, false)
      setForgotCooldown(RESEND_COOLDOWN)
      setForgotCodeSent(true)
      toast(t('auth.codeSent'), 'success')
    } catch (err) { toastError(err?.message || '') }
    finally { setLoading(false) }
  }

  // 忘记密码(邮箱):校验验证码 → 进入设置新密码
  const handleForgotVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onVerifyOtp(pendingEmail, verifyCode)
      setMode('setNewPwd')
    } catch (err) { toastError(err?.message || '') }
    finally { setLoading(false) }
  }

  // ── 忘记密码(自定义账号):用户名 + 安全密钥校验 → 重置密码 ──
  const handleForgotCustom = async (e) => {
    e.preventDefault()
    if (newPassword !== newPassword2) return toastError('PASSWORD_MISMATCH')
    if (!checkPwd(newPassword)) return
    setLoading(true)
    try {
      await forgotPasswordCustom(forgotAccount, forgotKey, newPassword)
      toast(t('auth.resetDone'), 'success')
      setMode('login')
    } catch (err) {
      const msg = err?.message || ''
      toastError(/invalid security key/i.test(msg) ? 'INVALID_SECURITY_KEY' : msg)
    } finally { setLoading(false) }
  }

  // 邮箱找回密码:设置新密码
  const handleSetNewPwd = async (e) => {
    e.preventDefault()
    if (newPassword !== newPassword2) return toastError('PASSWORD_MISMATCH')
    if (!checkPwd(newPassword)) return
    setLoading(true)
    try {
      await onSetPassword(newPassword)
      toast(t('auth.resetDone'), 'success')
      setMode('login')
    } catch (err) { toastError(err?.message || '') }
    finally { setLoading(false) }
  }

  const saveRemember = (remember) => {
    try {
      const cur = JSON.parse(localStorage.getItem('bead_studio_settings') || '{}')
      localStorage.setItem('bead_studio_settings', JSON.stringify({ ...cur, rememberMe: remember }))
    } catch { /* 忽略 */ }
  }

  const switchMode = (m) => { setMode(m) }

  return (
    <div className="auth-page">
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
        <button className="auth-back" onClick={goBack}>← {t('common.back')}</button>

        {mode === 'login' || mode === 'register' ? (
          <div className="auth-mode-switch">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>{t('auth.login')}</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>{t('auth.register')}</button>
          </div>
        ) : mode === 'forgot' ? <h2 className="auth-title">{t('auth.forgotTitle')}</h2> : null}

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
            <label className="auth-label">{t('auth.nickname')}</label>
            <input className="auth-input" value={nickname} onChange={e => setNickname(e.target.value)} placeholder={t('auth.nicknamePlaceholder')} autoComplete="nickname" required />

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
              </>
            )}

            <label className="auth-label">{t('auth.password')}</label>
            <div className="password-input-wrap">
              <input className="auth-input" type={showReg ? 'text' : 'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)} autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowReg(!showReg)} aria-label={t('auth.togglePassword')}>{showReg ? '🙈' : '👁'}</button>
            </div>
            <label className="auth-label">{t('auth.confirmPassword')}</label>
            <div className="password-input-wrap">
              <input className="auth-input" type={showReg ? 'text' : 'password'} value={regPassword2} onChange={e => setRegPassword2(e.target.value)} autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowReg(!showReg)} aria-label={t('auth.togglePassword')}>{showReg ? '🙈' : '👁'}</button>
            </div>

            {/* 安全密钥:仅自定义账号方式,置于确认密码之下 */}
            {method === 'username' && (
              <>
                <label className="auth-label">{t('auth.securityKey')}</label>
                <input className="auth-input" type={showNew ? 'text' : 'password'} value={securityKey} onChange={e => setSecurityKey(e.target.value)} placeholder={t('auth.securityKeyPlaceholder')} autoComplete="off" />
              </>
            )}

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
          <form onSubmit={forgotMethod === 'email' ? handleForgotVerify : handleForgotCustom} className="auth-form">
            <div className="auth-method-switch">
              <button type="button" className={forgotMethod === 'email' ? 'active' : ''} onClick={() => { setForgotMethod('email'); setForgotCodeSent(false) }}>{t('auth.methodEmail')}</button>
              <button type="button" className={forgotMethod === 'username' ? 'active' : ''} onClick={() => { setForgotMethod('username'); setForgotCodeSent(false) }}>{t('auth.methodUsername')}</button>
            </div>
            {forgotMethod === 'email' ? (
              <>
                <p className="auth-verify-hint">{t('auth.forgotEmailHint')}</p>
                <label className="auth-label">{t('auth.email')}</label>
                {/* 邮箱输入 + 右侧内联"发送验证码"强调色文字按钮(发送后切换为动态倒计时) */}
                <div className="code-send-wrap">
                  <input
                    className="auth-input"
                    type="email"
                    value={forgotAccount}
                    onChange={e => { setForgotAccount(e.target.value); setForgotCodeSent(false) }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                  <button type="button" className="code-send-btn" onClick={handleSendForgotCode} disabled={forgotCooldown > 0 || loading}>
                    {forgotCooldown > 0 ? t('auth.resendIn', { n: forgotCooldown }) : t('auth.sendCode')}
                  </button>
                </div>
                {/* 验证码输入 + 确认重置密码按钮始终显示(不折叠),未发送验证码前确认按钮禁用 */}
                <label className="auth-label">{t('auth.otpCode')}</label>
                <input className="auth-input" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="123456" maxLength="6" inputMode="numeric" autoComplete="one-time-code" required />
                <p className="auth-verify-sub">{t('auth.checkSpam')}</p>
                <button type="submit" className="auth-btn-primary" disabled={loading || !forgotCodeSent}>{loading ? t('auth.loading') : t('auth.confirmResetBtn')}</button>
              </>
            ) : (
              <>
                <label className="auth-label">{t('auth.username')}</label>
                <input className="auth-input" value={forgotAccount} onChange={e => setForgotAccount(e.target.value)} placeholder={t('auth.usernamePlaceholder')} required />
                <label className="auth-label">{t('auth.securityKey')}</label>
                <input className="auth-input" type={showNew ? 'text' : 'password'} value={forgotKey} onChange={e => setForgotKey(e.target.value)} autoComplete="off" required />
                <label className="auth-label">{t('auth.newPassword')}</label>
                <div className="password-input-wrap">
                  <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />
                  <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)} aria-label={t('auth.togglePassword')}>{showNew ? '🙈' : '👁'}</button>
                </div>
                <label className="auth-label">{t('auth.confirmPassword')}</label>
                <div className="password-input-wrap">
                  <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword2} onChange={e => setNewPassword2(e.target.value)} autoComplete="new-password" required />
                  <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)} aria-label={t('auth.togglePassword')}>{showNew ? '🙈' : '👁'}</button>
                </div>
                <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.resetBtn')}</button>
              </>
            )}
          </form>
        )}

        {/* ── 邮箱注册验证码 ── */}
        {mode === 'verify' && (
          <div className="auth-form">
            <p className="auth-verify-hint">{t('auth.otpHint', { email: pendingEmail })}</p>
            <label className="auth-label">{t('auth.otpCode')}</label>
            <input className="auth-input" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="123456" maxLength="6" inputMode="numeric" autoComplete="one-time-code" required />
            <div className="auth-resend-row">
              <button type="button" className="auth-resend-btn" onClick={resendCode} disabled={regCooldown > 0 || loading}>
                {regCooldown > 0 ? t('auth.resendIn', { n: regCooldown }) : t('auth.resend')}
              </button>
            </div>
            <button type="button" className="auth-btn-primary" disabled={loading} onClick={handleVerify}>{loading ? t('auth.loading') : t('auth.verifyBtn')}</button>
          </div>
        )}

        {/* ── 邮箱找回密码:设置新密码 ── */}
        {mode === 'setNewPwd' && (
          <form onSubmit={handleSetNewPwd} className="auth-form">
            <h2 className="auth-title">{t('auth.setPasswordTitle')}</h2>
            <label className="auth-label">{t('auth.newPassword')}</label>
            <div className="password-input-wrap">
              <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)} aria-label={t('auth.togglePassword')}>{showNew ? '🙈' : '👁'}</button>
            </div>
            <label className="auth-label">{t('auth.confirmPassword')}</label>
            <div className="password-input-wrap">
              <input className="auth-input" type={showNew ? 'text' : 'password'} value={newPassword2} onChange={e => setNewPassword2(e.target.value)} autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)} aria-label={t('auth.togglePassword')}>{showNew ? '🙈' : '👁'}</button>
            </div>
            <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.setPasswordBtn')}</button>
          </form>
        )}
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
          display: inline-flex;
          align-items: center;
          align-self: flex-start;
          gap: 6px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          font-size: var(--text-md);
          font-weight: 500;
          cursor: pointer;
          padding: 8px 16px;
          border-radius: 10px;
          margin-bottom: 12px;
          transition: all 0.15s;
        }
        .auth-back:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
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
        .auth-mode-switch button.active { background: var(--accent); color: white; }
        .auth-method-switch { display: flex; gap: 8px; margin: 4px 0 14px; }
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
        .auth-method-switch button.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
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
          padding: 4px;
        }
        .auth-row { display: flex; align-items: center; justify-content: space-between; margin: 8px 0 4px; }
        .auth-remember { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer; }
        .auth-link { background: none; border: none; color: var(--accent); font-size: var(--text-sm); cursor: pointer; }
        .auth-link:disabled { opacity: 0.5; cursor: default; }
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
        .auth-policy-link { color: var(--accent); text-decoration: underline; cursor: pointer; }
        .auth-policy-link:hover { color: var(--accent-hover); }
        .auth-verify-hint { font-size: var(--text-sm); color: var(--text-secondary); margin: 8px 0 2px; }
        .auth-verify-sub { font-size: var(--text-xs); color: var(--text-muted); margin: 0 0 6px; line-height: 1.5; }
        .auth-resend-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 8px;
        }
        /* 重发验证码按钮:倒计时期间禁用并动态显示剩余秒数 */
        .auth-resend-btn {
          border: 1px solid var(--border-color);
          background: var(--bg-primary);
          color: var(--accent);
          border-radius: 8px;
          padding: 7px 14px;
          font-size: var(--text-sm);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .auth-resend-btn:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-soft); }
        .auth-resend-btn:disabled { opacity: 0.55; cursor: default; color: var(--text-muted); }
        /* 邮箱输入框内联"发送验证码"按钮:右侧内嵌,发送后切换为动态倒计时 */
        .code-send-wrap {
          position: relative;
        }
        .code-send-wrap .auth-input {
          padding-right: 118px;
        }
        .code-send-btn {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--accent);
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          padding: 4px 8px;
          transition: color 0.15s;
        }
        .code-send-btn:hover:not(:disabled) { color: var(--accent-hover); }
        .code-send-btn:disabled { color: var(--text-muted); cursor: default; }
        @media (max-width: 640px) {
          .auth-page { padding: 16px 12px 48px; }
          .auth-card { padding: 18px 16px; }
        }
      `}</style>
    </div>
  )
}
