import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { LANGUAGES } from '../../i18n'
import './LanguageSelector.css'

/**
 * 语言选择器
 * - 默认(PC):原生 select 下拉
 * - compact(移动端):🌐 标准语言图标按钮 + 弹出菜单
 */
export default function LanguageSelector({ compact }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  // 点击外部关闭弹出菜单
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  if (!compact) {
    return (
      <div className="language-selector">
        <select
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="language-select"
          title={currentLang.name}
        >
          {LANGUAGES.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeName}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="lang-compact" ref={ref}>
      <button
        className="lang-globe-btn"
        onClick={() => setOpen(!open)}
        aria-label={currentLang.name}
        title={currentLang.name}
      >
        <Globe size={18} />
      </button>
      {open && (
        <div className="lang-menu" role="menu">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              role="menuitem"
              className={`lang-menu-item ${lang.code === i18n.language ? 'active' : ''}`}
              onClick={() => {
                i18n.changeLanguage(lang.code)
                setOpen(false)
              }}
            >
              <span className="lang-native">{lang.nativeName}</span>
              <span className="lang-name">{lang.name}</span>
            </button>
          ))}
        </div>
      )}
      <style>{`
        .lang-compact {
          position: relative;
          display: inline-flex;
        }
        .lang-globe-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .lang-globe-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .lang-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          min-width: 168px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(43, 36, 32, 0.16);
          padding: 6px;
          z-index: 1200;
          animation: langMenuIn 0.15s ease;
        }
        @keyframes langMenuIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: none; }
        }
        .lang-menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          padding: 9px 12px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .lang-menu-item:hover {
          background: var(--bg-secondary);
        }
        .lang-menu-item.active {
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }
        .lang-native {
          font-size: var(--text-md);
          color: var(--text-primary);
        }
        .lang-menu-item.active .lang-native {
          color: var(--accent);
        }
        .lang-name {
          font-size: 11px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  )
}
