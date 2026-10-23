import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate } from 'react-router-dom'
import { PenTool, LayoutGrid, BookOpen, Palette } from 'lucide-react'
import LanguageSelector from './Header/LanguageSelector'
import Avatar from './Avatar'

export default function Header({ user, onLogin, onRegister: _onRegister, onLogout: _onLogout, onSave, currentPage, onPageChange: _onPageChange, simplified, saveState, autoSaveState }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // 自动保存状态:只在「保存中 / 已保存 / 失败」时显示。
  // 与 saveState 的未保存圆点是两件事 —— 一个是「要不要手动存」,
  // 一个是「本机草稿有没有落地」,混成一个反而看不懂。
  const autoSaveLabel = autoSaveState === 'saving' ? t('autosave.statusSaving')
    : autoSaveState === 'saved' ? t('autosave.statusSaved')
    : autoSaveState === 'failed' ? t('autosave.statusFailed')
    : null

  // 后台管理(admin)不在导航中显示,仅通过 /admin 路由访问
  const navItems = [
    { id: 'canvas', path: '/', label: t('nav.canvas'), icon: PenTool },
    { id: 'gallery', path: '/gallery', label: t('nav.gallery'), icon: LayoutGrid },
    { id: 'tutorials', path: '/tutorials', label: t('nav.tutorials'), icon: BookOpen },
    { id: 'myBeads', path: '/my/beads', label: t('nav.myBeads'), icon: Palette },
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
          <button
            onClick={onSave}
            className={`btn btn-ghost save-work-btn${saveState === 'dirty' ? ' has-unsaved' : ''}`}
            aria-label={t('gallery.saveTitle')}
            title={saveState === 'dirty' ? t('gallery.unsavedHint') : undefined}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {!simplified && t('gallery.saveTitle')}
            {/* 未保存标记:一个不依赖颜色的圆点,窄屏也能看见 */}
            {saveState === 'dirty' && <span className="save-unsaved-dot" aria-hidden="true" />}
          </button>
        )}
        {/* 自动保存状态:紧挨保存按钮,读作「保存这件事的现状」。
            移动端没有空间放文字,只在失败时提示 —— 失败是唯一需要用户行动的态。 */}
        {currentPage === 'canvas' && autoSaveLabel && (
          <span
            className={`autosave-status${autoSaveState === 'failed' ? ' is-failed' : ''}`}
            role="status"
            title={autoSaveState === 'failed' ? t('autosave.statusFailedHint') : undefined}
          >
            {simplified ? (autoSaveState === 'failed' ? '!' : '') : autoSaveLabel}
          </span>
        )}
        {!simplified && <LanguageSelector />}
        {/* 移动端:非画布页在导航与用户区之间显示语言切换按钮(🌐) */}
        {simplified && currentPage !== 'canvas' && <LanguageSelector compact />}
        {user ? (
          /* 已登录:圆形头像(邮箱首字符,橙色底白字)为入口,点击进入 /profile 个人资料页 */
          <button
            className="avatar-entry"
            onClick={() => navigate('/profile')}
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
              /* PC 游客:单个「登录」按钮,保留品牌主色填充(网站标志色);
                 注册在 /login 页顶部切换,入口保留。顶栏右侧留出后续扩展空间 */
              <button onClick={onLogin} className="btn btn-primary">{t('auth.login')}</button>
            )}
          </div>
        )}
      </div>

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
          position: relative;
        }
        /* 未保存标记:小圆点,不依赖颜色区分(色弱也能看出形状变化)。
           定位在图标右上角,简版(仅图标)按钮下同样可见。 */
        .save-unsaved-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          flex: none;
        }
        .header.simplified .save-unsaved-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          margin: 0;
        }
        /* 自动保存状态:低对比度的旁注,不与保存按钮抢注意力。
           失败时转为警示色 —— 那是唯一需要用户动手处理的态。 */
        .autosave-status {
          font-size: var(--text-sm);
          color: var(--text-muted);
          white-space: nowrap;
        }
        .autosave-status.is-failed {
          color: var(--danger, #c62828);
          font-weight: 600;
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
