/**
 * PaletteGettingStarted — 无个人色卡时的起步状态,以及复制完成后的下一步面板
 * (重构规格 §4.1 / §4.3)。
 *
 * 空状态不能只写「还没有个人色卡」:必须给出两条可执行路径,并说明内置色卡不会被改动。
 */

import { useTranslation } from 'react-i18next'
import { Copy, Plus, Palette as PaletteIcon, X } from 'lucide-react'

/** 空状态:两个明确入口 */
export function PaletteEmptyState({ onCopyBuiltin, onNewPalette, hasCanvas }) {
  const { t } = useTranslation()
  return (
    <div className="my-beads-getting-started">
      <PaletteIcon size={22} className="gs-icon" aria-hidden="true" />
      <h3>{t('myBeads.gettingStarted.title')}</h3>
      <p>{t('myBeads.gettingStarted.desc')}</p>
      <div className="gs-actions">
        <button type="button" className="my-beads-btn primary" onClick={onCopyBuiltin}>
          <Copy size={15} />{t('myBeads.gettingStarted.copyBuiltin')}
        </button>
        <button type="button" className="my-beads-btn secondary" onClick={onNewPalette}>
          <Plus size={15} />{t('myBeads.gettingStarted.createCustom')}
        </button>
      </div>
      {hasCanvas && <p className="my-beads-hint small">{t('myBeads.gettingStarted.canvasHint')}</p>}
    </div>
  )
}

/**
 * 复制成功后的后续操作区域。它不是一个转瞬即逝的 toast ——
 * 用户主动关闭或完成跳转前一直可见(规格 §4.3 第 4 条)。
 */
export function CopyResultPanel({
  paletteName,
  colorCount,
  hasCanvas,
  onDismiss,
  onGoColors,
  onGoInventory,
  onGoMatch,
  onGoCanvas,
}) {
  const { t } = useTranslation()
  return (
    <div className="my-beads-copy-result" role="region" aria-label={t('myBeads.copy.doneTitle', { name: paletteName })}>
      <div className="copy-result-head">
        <strong>{t('myBeads.copy.doneTitle', { name: paletteName })}</strong>
        <button
          type="button"
          className="my-beads-icon-btn small"
          aria-label={t('myBeads.copy.dismiss')}
          onClick={onDismiss}
        >
          <X size={13} />
        </button>
      </div>
      <p className="my-beads-hint small">
        {t('myBeads.copy.doneDesc', { n: colorCount })}
      </p>
      <div className="copy-result-actions">
        <button type="button" className="my-beads-btn secondary" onClick={onGoColors}>
          {t('myBeads.copy.goColors')}
        </button>
        <button type="button" className="my-beads-btn secondary" onClick={onGoInventory}>
          {t('myBeads.copy.goInventory')}
        </button>
        {hasCanvas ? (
          <button type="button" className="my-beads-btn secondary" onClick={onGoMatch}>
            {t('myBeads.copy.goMatch')}
          </button>
        ) : (
          <button type="button" className="my-beads-btn ghost" onClick={onGoCanvas}>
            {t('myBeads.copy.goCanvas')}
          </button>
        )}
      </div>
      {!hasCanvas && <p className="my-beads-hint small">{t('myBeads.copy.noCanvas')}</p>}
    </div>
  )
}
