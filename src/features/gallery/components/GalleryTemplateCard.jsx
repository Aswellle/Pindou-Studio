import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { extractPatternColors, templateDimensions } from '../../../data/templates'
import { PALETTE_LIST } from '../../../data/palettes'
import ThumbnailCanvas from '../../../components/ThumbnailCanvas'
import { formatDownloadCount } from '../hooks/useDownloadCounts'
import { placePopupMenu } from '../../../hooks/viewportGeometry'

const MAX_VISIBLE_DOTS = 7

/** 难度语义色(卡片徽章与筛选面板共用同一口径) */
export function getDifficultyColor(difficulty) {
  switch (difficulty) {
    case 'easy': return 'var(--secondary-accent)'
    case 'medium': return 'var(--warning)'
    case 'hard': return 'var(--error)'
    default: return 'var(--text-muted)'
  }
}

function ColorDots({ pattern }) {
  const colors = extractPatternColors(pattern)
  const visible = colors.slice(0, MAX_VISIBLE_DOTS)
  const extra = colors.length - visible.length
  return (
    <>
      {visible.map((color, i) => (
        <span key={i} className="color-dot" style={{ backgroundColor: color }} title={color} />
      ))}
      {extra > 0 && <span className="color-dot-more" title={`+${extra}`}>+{extra}</span>}
    </>
  )
}

/** 菜单定位:portal 后按触发按钮贴靠(视觉视口坐标,iOS 键盘安全)。 */
function usePopupMenuPosition(menuId, menuRef, triggerRectRef, prefer) {
  useLayoutEffect(() => {
    if (!menuId || !menuRef.current || !triggerRectRef.current) return
    const menu = menuRef.current
    const r = triggerRectRef.current
    const vv = window.visualViewport
    const { left, top } = placePopupMenu({
      rect: r,
      menuWidth: menu.offsetWidth,
      menuHeight: menu.offsetHeight,
      vTop: vv ? Math.max(0, vv.offsetTop) : 0,
      vBottom: vv ? vv.offsetTop + vv.height : window.innerHeight,
      viewportWidth: window.innerWidth,
      prefer,
    })
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [menuId, menuRef, triggerRectRef, prefer])
}

/**
 * GalleryTemplateCard — 图库模板卡片(feed 网格 / 筛选结果 / 主题合集详情共用形态)。
 *
 * 从 GalleryPage 原地抽出,行为契约不变(重构文档 04 §4):
 *   - 卡片主体 div[role=button],Enter/Space 打开载入确认;焦点在内部按钮上时不响应;
 *   - 收藏/导出/品牌按钮 stopPropagation,不触发打开;
 *   - 品牌/导出菜单 portal 到 body,Escape 关闭并把焦点还给触发按钮;
 *   - ThumbnailCanvas 收真实宽高,矩形图案不裁切不变形。
 * 品牌/导出菜单状态收进卡片内部(互不干扰),品牌选择结果仍由父级持有
 * (跨卡片持久:用户换 feed 后覆盖关系不丢)。
 */
export default function GalleryTemplateCard({
  template,
  favorite,
  onToggleFavorite,
  onOpen,
  exporting = false,
  onExportTemplate,
  brandId,
  brandOverridden = false,
  onBrandSelect,
  getDownloadCount,
}) {
  const { t } = useTranslation()
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
  const exportTriggerEl = useRef(null)
  const brandTriggerEl = useRef(null)
  const exportTriggerRect = useRef(null)
  const brandTriggerRect = useRef(null)
  const exportMenuRef = useRef(null)
  const brandMenuRef = useRef(null)

  usePopupMenuPosition(exportMenuOpen, exportMenuRef, exportTriggerRect, 'above')
  usePopupMenuPosition(brandMenuOpen, brandMenuRef, brandTriggerRect, 'below')

  // 点击外部关闭导出菜单(与旧 GalleryPage 行为一致;品牌菜单由遮罩点击关闭)
  useEffect(() => {
    if (!exportMenuOpen) return undefined
    const close = () => setExportMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [exportMenuOpen])

  // Escape 关闭菜单并把焦点还给触发按钮(规格 07 §8)
  useEffect(() => {
    if (!exportMenuOpen && !brandMenuOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      const trigger = exportMenuOpen ? exportTriggerEl.current : brandTriggerEl.current
      if (exportMenuOpen) setExportMenuOpen(false)
      if (brandMenuOpen) setBrandMenuOpen(false)
      // 下一帧再聚焦:菜单卸载后再 focus 才能稳定落到按钮上
      requestAnimationFrame(() => trigger?.focus?.())
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [exportMenuOpen, brandMenuOpen])

  const { width, height } = templateDimensions(template)
  const displayName = template.name
    ? (template.nameZh || template.name)
    : t(`templates.names.${template.nameKey}`, template.nameKey)

  return (
    <div
      className="template-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.()}
      onKeyDown={(e) => {
        // 键盘可达:卡片本身是 div(内部还有收藏/导出/品牌三个按钮),
        // 只在焦点落在卡片自身时才响应,避免 Enter 冒泡触发两次。
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen?.()
        }
      }}
    >
      <div className="template-thumbnail">
        <ThumbnailCanvas pattern={template.pattern} size={template.size} gridWidth={width} gridHeight={height} />
        <button
          className={`favorite-btn ${favorite ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(e) }}
          aria-label={t('gallery.myFavorites')}
          aria-pressed={favorite}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={favorite ? 'var(--accent)' : 'none'} stroke="var(--accent)" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>

        {exportMenuOpen && createPortal(
          // portal 到 document.body:彻底脱离模板卡片的 overflow:hidden 与
          // 任何祖先 transform/包含块陷阱,菜单永不被卡片边框裁剪
          <div
            className="export-menu-overlay"
            onClick={e => { e.stopPropagation(); setExportMenuOpen(false) }}
          >
            <div className="export-menu" ref={exportMenuRef} role="menu" onClick={e => e.stopPropagation()}>
              <div className="export-menu-header">
                <span className="export-menu-title">{t('gallery.exportTitle')}</span>
                <span className="export-menu-name">{displayName}</span>
              </div>
              <div className="export-menu-hint">{t('gallery.exportHint')}</div>
              <button role="menuitem" className="export-format-item" onClick={e => { setExportMenuOpen(false); onExportTemplate?.(template, 'professional', e) }}>
                <span className="export-format-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                  </svg>
                </span>
                <span className="export-format-text">
                  <span className="export-format-name">{t('gallery.exportProfessional')}</span>
                  <span className="export-format-desc">{t('gallery.exportProfessionalDesc')}</span>
                </span>
              </button>
              <button role="menuitem" className="export-format-item" onClick={e => { setExportMenuOpen(false); onExportTemplate?.(template, 'realistic', e) }}>
                <span className="export-format-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2c1.5 3 4 4 4 7a4 4 0 0 1-8 0c0-3 2.5-4 4-7z"/><path d="M12 15v4"/><path d="M8 22h8"/>
                  </svg>
                </span>
                <span className="export-format-text">
                  <span className="export-format-name">{t('gallery.exportRealistic')}</span>
                  <span className="export-format-desc">{t('gallery.exportRealisticDesc')}</span>
                </span>
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>
      <div className="template-info">
        <h3 className="template-name">{displayName}</h3>
        <div className="template-meta">
          {/* 真实宽高:矩形模板显示 W × H,方形显示 N × N */}
          <span className="template-size">{width} x {height}</span>
          {/* 拼豆品牌徽章:显示模板所属色卡品牌;点击可切换并转换为指定品牌 */}
          <button
            className={`template-brand${brandOverridden ? ' overridden' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              brandTriggerRect.current = e.currentTarget.getBoundingClientRect()
              brandTriggerEl.current = e.currentTarget
              setExportMenuOpen(false)
              setBrandMenuOpen(v => !v)
            }}
            title={t('gallery.brandConvert')}
            aria-label={t('gallery.brandConvert')}
            aria-expanded={brandMenuOpen}
            aria-haspopup="menu"
          >
            {t(`palette.brand.${brandId}`)}
            {brandOverridden && (
              /* 调色板图标:表示该模板已转换到指定品牌的色卡 */
              <svg className="brand-convert-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22a10 10 0 1 1 10-10c0 1.66-1.34 3-3 3h-2.3a2.4 2.4 0 0 0-1.8 3.94c.3.37.35.87.07 1.3-.38.7-.9 1.76-.97 1.76z"/>
                <circle cx="7.5" cy="11.5" r="1"/><circle cx="11.5" cy="7.5" r="1"/><circle cx="16" cy="9.5" r="1"/>
              </svg>
            )}
            {/* 向下箭头:标示该徽章是可展开的下拉按钮 */}
            <svg className="brand-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <span
            className="template-difficulty"
            style={{ '--diff-color': getDifficultyColor(template.difficulty) }}
          >
            {t(`gallery.difficulties.${template.difficulty}`)}
          </span>
        </div>
        <span className="template-category">{template.categoryLabel}</span>
      </div>
      {/* 品牌切换菜单(portal 到 body,避免卡片 overflow:hidden 裁剪) */}
      {brandMenuOpen && createPortal(
        <div
          className="brand-menu-overlay"
          onClick={(e) => { e.stopPropagation(); setBrandMenuOpen(false) }}
        >
          <div className="brand-menu" ref={brandMenuRef} role="menu" onClick={e => e.stopPropagation()}>
            <button
              role="menuitem"
              className={!brandOverridden ? 'active' : ''}
              onClick={(e) => {
                e.stopPropagation()
                onBrandSelect?.(null)
                setBrandMenuOpen(false)
              }}
            >
              {t('gallery.brandDefault')}
            </button>
            {PALETTE_LIST.map(brand => (
              <button
                key={brand.id}
                role="menuitem"
                className={brandId === brand.id && brandOverridden ? 'active' : ''}
                onClick={(e) => {
                  e.stopPropagation()
                  onBrandSelect?.(brand.id)
                  setBrandMenuOpen(false)
                }}
              >
                {t(`palette.brand.${brand.id}`)}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
      {/* 卡片页脚:颜色圆点 + 导出胶囊(导出按钮 + 下载量)。
          导出原本浮在缩略图右下角,既压住图案,又让预览区必须留 40px 底边;
          放进页脚后预览区是干净的正方形,操作也有了明确的落点。 */}
      <div className="template-footer">
        <div className="template-colors">
          <ColorDots pattern={template.pattern} />
        </div>
        {/* 卡片页脚右侧:导出按钮与下载量同处一个胶囊。
            左侧是可点的导出按钮(圆形,内含下载箭头图标),
            右侧是纯展示的下载计数,两者共用一层边框与底色,
            一眼就能看出这个数字属于「下载」而不是别的东西。 */}
        <div className="export-count-capsule">
          <button
            className="export-btn"
            onClick={e => {
              e.stopPropagation()
              exportTriggerRect.current = e.currentTarget.getBoundingClientRect()
              exportTriggerEl.current = e.currentTarget
              setBrandMenuOpen(false)
              setExportMenuOpen(v => !v)
            }}
            disabled={exporting}
            title={t('export.title')}
            aria-expanded={exportMenuOpen}
            aria-haspopup="menu"
            aria-label={t('export.title')}
          >
            {exporting ? (
              <svg className="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
          </button>
          <span
            className="download-count"
            title={`${t('gallery.downloadCount')}: ${getDownloadCount?.(template) ?? 0}`}
          >
            {formatDownloadCount(getDownloadCount?.(template) ?? 0)}
          </span>
        </div>
      </div>
    </div>
  )
}

