/**
 * ProfilePage — /profile 个人资料独立页面
 *
 * 页面定位:账号自助管理(头像 / 昵称 / 密码 / 退出登录)。
 * 形态约束:
 *   · 不继承站点导航 —— App 已把 /profile 归入独立页(隐藏 Header 与画布工具栏),
 *     本页自带返回与标题,页面内不出现图库/画布/登录等其他页面的控件;
 *   · 未登录不做「本页登录」按钮:个人资料页没有可管理的内容,直接回独立登录页;
 *   · PC 端为双栏(左:身份卡;右:基本资料 / 账号安全),<900px 自动收成单栏。
 *
 * 原 ProfileMenu 组件已并入本页(此前仅此页使用,单独一层已无意义)。
 */

import { useState, useRef, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, SUPABASE_URL } from '../services/supabase'
import Avatar from './Avatar'
import AvatarCropper from './AvatarCropper'
import LoadingScreen from './LoadingScreen'

export default function ProfilePage({ user, authLoading, onLogout, onUpdateProfile, onChangePassword }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [nickname, setNickname] = useState(user?.nickname || '')
  const [nickSaved, setNickSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState(null) // 待裁剪的图片 dataURL
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)
  const cropperRef = useRef(null)

  // 修改密码(旧密码验证)状态
  const [showChangePw, setShowChangePw] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)

  // 确认对话框:退出登录 / 修改密码(防误触)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [confirmChangePw, setConfirmChangePw] = useState(false)

  // 头像/昵称由 useAuth 异步补齐(refreshProfile),首帧 user 上可能还没有昵称:
  // 资料到达后把输入框同步过来;若用户已经动手编辑,则保留用户输入不覆盖
  const lastSyncedRef = useRef(user?.nickname || '')
  useEffect(() => {
    // 注意:先取快照再改 ref —— setNickname 的更新函数在下次渲染才执行,
    // 若提前覆盖 ref,函数里比较的基准会变成新值,导致「永远认为用户已编辑」而不同步
    const prev = lastSyncedRef.current
    const next = user?.nickname || ''
    lastSyncedRef.current = next
    setNickname((current) => (current === prev ? next : current))
  }, [user?.nickname])

  // 会话解析中:此时 user 仍为 null,不能据此判定未登录(否则已登录用户会被踢到登录页)
  if (authLoading) {
    return (
      <div className="profile-page">
        <LoadingScreen />
      </div>
    )
  }

  // 未登录:本页不提供登录入口(登录是 /login 的职责)
  if (!user) return <Navigate to="/login" replace />

  // 返回上一页;深链接直达(无浏览历史)时兜底回首页
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  const isWeakPassword = (p) => {
    if (p.length < 8) return 'errors.passwordTooShort'
    if (/^(.)\1+$/.test(p)) return 'errors.passwordRepeat'
    if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(p)) return 'errors.passwordSequence'
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'errors.passwordMix'
    return null
  }

  // 昵称只有真的改动过才允许保存(避免无意义写入)
  const nicknameDirty = nickname.trim() !== (user.nickname || '').trim()

  const saveNickname = async () => {
    const trimmed = nickname.trim()
    if (!trimmed) {
      setMessage(t('profile.nicknameRequired'))
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await onUpdateProfile({ nickname: trimmed })
      setNickSaved(true)
      setTimeout(() => setNickSaved(false), 1500)
    } catch {
      setMessage(t('profile.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 类型与大小校验:20MB 手机原图全量读入内存可卡死移动端,这里硬性拦截
    if (!file.type.startsWith('image/')) { setMessage(t('profile.avatarInvalid')); return }
    if (file.size > 5 * 1024 * 1024) { setMessage(t('profile.avatarTooLarge')); return }
    const reader = new FileReader()
    reader.onload = () => setAvatarSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = '' // 允许重复选择同一文件
  }

  // 裁剪器输出 blob → 上传 storage → 更新 profile(先更新成功再清理旧图,避免旧头像丢失)
  const confirmAvatar = async (blob) => {
    setBusy(true)
    setMessage('')
    let uploadedPath = null
    try {
      const path = `${user.id}/${Date.now()}.webp`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/webp' })
      if (upErr) throw upErr
      uploadedPath = path

      const url = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
      await onUpdateProfile({ avatarUrl: url })
      if (user?.avatarUrl?.includes('/avatars/')) {
        const oldPath = user.avatarUrl.split('/avatars/')[1]
        await supabase.storage.from('avatars').remove([oldPath]).catch(() => {})
      }
      setAvatarSrc(null)
      setMessage(t('profile.avatarUpdated'))
    } catch {
      // 清理已上传的新文件,避免存储孤儿累积
      if (uploadedPath) supabase.storage.from('avatars').remove([uploadedPath]).catch(() => {})
      setMessage(t('profile.avatarFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleChangePassword = () => {
    if (!oldPw) { setPwError(t('profile.oldPasswordRequired')); return }
    const weak = isWeakPassword(newPw)
    if (weak) { setPwError(t(weak)); return }
    if (newPw !== newPw2) { setPwError(t('errors.passwordMismatch')); return }
    setPwError('')
    setConfirmChangePw(true)
  }

  const doChangePassword = async () => {
    setConfirmChangePw(false)
    setPwBusy(true)
    try {
      await onChangePassword(user.email, oldPw, newPw)
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2000)
      setOldPw('')
      setNewPw('')
      setNewPw2('')
      setShowChangePw(false)
    } catch {
      setPwError(t('profile.wrongPassword'))
    } finally {
      setPwBusy(false)
    }
  }

  const displayName = user.nickname || user.name || user.email || ''
  const accountLabel = user.username || user.email || ''

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <header className="profile-page-bar">
          <button
            type="button"
            className="profile-back"
            onClick={handleBack}
            aria-label={t('common.back', '返回')}
            title={t('common.back', '返回')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="profile-back-label">{t('common.back', '返回')}</span>
          </button>
          <div className="profile-page-title">
            <h1>{t('profile.title', '个人资料')}</h1>
            <p>{t('profile.subtitle', '管理你的账号信息与安全设置')}</p>
          </div>
        </header>

        {message ? (
          <div className="profile-toast" role="status">
            <span>{message}</span>
            <button type="button" className="profile-toast-close" onClick={() => setMessage('')} aria-label={t('common.close', '关闭')}>×</button>
          </div>
        ) : null}

        <div className="profile-layout">
          {/* ── 左:身份卡 ─────────────────────────────────── */}
          <aside className="profile-card profile-identity">
            <div className="profile-avatar-wrap">
              <Avatar user={user} size={96} />
            </div>
            <h2 className="profile-name" title={displayName}>{displayName}</h2>
            <p className="profile-account" title={accountLabel}>{accountLabel}</p>
            <span className="profile-account-kind">
              {user.username ? t('profile.accountUsername', '用户名账号') : t('profile.accountEmail', '邮箱账号')}
            </span>

            {avatarSrc ? (
              <div className="profile-crop">
                <AvatarCropper
                  ref={cropperRef}
                  imageSrc={avatarSrc}
                  onConfirm={confirmAvatar}
                  onCancel={() => setAvatarSrc(null)}
                  busy={busy}
                />
                <p className="profile-hint">{t('profile.cropHint')}</p>
                <div className="profile-crop-actions">
                  <button type="button" className="profile-btn primary" disabled={busy} onClick={() => cropperRef.current?.output()}>
                    {t('profile.confirmCrop')}
                  </button>
                  <button type="button" className="profile-btn ghost" disabled={busy} onClick={() => setAvatarSrc(null)}>
                    {t('profile.cancelCrop')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="profile-identity-actions">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
                <button type="button" className="profile-btn secondary block" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {t('profile.uploadAvatar')}
                </button>
              </div>
            )}

            <div className="profile-identity-footer">
              <button type="button" className="profile-btn danger block" onClick={() => setConfirmLogout(true)}>
                {t('auth.logout', '退出登录')}
              </button>
            </div>
          </aside>

          {/* ── 右:基本资料 / 账号安全 ─────────────────────── */}
          <div className="profile-main">
            <section className="profile-card">
              <div className="profile-card-head">
                <h3>{t('profile.sectionAccount', '基本信息')}</h3>
              </div>
              <label className="profile-field" htmlFor="profile-nickname">
                <span>{t('profile.nickname', '昵称')}</span>
                <div className="profile-field-row">
                  <input
                    id="profile-nickname"
                    type="text"
                    className="profile-input"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && nicknameDirty && !busy) saveNickname() }}
                    placeholder={t('profile.nicknamePlaceholder', '给自己起个昵称')}
                    maxLength={24}
                  />
                  <button type="button" className="profile-btn primary" disabled={busy || !nicknameDirty} onClick={saveNickname}>
                    {t('common.save', '保存')}
                  </button>
                </div>
                {nickSaved ? <span className="profile-success">{t('profile.saved', '已保存')}</span> : null}
              </label>
            </section>

            <section className="profile-card">
              <div className="profile-card-head">
                <h3>{t('profile.sectionSecurity', '账号安全')}</h3>
                {!showChangePw ? (
                  <button type="button" className="profile-link" onClick={() => { setShowChangePw(true); setPwError('') }}>
                    {t('profile.changePassword', '修改密码')}
                  </button>
                ) : null}
              </div>

              {showChangePw ? (
                <div className="profile-pw-form">
                  <label className="profile-field" htmlFor="profile-old-pw">
                    <span>{t('profile.oldPassword', '当前密码')}</span>
                    <input
                      id="profile-old-pw"
                      type="password"
                      className="profile-input"
                      value={oldPw}
                      onChange={(e) => { setOldPw(e.target.value); setPwError('') }}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </label>
                  <label className="profile-field" htmlFor="profile-new-pw">
                    <span>{t('profile.newPassword', '新密码')}</span>
                    <input
                      id="profile-new-pw"
                      type="password"
                      className="profile-input"
                      value={newPw}
                      onChange={(e) => { setNewPw(e.target.value); setPwError('') }}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="profile-field" htmlFor="profile-new-pw2">
                    <span>{t('profile.confirmNewPassword', '确认新密码')}</span>
                    <input
                      id="profile-new-pw2"
                      type="password"
                      className="profile-input"
                      value={newPw2}
                      onChange={(e) => { setNewPw2(e.target.value); setPwError('') }}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </label>
                  {pwError ? <p className="profile-error">{pwError}</p> : null}
                  {pwSaved ? <p className="profile-success">{t('profile.passwordUpdated', '密码已更新')}</p> : null}
                  <div className="profile-crop-actions">
                    <button type="button" className="profile-btn primary" disabled={pwBusy} onClick={handleChangePassword}>
                      {pwBusy ? t('auth.processing', '处理中...') : t('common.save', '保存')}
                    </button>
                    <button type="button" className="profile-btn ghost" disabled={pwBusy} onClick={() => { setShowChangePw(false); setPwError('') }}>
                      {t('common.cancel', '取消')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="profile-hint">{t('profile.securityHint', '定期更换密码可以提升账号安全性')}</p>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* 退出登录 / 修改密码 确认对话框(防误触) */}
      {(confirmLogout || confirmChangePw) && (
        <div className="profile-confirm-overlay" onClick={() => { setConfirmLogout(false); setConfirmChangePw(false) }}>
          <div className="modal-content confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmLogout ? t('profile.confirmLogoutTitle') : t('profile.confirmChangePwTitle')}</h3>
            <p>{confirmLogout ? t('profile.confirmLogoutBody') : t('profile.confirmChangePwBody')}</p>
            <div className="confirm-actions">
              <button type="button" className="profile-btn ghost" onClick={() => { setConfirmLogout(false); setConfirmChangePw(false) }}>{t('common.cancel')}</button>
              <button type="button" className="profile-btn danger" onClick={confirmLogout ? () => { setConfirmLogout(false); onLogout() } : doChangePassword}>{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
