/**
 * BrandSwitchDialog — 切换品牌色卡时的预览与确认(规格 04 §4)。
 *
 * 规格原文:「当切换品牌色卡时,需要明确选择:只改变色号/显示映射,
 * 还是把网格真实改成目标品牌色值。推荐提供预览;确认后替换矩阵中的
 * HEX,再记录修改为一个可撤销事务。」
 *
 * 两种模式:
 *   - convert(默认):把矩阵 HEX 换成目标品牌最近色,一条可撤销历史;
 *   - mapping:只切换色号解析口径,矩阵不动(改造前的旧行为)。
 *
 * 预览只读:显示每一种画布颜色 → 目标品牌色号、受影响的珠子数,
 * 以及会改动的格子总数。没有任何变化时禁用「转换」按钮。
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Palette, X } from 'lucide-react'
import { getPalette } from '../data/palettes'
import { useScrollLock } from '../hooks/useScrollLock'
import { planBrandSwitch } from '../utils/brandSwitch'

export default function BrandSwitchDialog({
  open,
  canvasData,
  fromPaletteId = 'perler',
  toPaletteId,
  onClose,
  onConvert,
  onMappingOnly,
}) {
  const { t } = useTranslation()
  const fromPalette = useMemo(() => getPalette(fromPaletteId), [fromPaletteId])
  const toPalette = useMemo(() => getPalette(toPaletteId || fromPaletteId), [toPaletteId, fromPaletteId])
  const plan = useMemo(
    () => (open ? planBrandSwitch(canvasData, toPalette.id) : null),
    [open, canvasData, toPalette]
  )

  // 弹层打开期间锁定背景滚动(必须在早退 return 之前调用,保持 hooks 顺序)
  useScrollLock(!!open)

  if (!open || !plan) return null

  const brandName = (p) => t(`palette.brand.${p.id}`)
  const canConvert = plan.changedCells > 0

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="brand-switch-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="brand-switch-head">
          <Palette size={18} />
          <h3>{t('brandSwitch.title')}</h3>
          <button type="button" className="brand-switch-close" onClick={onClose} aria-label={t('common.cancel')}>
            <X size={16} />
          </button>
        </div>

        <div className="brand-switch-flow">
          <span className="brand-switch-brand">{brandName(fromPalette)}</span>
          <span aria-hidden="true">→</span>
          <span className="brand-switch-brand strong">{brandName(toPalette)}</span>
        </div>

        <p className="brand-switch-hint">{t('brandSwitch.hint')}</p>

        {plan.rows.length === 0 ? (
          <p className="brand-switch-empty">{t('brandSwitch.emptyCanvas')}</p>
        ) : (
          <>
            <div className="brand-switch-summary">
              <span>{t('brandSwitch.summaryColors', { n: plan.rows.length })}</span>
              <span className={canConvert ? 'brand-switch-warn' : ''}>
                {canConvert
                  ? t('brandSwitch.summaryChanged', { n: plan.changedCells, m: plan.changedColors })
                  : t('brandSwitch.noChange')}
              </span>
            </div>

            <div className="brand-switch-list">
              {plan.rows.map(row => (
                <div key={row.fromHex} className={`brand-switch-row${row.changed ? '' : ' same'}`}>
                  <span className="brand-switch-dot" style={{ backgroundColor: row.fromHex }} />
                  <span className="brand-switch-arrow" aria-hidden="true">→</span>
                  <span className="brand-switch-dot" style={{ backgroundColor: row.toHex }} />
                  <span className="brand-switch-target">{row.toId} {row.toName}</span>
                  <span className="brand-switch-count">{row.count}</span>
                </div>
              ))}
            </div>

            <div className="brand-switch-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('common.cancel')}
              </button>
              {/* 只改色号显示:矩阵不动,与改造前的行为一致 */}
              <button type="button" className="btn btn-secondary" onClick={onMappingOnly}>
                {t('brandSwitch.mappingOnly')}
              </button>
              <button type="button" className="btn btn-primary" onClick={onConvert} disabled={!canConvert}>
                {t('brandSwitch.convert')}
              </button>
            </div>
          </>
        )}

        <style>{`
          .brand-switch-dialog {
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
          .brand-switch-head {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--accent);
          }
          .brand-switch-head h3 {
            flex: 1;
            font-size: var(--text-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
          }
          .brand-switch-close {
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
          }
          .brand-switch-close:hover { background: var(--bg-secondary); color: var(--text-primary); }
          .brand-switch-flow {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: var(--text-sm);
            color: var(--text-muted);
          }
          .brand-switch-brand { color: var(--text-secondary); }
          .brand-switch-brand.strong {
            color: var(--text-primary);
            font-weight: var(--font-weight-semibold);
          }
          .brand-switch-hint,
          .brand-switch-empty {
            font-size: var(--text-sm);
            color: var(--text-muted);
            line-height: 1.5;
          }
          .brand-switch-empty { padding: 18px 0; text-align: center; }
          .brand-switch-summary {
            display: flex;
            flex-wrap: wrap;
            gap: 4px 14px;
            font-size: var(--text-xs);
            color: var(--text-muted);
          }
          .brand-switch-warn { color: var(--secondary-accent); font-weight: var(--font-weight-semibold); }
          .brand-switch-list {
            display: flex;
            flex-direction: column;
            gap: 3px;
            max-height: 240px;
            overflow-y: auto;
          }
          .brand-switch-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 8px;
            border-radius: 6px;
            background: var(--bg-secondary);
            font-size: var(--text-xs);
          }
          .brand-switch-row.same { opacity: 0.55; }
          .brand-switch-dot {
            width: 14px;
            height: 14px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
            flex-shrink: 0;
          }
          .brand-switch-arrow { color: var(--text-muted); }
          .brand-switch-target {
            flex: 1;
            min-width: 0;
            color: var(--text-secondary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .brand-switch-count {
            font-family: var(--font-mono);
            color: var(--text-muted);
            flex-shrink: 0;
          }
          .brand-switch-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 8px;
          }
          @media (max-width: 639px) {
            .brand-switch-dialog { padding: 16px; }
            .brand-switch-actions { flex-direction: column-reverse; }
            .brand-switch-actions .btn { min-height: 44px; width: 100%; }
          }
        `}</style>
      </div>
    </div>,
    document.body
  )
}
