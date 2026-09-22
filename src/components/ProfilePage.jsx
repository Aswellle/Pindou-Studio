/**
 * ProfilePage — /profile 独立路由页面
 *
 * 从 ProfileMenu Modal 迁移而来，功能完全一致：
 * 头像展示/上传/裁剪、修改昵称、修改密码、退出登录。
 *
 * 保留原 ProfileMenu Modal 路径不变（onClose 仍可用于关闭），
 * 路由入口仅作为新增的页面级访问方式。
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ProfileMenu from './ProfileMenu'

export default function ProfilePage({ user, onLogout, onUpdateProfile, onChangePassword }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleClose = () => navigate(-1)

  return (
    <div className="profile-page">
      <div className="profile-page-header">
        <button className="btn btn-ghost" onClick={handleClose}>
          ← {t('common.back', '返回')}
        </button>
        <h2>{t('nav.profile', '个人资料')}</h2>
      </div>
      <div className="profile-page-body">
        <ProfileMenu
          user={user}
          onClose={handleClose}
          onLogout={onLogout}
          onUpdateProfile={onUpdateProfile}
          onChangePassword={onChangePassword}
        />
      </div>
    </div>
  )
}
