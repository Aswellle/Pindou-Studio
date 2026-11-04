import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { DIFFICULTIES } from '../../../data/templates'
import { COLOR_COUNT_TIERS } from '../hooks/useGalleryQuery'
import { useDialogA11y } from '../../../hooks/useDialogA11y'
import { useScrollLock } from '../../../hooks/useScrollLock'
import { getDifficultyColor } from './GalleryTemplateCard'

/**
 * GalleryFilterPanel — 分类/难度/用色数三组筛选的统一面板。
 *
 * 交互契约(重构文档 04 §5):
 *   - 默认关闭;Escape 关闭并把焦点还给触发按钮(useDialogA11y);
 *   - 桌面锚定筛选按钮下方(portal 到 body,视觉视口坐标);
 *     窄屏(≤640)变成底部弹层,并锁定背景滚动(useScrollLock);
 *   - 面板内选择立即生效(URL 即状态),没有第二份权威状态;
 *   - 「重置」一次清空全部条件(单次 patch,不逐项 setter)。
 * 面板根类名不以 overlay 结尾:它是锚定/底部弹层,不属于全屏浮层契约。
 */
export default function GalleryFilterPanel({
  open,
  onClose,
  triggerRef,
  categoryOptions,
  categoryCounts,
  getCategoryLabel,
  category,
  onCategory,
  difficulty,
  onDifficulty,
  maxColors,
  onMaxColors,
  onReset,
}) {
  const { t } = useTranslation()
  const panelRef = useRef(null)
  const { ref: dialogRef, dialogProps } = useDialogA11y({
    open,
    onClose,
    label: t('gallery.explorer.filterTitle'),
  })

  // 窄屏为底部弹层:锁背景滚动。宽屏是锚定浮层,不锁(用户可能想边筛边看结果)。
  // open 时刻判定视口,面板是瞬态 UI,展开中改变窗口宽度以重新打开为准。
  const isMobile = open && window.innerWidth <= 640
  useScrollLock(isMobile)

  // 桌面定位:锚定触发按钮下方(视觉视口坐标,键盘弹起时 iOS 会平移视口)。
  useLayoutEffect(() => {
    if (!open || isMobile || !panelRef.current || !triggerRef?.current) return
    const menu = panelRef.current
    const r = triggerRef.current.getBoundingClientRect()
    const vv = window.visualViewport
    const vTop = vv ? Math.max(0, vv.offsetTop) : 0
    const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
    const width = menu.offsetWidth || 320
    let left = Math.min(r.left, window.innerWidth - width - 12)
    left = Math.max(12, left)
    let top = r.bottom + 8
    // 底部放不下时向上展开(面板高度上限 480px)
    if (top + menu.offsetHeight > vBottom - 12) top = Math.max(vTop + 12, r.top - menu.offsetHeight - 8)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [open, isMobile, triggerRef])

  if (!open) return null

  const setRef = el => {
    panelRef.current = el
    dialogRef.current = el
  }

  return createPortal(
    <div
      className="gallery-filter-layer"
      onClick={e => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="gallery-filter-pop" ref={setRef} {...dialogProps} onClick={e => e.stopPropagation()}>
        <header className="gallery-filter-head">
          <h3 className="gallery-filter-title">{t('gallery.explorer.filterTitle')}</h3>
        </header>

        <fieldset className="gallery-filter-group">
          <legend className="gallery-filter-label">{t('gallery.category')}</legend>
          <div className="gallery-filter-options">
            {categoryOptions.map(cat => (
              <button
                key={cat}
                type="button"
                className={`gallery-filter-opt${category === cat ? ' active' : ''}`}
                aria-pressed={category === cat}
                onClick={() => onCategory(cat)}
              >
                {getCategoryLabel(cat)}
                <span className="gallery-filter-count">
                  {cat === 'all'
                    ? Object.values(categoryCounts).reduce((a, b) => a + b, 0)
                    : categoryCounts[cat] || 0}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="gallery-filter-group">
          <legend className="gallery-filter-label">{t('gallery.difficulty')}</legend>
          <div className="gallery-filter-options">
            {DIFFICULTIES.map(diff => (
              <button
                key={diff}
                type="button"
                className={`gallery-filter-opt${difficulty === diff ? ' active' : ''}`}
                aria-pressed={difficulty === diff}
                style={{ '--diff-color': getDifficultyColor(diff) }}
                onClick={() => onDifficulty(diff)}
              >
                {t(`gallery.difficulties.${diff}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="gallery-filter-group">
          <legend className="gallery-filter-label">{t('gallery.discovery.filterColors')}</legend>
          <div className="gallery-filter-options">
            <button
              type="button"
              className={`gallery-filter-opt${!maxColors ? ' active' : ''}`}
              aria-pressed={!maxColors}
              onClick={() => onMaxColors('')}
            >
              {t('gallery.discovery.filterColorsAny')}
            </button>
            {COLOR_COUNT_TIERS.map(n => (
              <button
                key={n}
                type="button"
                className={`gallery-filter-opt${maxColors === n ? ' active' : ''}`}
                aria-pressed={maxColors === n}
                onClick={() => onMaxColors(n)}
              >
                {t('gallery.discovery.filterColorsMax', { n })}
              </button>
            ))}
          </div>
        </fieldset>

        <footer className="gallery-filter-foot">
          <button type="button" className="gallery-filter-reset" onClick={onReset}>
            {t('gallery.discovery.filterReset')}
          </button>
          <button type="button" className="btn btn-primary gallery-filter-done" onClick={onClose}>
            {t('gallery.explorer.done')}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
