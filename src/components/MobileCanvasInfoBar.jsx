import { useTranslation } from 'react-i18next'
import { RotateCcw, Maximize2 } from 'lucide-react'

/**
 * 移动端画布信息条 — 紧凑显示在 Header 下方
 * 包含：当前画布规格、缩放比例、重置按钮、适应按钮
 */
export default function MobileCanvasInfoBar({
  gridSize,
  gridWidth,
  gridHeight,
  scale,
  onReset,
  onFit,
}) {
  const { t } = useTranslation()

  const w = gridWidth || gridSize
  const h = gridHeight || gridSize
  const scalePercent = Math.round((scale || 1) * 100)

  return (
    <div className="mobile-canvas-info-bar">
      <span className="info-size">{w}×{h}</span>
      <span className="info-scale">{scalePercent}%</span>
      <button className="info-btn" onClick={onReset} aria-label={t('canvas.reset')} title={t('canvas.reset')}>
        <RotateCcw size={14} />
      </button>
      <button className="info-btn" onClick={onFit} aria-label={t('canvas.fit')} title={t('canvas.fit')}>
        <Maximize2 size={14} />
      </button>

      <style>{`
        .mobile-canvas-info-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
          min-height: 32px;
        }
        .info-size {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .info-scale {
          font-size: 12px;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          margin-right: auto;
        }
        .info-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .info-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
        }
        .info-btn:active {
          background: var(--accent-soft);
        }
      `}</style>
    </div>
  )
}
