/**
 * ProfilePage — /profile 独立路由页面
 *
 * 个人资料设置的默认入口（Header 头像直接导航到此），取代原先的 ProfileMenu 模态框：
 * 头像展示/上传/裁剪、修改昵称、修改密码、退出登录。
 * 面板内容复用 ProfileMenu（页面内嵌形态）。
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ProfileMenu from './ProfileMenu'

export default function ProfilePage({ user, onLogout, onUpdateProfile, onChangePassword }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // 返回上一页;深链接直达(无浏览历史)时兜底回首页(与法务页返回策略一致)
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="profile-page">
      <div className="profile-page-header">
        <button className="btn btn-ghost" onClick={handleBack}>
          ← {t('common.back', '返回')}
        </button>
        <h2>{t('nav.profile', '个人资料')}</h2>
      </div>
      <div className="profile-page-body">
        <ProfileMenu
          user={user}
          onLogout={onLogout}
          onUpdateProfile={onUpdateProfile}
          onChangePassword={onChangePassword}
        />
      </div>
    </div>
  )
}
