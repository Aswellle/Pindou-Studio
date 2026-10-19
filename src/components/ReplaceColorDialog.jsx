/**
 * ReplaceColorDialog — 批量颜色替换(M5)
 *
 * 规格:docs/implementation/IMPLEMENTATION_PLAN.md M5
 *   「颜色替换有命中数量与确认;空白格不被无提示填满」
 *
 * 行为契约:
 *   - 来源色只从画布上**实际存在**的颜色里选(collectColorStats),不给空白格
 *     提供「替换源」;
 *   - 选择来源色后立刻显示命中数量,用户确认才提交;
 *   - 目标色来自当前品牌色卡(与右侧色卡同源),避免替换成色卡外的颜色;
 *   - 替换是一次事务:App 侧 setCanvas 只推一条历史,一次撤销即回原矩阵。
 *
 * 视觉沿用站点暖色 token 与既有 .modal-overlay 基础设施,不引入新样式体系。
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Replace, X } from 'lucide-react'
import { getPalette } from '../data/palettes'
import { collectColorStats, countColor } from '../utils/selectionUtils'
import { useScrollLock } from '../hooks/useScrollLock'

export default function ReplaceColorDialog({
  open,
  canvasData,
  paletteId = 'perler',
  initialFrom = null,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation()
  const palette = useMemo(() => getPalette(paletteId || 'perler'), [paletteId])
  const stats = useMemo(() => (open ? collectColorStats(canvasData) : []), [open, canvasData])

  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(null)

  // 每次打开都重置:来源色默认取画布主色,目标色默认取当前色卡首色
  useEffect(() => {
    if (!open) return
    const first = initialFrom || stats[0]?.hex || null
    setFrom(first)
    setTo(palette.colors[0]?.hex || null)
  }, [open, initialFrom, stats, palette])

  const hits = useMemo(() => (open && from ? countColor(canvasData, from) : 0), [open, from, canvasData])

  // 弹层打开期间锁定背景滚动(必须在早退 return 之前调用,保持 hooks 顺序)
  useScrollLock(!!open)

  if (!open) return null

  const colorName = (c) => c && t(`palette.colorNames.${palette.id}.${c.id}`, c.nameZh || c.name)
  const nameOf = (hex) => {
    const pc = palette.colors.find(c => c.hex?.toLowerCase() === String(hex).toLowerCase())
    return pc ? `${pc.id} ${colorName(pc)}` : hex
  }

  const canApply = Boolean(from) && Boolean(to) && from !== to && hits > 0

  const handleApply = () => {
    if (!canApply) return
    onConfirm?.(from, to)
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="replace-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="replace-head">
          <Replace size={18} />
          <h3>{t('replace.title')}</h3>
          <button type="button" className="replace-close" onClick={onClose} aria-label={t('common.cancel')}>
            <X size={16} />
          </button>
        </div>

        <p className="replace-hint">{t('replace.hint')}</p>

        {stats.length === 0 ? (
          <p className="replace-empty">{t('replace.emptyCanvas')}</p>
        ) : (
          <>
            <div className="replace-section">
              <label className="replace-label">{t('replace.from')}</label>
              <div className="replace-swatches">
                {stats.map(({ hex, count }) => (
                  <button
                    key={hex}
                    type="button"
                    className={`replace-swatch${from === hex ? ' active' : ''}`}
                    onClick={() => setFrom(hex)}
                    title={`${nameOf(hex)} · ${count}`}
                  >
                    <span className="replace-dot" style={{ backgroundColor: hex }} />
                    <span className="replace-swatch-text">
                      <span className="replace-swatch-name">{nameOf(hex)}</span>
                      <span className="replace-swatch-count">{count}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="replace-section">
              <label className="replace-label">{t('replace.to')}</label>
              <div className="replace-swatches compact">
                {palette.colors.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`replace-swatch square${to === c.hex ? ' active' : ''}`}
                    onClick={() => setTo(c.hex)}
                    title={`${c.id} · ${colorName(c)}`}
                  >
                    <span className="replace-dot" style={{ backgroundColor: c.hex }} />
                  </button>
                ))}
              </div>
            </div>

            <div className="replace-preview">
              <span className="replace-preview-label">{t('replace.hits', { n: hits })}</span>
              <span className="replace-preview-flow">
                <span className="replace-dot" style={{ backgroundColor: from || 'transparent' }} />
                <span aria-hidden="true">→</span>
                <span className="replace-dot" style={{ backgroundColor: to || 'transparent' }} />
              </span>
            </div>

            <div className="replace-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleApply} disabled={!canApply}>
                {t('replace.apply')}
              </button>
            </div>
          </>
        )}

        <style>{`
          .replace-dialog {
            width: min(520px, calc(100vw - 32px));
            max-height: min(680px, calc(var(--visible-vh, 100vh) - 48px));
            display: flex;
            flex-direction: column;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-card);
            box-shadow: var(--shadow-card);
            padding: 18px 20px;
            gap: 12px;
            overflow-y: auto;
            overscroll-behavior: contain;
          }
          .replace-head {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--accent);
          }
          .replace-head h3 {
            flex: 1;
            font-size: var(--text-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
          }
          .replace-close {
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
          }
          .replace-close:hover { background: var(--bg-secondary); color: var(--text-primary); }
          .replace-hint,
          .replace-empty {
            font-size: var(--text-sm);
            color: var(--text-muted);
            line-height: 1.5;
          }
          .replace-empty { padding: 18px 0; text-align: center; }
          .replace-section { display: flex; flex-direction: column; gap: 6px; }
          .replace-label {
            font-size: var(--text-xs);
            font-weight: var(--font-weight-medium);
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .replace-swatches {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            max-height: 168px;
            overflow-y: auto;
          }
          .replace-swatches.compact { max-height: 132px; }
          .replace-swatch {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 8px;
            border: 2px solid transparent;
            background: var(--bg-secondary);
            cursor: pointer;
            font-family: inherit;
          }
          .replace-swatch.square { padding: 3px; }
          .replace-swatch.active {
            border-color: var(--accent);
            background: var(--bg-tertiary);
          }
          .replace-dot {
            width: 16px;
            height: 16px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
            display: inline-block;
            flex-shrink: 0;
          }
          .replace-swatch-text {
            display: inline-flex;
            align-items: baseline;
            gap: 5px;
            font-size: var(--text-xs);
            color: var(--text-secondary);
            white-space: nowrap;
          }
          .replace-swatch-count {
            font-family: var(--font-mono);
            color: var(--text-muted);
          }
          .replace-preview {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 10px;
            background: var(--bg-secondary);
          }
          .replace-preview-label {
            font-size: var(--text-sm);
            font-weight: var(--font-weight-medium);
            color: var(--text-primary);
          }
          .replace-preview-flow {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--text-muted);
          }
          .replace-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          }
          @media (max-width: 639px) {
            .replace-dialog { padding: 16px; }
            .replace-actions .btn { min-height: 44px; }
          }
        `}</style>
      </div>
    </div>,
    document.body
  )
}
