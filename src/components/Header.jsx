import { useTranslation } from 'react-i18next'
import LanguageSelector from './Header/LanguageSelector'

export default function Header({ user, onLogin, onRegister, onLogout, onSave, currentPage, onPageChange, simplified }) {
  const { t } = useTranslation()

  const navItems = [
    { id: 'canvas', label: t('nav.canvas') },
    { id: 'gallery', label: t('nav.gallery') },
    { id: 'tutorials', label: t('nav.tutorials') }
  ]

  return (
    <header className={`header ${simplified ? 'simplified' : ''}`}>
      <div className="header-left">
        <div className="logo">
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
        </div>
      </div>

      <div className="header-center">
        <nav className="nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => onPageChange(item.id)}
              aria-label={item.label}
            >
              {simplified ? (
                <span className="nav-icon">
                  {item.id === 'canvas' && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <path d="M3 9h18M9 3v18"/>
                    </svg>
                  )}
                  {item.id === 'gallery' && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                  )}
                  {item.id === 'tutorials' && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                  )}
                </span>
              ) : item.label}
            </button>
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
        {user ? (
          <div className="user-menu">
            {!simplified && <span className="user-name">{user.name}</span>}
            <button onClick={onLogout} className="btn btn-ghost" aria-label={t('auth.logout')}>
              {simplified ? '⎋' : t('auth.logout')}
            </button>
          </div>
        ) : (
          <div className="auth-buttons">
            {simplified ? (
              <button onClick={onLogin} className="btn btn-ghost icon-only-btn" aria-label={t('auth.login')} title={t('auth.login')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
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
      `}</style>
    </header>
  )
}
