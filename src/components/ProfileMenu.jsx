import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, SUPABASE_URL } from '../services/supabase'
import Avatar from './Avatar'
import AvatarCropper from './AvatarCropper'

/**
 * 个人资料设置菜单(模态框):
 * 头像展示 / 上传图片 + 圆形裁剪 / 修改昵称 / 修改密码(邮件确认)/ 退出登录。
 * PC 与移动端共用同一模态框,内部布局响应式自适应。
 */
export default function ProfileMenu({ user, onClose, onLogout, onUpdateProfile, onChangePassword }) {
  const { t } = useTranslation()
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
  // 确认对话框:退出登录 / 修改密码
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [confirmChangePw, setConfirmChangePw] = useState(false)

  // 新密码强度校验(与注册页一致)
  const isWeakPassword = (p) => {
    if (p.length < 8) return 'errors.passwordTooShort'
    if (/^(.)\1+$/.test(p)) return 'errors.passwordRepeat'
    if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(p)) return 'errors.passwordSequence'
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'errors.passwordMix'
    return null
  }

  const saveNickname = async () => {
    const trimmed = nickname.trim()
    // 非空校验:空昵称不允许保存
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
    // 类型与大小校验(此前仅靠 accept 过滤,20MB 手机照片全量读入内存可卡死移动端)
    if (!file.type.startsWith('image/')) { setMessage(t('profile.avatarInvalid')); return }
    if (file.size > 5 * 1024 * 1024) { setMessage(t('profile.avatarTooLarge')); return }
    const reader = new FileReader()
    reader.onload = () => setAvatarSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = '' // 允许重复选择同一文件
  }

  // 裁剪器输出 blob → 上传 storage → 更新 profile
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
      // 先更新 profile 成功,再清理旧头像(此前先删旧图,更新失败时旧头像已丢且无孤儿清理)
      await onUpdateProfile({ avatarUrl: url })
      if (user?.avatarUrl?.includes('/avatars/')) {
        const oldPath = user.avatarUrl.split('/avatars/')[1]
        await supabase.storage.from('avatars').remove([oldPath]).catch(() => {})
      }
      setAvatarSrc(null)
      setMessage(t('profile.avatarUpdated'))
    } catch (e) {
      // 清理已上传的新文件,避免存储孤儿累积
      if (uploadedPath) supabase.storage.from('avatars').remove([uploadedPath]).catch(() => {})
      setMessage(t('profile.avatarFailed'))
    } finally {
      setBusy(false)
    }
  }

  // 修改密码:校验旧密码、新密码强度与两次一致 → 弹确认对话框
  const handleChangePassword = () => {
    if (!oldPw) { setPwError(t('profile.oldPasswordRequired')); return }
    const weak = isWeakPassword(newPw)
    if (weak) { setPwError(t(weak)); return }
    if (newPw !== newPw2) { setPwError(t('errors.passwordMismatch')); return }
    setPwError('')
    setConfirmChangePw(true)
  }

  // 确认后真正执行修改密码
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
    } catch (e) {
      setPwError(t('profile.wrongPassword'))
    } finally {
      setPwBusy(false)
    }
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
          /* 裁剪视图:自实现圆形裁剪器(拖动平移 + 滚轮/双指缩放) */
          <div className="crop-section">
            <AvatarCropper
              ref={cropperRef}
              imageSrc={avatarSrc}
              onConfirm={confirmAvatar}
              onCancel={() => setAvatarSrc(null)}
              busy={busy}
            />
            <p className="profile-hint">{t('profile.cropHint')}</p>
            <div className="crop-actions">
              <button className="btn btn-primary" disabled={busy} onClick={() => cropperRef.current?.output()}>
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
          <button className="btn btn-ghost" onClick={() => { setShowChangePw(!showChangePw); setPwError('') }}>
            {t('profile.changePassword')}
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmLogout(true)}>
            {t('auth.logout')}
          </button>
        </div>

        {showChangePw && (
          <div className="profile-section change-pw">
            <h3>{t('profile.changePasswordTitle')}</h3>
            <div className="form-group">
              <label htmlFor="oldPw">{t('profile.oldPassword')}</label>
              <input
                id="oldPw"
                type="password"
                className="profile-input"
                value={oldPw}
                onChange={e => { setOldPw(e.target.value); setPwError('') }}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPw">{t('profile.newPassword')}</label>
              <input
                id="newPw"
                type="password"
                className="profile-input"
                value={newPw}
                onChange={e => { setNewPw(e.target.value); setPwError('') }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPw2">{t('profile.confirmNewPassword')}</label>
              <input
                id="newPw2"
                type="password"
                className="profile-input"
                value={newPw2}
                onChange={e => { setNewPw2(e.target.value); setPwError('') }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            {pwError && <p className="profile-message">{pwError}</p>}
            {pwSaved && <p className="profile-success">{t('profile.passwordUpdated')}</p>}
            <div className="crop-actions">
              <button className="btn btn-primary" disabled={pwBusy} onClick={handleChangePassword}>
                {pwBusy ? t('auth.processing') : t('common.save')}
              </button>
              <button className="btn btn-ghost" disabled={pwBusy} onClick={() => { setShowChangePw(false); setPwError('') }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* 退出登录 / 修改密码 确认对话框(防误触) */}
        {(confirmLogout || confirmChangePw) && (
          <div className="profile-confirm-overlay" onClick={() => { setConfirmLogout(false); setConfirmChangePw(false) }}>
            <div className="modal-content profile-modal confirm-box" onClick={e => e.stopPropagation()}>
              <h3>{confirmLogout ? t('profile.confirmLogoutTitle') : t('profile.confirmChangePwTitle')}</h3>
              <p>{confirmLogout ? t('profile.confirmLogoutBody') : t('profile.confirmChangePwBody')}</p>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => { setConfirmLogout(false); setConfirmChangePw(false) }}>{t('common.cancel')}</button>
                <button className="btn btn-danger" onClick={confirmLogout ? () => { setConfirmLogout(false); onLogout() } : doChangePassword}>{t('common.confirm')}</button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          .profile-overlay { z-index: 1100; }
          .profile-confirm-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: var(--visible-vh, 100vh); /* iOS 键盘弹起收缩兜底 */
            background: rgba(0, 0, 0, 0.4);
            z-index: 1200;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            box-sizing: border-box;
          }
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
          .change-pw {
            border-top: 1px solid var(--border-color);
            padding-top: 16px;
          }
          .change-pw .form-group { margin-bottom: 12px; }
          .change-pw .form-group label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--text-secondary);
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
