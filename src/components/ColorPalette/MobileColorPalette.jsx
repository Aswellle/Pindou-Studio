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
  const selectedColorName = selectedColorInfo?.nameZh || selectedColorInfo?.name || ''

  // 色系分组,按使用度(组内颜色数)由高到低排列(COCO/MARD 均适用)
  const groups = useMemo(() => {
    if (!palette.groupNames) return null
    return Object.entries(palette.groupNames)
      .map(([gid, gname]) => ({
        id: gid,
        name: gname,
        colors: palette.colors.filter(c => c.category === gid),
      }))
      .sort((a, b) => b.colors.length - a.colors.length)
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
          {/* 颜色名称 + 所属品牌/色号,方便分辨是哪个色卡的珠子 */}
          <span className="color-name">{selectedColorName || selectedColor}</span>
          <span className="color-brand">{palette.nameZh} · {selectedColorInfo?.id}</span>
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

          {/* 色卡网格：色块下方直接印出色号+名称，不再只靠长按才出现的 title 提示。
              有 groupNames 的品牌(MARD 等)按色系分组展示,便于快速定位 */}
          {groups ? (
            groups.map((g) => (
              <div key={g.id} className="palette-group">
                <div className="palette-group-title">{g.name} · {g.colors.length}</div>
                <div className="color-grid">
                  {g.colors.map((color) => (
                    <button
                      key={color.id}
                      className={`color-swatch-item ${selectedColor === color.hex ? 'selected' : ''}`}
                      onClick={() => handleColorSelect(color.hex)}
                    >
                      <span className="color-swatch" style={{ backgroundColor: color.hex }} />
                      <span className="color-swatch-label">
                        {color.id} {color.nameZh || color.name}
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
                    {color.id} {color.nameZh || color.name}
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
