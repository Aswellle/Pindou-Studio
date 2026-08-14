import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PALETTE_LIST } from '../../data/palettes'
import { resolveToHex } from '../../services/colorUtils'
import './MobileColorPalette.css'

export default function MobileColorPalette({
  selectedColor,
  onColorSelect,
  currentPalette,
  onPaletteChange,
  canvasData,
}) {
  const { t } = useTranslation()
  const [showPalette, setShowPalette] = useState(false)

  const palette = PALETTE_LIST.find(p => p.id === currentPalette) || PALETTE_LIST[0]
  // 惰性初始化一次(此前每次渲染都 JSON.parse,脏数据还会导致整页崩溃)
  const [recentColors, setRecentColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bead_studio_recent_colors') || '[]') }
    catch { return [] }
  })

  // 当前选中颜色在色卡里的具体名称（如"玉米黄"），找不到就只显示 HEX
  const selectedColorInfo = useMemo(
    () => palette.colors.find(c => c.hex?.toLowerCase() === selectedColor?.toLowerCase()),
    [palette, selectedColor]
  )
  // 颜色名走 i18n 键(palette.colorNames.<品牌>.<色号>),缺键回退到数据自带的 nameZh/name
  const colorName = (color) => color && t(`palette.colorNames.${palette.id}.${color.id}`, color.nameZh || color.name)
  const selectedColorName = selectedColorInfo ? colorName(selectedColorInfo) : ''

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

  // 珠子/颜色数统计 — 与桌面端 ColorStatsBar 同一算法，移动端用紧凑徽章展示
  const { totalBeads, colorCount } = useMemo(() => {
    if (!canvasData) return { totalBeads: 0, colorCount: 0 }
    const seen = new Set()
    let total = 0
    for (const row of canvasData) {
      for (const cell of row) {
        const hex = resolveToHex(cell, palette)
        if (hex) {
          seen.add(hex)
          total++
        }
      }
    }
    return { totalBeads: total, colorCount: seen.size }
  }, [canvasData, palette])

  const handleColorSelect = (color) => {
    onColorSelect(color)

    // 保存最近使用的颜色
    setRecentColors(prev => {
      const recent = [color, ...prev.filter(c => c !== color)].slice(0, 8)
      localStorage.setItem('bead_studio_recent_colors', JSON.stringify(recent))
      return recent
    })
  }

  return (
    <div className="mobile-color-palette">
      {/* 当前颜色预览：色块 + 名称 + HEX，普通用户光看色号认不出颜色，这里直接把名字显示出来 */}
      <button
        className="current-color-btn"
        onClick={() => setShowPalette(!showPalette)}
      >
        <div
          className="color-preview"
          style={{ backgroundColor: selectedColor }}
        />
        <span className="color-label">
          {/* 颜色名称 + 所属品牌(去重:色号已在色卡网格中显示,这里只标品牌) */}
          <span className="color-name">{selectedColorName || selectedColor}</span>
          <span className="color-brand">{t(`palette.brand.${palette.id}`)}</span>
        </span>
        {totalBeads > 0 && (
          <span className="mobile-stats-badge">
            {totalBeads} {t('stats.beads')} · {colorCount} {t('stats.colors')}
          </span>
        )}
        <span className="toggle-icon">{showPalette ? '▲' : '▼'}</span>
      </button>

      {/* 展开的色卡 */}
      {showPalette && (
        <div className="palette-expanded">
          {/* 品牌选择 */}
          <div className="palette-brands">
            {PALETTE_LIST.map(brand => (
              <button
                key={brand.id}
                className={`brand-tab ${currentPalette === brand.id ? 'active' : ''}`}
                onClick={() => onPaletteChange(brand.id)}
              >
                {t(`palette.brand.${brand.id}`)}
              </button>
            ))}
          </div>

          {/* 最近使用 */}
          {recentColors.length > 0 && (
            <div className="recent-colors">
              <span className="section-label">{t('palette.recent')}</span>
              <div className="color-row">
                {recentColors.map((color, idx) => (
                  <button
                    key={`recent-${idx}`}
                    className={`color-swatch ${selectedColor === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleColorSelect(color)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 色卡网格：色块下方直接印出色号+名称，不再只靠长按才出现的 title 提示。
              有 groupNames 的品牌(MARD 等)按色系分组展示,便于快速定位 */}
          {groups ? (
            groups.map((g) => (
              <div key={g.id} className="palette-group">
                <div className="palette-group-title">{t(`palette.groupNames.${palette.id}.${g.id}`, g.name)} · {g.colors.length}</div>
                <div className="color-grid">
                  {g.colors.map((color) => (
                    <button
                      key={color.id}
                      className={`color-swatch-item ${selectedColor === color.hex ? 'selected' : ''}`}
                      onClick={() => handleColorSelect(color.hex)}
                    >
                      <span className="color-swatch" style={{ backgroundColor: color.hex }} />
                      <span className="color-swatch-label">
                        {color.id} {colorName(color)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="color-grid">
              {palette.colors.map((color) => (
                <button
                  key={color.id}
                  className={`color-swatch-item ${selectedColor === color.hex ? 'selected' : ''}`}
                  onClick={() => handleColorSelect(color.hex)}
                >
                  <span className="color-swatch" style={{ backgroundColor: color.hex }} />
                  <span className="color-swatch-label">
                    {color.id} {colorName(color)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
