import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { LANGUAGES } from '../../i18n'
import { useResponsive } from '../../hooks/useResponsive'
import './LanguageSelector.css'

/**
 * 语言选择器 — 按设备形态渲染三种 UI:
 * - 平板(640–1023px):国旗按钮 + 弹出菜单,顶栏只显示当前语言国旗,压缩水平占用,
 *   避免平板竖屏头栏因文字下拉而拥挤、布局变形
 * - 手机(<640px, compact):🌐 地球图标按钮 + 弹出菜单(沿用原有移动端 UI)
 * - PC(≥1024px):原生 select 文字下拉(沿用原有 PC UI)
 */
export default function LanguageSelector({ compact }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { breakpoint } = useResponsive()

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

  // ── 平板:国旗按钮 + 弹出菜单 ──────────────────────────────
  if (breakpoint === 'tablet') {
    return (
      <div className="lang-select" ref={ref}>
        <button
          className="lang-flag-btn"
          onClick={() => setOpen(!open)}
          aria-label={currentLang.name}
          title={currentLang.name}
        >
          <span className="lang-flag" aria-hidden="true">{currentLang.flag || '🌐'}</span>
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
                <span className="lang-flag" aria-hidden="true">{lang.flag}</span>
                <span className="lang-native">{lang.nativeName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 手机(compact):地球图标按钮 + 弹出菜单 ─────────────────
  if (compact) {
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
      </div>
    )
  }

  // ── PC:原生 select 文字下拉 ───────────────────────────────
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
