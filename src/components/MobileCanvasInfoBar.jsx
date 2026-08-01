import { useTranslation } from 'react-i18next'

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
      <button className="info-reset-btn" onClick={onReset} title={t('canvas.resetTitle')}>
        {t('canvas.reset')}
      </button>
      <button className="info-fit-btn" onClick={onFit} title={t('canvas.fitTitle')}>
        {t('canvas.fit')}
      </button>

      <style>{`
        .mobile-canvas-info-bar {
          display: flex;
          align-items: center;
          gap: 6px;
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
        .info-reset-btn {
          background: var(--secondary-accent);
          color: white;
          border: none;
          padding: 3px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          white-space: nowrap;
        }
        .info-reset-btn:hover {
          background: var(--secondary-accent-hover);
          transform: scale(1.05);
        }
        .info-reset-btn:active {
          transform: scale(0.96);
        }
        .info-fit-btn {
          background: var(--accent);
          color: white;
          border: none;
          padding: 3px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          white-space: nowrap;
        }
        .info-fit-btn:hover {
          background: var(--accent-hover);
          transform: scale(1.05);
        }
        .info-fit-btn:active {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  )
}
