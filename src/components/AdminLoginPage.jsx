/**
 * 管理员专属登录面板(/admin/login)
 *
 * 三步:密码 → 两步验证(已绑定 TOTP 时强制) → 进入后台。
 * 安全层次(与 supabase/migrations/0019_admin_hardening.sql 对应):
 *   ① 服务端判据:profiles.role='admin' 且在白名单 admin_allowlist 内(is_admin());
 *   ② 本页强制:若账号已绑定 TOTP 因子,则必须完成 aal2 校验才跳转后台;
 *   ③ 服务端可再强开:security_settings.admin_require_mfa=true 时,
 *      非 aal2 会话连后台 RPC/RLS 都会被 is_admin() 拒绝。
 * 未绑定 TOTP 时会明确告知风险并给出绑定入口,但不会阻断(避免把管理员锁在门外)。
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabase'

export default function AdminLoginPage({ onLogin }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('credentials') // credentials | mfa | enroll
  const [factorId, setFactorId] = useState(null)
  const [enroll, setEnroll] = useState(null)      // { factorId, qr, secret }

  const goToAdmin = useCallback(() => navigate('/admin'), [navigate])

  // 按当前会话的第二因子等级分流:已 aal2 → 直接进后台;已绑定 TOTP → 要求输码;未绑定 → 引导绑定
  // 不依赖单一 API:getAuthenticatorAssuranceLevel 不可用时,回退读取会话自带的 user.factors 判定,
  // 仍无法判定才提示重新登录 —— 避免「管理员卡在密码页」或「已绑定却被当成未绑定」
  const routeByAssurance = useCallback(async () => {
    const factorsOf = (session) => (session?.user?.factors || [])
      .filter((f) => f.factor_type === 'totp' && f.status === 'verified')

    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === 'aal2') { goToAdmin(); return }
      if (aal?.nextLevel === 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const totp = (factors?.totp || []).find((f) => f.status === 'verified')
        setFactorId(totp?.id || null)
        setStep('mfa')
        return
      }
    } catch {
      // 落到下方回退判定
    }

    const { data: { session } } = await supabase.auth.getSession()
    const verified = factorsOf(session)
    if (verified.length > 0) {
      setFactorId(verified[0].id)
      setStep('mfa')
      return
    }
    setStep('enroll')
  }, [goToAdmin])

  // 已存在登录会话时(刷新/回退到本页)直接续走验证流程,不再要求重输密码
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!alive || !session) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      if (!alive || profile?.role !== 'admin') return
      await routeByAssurance()
    })()
    return () => { alive = false }
  }, [routeByAssurance])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(email, password)
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { setError(t('errors.generic')); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle()
      if (profile?.role !== 'admin') { setError(t('admin.gate.notAdmin')); return }
      await routeByAssurance()
    } catch (err) {
      setError(/invalid login credentials/i.test(err?.message || '') ? t('errors.invalidCredentials') : (err?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  const verifyTotp = async (targetFactorId) => {
    setError('')
    setLoading(true)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: targetFactorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: targetFactorId,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (verifyError) throw verifyError
      goToAdmin()
    } catch (err) {
      setError(/invalid|code|expired/i.test(err?.message || '') ? t('admin.mfa.invalid') : (err?.message || t('errors.generic')))
    } finally {
      setLoading(false)
    }
  }

  const handleMfaSubmit = async (e) => {
    e.preventDefault()
    if (!factorId) { setError(t('admin.mfa.invalid')); return }
    await verifyTotp(factorId)
  }

  const startEnroll = async () => {
    setError('')
    setLoading(true)
    try {
      // 清掉历史未验证因子,否则重复 enroll 会因同名因子报错
      const { data: factors } = await supabase.auth.mfa.listFactors()
      for (const f of (factors?.all || []).filter((f) => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `admin-${Date.now()}`,
      })
      if (enrollError) throw enrollError
      setEnroll({ factorId: data.id, qr: data.totp?.qr_code || '', secret: data.totp?.secret || '' })
    } catch {
      setError(t('admin.mfa.enrollFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleEnrollVerify = async (e) => {
    e.preventDefault()
    if (!enroll?.factorId) return
    await verifyTotp(enroll.factorId)
  }

  const resetToCredentials = async () => {
    await supabase.auth.signOut().catch(() => {})
    setStep('credentials')
    setCode('')
    setEnroll(null)
    setFactorId(null)
    setError('')
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
          <span>{step === 'credentials' ? t('admin.gate.loginTitle') : t('admin.mfa.title')}</span>
        </div>

        {step === 'credentials' && (
          <>
            <p className="auth-sub-note">{t('admin.gate.loginHint')}</p>
            <form onSubmit={handleLogin} className="auth-form">
              <label className="auth-label" htmlFor="admin-email">{t('auth.email')}</label>
              <input id="admin-email" className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
              <label className="auth-label" htmlFor="admin-password">{t('auth.password')}</label>
              <input id="admin-password" className="auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button type="submit" className="auth-btn-primary" disabled={loading}>{loading ? t('auth.loading') : t('auth.loginBtn')}</button>
            </form>
          </>
        )}

        {step === 'mfa' && (
          <>
            <p className="auth-sub-note">{t('admin.mfa.hint')}</p>
            <form onSubmit={handleMfaSubmit} className="auth-form">
              <label className="auth-label" htmlFor="mfa-code">{t('admin.mfa.codeLabel')}</label>
              <input
                id="mfa-code"
                className="auth-input mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                required
              />
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button type="submit" className="auth-btn-primary" disabled={loading || code.length < 6}>
                {loading ? t('auth.processing') : t('admin.mfa.submit')}
              </button>
            </form>
            <button type="button" className="auth-skip" onClick={resetToCredentials}>{t('admin.mfa.switchAccount')}</button>
          </>
        )}

        {step === 'enroll' && (
          <>
            <p className="auth-sub-note">{t('admin.mfa.enrollHint')}</p>
            {!enroll ? (
              <>
                <p className="auth-warn">{t('admin.mfa.skipWarn')}</p>
                {error && <div className="auth-error" role="alert">{error}</div>}
                <button type="button" className="auth-btn-primary" disabled={loading} onClick={startEnroll}>
                  {loading ? t('auth.processing') : t('admin.mfa.enableNow')}
                </button>
                <button type="button" className="auth-skip" onClick={goToAdmin}>{t('admin.mfa.skip')}</button>
              </>
            ) : (
              <form onSubmit={handleEnrollVerify} className="auth-form">
                {enroll.qr && <img className="mfa-qr" src={enroll.qr} alt={t('admin.mfa.enrollTitle')} />}
                {enroll.secret && (
                  <p className="mfa-secret">
                    {t('admin.mfa.secretLabel')}
                    <code>{enroll.secret}</code>
                  </p>
                )}
                <label className="auth-label" htmlFor="enroll-code">{t('admin.mfa.codeLabel')}</label>
                <input
                  id="enroll-code"
                  className="auth-input mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                />
                {error && <div className="auth-error" role="alert">{error}</div>}
                <button type="submit" className="auth-btn-primary" disabled={loading || code.length < 6}>
                  {loading ? t('auth.processing') : t('admin.mfa.enrollSubmit')}
                </button>
                <button type="button" className="auth-skip" onClick={() => { setEnroll(null); setCode('') }}>
                  {t('common.cancel')}
                </button>
              </form>
            )}
          </>
        )}

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
              padding: 10px 12px;
              border: 1px solid var(--border-color);
              border-radius: 10px;
              background: var(--bg-primary);
              color: var(--text-primary);
              font-size: var(--text-md);
              box-sizing: border-box;
            }
            .auth-input:focus { outline: none; border-color: var(--accent); }
            .mfa-code { letter-spacing: 0.4em; text-align: center; font-family: var(--font-mono); font-size: var(--text-lg); }
            .auth-error {
              background: var(--error-bg);
              color: var(--error);
              border: 1px solid var(--error-border);
              padding: 8px 12px;
              border-radius: 8px;
              font-size: var(--text-sm);
              margin-top: 8px;
            }
            .auth-warn {
              margin: 0 0 12px;
              padding: 8px 12px;
              border-radius: 8px;
              background: var(--warning-bg);
              border: 1px solid var(--warning-border);
              color: var(--text-secondary);
              font-size: var(--text-sm);
              line-height: 1.5;
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
            .auth-skip {
              display: block;
              width: 100%;
              margin-top: 10px;
              padding: 8px 0;
              background: transparent;
              border: none;
              color: var(--text-muted);
              font-size: var(--text-sm);
              cursor: pointer;
            }
            .auth-skip:hover { color: var(--accent); }
            .mfa-qr {
              display: block;
              width: 180px;
              height: 180px;
              margin: 4px auto 8px;
              background: #fff;
              border-radius: 10px;
              padding: 8px;
              box-sizing: border-box;
            }
            .mfa-secret {
              margin: 0 0 8px;
              font-size: var(--text-xs);
              color: var(--text-muted);
              text-align: center;
              word-break: break-all;
            }
            .mfa-secret code {
              display: block;
              margin-top: 4px;
              padding: 6px 8px;
              border-radius: 6px;
              background: var(--bg-primary);
              color: var(--text-primary);
              font-family: var(--font-mono);
              font-size: var(--text-sm);
              user-select: all;
            }
            @media (max-width: 640px) {
              .auth-page { padding: 16px 12px 48px; }
              .auth-card { padding: 18px 16px; }
            }
          `}</style>
      </div>
    </div>
  )
}
