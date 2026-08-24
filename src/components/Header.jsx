import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { PenTool, LayoutGrid, BookOpen } from 'lucide-react'
import LanguageSelector from './Header/LanguageSelector'
import Avatar from './Avatar'
import ProfileMenu from './ProfileMenu'

export default function Header({ user, onLogin, onRegister, onLogout, onSave, currentPage, onPageChange, simplified, onUpdateProfile, onChangePassword }) {
  const { t } = useTranslation()
  const [showProfile, setShowProfile] = useState(false)

  // 后台管理(admin)不在导航中显示,仅通过 /admin 路由访问
  const navItems = [
    { id: 'canvas', path: '/', label: t('nav.canvas'), icon: PenTool },
    { id: 'gallery', path: '/gallery', label: t('nav.gallery'), icon: LayoutGrid },
    { id: 'tutorials', path: '/tutorials', label: t('nav.tutorials'), icon: BookOpen },
  ]

  return (
    <header className={`header ${simplified ? 'simplified' : ''}`}>
      <div className="header-left">
        <NavLink to="/" className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="8" height="8" x="0" y="0" fill="#E53935"/>
            <rect width="8" height="8" x="8" y="0" fill="#FDD835"/>
            <rect width="8" height="8" x="16" y="0" fill="#32CD32"/>
            <rect width="8" height="8" x="24" y="0" fill="#1976D2"/>
            <rect width="8" height="8" x="0" y="8" fill="#F06292"/>
            <rect width="8" height="8" x="8" y="8" fill="#BA68C8"/>
            <rect width="8" height="8" x="16" y="8" fill="#00BCD4"/>
            <rect width="8" height="8" x="24" y="8" fill="#FF9800"/>
            <rect width="8" height="8" x="0" y="16" fill="#FFFFFF" stroke="#E0E0E0"/>
            <rect width="8" height="8" x="8" y="16" fill="#9E9E9E"/>
            <rect width="8" height="8" x="16" y="16" fill="#000000"/>
            <rect width="8" height="8" x="24" y="16" fill="#795548"/>
            <rect width="8" height="8" x="0" y="24" fill="#8D6E63"/>
            <rect width="8" height="8" x="8" y="24" fill="#A1887F"/>
            <rect width="8" height="8" x="16" y="24" fill="#BDBDBD"/>
            <rect width="8" height="8" x="24" y="24" fill="#6D4C41"/>
          </svg>
          {!simplified && <span className="logo-text">{t('app.title')}</span>}
        </NavLink>
      </div>

      <div className="header-center">
        <nav className="nav">
          {navItems.map(item => (
            <NavLink
              key={item.id}
              to={item.path}
              className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
              aria-label={item.label}
            >
              {simplified ? (
                <span className="nav-icon">
                  <item.icon size={18} />
                </span>
              ) : (
                <span className="nav-label">
                  <item.icon size={16} />
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="header-right">
        {currentPage === 'canvas' && onSave && (
          <button onClick={onSave} className="btn btn-ghost save-work-btn" aria-label={t('gallery.saveTitle')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {!simplified && t('gallery.saveTitle')}
          </button>
        )}
        {!simplified && <LanguageSelector />}
        {/* 移动端:非画布页在导航与用户区之间显示语言切换按钮(国旗) */}
        {simplified && currentPage !== 'canvas' && <LanguageSelector />}
        {user ? (
          /* 已登录:圆形头像(邮箱首字符,橙色底白字)为入口,点击打开个人设置 */
          <button
            className="avatar-entry"
            onClick={() => setShowProfile(true)}
            aria-label={t('profile.title')}
            title={t('profile.title')}
          >
            <Avatar user={user} size={simplified ? 32 : 36} />
            {!simplified && <span className="user-name">{user.nickname || user.name}</span>}
          </button>
        ) : (
          <div className="auth-buttons">
            {simplified ? (
              /* 移动端游客:圆框"登录"文字按钮(带 i18n) */
              <button onClick={onLogin} className="mobile-login-btn" aria-label={t('auth.login')} title={t('auth.login')}>
                {t('auth.login')}
              </button>
            ) : (
              <>
                <button onClick={onLogin} className="btn btn-ghost">{t('auth.login')}</button>
                <button onClick={onRegister} className="btn btn-primary">{t('auth.register')}</button>
              </>
            )}
          </div>
        )}
      </div>

      {showProfile && user && (
        <ProfileMenu
          user={user}
          onClose={() => setShowProfile(false)}
          onLogout={onLogout}
          onUpdateProfile={onUpdateProfile}
          onChangePassword={onChangePassword}
        />
      )}

      <style>{`
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-primary);
          height: 60px;
        }
        .avatar-entry {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          font-family: inherit;
        }
        .avatar-entry .user-name {
          font-size: var(--text-md);
          color: var(--text-primary);
          font-weight: 500;
        }
        .avatar-fallback {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          font-weight: 700;
          user-select: none;
          flex-shrink: 0;
          box-shadow: 0 1px 4px rgba(43, 36, 32, 0.15);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .avatar-img {
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--border-color);
          flex-shrink: 0;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .avatar-entry:hover .avatar-fallback,
        .avatar-entry:hover .avatar-img {
          transform: scale(1.06);
          box-shadow: 0 2px 8px rgba(232, 115, 74, 0.3);
        }
        .header.simplified {
          padding: 8px 12px;
          height: 50px;
        }
        .header-left, .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .header.simplified .header-left,
        .header.simplified .header-right {
          gap: 8px;
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-text {
          font-size: var(--text-xl);
          font-weight: var(--font-weight-semibold);
        }
        .nav {
          display: flex;
          gap: 8px;
        }
        .header.simplified .nav {
          gap: 2px;
        }
        .nav-link {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: var(--text-md);
          color: var(--text-secondary);
          transition: all 0.2s;
          background: transparent;
          border: none;
          cursor: pointer;
          text-decoration: none;
        }
        .nav-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .header.simplified .nav-link {
          padding: 8px;
          min-width: 40px;
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .nav-link:hover {
          color: var(--text-primary);
          background: var(--bg-secondary);
        }
        .nav-link.active {
          color: var(--text-primary);
          font-weight: var(--font-weight-semibold);
          background: var(--bg-secondary);
        }
        .auth-buttons {
          display: flex;
          gap: 8px;
        }
        /* 移动端游客登录:圆框"登录"文字按钮 */
        .mobile-login-btn {
          height: 36px;
          min-width: 60px;
          padding: 0 16px;
          border-radius: 18px;
          border: 1.5px solid var(--text-secondary);
          background: transparent;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .mobile-login-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .user-menu {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .header.simplified .user-menu {
          gap: 4px;
        }
        .user-name {
          font-size: var(--text-md);
          color: var(--text-secondary);
        }
        .save-work-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: var(--text-base);
        }
        .icon-only-btn,
        .header.simplified .save-work-btn {
          padding: 8px;
          min-width: 40px;
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* 平板(640–1023px)使用完整头栏(LOGO + 站点名 + 文字导航),
           适当收紧间距避免在 768px 宽度下拥挤 */
        @media (min-width: 640px) and (max-width: 1023px) {
          .header {
            padding: 12px 16px;
          }
          .header-left,
          .header-right {
            gap: 10px;
          }
          .nav {
            gap: 4px;
          }
          .nav-link {
            padding: 8px 12px;
          }
        }
      `}</style>
    </header>
  )
}
