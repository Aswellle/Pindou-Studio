/**
 * ProfileSecuritySection — 个人中心「账号与安全」分区。
 *
 * 三类真实能力(全部有服务端依据,不做假入口):
 *
 *   1. 修改密码(旧密码验证):changePassword = verifyPassword + setPassword。
 *   2. 邮箱验证码重设密码:适用于「用验证码登录、从没设过密码」的账号。
 *      安全要点在 useAuth.setPasswordWithOtp —— 验证码验证后必须比对
 *      getUser().id 与当前用户 id,否则会改到别人账号的密码。
 *   3. 更换邮箱(仅真实邮箱账号):Supabase Auth updateUser({email}),
 *      确认前 user.email 不变,new_email 表示待确认。
 *   4. 安全密钥(仅用户名账号):先验证当前密码,再调 set_security_key RPC。
 *      哈希不可读,故只能「设置/覆盖」,没有「查看」。
 *
 * 不实现:自助删除账号、修改用户名、设备会话列表 —— 均无服务端能力。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { passwordWeakness } from '../../utils/password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 把认证错误归类成稳定的错误码,不把 Supabase 原始 message 渲染给用户
 * (可能含表名、URL、内部细节)。
 */
function classifyAuthError(err) {
  const msg = String(err?.message || err || '')
  if (/invalid login credentials/i.test(msg)) return 'wrongPassword'
  if (/email not confirmed/i.test(msg)) return 'emailNotConfirmed'
  if (/user already registered|already been registered/i.test(msg)) return 'emailInUse'
  if (/invalid email/i.test(msg)) return 'invalidEmail'
  if (/rate limit|too many/i.test(msg)) return 'tooManyAttempts'
  if (/session_user_mismatch/i.test(msg)) return 'sessionMismatch'
  if (/network|fetch|timeout|failed to fetch/i.test(msg)) return 'network'
  if (/not_signed_in/i.test(msg)) return 'sessionExpired'
  return 'unknown'
}

/** 分段控件:同一区域里切换「用密码改」与「用验证码改」 */
function SegmentedTabs({ value, onChange, options }) {
  return (
    <div className="pf-segmented" role="tablist">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className={`pf-segmented-btn${value === opt.id ? ' active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function ProfileSecuritySection({
  user,
  onChangePassword,
  onSendOtp,
  onSetPassword,
  onChangeEmail,
  onVerifyPassword,
  onSetSecurityKey,
  onMessage,
}) {
  const { t } = useTranslation()
  const isUsernameAccount = user.authType === 'username'

  // ── 修改密码(旧密码) ─────────────────────────────────────
  const [pwMode, setPwMode] = useState('password') // 'password' | 'otp'
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)

  // ── 验证码重设密码 ────────────────────────────────────────
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpError, setOtpError] = useState('')

  // ── 更换邮箱 ──────────────────────────────────────────────
  const [emailOpen, setEmailOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailPw, setEmailPw] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState('')

  // ── 安全密钥 ──────────────────────────────────────────────
  const [keyOpen, setKeyOpen] = useState(false)
  const [secKey, setSecKey] = useState('')
  const [secKey2, setSecKey2] = useState('')
  const [keyPw, setKeyPw] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyError, setKeyError] = useState('')

  const resetPwForm = () => {
    setOldPw('')
    setNewPw('')
    setNewPw2('')
    setOtpCode('')
    setOtpSent(false)
    setPwError('')
    setOtpError('')
  }

  const doChangePassword = async () => {
    if (!oldPw) {
      setPwError(t('profile.oldPasswordRequired'))
      return
    }
    const weak = passwordWeakness(newPw)
    if (weak) {
      setPwError(t(weak))
      return
    }
    if (newPw !== newPw2) {
      setPwError(t('errors.passwordMismatch'))
      return
    }
    setPwError('')
    setPwBusy(true)
    try {
      // 用户名账号的内部认证邮箱是合成地址 —— 只作参数传给 Auth,不渲染
      await onChangePassword(user.email, oldPw, newPw)
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2000)
      resetPwForm()
    } catch (err) {
      const code = classifyAuthError(err)
      setPwError(code === 'wrongPassword' ? t('profile.wrongPassword') : t(`profile.center.errors.${code}`))
    } finally {
      setPwBusy(false)
    }
  }

  const sendOtpCode = async () => {
    if (otpBusy) return
    setOtpBusy(true)
    setOtpError('')
    try {
      // shouldCreateUser=false:只给已存在的账号发码,不新建用户
      await onSendOtp(user.email, false)
      setOtpSent(true)
      onMessage(t('auth.codeSent'), 'success')
    } catch (err) {
      setOtpError(t(`profile.center.errors.${classifyAuthError(err)}`))
    } finally {
      setOtpBusy(false)
    }
  }

  const doSetPasswordByOtp = async () => {
    if (otpBusy) return
    const weak = passwordWeakness(newPw)
    if (weak) {
      setOtpError(t(weak))
      return
    }
    if (newPw !== newPw2) {
      setOtpError(t('errors.passwordMismatch'))
      return
    }
    if (!otpCode.trim()) {
      setOtpError(t('auth.codeInvalid'))
      return
    }
    setOtpError('')
    setOtpBusy(true)
    try {
      // setPasswordWithOtp 内部会校验验证后的会话归属,不匹配直接抛 SESSION_USER_MISMATCH
      await onSetPassword(user.email, otpCode.trim(), newPw, user.id)
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2000)
      resetPwForm()
    } catch (err) {
      setOtpError(t(`profile.center.errors.${classifyAuthError(err)}`))
    } finally {
      setOtpBusy(false)
    }
  }

  const doChangeEmail = async () => {
    const trimmed = newEmail.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError(t('errors.invalidEmail'))
      return
    }
    if (trimmed.toLowerCase() === (user.email || '').toLowerCase()) {
      setEmailError(t('profile.center.errors.sameEmail'))
      return
    }
    if (!emailPw) {
      setEmailError(t('profile.oldPasswordRequired'))
      return
    }
    setEmailError('')
    setEmailBusy(true)
    try {
      // 先验证当前密码:更换邮箱属于敏感操作,不能只凭已登录会话
      await onVerifyPassword(user.email, emailPw)
      await onChangeEmail(trimmed)
      setEmailOpen(false)
      setNewEmail('')
      setEmailPw('')
      // 确认前旧邮箱仍是身份 —— 提示语必须写清楚
      onMessage(t('profile.center.emailChangeSent', { email: trimmed }), 'success')
    } catch (err) {
      setEmailError(t(`profile.center.errors.${classifyAuthError(err)}`))
    } finally {
      setEmailBusy(false)
    }
  }

  const doSetSecurityKey = async () => {
    if (!secKey.trim()) {
      setKeyError(t('profile.center.errors.securityKeyRequired'))
      return
    }
    if (secKey !== secKey2) {
      setKeyError(t('errors.passwordMismatch'))
      return
    }
    if (!keyPw) {
      setKeyError(t('profile.oldPasswordRequired'))
      return
    }
    setKeyError('')
    setKeyBusy(true)
    try {
      await onVerifyPassword(user.email, keyPw)
      await onSetSecurityKey(secKey)
      setKeyOpen(false)
      setSecKey('')
      setSecKey2('')
      setKeyPw('')
      onMessage(t('profile.center.securityKeySaved'), 'success')
    } catch (err) {
      setKeyError(t(`profile.center.errors.${classifyAuthError(err)}`))
    } finally {
      setKeyBusy(false)
    }
  }

  const pwFormBusy = pwBusy || otpBusy

  return (
    <div className="pf-section-stack">
      {/* ── 修改密码 ─────────────────────────────────────────── */}
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>
            <ShieldCheck size={16} aria-hidden="true" /> {t('profile.changePassword')}
          </h3>
          {pwSaved ? (
            <span className="pf-success" role="status">
              {t('profile.passwordUpdated')}
            </span>
          ) : null}
        </div>

        {!isUsernameAccount ? (
          <SegmentedTabs
            value={pwMode}
            onChange={v => {
              setPwMode(v)
              resetPwForm()
            }}
            options={[
              { id: 'password', label: t('profile.center.useCurrentPassword') },
              { id: 'otp', label: t('profile.center.useEmailCode') },
            ]}
          />
        ) : null}

        {pwMode === 'password' || isUsernameAccount ? (
          <div className="pf-form">
            <label className="pf-field" htmlFor="pf-old-pw">
              <span>{t('profile.oldPassword')}</span>
              <input
                id="pf-old-pw"
                type="password"
                className="pf-input"
                value={oldPw}
                onChange={e => {
                  setOldPw(e.target.value)
                  setPwError('')
                }}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </label>
            <label className="pf-field" htmlFor="pf-new-pw">
              <span>{t('profile.newPassword')}</span>
              <input
                id="pf-new-pw"
                type="password"
                className="pf-input"
                value={newPw}
                onChange={e => {
                  setNewPw(e.target.value)
                  setPwError('')
                }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
            <label className="pf-field" htmlFor="pf-new-pw2">
              <span>{t('profile.confirmNewPassword')}</span>
              <input
                id="pf-new-pw2"
                type="password"
                className="pf-input"
                value={newPw2}
                onChange={e => {
                  setNewPw2(e.target.value)
                  setPwError('')
                }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
            {pwError ? (
              <p className="pf-error" role="alert">
                {pwError}
              </p>
            ) : null}
            <div className="pf-actions">
              <button
                type="button"
                className="pf-btn primary"
                disabled={pwFormBusy}
                onClick={doChangePassword}
              >
                {pwBusy ? t('auth.processing') : t('common.save')}
              </button>
              <button type="button" className="pf-btn ghost" disabled={pwFormBusy} onClick={resetPwForm}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="pf-form">
            <p className="pf-hint">{t('profile.center.otpPasswordHint')}</p>
            <div className="pf-field">
              <span>{t('profile.center.emailCode')}</span>
              <div className="pf-field-row">
                <input
                  type="text"
                  className="pf-input"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => {
                    setOtpCode(e.target.value)
                    setOtpError('')
                  }}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  aria-label={t('profile.center.emailCode')}
                />
                <button type="button" className="pf-btn secondary" disabled={otpBusy} onClick={sendOtpCode}>
                  {otpSent ? t('auth.resend') : t('auth.sendCode')}
                </button>
              </div>
            </div>
            <label className="pf-field" htmlFor="pf-otp-new-pw">
              <span>{t('profile.newPassword')}</span>
              <input
                id="pf-otp-new-pw"
                type="password"
                className="pf-input"
                value={newPw}
                onChange={e => {
                  setNewPw(e.target.value)
                  setOtpError('')
                }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
            <label className="pf-field" htmlFor="pf-otp-new-pw2">
              <span>{t('profile.confirmNewPassword')}</span>
              <input
                id="pf-otp-new-pw2"
                type="password"
                className="pf-input"
                value={newPw2}
                onChange={e => {
                  setNewPw2(e.target.value)
                  setOtpError('')
                }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
            {otpError ? (
              <p className="pf-error" role="alert">
                {otpError}
              </p>
            ) : null}
            <div className="pf-actions">
              <button
                type="button"
                className="pf-btn primary"
                disabled={pwFormBusy || !otpSent}
                onClick={doSetPasswordByOtp}
              >
                {otpBusy ? t('auth.processing') : t('common.save')}
              </button>
              <button type="button" className="pf-btn ghost" disabled={pwFormBusy} onClick={resetPwForm}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 更换邮箱(仅真实邮箱账号) ─────────────────────────── */}
      {!isUsernameAccount ? (
        <section className="pf-card">
          <div className="pf-card-head">
            <h3>
              <Mail size={16} aria-hidden="true" /> {t('profile.center.changeEmail')}
            </h3>
            {!emailOpen ? (
              <button
                type="button"
                className="pf-link-btn"
                onClick={() => {
                  setEmailOpen(true)
                  setEmailError('')
                }}
              >
                {t('profile.center.changeEmailAction')}
              </button>
            ) : null}
          </div>

          {user.pendingEmail ? (
            <p className="pf-note pf-note-warn" role="status">
              {t('profile.center.pendingEmailNote', { email: user.pendingEmail })}
            </p>
          ) : null}

          {emailOpen ? (
            <div className="pf-form">
              <p className="pf-hint">{t('profile.center.changeEmailHint')}</p>
              <label className="pf-field" htmlFor="pf-new-email">
                <span>{t('profile.center.newEmail')}</span>
                <input
                  id="pf-new-email"
                  type="email"
                  className="pf-input"
                  value={newEmail}
                  onChange={e => {
                    setNewEmail(e.target.value)
                    setEmailError('')
                  }}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </label>
              <label className="pf-field" htmlFor="pf-email-pw">
                <span>{t('profile.oldPassword')}</span>
                <input
                  id="pf-email-pw"
                  type="password"
                  className="pf-input"
                  value={emailPw}
                  onChange={e => {
                    setEmailPw(e.target.value)
                    setEmailError('')
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>
              {emailError ? (
                <p className="pf-error" role="alert">
                  {emailError}
                </p>
              ) : null}
              <div className="pf-actions">
                <button type="button" className="pf-btn primary" disabled={emailBusy} onClick={doChangeEmail}>
                  {emailBusy ? t('auth.processing') : t('profile.center.sendConfirm')}
                </button>
                <button
                  type="button"
                  className="pf-btn ghost"
                  disabled={emailBusy}
                  onClick={() => {
                    setEmailOpen(false)
                    setNewEmail('')
                    setEmailPw('')
                    setEmailError('')
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <p className="pf-hint">{t('profile.center.currentEmail', { email: user.email })}</p>
          )}
        </section>
      ) : null}

      {/* ── 安全密钥(仅用户名账号) ───────────────────────────── */}
      {isUsernameAccount ? (
        <section className="pf-card">
          <div className="pf-card-head">
            <h3>
              <KeyRound size={16} aria-hidden="true" /> {t('profile.center.securityKeyTitle')}
            </h3>
            {!keyOpen ? (
              <button
                type="button"
                className="pf-link-btn"
                onClick={() => {
                  setKeyOpen(true)
                  setKeyError('')
                }}
              >
                {t('profile.center.securityKeyAction')}
              </button>
            ) : null}
          </div>

          <p className="pf-hint">{t('profile.center.securityKeyHint')}</p>

          {keyOpen ? (
            <div className="pf-form">
              <label className="pf-field" htmlFor="pf-seckey">
                <span>{t('profile.center.newSecurityKey')}</span>
                <input
                  id="pf-seckey"
                  type="password"
                  className="pf-input"
                  value={secKey}
                  onChange={e => {
                    setSecKey(e.target.value)
                    setKeyError('')
                  }}
                  autoComplete="off"
                />
              </label>
              <label className="pf-field" htmlFor="pf-seckey2">
                <span>{t('profile.center.confirmSecurityKey')}</span>
                <input
                  id="pf-seckey2"
                  type="password"
                  className="pf-input"
                  value={secKey2}
                  onChange={e => {
                    setSecKey2(e.target.value)
                    setKeyError('')
                  }}
                  autoComplete="off"
                />
              </label>
              <label className="pf-field" htmlFor="pf-key-pw">
                <span>{t('profile.oldPassword')}</span>
                <input
                  id="pf-key-pw"
                  type="password"
                  className="pf-input"
                  value={keyPw}
                  onChange={e => {
                    setKeyPw(e.target.value)
                    setKeyError('')
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>
              {keyError ? (
                <p className="pf-error" role="alert">
                  {keyError}
                </p>
              ) : null}
              <div className="pf-actions">
                <button
                  type="button"
                  className="pf-btn primary"
                  disabled={keyBusy}
                  onClick={doSetSecurityKey}
                >
                  {keyBusy ? t('auth.processing') : t('common.save')}
                </button>
                <button
                  type="button"
                  className="pf-btn ghost"
                  disabled={keyBusy}
                  onClick={() => {
                    setKeyOpen(false)
                    setSecKey('')
                    setSecKey2('')
                    setKeyPw('')
                    setKeyError('')
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
