import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  onSave,
  currentPage,
  onPageChange: _onPageChange,
  simplified,
  saveState,
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const userMenuTriggerRef = useRef(null)
  const userMenuRef = useRef(null)
  const headerRef = useRef(null)
  // 顶栏装不下完整导航时退化为图标模式:先按自然宽度(不换行、不收缩)量一次,
  // 溢出才隐藏文字。这样中文在 768px 仍保留菜单名,英文/日文等更长的语言
  // 或更窄的平板则自动切成图标 + title,不会把文字挤成两行。
  const [compact, setCompact] = useState(false)

  useScrollLock(confirmLogout)

  // biome-ignore lint/correctness/useExhaustiveDependencies: user/currentPage/saveState/i18n.language 是「顶栏内容变化」的信号,变化后需要重新测量,效果体内不直接读取
  useLayoutEffect(() => {
    if (simplified) {
      setCompact(false)
      return
    }
    const el = headerRef.current
    if (!el) return
    // 先拿掉紧凑类量自然宽度(否则会一直以为已经装得下)
    el.classList.remove('is-compact')
    const shouldCompact = el.scrollWidth > el.clientWidth + 1
    if (shouldCompact) el.classList.add('is-compact')
    setCompact(shouldCompact)
  }, [simplified, user, currentPage, saveState, i18n.language])

  useEffect(() => {
    if (simplified) return undefined
    const onResize = () => {
      const el = headerRef.current
      if (!el) return
      el.classList.remove('is-compact')
      const shouldCompact = el.scrollWidth > el.clientWidth + 1
      if (shouldCompact) el.classList.add('is-compact')
      setCompact(shouldCompact)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [simplified])

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

  // 自动保存状态由画布区域的悬浮旁注承载(AutoSaveStatus):
  // 顶栏在平板宽度下已容纳 LOGO、四项导航、保存、语言与账号,
  // 再放一条常驻文案会挤压导航导致断行。

  // 后台管理(admin)不在导航中显示,仅通过 /admin 路由访问
  const navItems = [
    { id: 'canvas', path: '/', label: t('nav.canvas'), icon: PenTool },
    { id: 'gallery', path: '/gallery', label: t('nav.gallery'), icon: LayoutGrid },
    { id: 'tutorials', path: '/tutorials', label: t('nav.tutorials'), icon: BookOpen },
    { id: 'myBeads', path: '/my/beads', label: t('nav.myBeads'), icon: Palette },
  ]

  return (
    <header
      ref={headerRef}
      className={`header ${simplified ? 'simplified' : ''}${compact ? ' is-compact' : ''}`}
    >
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

      <div className="header-center">
        <nav className="nav">
          {navItems.map(item => (
            <NavLink
              key={item.id}
              to={item.path}
              className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
              aria-label={item.label}
              title={compact ? item.label : undefined}
            >
              {simplified ? (
                <span className="nav-icon">
                  <item.icon size={18} />
                </span>
              ) : (
                <span className="nav-label">
                  <item.icon size={16} />
                  <span className="nav-text">{item.label}</span>
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
            title={
              saveState === 'dirty' ? t('gallery.unsavedHint') : compact ? t('gallery.saveTitle') : undefined
            }
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {!simplified && <span className="save-label">{t('gallery.saveTitle')}</span>}
            {/* 未保存标记:一个不依赖颜色的圆点,窄屏也能看见 */}
            {saveState === 'dirty' && <span className="save-unsaved-dot" aria-hidden="true" />}
          </button>
        )}
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
              /* PC 游客:单个「登录」按钮,保留品牌主色填充(网站标志色);
                 注册在 /login 页顶部切换,入口保留。顶栏右侧留出后续扩展空间 */
              <button onClick={onLogin} className="btn btn-primary">
                {t('auth.login')}
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
          gap: 16px;
        }
        /* 顶栏自适应紧凑模式:菜单文字不换行、不收缩 —— 装不下时由 JS 测量
           切到 is-compact(隐藏文字、只留图标 + title),而不是把文字挤成两行 */
        .header-left, .header-center, .header-right {
          flex-shrink: 0;
        }
        .logo, .logo-text, .nav-link, .nav-label, .nav-text,
        .save-work-btn, .save-label, .btn-primary, .mobile-login-btn, .user-name {
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
        /* 紧凑模式:导航与保存只留图标(名称走 title / aria-label),昵称同样让位 */
        .header.is-compact .nav-text,
        .header.is-compact .save-label,
        .header.is-compact .user-name {
          display: none;
        }
        .header.is-compact .nav-link {
          padding: 8px;
          min-width: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .header.is-compact .nav-label {
          gap: 0;
        }
        .header.is-compact .save-work-btn {
          padding: 8px;
          min-width: 40px;
          justify-content: center;
        }
        .header.is-compact .user-menu {
          gap: 4px;
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
