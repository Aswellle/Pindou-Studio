/**
 * PaletteSetupDialog — 新建 / 编辑个人色卡(重构规格 §4.2)。
 *
 * 品牌与豆径改成「预设优先、手动兜底」:
 *   - 品牌从 PALETTE_LIST 派生,可切到自定义文本;
 *   - 豆径从内置色卡 + 已有个人色卡的已知值派生,可切到未知或自定义;
 *   - 编辑旧数据时,不在预设里的值以「自定义」回显,绝不丢失。
 *
 * 表单状态由父组件持有(editingPalette),这里只负责呈现与校验反馈;
 * 保存失败时父组件保持弹层打开,输入不丢。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PALETTE_LIST } from '../../data/palettes'
import { MAX_PALETTE_NAME } from '../../services/beads/personalPalette'
import { isIOSSafariLike } from '../../utils/device'
import {
  beadSizeOptions,
  brandOptions,
  seriesOptions,
} from './paletteOptions'

const CUSTOM = '__custom__'
const UNKNOWN = '__unknown__'

export default function PaletteSetupDialog({
  value,
  palettes = [],
  busy,
  dialogRef,
  dialogProps,
  onChange,
  onCancel,
  onSave,
}) {
  const { t } = useTranslation()
  const nameRef = useRef(null)
  const [showNotes, setShowNotes] = useState(!!value?.notes)

  const brands = useMemo(() => brandOptions(palettes), [palettes])
  const sizes = useMemo(() => beadSizeOptions(palettes), [palettes])
  const series = useMemo(() => seriesOptions(palettes), [palettes])

  // 已有值不在预设里 → 选中「自定义」并把原值保留在输入框
  const builtinBrandNames = useMemo(
    () => new Set(PALETTE_LIST.map((p) => t(`palette.brand.${p.id}`, p.nameZh || p.name))),
    [t],
  )
  const brandIsBuiltin = builtinBrandNames.has(value?.brandName || '')
  const [brandMode, setBrandMode] = useState(
    value?.brandName && !brandIsBuiltin ? CUSTOM : (value?.brandName ? '' : ''),
  )
  const [seriesMode, setSeriesMode] = useState(
    value?.seriesName && !series.includes(value.seriesName) ? CUSTOM : '',
  )
  const [sizeMode, setSizeMode] = useState(() => {
    if (value?.beadSizeMm === null || value?.beadSizeMm === undefined || value?.beadSizeMm === '') return UNKNOWN
    return sizes.includes(Number(value.beadSizeMm)) ? '' : CUSTOM
  })

  // 默认聚焦名称 —— **仅非 iOS**。
  // 移动端不自动聚焦(与 App.jsx 保存对话框同一结论,规格 08 §5):autoFocus
  // 会立刻唤起键盘,与浮层收缩动画互相竞争。更麻烦的是本表单里有三个 select,
  // iOS 上点下拉框会先收起键盘;用户被迫在「点输入框弹键盘 → 点下拉框收键盘」
  // 之间反复往返。不自动聚焦后,用户按自己的顺序填写,不会平白多一轮。
  useEffect(() => {
    if (isIOSSafariLike(navigator.userAgent, navigator.maxTouchPoints)) return
    nameRef.current?.focus()
  }, [])

  const set = (patch) => onChange({ ...value, ...patch })

  const brandSelectValue = brandMode === CUSTOM
    ? CUSTOM
    : (PALETTE_LIST.find((p) => t(`palette.brand.${p.id}`, p.nameZh || p.name) === value?.brandName)?.id || '')

  const onBrandSelect = (e) => {
    const next = e.target.value
    if (next === CUSTOM) {
      setBrandMode(CUSTOM)
      return
    }
    setBrandMode('')
    if (!next) { set({ brandName: '' }); return }
    const palette = PALETTE_LIST.find((p) => p.id === next)
    set({
      brandName: t(`palette.brand.${next}`, palette?.nameZh || palette?.name || ''),
    })
  }

  const sizeSelectValue = sizeMode === CUSTOM ? CUSTOM
    : (sizeMode === UNKNOWN || value?.beadSizeMm === '' || value?.beadSizeMm === null || value?.beadSizeMm === undefined
      ? UNKNOWN
      : String(value.beadSizeMm))
  const onSizeSelect = (e) => {
    const next = e.target.value
    if (next === CUSTOM) { setSizeMode(CUSTOM); return }
    if (next === UNKNOWN) { setSizeMode(UNKNOWN); set({ beadSizeMm: '' }); return }
    setSizeMode('')
    set({ beadSizeMm: next })
  }

  return (
    <div className="my-beads-modal-overlay" onClick={onCancel}>
      <div className="my-beads-modal" ref={dialogRef} {...dialogProps} onClick={(e) => e.stopPropagation()}>
        <h3>{value?.id ? t('myBeads.palettes.editTitle') : t('myBeads.palettes.newTitle')}</h3>

        <label>
          <span>{t('myBeads.palettes.name')} *</span>
          <input
            ref={nameRef}
            value={value?.name || ''}
            maxLength={MAX_PALETTE_NAME}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={t('myBeads.palettes.form.nameExample')}
          />
        </label>

        <label>
          <span>{t('myBeads.palettes.brandName')}</span>
          <select value={brandSelectValue} onChange={onBrandSelect}>
            <option value="">{t('myBeads.palettes.form.seriesUnknown')}</option>
            {PALETTE_LIST.map((p) => (
              <option key={p.id} value={p.id}>{t(`palette.brand.${p.id}`, p.nameZh || p.name)}</option>
            ))}
            {brands.custom.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            <option value={CUSTOM}>{t('myBeads.palettes.form.brandCustom')}</option>
          </select>
        </label>
        {(brandMode === CUSTOM || (brands.custom.length > 0 && brands.custom.includes(value?.brandName))) && (
          <label>
            <span>{t('myBeads.palettes.form.brandCustom')}</span>
            <input
              value={value?.brandName || ''}
              maxLength={MAX_PALETTE_NAME}
              onChange={(e) => set({ brandName: e.target.value })}
              placeholder={t('myBeads.palettes.form.brandPlaceholder')}
            />
          </label>
        )}

        <label>
          <span>{t('myBeads.palettes.seriesName')}</span>
          <select
            value={seriesMode === CUSTOM ? CUSTOM : (series.includes(value?.seriesName) ? value.seriesName : '')}
            onChange={(e) => {
              const next = e.target.value
              if (next === CUSTOM) { setSeriesMode(CUSTOM); return }
              setSeriesMode('')
              set({ seriesName: next })
            }}
          >
            <option value="">{t('myBeads.palettes.form.seriesUnknown')}</option>
            {series.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={CUSTOM}>{t('myBeads.palettes.form.seriesCustom')}</option>
          </select>
        </label>
        {seriesMode === CUSTOM && (
          <label>
            <span>{t('myBeads.palettes.form.seriesCustom')}</span>
            <input
              value={value?.seriesName || ''}
              maxLength={MAX_PALETTE_NAME}
              onChange={(e) => set({ seriesName: e.target.value })}
              placeholder={t('myBeads.palettes.form.seriesPlaceholder')}
            />
          </label>
        )}

        <label>
          <span>{t('myBeads.palettes.beadSize')}</span>
          <select value={sizeSelectValue} onChange={onSizeSelect}>
            <option value={UNKNOWN}>{t('myBeads.palettes.form.beadSizeUnknown')}</option>
            {sizes.map((n) => <option key={n} value={String(n)}>{`${n} mm`}</option>)}
            <option value={CUSTOM}>{t('myBeads.palettes.form.beadSizeCustom')}</option>
          </select>
        </label>
        {sizeMode === CUSTOM && (
          <label>
            <span>{t('myBeads.palettes.beadSize')}</span>
            <input
              type="number"
              min="0.1"
              max="20"
              step="0.1"
              value={value?.beadSizeMm ?? ''}
              onChange={(e) => set({ beadSizeMm: e.target.value })}
              placeholder={t('myBeads.palettes.beadSizePlaceholder')}
            />
          </label>
        )}

        {!showNotes ? (
          <button
            type="button"
            className="my-beads-btn ghost note-toggle"
            onClick={() => setShowNotes(true)}
          >
            {t('myBeads.palettes.form.notesToggle')}
          </button>
        ) : (
          <label>
            <span>{t('myBeads.palettes.notes')}</span>
            <textarea
              rows={2}
              value={value?.notes || ''}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>
        )}

        <div className="my-beads-modal-actions">
          <button type="button" className="my-beads-btn ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="my-beads-btn primary" disabled={busy} onClick={onSave}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
