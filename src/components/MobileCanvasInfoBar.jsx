import { useTranslation } from 'react-i18next'

/**
 * 移动端画布信息条 — 紧凑显示在 Header 下方
 * 包含：当前画布规格、缩放比例、重置按钮、适应按钮、自动保存状态
 *
 * 自动保存状态放在这里而不是单独加一条:移动端垂直空间极紧,
 * 多一条 32px 的横条就是从画布手里抢 32px。信息条本来就是「画布状态的
 * 一行摘要」,自动保存状态属于同一类信息。
 */
export default function MobileCanvasInfoBar({
  gridSize,
  gridWidth,
  gridHeight,
  scale,
  onReset,
  onFit,
  autoSaveState,
  // 保存入口从顶栏移到画布信息条:画布专属动作不进全局导航,
  // 右侧图标组才不会随页面切换增减、整排跳位。
  onSave,
  saveState,
}) {
  const { t } = useTranslation()

  const w = gridWidth || gridSize
  const h = gridHeight || gridSize
  const scalePercent = Math.round((scale || 1) * 100)
  // 只在「正在保存 / 已保存 / 失败」时显示:空闲与待保存都没必要占位,
  // 否则这一格会长期挂着一个无信息的词
  const saveLabel =
    autoSaveState === 'saving'
      ? t('autosave.statusSaving')
      : autoSaveState === 'saved'
        ? t('autosave.statusSaved')
        : autoSaveState === 'failed'
          ? t('autosave.statusFailed')
          : null

  return (
    <div className="mobile-canvas-info-bar">
      <span className="info-size">
        {w}×{h}
      </span>
      <span className="info-scale">{scalePercent}%</span>
      {saveLabel && (
        <span
          className={`info-autosave${autoSaveState === 'failed' ? ' is-failed' : ''}`}
          title={autoSaveState === 'failed' ? t('autosave.statusFailedHint') : undefined}
          role="status"
        >
          {saveLabel}
        </span>
      )}
      {onSave && (
        <button
          type="button"
          className={`info-save-btn${saveState === 'dirty' ? ' has-unsaved' : ''}`}
          onClick={onSave}
          aria-label={t('gallery.saveTitle')}
          title={saveState === 'dirty' ? t('gallery.unsavedHint') : t('gallery.saveTitle')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          {saveState === 'dirty' && <span className="info-save-dot" aria-hidden="true" />}
        </button>
      )}
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
        /* 自动保存状态:与缩放百分比同级的次要信息,不抢按钮的注意力 */
        .info-autosave {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .info-autosave.is-failed { color: var(--danger, #c62828); }
        /* 保存入口:与重置/适应同级的图标按钮 */
        .info-save-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: color 0.15s, background 0.15s;
          font-family: inherit;
          /* 与「重置」拉开间距(容器 gap 6px + 此处 6px = 12px),
             与适应按钮相对重置的间距一致,减少移动端误触 */
          margin-right: 6px;
        }
        .info-save-btn:hover {
          color: var(--text-primary);
          background: rgba(43, 36, 32, 0.07);
        }
        .info-save-dot {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
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
          /* 与「重置」按钮拉开间距(容器 gap 6px + 此处 6px = 12px),
             减少移动端误触,不改变按钮大小与样式 */
          margin-left: 6px;
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
