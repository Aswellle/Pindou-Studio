/**
 * ProfileInfoSection — 个人中心「个人资料」分区。
 *
 * 头像 / 昵称 / 账号标识 / 建立时间 / 邮箱验证状态。
 *
 * 复用既有链路,不重写:
 *   · 头像门控 checkImageFile + checkImagePixels(与图片转拼豆同一套);
 *   · AvatarCropper 裁剪 240×240 webp;
 *   · 上传 avatars bucket → onUpdateProfile → 清理旧图,失败回滚新图。
 *
 * 账号标识区分两类账号:用户名账号只显示 username,绝不渲染合成邮箱。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, SUPABASE_URL } from '../../services/supabase'
import { checkImageFile, checkImagePixels } from '../../utils/imageGuard'
import { accountIdentity, displayNameOf } from '../../utils/normalizeAuthUser'
import Avatar from '../Avatar'
import AvatarCropper from '../AvatarCropper'

export default function ProfileInfoSection({ user, onUpdateProfile, onMessage }) {
  const { t, i18n } = useTranslation()
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [nickSaved, setNickSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState(null)
  const fileRef = useRef(null)
  const cropperRef = useRef(null)

  // 昵称由 useAuth 异步补齐:资料到达后同步进输入框;用户已动手编辑则不覆盖。
  // 注意先取快照再改 ref —— setNickname 的更新函数下次渲染才执行,
  // 提前覆盖 ref 会让比较基准变成新值,「永远认为用户已编辑」。
  const lastSyncedRef = useRef(user?.nickname || '')
  useEffect(() => {
    const prev = lastSyncedRef.current
    const next = user?.nickname || ''
    lastSyncedRef.current = next
    setNickname(current => (current === prev ? next : current))
  }, [user?.nickname])

  const nicknameDirty = nickname.trim() !== (user?.nickname || '').trim()

  const saveNickname = async () => {
    const trimmed = nickname.trim()
    if (!trimmed) {
      onMessage(t('profile.nicknameRequired'), 'error')
      return
    }
    setBusy(true)
    try {
      await onUpdateProfile({ nickname: trimmed })
      setNickSaved(true)
      setTimeout(() => setNickSaved(false), 1500)
    } catch {
      onMessage(t('profile.saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    // 类型/字节/像素三重门控:裁剪前会按原始分辨率整张解码,
    // 「文件很小、像素极多」的图片会在这里撑爆移动端内存。
    const fileErr = checkImageFile(file, { maxBytes: 5 * 1024 * 1024 })
    if (fileErr) {
      onMessage(t(fileErr === 'notImage' ? 'profile.avatarInvalid' : 'profile.avatarTooLarge'), 'error')
      return
    }
    const head = await file.slice(0, 65536).arrayBuffer()
    if (checkImagePixels(head)) {
      onMessage(t('quantizer.errors.tooManyPixels'), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAvatarSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = '' // 允许重复选择同一文件
  }

  // 裁剪输出 blob → 上传 storage → 更新 profile → 清理旧图。
  // 顺序不能反:先更新成功再删旧图,否则更新失败时旧头像已经没了。
  const confirmAvatar = async blob => {
    setBusy(true)
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
        await supabase.storage
          .from('avatars')
          .remove([oldPath])
          .catch(() => {})
      }
      setAvatarSrc(null)
      onMessage(t('profile.avatarUpdated'), 'success')
    } catch {
      // 清理已上传的新文件,避免存储孤儿累积
      if (uploadedPath)
        supabase.storage
          .from('avatars')
          .remove([uploadedPath])
          .catch(() => {})
      onMessage(t('profile.avatarFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const formatDate = value => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    try {
      return d.toLocaleDateString(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      return d.toISOString().slice(0, 10)
    }
  }

  const isUsernameAccount = user.authType === 'username'

  return (
    <div className="pf-section-stack">
      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.avatarTitle')}</h3>
        </div>
        <div className="pf-avatar-editor">
          <div className="pf-avatar-preview">
            <Avatar user={user} size={88} />
          </div>
          <div className="pf-avatar-controls">
            {avatarSrc ? (
              <>
                <AvatarCropper
                  ref={cropperRef}
                  imageSrc={avatarSrc}
                  onConfirm={confirmAvatar}
                  onCancel={() => setAvatarSrc(null)}
                  busy={busy}
                />
                <p className="pf-hint">{t('profile.cropHint')}</p>
                <div className="pf-actions">
                  <button
                    type="button"
                    className="pf-btn primary"
                    disabled={busy}
                    onClick={() => cropperRef.current?.output()}
                  >
                    {t('profile.confirmCrop')}
                  </button>
                  <button
                    type="button"
                    className="pf-btn ghost"
                    disabled={busy}
                    onClick={() => setAvatarSrc(null)}
                  >
                    {t('profile.cancelCrop')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
                <button
                  type="button"
                  className="pf-btn secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  {t('profile.uploadAvatar')}
                </button>
                <p className="pf-hint">{t('profile.center.avatarHint')}</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.nicknameTitle')}</h3>
          {nickSaved ? (
            <span className="pf-success" role="status">
              {t('profile.saved')}
            </span>
          ) : null}
        </div>
        <label className="pf-field" htmlFor="profile-nickname">
          <span>{t('profile.nickname')}</span>
          <div className="pf-field-row">
            <input
              id="profile-nickname"
              type="text"
              className="pf-input"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && nicknameDirty && !busy) saveNickname()
              }}
              placeholder={t('profile.nicknamePlaceholder')}
              maxLength={24}
            />
            <button
              type="button"
              className="pf-btn primary"
              disabled={busy || !nicknameDirty}
              onClick={saveNickname}
            >
              {t('common.save')}
            </button>
          </div>
        </label>
      </section>

      <section className="pf-card">
        <div className="pf-card-head">
          <h3>{t('profile.center.accountTitle')}</h3>
        </div>
        <dl className="pf-meta-list">
          <div className="pf-meta-row">
            <dt>{isUsernameAccount ? t('profile.center.usernameLabel') : t('profile.center.emailLabel')}</dt>
            <dd title={accountIdentity(user)}>{accountIdentity(user)}</dd>
          </div>
          <div className="pf-meta-row">
            <dt>{t('profile.center.accountType')}</dt>
            <dd>{isUsernameAccount ? t('profile.accountUsername') : t('profile.accountEmail')}</dd>
          </div>
          <div className="pf-meta-row">
            <dt>{t('profile.center.displayName')}</dt>
            <dd>{displayNameOf(user)}</dd>
          </div>
          {user.createdAt ? (
            <div className="pf-meta-row">
              <dt>{t('profile.center.createdAt')}</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
          ) : null}
          {!isUsernameAccount ? (
            <div className="pf-meta-row">
              <dt>{t('profile.center.emailStatus')}</dt>
              <dd>
                {user.emailConfirmedAt
                  ? t('profile.center.emailVerified')
                  : t('profile.center.emailUnverified')}
              </dd>
            </div>
          ) : null}
          {user.pendingEmail ? (
            <div className="pf-meta-row">
              <dt>{t('profile.center.pendingEmail')}</dt>
              <dd>{user.pendingEmail}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  )
}
