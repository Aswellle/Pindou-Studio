import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../../i18n'
import './LanguageSelector.css'

/**
 * 语言选择器 — 国旗按钮 + 弹出菜单
 * 顶栏只显示当前语言的国旗(占用极小),点击展开列出全部语言(国旗 + 名称)。
 * 取代原先 PC 端的原生文字 select:平板竖屏头栏水平空间紧张,文字下拉易使
 * 导航/LOGO/其他控件拥挤甚至布局变形,国旗按钮把水平占用缩到最小。
 */
export default function LanguageSelector() {
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
