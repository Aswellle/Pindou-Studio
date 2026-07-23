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
  const recentColors = JSON.parse(localStorage.getItem('bead_studio_recent_colors') || '[]')

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
    const recent = [color, ...recentColors.filter(c => c !== color)].slice(0, 8)
    localStorage.setItem('bead_studio_recent_colors', JSON.stringify(recent))
  }

  return (
    <div className="mobile-color-palette">
      {/* 当前颜色预览 + 珠子/颜色统计 */}
      <button
        className="current-color-btn"
        onClick={() => setShowPalette(!showPalette)}
      >
        <div
          className="color-preview"
          style={{ backgroundColor: selectedColor }}
        />
        <span className="color-hex">{selectedColor}</span>
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
                {brand.name}
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

          {/* 色卡网格 */}
          <div className="color-grid">
            {palette.colors.map((color) => (
              <button
                key={color.id}
                className={`color-swatch ${selectedColor === color.hex ? 'selected' : ''}`}
                style={{ backgroundColor: color.hex }}
                onClick={() => handleColorSelect(color.hex)}
                title={color.nameZh || color.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
