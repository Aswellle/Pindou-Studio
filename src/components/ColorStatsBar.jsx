/**
 * ColorStatsBar — displays bead count + color count in the left sidebar.
 * Always visible, compact, above the "导出图纸" area.
 *
 * Props:
 *   canvasData: 2D array of hex colors or null
 *   gridSize: current canvas dimension
 *   paletteId: current palette id (for brand color resolution)
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getPalette } from '../data/palettes'
import { resolveToHex } from '../services/colorUtils'

export default function ColorStatsBar({ canvasData, gridSize, paletteId }) {
  const { t } = useTranslation()

  const { total, colorCount, colorList } = useMemo(() => {
    if (!canvasData) return { total: 0, colorCount: 0, colorList: [] }
    const palette = getPalette(paletteId || 'perler')
    const counts = {}
    let total = 0
    const rows = canvasData.length
    const cols = rows > 0 ? canvasData[0].length : 0
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const hex = resolveToHex(canvasData[y]?.[x], palette)
        if (hex) {
          counts[hex] = (counts[hex] || 0) + 1
          total++
        }
      }
    }
    const colorList = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([hex, count]) => {
        const pc = palette.colors.find(c => c.hex?.toLowerCase() === hex.toLowerCase())
        return { hex, count, label: pc ? `${pc.id} ${pc.nameZh || pc.name}` : hex }
      })
    return { total, colorCount: colorList.length, colorList }
  }, [canvasData, paletteId])

  if (!canvasData) {
    return (
      <div className="color-stats-bar empty">
        <div className="stats-empty-text">{t('stats.noData')}</div>
      </div>
    )
  }

  return (
    <div className="color-stats-bar">
      {/* Summary row */}
      <div className="stats-summary">
        <div className="stats-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
          </svg>
          <span className="stats-chip-value">{total}</span>
          <span className="stats-chip-label">{t('stats.beads')}</span>
        </div>
        <div className="stats-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <span className="stats-chip-value">{colorCount}</span>
          <span className="stats-chip-label">{t('stats.colors')}</span>
        </div>
      </div>

      {/* Color swatches — scrollable list showing all colors with brand IDs */}
      {colorList.length > 0 && (
        <div className="stats-swatches">
          {colorList.map(({ hex, count, label }) => (
            <div key={hex} className="stats-swatch-item" title={`${hex} — ${count} ${t('stats.beads')}`}>
              <span className="stats-swatch-dot" style={{ backgroundColor: hex }} />
              <span className="stats-swatch-hex">{label}</span>
              <span className="stats-swatch-count">{count}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .color-stats-bar {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 12px 14px;
          flex-shrink: 0;
        }
        .color-stats-bar.empty {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .stats-empty-text {
          font-size: var(--text-sm);
          color: var(--text-muted);
        }
        .stats-summary {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .stats-chip {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 6px 10px;
        }
        .stats-chip svg {
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .stats-chip-value {
          font-size: var(--text-lg);
          font-weight: var(--font-weight-bold);
          color: var(--text-primary);
          line-height: 1;
        }
        .stats-chip-label {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
        }
        .stats-swatches {
          display: flex;
          flex-direction: column;
          gap: 3px;
          max-height: 180px;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .stats-swatches::-webkit-scrollbar {
          width: 3px;
        }
        .stats-swatches::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 2px;
        }
        .stats-swatch-item {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-secondary);
          border-radius: 5px;
          padding: 3px 6px;
          flex-shrink: 0;
        }
        .stats-swatch-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          flex-shrink: 0;
        }
        .stats-swatch-hex {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-muted);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .stats-swatch-count {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-weight: var(--font-weight-semibold);
          color: var(--text-secondary);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
