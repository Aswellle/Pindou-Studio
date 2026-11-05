import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PenTool, LayoutGrid, BookOpen, Palette, ChevronDown, LogOut, UserRound } from 'lucide-react'
import LanguageSelector from './Header/LanguageSelector'
import Avatar from './Avatar'
import LogoutConfirmDialog from './auth/LogoutConfirmDialog'
import { useScrollLock } from '../hooks/useScrollLock'
import { SITE_NAME } from '../data/site'

export default function Header({
  user,
  onLogin,
  onRegister: _onRegister,
  onLogout,
  currentPage,
  onPageChange: _onPageChange,
  simplified,
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const userMenuTriggerRef = useRef(null)
  const userMenuRef = useRef(null)

  useScrollLock(confirmLogout)

  // 切换页面或退出登录后收起菜单:菜单是浮层,不该跟着路由残留在新页面上
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname 只作为「路由变化」信号,effect 内不读取它
  useEffect(() => {
    setUserMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user) {
      setUserMenuOpen(false)
      setConfirmLogout(false)
    }
  }, [user])

  // 点击菜单外部关闭;Escape 关闭并把焦点还给触发按钮
  useEffect(() => {
    if (!userMenuOpen) return undefined
    const handleClick = e => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false)
        userMenuTriggerRef.current?.focus()
      }
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [userMenuOpen])

  // 后台管理(admin)不在导航中显示,仅通过 /admin 路由访问
  const navItems = [
    { id: 'canvas', path: '/', label: t('nav.canvas'), icon: PenTool },
    { id: 'gallery', path: '/gallery', label: t('nav.gallery'), icon: LayoutGrid },
    { id: 'tutorials', path: '/tutorials', label: t('nav.tutorials'), icon: BookOpen },
    { id: 'myBeads', path: '/my/beads', label: t('nav.myBeads'), icon: Palette },
  ]

  // 顶部导航在两种布局下都是纯图标:名称走 aria-label 与悬浮轻提示(data-tip),
  // 从根上免除英文/日文等长语言把顶栏挤断行的问题,也不再需要按语言调宽度。
  const renderNav = iconSize => (
    <nav className="nav">
      {navItems.map(item => (
        <NavLink
          key={item.id}
          to={item.path}
          className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
          aria-label={item.label}
          data-tip={item.label}
        >
          <item.icon size={iconSize} aria-hidden="true" />
        </NavLink>
      ))}
    </nav>
  )

  // 圆形登录按钮只放得下一个词:中文显示「登录」,
  // 其余语言(英/日/韩)统一显示英文 Login,避免长词撑破圆形。
  const loginText = i18n.language?.startsWith('zh') ? t('auth.login') : 'Login'

  return (
    <header className={`header ${simplified ? 'simplified' : ''}`}>
      <div className="header-left">
        <NavLink to="/" className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="8" height="8" x="0" y="0" fill="#E53935" />
            <rect width="8" height="8" x="8" y="0" fill="#FDD835" />
            <rect width="8" height="8" x="16" y="0" fill="#32CD32" />
            <rect width="8" height="8" x="24" y="0" fill="#1976D2" />
            <rect width="8" height="8" x="0" y="8" fill="#F06292" />
            <rect width="8" height="8" x="8" y="8" fill="#BA68C8" />
            <rect width="8" height="8" x="16" y="8" fill="#00BCD4" />
            <rect width="8" height="8" x="24" y="8" fill="#FF9800" />
            <rect width="8" height="8" x="0" y="16" fill="#FFFFFF" stroke="#E0E0E0" />
            <rect width="8" height="8" x="8" y="16" fill="#9E9E9E" />
            <rect width="8" height="8" x="16" y="16" fill="#000000" />
            <rect width="8" height="8" x="24" y="16" fill="#795548" />
            <rect width="8" height="8" x="0" y="24" fill="#8D6E63" />
            <rect width="8" height="8" x="8" y="24" fill="#A1887F" />
            <rect width="8" height="8" x="16" y="24" fill="#BDBDBD" />
            <rect width="8" height="8" x="24" y="24" fill="#6D4C41" />
          </svg>
          {!simplified && <span className="logo-text">{SITE_NAME}</span>}
        </NavLink>
      </div>

      {/* 移动端:导航保持居中(50px 矮顶栏,右侧要让给语言与登录) */}
      {simplified && <div className="header-center">{renderNav(18)}</div>}

      <div className="header-right">
        {/* PC:纯图标导航整体右移,与语言切换、登录同一组水平排布。
            保存等画布专属动作不进顶栏 —— 否则图标组会随页面切换增减、整排跳位 */}
        {!simplified && renderNav(20)}
        {!simplified && <LanguageSelector />}
        {/* 移动端:非画布页在导航与用户区之间显示语言切换按钮(🌐) */}
        {simplified && currentPage !== 'canvas' && <LanguageSelector compact />}
        {user ? (
          /* 已登录:头像作为账号菜单入口(个人中心 / 退出登录)。
             登出在桌面与手机上都从这里进入,不再依赖个人中心内被移动端隐藏的按钮。 */
          <div className="user-menu" ref={userMenuRef}>
            <button
              ref={userMenuTriggerRef}
              type="button"
              className="avatar-entry"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-controls="user-account-menu"
              aria-label={t('profile.center.title')}
              title={t('profile.center.title')}
              onClick={() => setUserMenuOpen(open => !open)}
            >
              <Avatar user={user} size={simplified ? 32 : 36} />
              {!simplified && <span className="user-name">{user.nickname || user.name}</span>}
              <ChevronDown
                size={14}
                className={`user-menu-caret${userMenuOpen ? ' open' : ''}`}
                aria-hidden="true"
              />
            </button>
            {userMenuOpen && (
              <div className="user-menu-pop" id="user-account-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item"
                  onClick={() => {
                    setUserMenuOpen(false)
                    navigate('/profile')
                  }}
                >
                  <UserRound size={16} aria-hidden="true" />
                  <span>{t('profile.center.title')}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item danger"
                  onClick={() => {
                    setUserMenuOpen(false)
                    setConfirmLogout(true)
                  }}
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>{t('auth.logout')}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="auth-buttons">
            {simplified ? (
              /* 移动端游客:圆框"登录"文字按钮(带 i18n) */
              <button
                onClick={onLogin}
                className="mobile-login-btn"
                aria-label={t('auth.login')}
                title={t('auth.login')}
              >
                {t('auth.login')}
              </button>
            ) : (
              /* PC 游客:圆形「登录」按钮(品牌主色填充);注册在 /login 页顶部切换,
                 入口保留。文案规则见 loginText:中文用「登录」,其他语言用 Login */
              <button
                type="button"
                onClick={onLogin}
                className="auth-circle-btn"
                aria-label={t('auth.login')}
              >
                {loginText}
              </button>
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
        /* 头像的圆形/边框基础样式在 Avatar.css(组件自带),这里只保留
           导航栏特有的悬停放大 —— 头像在 /profile 等独立页也要用,而那时
           本组件根本不渲染。 */
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
          gap: 12px;
        }
        /* 顶栏各组不收缩:纯图标导航下任何语言都不会溢出 */
        .header-left, .header-center, .header-right {
          flex-shrink: 0;
        }
        .logo, .logo-text, .nav-link,
        .btn-primary, .mobile-login-btn, .user-name {
          white-space: nowrap;
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
          gap: 4px;
        }
        /* 纯图标导航:40px 见方的命中区,名称走 aria-label + 悬浮轻提示。
           不再渲染文字,任何语言下顶栏都不会被长文本挤断行 */
        .nav-link {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          color: var(--text-secondary);
          transition: color 0.15s, background 0.15s;
        }
        .nav-link:hover {
          color: var(--text-primary);
          background: var(--bg-secondary);
        }
        .nav-link.active {
          color: var(--accent-hover);
          background: var(--accent-soft);
        }
        .nav-link:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        /* 悬浮轻提示:悬停/键盘聚焦 300ms 后淡入,离开即消失,不抢操作 */
        .nav-link::after {
          content: attr(data-tip);
          position: absolute;
          top: calc(100% + 8px);
          left: 50%;
          transform: translate(-50%, -3px);
          padding: 6px 9px;
          border-radius: 7px;
          background: var(--text-primary);
          color: var(--bg-primary);
          font-size: var(--text-xs);
          font-weight: var(--font-weight-normal);
          line-height: 1.2;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          z-index: 1400;
          transition:
            opacity 0.15s ease 0.3s,
            transform 0.15s ease 0.3s;
        }
        .nav-link:hover::after,
        .nav-link:focus-visible::after {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        @media (prefers-reduced-motion: reduce) {
          .nav-link::after {
            transition: opacity 0.1s ease 0.3s;
            transform: translate(-50%, 0);
          }
        }
        .auth-buttons {
          display: flex;
          gap: 8px;
        }
        /* PC 游客:圆形登录按钮(品牌主色填充),比旧胶囊按钮更小更克制 */
        .auth-circle-btn {
          width: 40px;
          height: 40px;
          padding: 0;
          border: none;
          border-radius: 50%;
          background: var(--accent);
          color: #fff;
          font-family: inherit;
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s;
        }
        .auth-circle-btn:hover {
          background: var(--accent-hover);
        }
        .auth-circle-btn:focus-visible {
          outline: 2px solid var(--accent-hover);
          outline-offset: 2px;
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
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .header.simplified .user-menu {
          gap: 4px;
        }
        .user-menu-caret {
          color: var(--text-secondary);
          transition: transform 0.15s ease;
        }
        .user-menu-caret.open {
          transform: rotate(180deg);
        }
        .user-menu-pop {
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          min-width: 180px;
          padding: 6px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(43, 36, 32, 0.16);
          z-index: 1200;
          animation: userMenuIn 0.15s ease;
        }
        @keyframes userMenuIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: none; }
        }
        .user-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 9px 12px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-primary);
          font-family: inherit;
          font-size: var(--text-md);
          text-align: left;
          cursor: pointer;
        }
        .user-menu-item:hover {
          background: var(--bg-secondary);
        }
        .user-menu-item.danger {
          color: var(--error);
        }
        .user-menu-item:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .user-name {
          font-size: var(--text-md);
          color: var(--text-secondary);
        }
      `}</style>

      {/* 退出登录二次确认:退出会清掉本机未完成的自动保存草稿,不能一键误触 */}
      <LogoutConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false)
          onLogout?.()
        }}
      />
    </header>
  )
}
