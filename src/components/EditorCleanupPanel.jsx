/**
 * EditorCleanupPanel — 图纸编辑器「整理」抽屉。
 *
 * 低频但不可缺的批量操作集中在这里,不占常驻操作台:
 *   去噪 / 替换色号 / 删除颜色 / 合并相近色 / 裁切 / 单色隔离。
 *
 * 与画布页共用同一套底层能力(removeNoiseBeads、replaceColor、
 * editorCleanup 纯函数);面板只负责选择参数与确认,真正的写入由
 * EditorPage 转交 App 的 setCanvas / replaceCanvas 完成 —— 一次操作
 * 一条历史(裁切例外:换画布尺寸会重置历史,面板内明确提示)。
 *
 * 浮层沿用 index.css 共享浮层组与 editor-sheet 样式,移动端贴底、
 * 桌面端居中;内容区独立滚动,不挤压画格区。
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Sparkles, Replace, Trash2, Merge, Crop, Check, EyeOff, X } from 'lucide-react'

const REDUCE_PRESETS = [8, 12, 16, 24, 32, 48]

function Section({ title, hint, children }) {
  return (
    <section className="editor-cleanup-section">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {children}
    </section>
  )
}

function ColorPicker({ colors, value, onChange, labelOf }) {
  return (
    <div className="editor-cleanup-colors">
      {colors.map(c => (
        <button
          key={c.hex}
          type="button"
          className={`editor-cleanup-color${value === c.hex ? ' active' : ''}`}
          onClick={() => onChange(c.hex)}
          title={`${labelOf(c)} · ${c.count}`}
        >
          <span className="editor-cleanup-swatch" style={{ background: c.hex }} />
          <span>{labelOf(c)}</span>
          <span className="editor-cleanup-count">{c.count}</span>
        </button>
      ))}
    </div>
  )
}

export default function EditorCleanupPanel({
  palette,
  usedColors = [],
  hasSelection = false,
  isolateColor = null,
  onNoise,
  onOpenReplace,
  onDeleteColor,
  onReduceColors,
  onCrop,
  onToggleIsolate,
  onClose,
}) {
  const { t } = useTranslation()
  const [deleteHex, setDeleteHex] = useState(usedColors[0]?.hex || null)
  const reduceOptions = useMemo(() => REDUCE_PRESETS.filter(n => n < usedColors.length), [usedColors.length])
  const [reduceTo, setReduceTo] = useState(reduceOptions[0] || null)

  const nameOf = c => t(`palette.colorNames.${palette.id}.${c.id}`, c.nameZh || c.name)
  const labelOf = c => {
    const pc = palette.colors.find(p => p.hex?.toLowerCase() === c.hex.toLowerCase())
    return pc ? `${pc.id} ${nameOf(pc)}` : c.hex
  }
  const deleteTarget = usedColors.find(c => c.hex === deleteHex) || usedColors[0] || null

  return createPortal(
    <div className="editor-sheet-overlay" onClick={onClose}>
      <div
        className="editor-sheet editor-cleanup-sheet"
        role="dialog"
        aria-label={t('editor.cleanupTitle')}
        onClick={e => e.stopPropagation()}
      >
        <div className="editor-sheet-head">
          <h2>{t('editor.cleanupTitle')}</h2>
          <button
            type="button"
            className="editor-sheet-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="editor-sheet-body">
          <Section title={t('editor.cleanupNoise')} hint={t('editor.cleanupNoiseHint')}>
            <button type="button" className="editor-cleanup-action" onClick={onNoise}>
              <Sparkles size={15} />
              {t('tools.noiseCleanup')}
            </button>
          </Section>

          <Section title={t('editor.cleanupReplace')} hint={t('editor.cleanupReplaceHint')}>
            <button type="button" className="editor-cleanup-action" onClick={onOpenReplace}>
              <Replace size={15} />
              {t('replace.title')}
            </button>
          </Section>

          <Section title={t('editor.cleanupDelete')} hint={t('editor.cleanupDeleteHint')}>
            <ColorPicker
              colors={usedColors}
              value={deleteTarget?.hex}
              onChange={setDeleteHex}
              labelOf={labelOf}
            />
            <button
              type="button"
              className="editor-cleanup-action danger"
              disabled={!deleteTarget}
              onClick={() => onDeleteColor?.(deleteTarget.hex)}
            >
              <Trash2 size={15} />
              {t('editor.cleanupDeleteAction', { n: deleteTarget?.count || 0 })}
            </button>
          </Section>

          <Section title={t('editor.cleanupReduce')} hint={t('editor.cleanupReduceHint')}>
            {reduceOptions.length === 0 ? (
              <p className="editor-cleanup-note">{t('editor.cleanupReduceNone')}</p>
            ) : (
              <>
                <div className="editor-cleanup-presets">
                  {reduceOptions.map(n => (
                    <button
                      key={n}
                      type="button"
                      className={`editor-cleanup-preset${reduceTo === n ? ' active' : ''}`}
                      onClick={() => setReduceTo(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="editor-cleanup-action"
                  disabled={!reduceTo}
                  onClick={() => onReduceColors?.(reduceTo)}
                >
                  <Merge size={15} />
                  {t('editor.cleanupReduceAction', { n: reduceTo || 0 })}
                </button>
              </>
            )}
          </Section>

          <Section title={t('editor.cleanupCrop')} hint={t('editor.cleanupCropHint')}>
            <div className="editor-cleanup-row">
              <button type="button" className="editor-cleanup-action" onClick={() => onCrop?.('content')}>
                <Crop size={15} />
                {t('editor.cleanupCropContent')}
              </button>
              <button
                type="button"
                className="editor-cleanup-action"
                disabled={!hasSelection}
                onClick={() => onCrop?.('selection')}
              >
                <Crop size={15} />
                {t('editor.cleanupCropSelection')}
              </button>
            </div>
          </Section>

          <Section title={t('editor.cleanupIsolate')} hint={t('editor.cleanupIsolateHint')}>
            {isolateColor && (
              <button
                type="button"
                className="editor-cleanup-action active"
                onClick={() => onToggleIsolate?.(null)}
              >
                <EyeOff size={15} />
                {t('editor.cleanupIsolateExit')}
              </button>
            )}
            <ColorPicker
              colors={usedColors}
              value={isolateColor}
              labelOf={labelOf}
              onChange={hex => onToggleIsolate?.(hex)}
            />
          </Section>
        </div>

        <button type="button" className="editor-cleanup-done" onClick={onClose}>
          <Check size={15} />
          {t('editor.cleanupDone')}
        </button>
      </div>
    </div>,
    document.body
  )
}
