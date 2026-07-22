import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PERLER_COLORS } from './ColorPalette'
import { getPalette } from '../data/palettes'
import { exportAsPNG, exportAsSVG } from '../services/BeadPatternExporter'
import { resolveToHex } from '../services/colorUtils'

export default function ExportPanel({ canvasData, gridSize, gridWidth, gridHeight, designName = '拼豆图案', paletteId = 'perler', onClose }) {
  const { t } = useTranslation()
  // Passing onClose signals this instance is the mobile modal entry point —
  // it should open already expanded instead of requiring a second click.
  const isModal = !!onClose
  const [showExport, setShowExport] = useState(isModal)
  const [exportProgress, setExportProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [beadStyle, setBeadStyle] = useState('professional')
  const palette = getPalette(paletteId)
  const panelRef = useRef(null)

  // Desktop sidebar instance: when expanding, scroll the panel fully into
  // view within the scrolling .left-sidebar ancestor. Skip for the mobile
  // modal, which already renders full-height and has its own overlay scroll.
  useEffect(() => {
    if (!showExport || isModal || !panelRef.current) return
    const raf = requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
    return () => cancelAnimationFrame(raf)
  }, [showExport, isModal])

  // Actual dimensions (support rectangular grids)
  const actualWidth = gridWidth || gridSize
  const actualHeight = gridHeight || gridSize

  const { colorCounts, totalBeads } = useMemo(() => {
    if (!canvasData) return { colorCounts: {}, totalBeads: 0 }
    const counts = {}
    for (let y = 0; y < actualHeight; y++) {
      for (let x = 0; x < actualWidth; x++) {
        const color = canvasData[y]?.[x]
        if (color) counts[color] = (counts[color] || 0) + 1
      }
    }
    return { colorCounts: counts, totalBeads: Object.values(counts).reduce((a, b) => a + b, 0) }
  }, [canvasData, actualWidth, actualHeight])

  const handleExportImage = () => {
    if (!canvasData) return

    const CELL_SIZE = 20
    const BEAD_RADIUS = CELL_SIZE / 2 - 1

    const canvas = document.createElement('canvas')
    canvas.width = actualWidth * CELL_SIZE
    canvas.height = actualHeight * CELL_SIZE
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let y = 0; y < actualHeight; y++) {
      for (let x = 0; x < actualWidth; x++) {
        const color = canvasData[y]?.[x]
        const hex = resolveToHex(color, palette)
        if (hex) {
          ctx.fillStyle = hex
          ctx.beginPath()
          ctx.arc(
            x * CELL_SIZE + CELL_SIZE / 2,
            y * CELL_SIZE + CELL_SIZE / 2,
            BEAD_RADIUS,
            0, Math.PI * 2
          )
          ctx.fill()
        }
      }
    }

    const link = document.createElement('a')
    link.download = `bead-pattern-${actualWidth}x${actualHeight}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleExportText = () => {
    // 生成带颜色编号的文本图纸
    const today = new Date().toISOString().split('T')[0]

    let text = `拼豆图纸\n`
    text += `${actualWidth} x ${actualHeight} 格子\n`
    text += `日期：${today}\n`
    text += `${'═'.repeat(Math.max(actualWidth, actualHeight) * 3 + 10)}\n\n`

    // 颜色对照表（按使用频率排序）
    const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])
    text += `【颜色对照表】\n`
    sortedColors.forEach(([color, count], idx) => {
      const idxInPalette = PERLER_COLORS.indexOf(color)
      const code = idxInPalette >= 0 ? String(idxInPalette).padStart(2, '0') : '--'
      text += `  [${code}] ${color} - ${count}颗\n`
    })
    text += '\n'

    // 带编号的图纸
    text += `【图纸】每格一个数字，00表示空\n`
    text += `${'─'.repeat(Math.max(actualWidth, actualHeight) * 3 + 3)}\n`

    // 列编号
    text += '   '
    for (let x = 0; x < actualWidth; x++) {
      text += String.fromCharCode(65 + (x % 26))  // A, B, C... 循环
    }
    text += '\n'

    for (let y = 0; y < actualHeight; y++) {
      text += String(y + 1).padStart(3, ' ') + ' '
      for (let x = 0; x < actualWidth; x++) {
        const color = canvasData[y]?.[x]
        if (color) {
          const idx = PERLER_COLORS.indexOf(color)
          text += idx >= 0 ? String(idx).padStart(2, '0') : '??'
        } else {
          text += '  '
        }
        text += ' '
      }
      text += '\n'
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.download = `bead-pattern-${actualWidth}x${actualHeight}.txt`
    link.href = URL.createObjectURL(blob)
    link.click()
  }

  const handleExportSVG = () => {
    if (!canvasData) return

    const CELL_SIZE = 20
    const BEAD_RADIUS = CELL_SIZE / 2 - 1

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${actualWidth * CELL_SIZE} ${actualHeight * CELL_SIZE}">\n`
    svg += `  <rect width="${actualWidth * CELL_SIZE}" height="${actualHeight * CELL_SIZE}" fill="white"/>\n`

    for (let y = 0; y < actualHeight; y++) {
      for (let x = 0; x < actualWidth; x++) {
        const color = canvasData[y]?.[x]
        const hex = resolveToHex(color, palette)
        if (hex) {
          const cx = x * CELL_SIZE + CELL_SIZE / 2
          const cy = y * CELL_SIZE + CELL_SIZE / 2
          svg += `  <circle cx="${cx}" cy="${cy}" r="${BEAD_RADIUS}" fill="${hex}"/>\n`
        }
      }
    }
    svg += '</svg>'

    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const link = document.createElement('a')
    link.download = `bead-pattern-${actualWidth}x${actualHeight}.svg`
    link.href = URL.createObjectURL(blob)
    link.click()
  }

  const handleExportPatternSheet = async () => {
    if (!canvasData || isExporting) return
    setIsExporting(true)
    setExportProgress(0)
    setExportError(null)
    try {
      await exportAsPNG(canvasData, gridSize, paletteId, designName, palette, {
        gridWidth,
        gridHeight,
        beadStyle,
        onProgress: (_phase, pct) => setExportProgress(Math.round(pct * 100))
      })
    } catch (err) {
      console.error('Export failed:', err)
      setExportError(t('export.exportFailed'))
    } finally {
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  const handleExportPatternSheetSVG = () => {
    if (!canvasData) return
    exportAsSVG(canvasData, gridSize, paletteId, designName, palette, gridWidth, gridHeight, beadStyle)
  }

  const panel = (
    <div className="export-panel" ref={panelRef}>
      <button
        className="export-toggle"
        onClick={() => setShowExport(!showExport)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {t('export.title')}
        {!isModal && <span className={`arrow ${showExport ? 'up' : ''}`}>▼</span>}
        {isModal && (
          <span
            className="export-modal-close"
            role="button"
            aria-label={t('common.close')}
            onClick={(e) => { e.stopPropagation(); onClose() }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        )}
      </button>

      {showExport && (
        <div className="export-content">
          <div className="export-section">
            <div className="section-heading">
              <span className="section-title">{t('export.quickSection')}</span>
              <span className="section-hint">{t('export.quickSectionHint')}</span>
            </div>
            <div className="export-buttons">
              <button onClick={handleExportImage} className="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21,15 16,10 5,21"/>
                </svg>
                {t('export.png')}
              </button>
              <button onClick={handleExportSVG} className="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12,2 2,7 12,12 22,7 12,2"/>
                  <polyline points="2,17 12,22 22,17"/>
                  <polyline points="2,12 12,17 22,12"/>
                </svg>
                {t('export.svg')}
              </button>
              <button onClick={handleExportText} className="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                {t('export.text')}
              </button>
            </div>
          </div>

          <div className="export-divider" />

          <div className="export-section">
            <div className="section-heading">
              <span className="section-title">{t('export.proSection')}</span>
              <span className="section-hint">{t('export.proSectionHint')}</span>
            </div>
            <div className="export-style-group">
              <label className="style-label">{t('export.styleLabel')}</label>
              <select
                value={beadStyle}
                onChange={e => setBeadStyle(e.target.value)}
                className="style-select"
              >
                <option value="professional">{t('gallery.exportProfessional')}</option>
                <option value="realistic">{t('gallery.exportRealistic')}</option>
              </select>
              <span className="setting-hint">
                {beadStyle === 'professional'
                  ? t('export.professionalHint')
                  : t('export.realisticHint')}
              </span>
            </div>
            <div className="export-buttons">
              <button onClick={handleExportPatternSheet} className="btn btn-primary btn-pattern" disabled={isExporting}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                  <line x1="15" y1="3" x2="15" y2="21"/>
                </svg>
                {isExporting ? `${t('export.exporting')} ${exportProgress}%` : t('export.patternSheet')}
              </button>
              {isExporting && (
                <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, margin: '4px 0' }}>
                  <div style={{ height: '100%', width: `${exportProgress}%`, background: 'var(--secondary-accent)', borderRadius: 2, transition: 'width 0.1s' }} />
                </div>
              )}
              {exportError && (
                <div style={{ fontSize: 11, color: 'var(--error)', padding: '4px 2px', lineHeight: 1.4 }}>
                  {exportError}
                </div>
              )}
              <button onClick={handleExportPatternSheetSVG} className="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                  <line x1="15" y1="3" x2="15" y2="21"/>
                </svg>
                {t('export.patternSheetSVG')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .export-panel {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          width: 100%;
        }
        .export-toggle {
          width: 100%;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: var(--text-base);
          font-weight: var(--font-weight-semibold);
          background: none;
          border: none;
          cursor: pointer;
          transition: background 0.2s;
        }
        .export-toggle:hover {
          background: var(--bg-secondary);
        }
        .arrow {
          margin-left: auto;
          font-size: var(--text-xs);
          transition: transform 0.2s;
        }
        .arrow.up {
          transform: rotate(180deg);
        }
        .export-content {
          padding: 0 12px 12px;
        }
        .export-stats {
          display: flex;
          gap: 16px;
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .stat {
          display: flex;
          flex-direction: column;
        }
        .stat-value {
          font-size: var(--text-xl);
          font-weight: var(--font-weight-semibold);
        }
        .stat-label {
          font-size: var(--text-xs);
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .color-legend {
          margin-bottom: 12px;
        }
        .color-legend h4 {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .legend-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          background: var(--bg-secondary);
          border-radius: 4px;
        }
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          border: 1px solid var(--border-color);
        }
        .legend-count {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-weight: var(--font-weight-semibold);
        }
        .export-buttons {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .export-buttons .btn {
          justify-content: flex-start;
          padding: 10px 12px;
          font-size: var(--text-sm);
        }
        .export-divider {
          height: 1px;
          background: var(--border-color);
          margin: 8px 0;
        }
        .btn-pattern {
          background: linear-gradient(135deg, var(--accent) 0%, #c25a34 100%);
          color: white;
          border: none;
          font-weight: var(--font-weight-semibold);
        }
        .btn-pattern:hover {
          background: linear-gradient(135deg, #c25a34 0%, #a84a29 100%);
        }
        .export-style-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px 0 2px;
        }
        .style-label {
          font-size: var(--text-xs);
          font-weight: var(--font-weight-semibold);
          color: var(--text-secondary);
        }
        .style-select {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          color: var(--text-primary);
        }
        .setting-hint {
          font-size: var(--text-xs);
          color: var(--text-muted);
          line-height: 1.3;
        }
        .export-modal-close {
          margin-left: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 4px;
          color: var(--text-muted);
          transition: all 0.2s;
        }
        .export-modal-close:hover {
          color: var(--text-primary);
          background: var(--bg-tertiary);
        }
        .export-section {
          padding-top: 10px;
        }
        .section-heading {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 8px;
        }
        .section-title {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-bold);
          color: var(--text-primary);
        }
        .section-hint {
          font-size: var(--text-xs);
          color: var(--text-muted);
          line-height: 1.3;
        }
      `}</style>
    </div>
  )

  if (!isModal) return panel

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="export-modal-content" onClick={(e) => e.stopPropagation()}>
        {panel}
      </div>
      <style>{`
        .export-modal-content {
          width: min(420px, 92vw);
          max-height: 80vh;
          overflow-y: auto;
        }
      `}</style>
    </div>
  )
}
