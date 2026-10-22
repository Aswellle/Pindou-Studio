/**
 * CopyBuiltinPaletteDialog — 复制内置品牌色卡(重构规格 §4.3)。
 *
 * 取代原先的 window.prompt:展示品牌、颜色数、豆径与有限数量的颜色预览,
 * 说明「只改副本、不动内置数据」,并让用户先改好副本名称再确认。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PALETTE_LIST } from '../../data/palettes'
import { MAX_PALETTE_NAME } from '../../services/beads/personalPalette'

/** 预览最多渲染的色块数 —— 一次画几百个色块在移动端会明显掉帧 */
const PREVIEW_LIMIT = 24

export default function CopyBuiltinPaletteDialog({
  builtin,
  busy,
  dialogRef,
  dialogProps,
  onCancel,
  onConfirm,
}) {
  const { t } = useTranslation()
  const inputRef = useRef(null)
  const defaultName = builtin
    ? `${t(`palette.brand.${builtin.id}`, builtin.nameZh || builtin.name)} ${t('myBeads.copySuffix')}`
    : ''
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    setName(defaultName)
  }, [defaultName])

  if (!builtin) return null
  const colors = builtin.colors || []
  const preview = colors.slice(0, PREVIEW_LIMIT)
  const rest = colors.length - preview.length

  return (
    <div className="my-beads-modal-overlay" onClick={onCancel}>
      <div className="my-beads-modal copy-builtin" ref={dialogRef} {...dialogProps} onClick={(e) => e.stopPropagation()}>
        <h3>{t('myBeads.copy.title')}</h3>

        <div className="copy-builtin-meta">
          <strong>{t(`palette.brand.${builtin.id}`, builtin.nameZh || builtin.name)}</strong>
          <span>{t('myBeads.builtin.colorCount', { n: colors.length })}</span>
          {builtin.beadSize ? <span>{`${builtin.beadSize} mm`}</span> : null}
        </div>

        <ul className="copy-builtin-swatches" aria-hidden="true">
          {preview.map((c) => (
            <li key={c.id} style={{ background: c.hex }} title={c.id} />
          ))}
        </ul>
        {rest > 0 && (
          <p className="my-beads-hint small">{t('myBeads.copy.previewMore', { n: rest })}</p>
        )}

        <p className="my-beads-hint small">{t('myBeads.copy.desc')}</p>

        <label>
          <span>{t('myBeads.copy.nameLabel')}</span>
          <input
            ref={inputRef}
            value={name}
            maxLength={MAX_PALETTE_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                e.preventDefault()
                onConfirm(name.trim())
              }
            }}
          />
        </label>

        <div className="my-beads-modal-actions">
          <button type="button" className="my-beads-btn ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="my-beads-btn primary"
            disabled={busy || !name.trim()}
            onClick={() => onConfirm(name.trim() || defaultName)}
          >
            {t('myBeads.copy.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 供父组件复用:内置色卡按 PALETTE_LIST 顺序取 */
export function findBuiltin(id) {
  return PALETTE_LIST.find((p) => p.id === id) || null
}
