import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Cropper from 'react-easy-crop'
import { supabase, SUPABASE_URL } from '../services/supabase'
import Avatar from './Avatar'

// 将图片源裁剪为正方形 blob(固定输出 240×240 webp)
async function getCroppedBlob(imageSrc, croppedAreaPixels) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })
  const SIZE = 240
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    croppedAreaPixels.x, croppedAreaPixels.y,
    croppedAreaPixels.width, croppedAreaPixels.height,
    0, 0, SIZE, SIZE
  )
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
}

/**
 * 个人资料设置菜单(模态框):
 * 头像展示 / 上传图片 + 圆形裁剪 / 修改昵称 / 修改密码(邮件确认)/ 退出登录。
 * PC 与移动端共用同一模态框,内部布局响应式自适应。
 */
export default function ProfileMenu({ user, onClose, onLogout, onResetPassword, onUpdateProfile }) {
  const { t } = useTranslation()
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [nickSaved, setNickSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState(null) // 待裁剪的图片 dataURL
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)

  const saveNickname = async () => {
    setBusy(true)
    setMessage('')
    try {
      await onUpdateProfile({ nickname: nickname.trim() })
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
    const reader = new FileReader()
    reader.onload = () => {
      setAvatarSrc(reader.result)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
    reader.readAsDataURL(file)
    e.target.value = '' // 允许重复选择同一文件
  }

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const confirmAvatar = async () => {
    if (!avatarSrc || !croppedAreaPixels) return
    setBusy(true)
    setMessage('')
    try {
      const blob = await getCroppedBlob(avatarSrc, croppedAreaPixels)
      const path = `${user.id}/${Date.now()}.webp`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/webp' })
      if (upErr) throw upErr

      // 清理旧头像
      if (user?.avatarUrl?.includes('/avatars/')) {
        const oldPath = user.avatarUrl.split('/avatars/')[1]
        await supabase.storage.from('avatars').remove([oldPath]).catch(() => {})
      }

      const url = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
      await onUpdateProfile({ avatarUrl: url })
      setAvatarSrc(null)
      setMessage(t('profile.avatarUpdated'))
    } catch (e) {
      setMessage(t('profile.avatarFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    onResetPassword(user.email)
      .then(() => {
        setConfirmReset(false)
        setMessage(t('profile.resetSent'))
      })
      .catch(() => setConfirmReset(false))
  }

  return (
    <div className="modal-overlay profile-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="profile-header">
          <Avatar user={user} size={72} />
          <div className="profile-ident">
            <h2>{user.nickname || user.name || user.email}</h2>
            <p>{user.email}</p>
          </div>
        </div>

        {avatarSrc ? (
          /* 裁剪视图:圆形裁剪 + 缩放,确认后上传 */
          <div className="crop-section">
            <div className="crop-stage">
              <Cropper
                image={avatarSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <p className="profile-hint">{t('profile.cropHint')}</p>
            <div className="crop-actions">
              <button className="btn btn-primary" disabled={busy} onClick={confirmAvatar}>
                {t('profile.confirmCrop')}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setAvatarSrc(null)}>
                {t('profile.cancelCrop')}
              </button>
            </div>
          </div>
        ) : (
          <div className="profile-section">
            <h3>{t('profile.changeAvatar')}</h3>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              {t('profile.uploadAvatar')}
            </button>
          </div>
        )}

        <div className="profile-section">
          <h3>{t('profile.nickname')}</h3>
          <div className="nickname-row">
            <input
              type="text"
              className="profile-input"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder={t('profile.nicknamePlaceholder')}
              maxLength={24}
            />
            <button className="btn btn-primary" disabled={busy} onClick={saveNickname}>
              {t('common.save')}
            </button>
          </div>
          {nickSaved && <p className="profile-success">{t('profile.saved')}</p>}
        </div>

        {message && <p className="profile-message">{message}</p>}

        <div className="profile-section profile-actions">
          <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
            {t('profile.resetPassword')}
          </button>
          <button className="btn btn-danger" onClick={onLogout}>
            {t('auth.logout')}
          </button>
        </div>

        {confirmReset && (
          <div className="modal-overlay" onClick={() => setConfirmReset(false)}>
            <div className="modal-content confirm-box" onClick={e => e.stopPropagation()}>
              <h3>{t('profile.resetConfirmTitle')}</h3>
              <p>{t('profile.resetConfirmText', { email: user.email })}</p>
              <div className="confirm-actions">
                <button className="btn btn-primary" onClick={handleReset}>{t('profile.confirmSend')}</button>
                <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          .profile-overlay { z-index: 1100; }
          .profile-modal {
            max-width: 440px;
            padding: 28px 24px 20px;
            position: relative;
          }
          .profile-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
          }
          .profile-ident { min-width: 0; }
          .profile-ident h2 {
            margin: 0 0 2px;
            font-size: var(--text-xl);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .profile-ident p {
            margin: 0;
            color: var(--text-muted);
            font-size: var(--text-sm);
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .profile-section { margin-bottom: 16px; }
          .profile-section h3 {
            font-size: var(--text-sm);
            font-weight: 600;
            color: var(--text-secondary);
            margin: 0 0 8px;
          }
          .nickname-row {
            display: flex;
            gap: 8px;
          }
          .profile-input {
            flex: 1;
            padding: 10px 12px;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            font-size: var(--text-md);
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-family: inherit;
          }
          .profile-input:focus {
            outline: none;
            border-color: var(--accent);
            background: var(--bg-primary);
          }
          .crop-section { margin-bottom: 16px; }
          .crop-stage {
            position: relative;
            width: 100%;
            height: 240px;
            background: var(--bg-tertiary);
            border-radius: 12px;
            overflow: hidden;
          }
          .profile-hint {
            font-size: var(--text-sm);
            color: var(--text-muted);
            margin: 8px 0;
          }
          .crop-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
          }
          .profile-success {
            color: var(--success);
            font-size: var(--text-sm);
            margin: 6px 0 0;
          }
          .profile-message {
            color: var(--text-secondary);
            font-size: var(--text-sm);
            margin: 0 0 12px;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-radius: 8px;
          }
          .profile-actions {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            border-top: 1px solid var(--border-color);
            padding-top: 16px;
            margin-bottom: 0;
          }
          .btn-danger {
            background: var(--error);
            color: white;
            border-color: transparent;
          }
          .btn-danger:hover {
            background: var(--error);
            opacity: 0.9;
          }
          .confirm-box {
            max-width: 380px;
            padding: 24px;
          }
          .confirm-box h3 {
            margin: 0 0 8px;
            font-size: var(--text-lg);
          }
          .confirm-box p {
            margin: 0 0 16px;
            color: var(--text-secondary);
            font-size: var(--text-md);
            word-break: break-all;
          }
          .confirm-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          }
          .close-btn {
            position: absolute;
            top: 14px;
            right: 14px;
            padding: 4px;
            border-radius: 4px;
            color: var(--text-muted);
            background: none;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
          }
          .close-btn:hover {
            color: var(--text-primary);
            background: var(--bg-secondary);
          }
          @media (max-width: 480px) {
            .profile-modal { padding: 24px 16px 16px; }
          }
        `}</style>
      </div>
    </div>
  )
}
