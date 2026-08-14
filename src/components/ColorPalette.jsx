import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getPalette, PALETTE_LIST } from '../data/palettes'

export default function ColorPalette({ selectedColor, onColorSelect, collapsed, onToggleCollapse, currentPalette, onPaletteChange }) {
  const { t } = useTranslation()
  // 与移动端同源:直接读官方品牌色卡
  const palette = getPalette(currentPalette)
  // 颜色名走 i18n 键(palette.colorNames.<品牌>.<色号>),缺键回退到数据自带的 nameZh/name
  const colorName = (c) => c && t(`palette.colorNames.${palette.id}.${c.id}`, c.nameZh || c.name)
  // 当前选中颜色的名称(色卡中匹配,匹配不到显示原值)
  const currentColorInfo = palette.colors.find(c => c.hex === selectedColor)
  const currentColorName = currentColorInfo ? colorName(currentColorInfo) : (selectedColor || '')
  // 次显行色号:仅当色号 ≠ 主显名时显示(COCO/MARD 的代号已作主显名,避免重复)
  const currentCode = currentColorInfo?.id || ''
  const showCode = Boolean(currentCode) && currentCode !== currentColorName

  // 色系分组:优先按 groupOrder(商家销量调研的畅销度),否则按组内颜色数降序
  const groups = useMemo(() => {
    if (!palette.groupNames) return null
    const entries = Object.entries(palette.groupNames).map(([gid, gname]) => ({
      id: gid,
      name: gname,
      colors: palette.colors.filter(c => c.category === gid),
    }))
    if (palette.groupOrder) {
      const order = new Map(palette.groupOrder.map((id, i) => [id, i]))
      return entries.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    }
    return entries.sort((a, b) => b.colors.length - a.colors.length)
  }, [palette])

  // 近白色珠加边框,避免浅背景上不可见
  const isLight = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return r > 230 && g > 230 && b > 230
  }

  const renderSwatch = (c) => (
    <button
      key={c.id}
      className={`color-swatch ${selectedColor === c.hex ? 'selected' : ''}${isLight(c.hex) ? ' white' : ''}`}
      style={{ backgroundColor: c.hex }}
      onClick={() => onColorSelect(c.hex)}
      title={`${c.id} · ${colorName(c)}`}
    />
  )

  return (
    <div className={`palette-drawer ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="drawer-toggle right-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? t('palette.expand') : t('palette.collapse')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {collapsed ? (
            <path d="M15 18l-6-6 6-6"/>
          ) : (
            <path d="M9 18l6-6-6-6"/>
          )}
        </svg>
      </button>

      <div className="palette-inner">
        <div className="palette-header">
          <h3 className="palette-title">{t('palette.title2')}</h3>
          {/* 品牌色卡选择(按 PALETTE_LIST 顺序:COCO → MARD → MARD 291 → Perler → Hama → Artkal) */}
          <select
            className="palette-brand-select"
            value={currentPalette}
            onChange={(e) => onPaletteChange?.(e.target.value)}
            aria-label={t('palette.brandSelect')}
          >
            {PALETTE_LIST.map(brand => (
              <option key={brand.id} value={brand.id}>{t(`palette.brand.${brand.id}`)}</option>
            ))}
          </select>
          <p className="palette-subtitle">{t(`palette.brand.${palette.id}`)} · {palette.colorCount} {t('palette.colors')}</p>
        </div>

        <div className="palette-scroll">
          {groups ? (
            /* 按色系分组展示(如 MARD:黄橙色调/绿色调/...),组序按使用度(色数)降序 */
            groups.map((g) => (
              <div key={g.id} className="palette-group">
                <div className="palette-group-title">{t(`palette.groupNames.${palette.id}.${g.id}`, g.name)} · {g.colors.length}</div>
                <div className="color-grid">
                  {g.colors.map(renderSwatch)}
                </div>
              </div>
            ))
          ) : (
            <div className="color-grid">
              {palette.colors.map(renderSwatch)}
            </div>
          )}
        </div>

        <div className="current-color">
          <div
            className="color-preview"
            style={{ backgroundColor: selectedColor }}
          />
          <div className="color-info">
            {/* 品牌(小字) + 颜色名/代号(主) + 色号·hex(次) 分行完整显示,窄栏内不省略号截断 */}
            <span className="color-brand">{t(`palette.brand.${palette.id}`)}</span>
            <span className="color-name">{currentColorName}</span>
            <span className="color-id">{currentColorInfo ? `${showCode ? `${currentCode} · ` : ''}${selectedColor || ''}` : ''}</span>
          </div>
        </div>
      </div>

      <style>{`
        .palette-drawer {
          position: relative;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          width: 200px;
          display: flex;
          flex-direction: column;
          transition: width 0.3s ease;
          overflow: hidden;
        }
        .palette-drawer.collapsed {
          width: 56px;
        }
        .palette-drawer.collapsed .palette-inner {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }
        .palette-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }
        .palette-header {
          flex-shrink: 0;
          padding: 16px 16px 12px;
        }
        .drawer-toggle {
          position: absolute;
          top: 50%;
          left: -12px;
          transform: translateY(-50%);
          width: 24px;
          height: 48px;
          border-radius: 8px 0 0 8px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-right: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          transition: all 0.2s ease;
          color: var(--text-secondary);
        }
        .drawer-toggle:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .drawer-toggle.right-toggle {
          left: -12px;
        }
        .palette-title {
          font-size: var(--text-md);
          font-weight: var(--font-weight-semibold);
          margin-bottom: 4px;
        }
        .collapsed .palette-title,
        .collapsed .palette-subtitle,
        .collapsed .palette-brand-select {
          display: none;
        }
        .palette-brand-select {
          width: 100%;
          margin: 6px 0 4px;
          padding: 5px 8px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: var(--text-sm);
          font-family: inherit;
          cursor: pointer;
        }
        .palette-subtitle {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .palette-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 16px;
          min-height: 0;
        }
        .palette-group {
          margin-bottom: 6px;
        }
        .palette-group-title {
          font-size: var(--text-xs);
          font-weight: var(--font-weight-semibold);
          color: var(--text-secondary);
          padding: 8px 0 4px;
          border-top: 1px solid var(--border-color);
        }
        .color-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          padding-bottom: 12px;
        }
        .color-swatch {
          aspect-ratio: 1;
          border-radius: 4px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.15s;
        }
        .color-swatch:hover {
          transform: scale(1.1);
          z-index: 1;
        }
        .color-swatch.selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent);
        }
        .color-swatch.white {
          border: 1px solid var(--border-color);
        }
        .current-color {
          flex-shrink: 0;
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px 16px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-primary);
        }
        .color-preview {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          flex-shrink: 0;
        }
        .color-info {
          flex: 1;
          min-width: 0;
        }
        .color-brand {
          font-size: var(--text-xs);
          color: var(--text-muted);
          display: block;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .color-name {
          font-size: var(--text-md);
          font-weight: var(--font-weight-semibold);
          display: block;
          margin-bottom: 2px;
          line-height: 1.3;
          white-space: normal;
          overflow-wrap: break-word;
        }
        .color-id {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          display: block;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}
