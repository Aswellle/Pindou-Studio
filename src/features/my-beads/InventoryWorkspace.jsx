/**
 * InventoryWorkspace — 库存工作区(重构规格 §5)。
 *
 * 结构:先选来源与色卡 → 摘要(可点筛选)→ 工具栏 → 颜色行 / 批量条。
 *
 * 关键约束:
 *   - 数量「草稿 + 提交」,不在每次按键时写库;
 *   - 单行与批量共用 inventoryStatus 的状态规则;
 *   - 切换色卡时清空行选择与批量草稿,不把上一张色卡的选择带过来。
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Copy, Plus, Package, ListChecks } from 'lucide-react'
import InventoryColorRow from './InventoryColorRow'
import {
  buildStockSummary,
  deriveStockState,
  matchesStockFilter,
  normalizeQuantityDraft,
  statusForQuantity,
} from './inventoryStatus'

const FILTERS = ['all', 'recorded', 'owned', 'low', 'out', 'unrecorded']

const SUMMARY_ITEMS = [
  { filter: 'recorded', key: 'myBeads.inventory.summary.recorded', field: 'recorded' },
  { filter: 'owned', key: 'myBeads.inventory.summary.owned', field: 'owned' },
  { filter: 'low', key: 'myBeads.inventory.summary.low', field: 'low' },
  { filter: 'out', key: 'myBeads.inventory.summary.out', field: 'out' },
  { filter: 'unrecorded', key: 'myBeads.inventory.summary.unrecorded', field: 'unrecorded' },
]

export default function InventoryWorkspace({
  palettes,
  colorsByPalette,
  inventoryByKey,
  source,
  paletteId,
  onSourceChange,
  onPaletteChange,
  onCopyBuiltin,
  onNewPalette,
  onGoPaletteColors,
  onCommitQuantity,
  onClearRecord,
  onBatchDone,
  busy,
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [batchQty, setBatchQty] = useState('')
  const [savingKey, setSavingKey] = useState(null)

  // 颜色列表:内置色卡来自 PALETTE_LIST,个人色卡来自 store
  const colors = useMemo(() => {
    if (!paletteId) return []
    if (source === 'builtin') {
      const palette = palettes.builtin.find((p) => p.id === paletteId)
      if (!palette) return []
      return palette.colors.map((c) => ({
        id: c.id,
        code: c.id,
        name: c.nameZh || c.name,
        hex: c.hex,
        key: `builtin:${paletteId}:${c.id}`,
      }))
    }
    const list = colorsByPalette.get(paletteId) || []
    return list.map((c) => ({ ...c, key: `user:${paletteId}:${c.id}` }))
  }, [source, paletteId, palettes.builtin, colorsByPalette])

  const summary = useMemo(() => buildStockSummary(colors, inventoryByKey), [colors, inventoryByKey])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return colors.filter((c) => {
      if (q) {
        const hit = String(c.code).toLowerCase().includes(q)
          || String(c.name || '').toLowerCase().includes(q)
          || String(c.hex || '').toLowerCase().includes(q)
        if (!hit) return false
      }
      return matchesStockFilter(deriveStockState(inventoryByKey.get(c.key)), filter)
    })
  }, [colors, search, filter, inventoryByKey])

  const visibleKeys = useMemo(() => visible.map((c) => c.key), [visible])
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k))

  // 切换色卡/来源时清空选择与批量草稿(规格 §5.1 第 5 条)
  const resetSelection = () => { setSelectedKeys(new Set()); setBatchQty('') }

  const changeSource = (next) => { resetSelection(); setFilter('all'); setSearch(''); onSourceChange(next) }
  const changePalette = (next) => { resetSelection(); onPaletteChange(next) }

  const toggleKey = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k))
      else visibleKeys.forEach((k) => next.add(k))
      return next
    })
  }

  const runBatch = async (buildPatch, successKey) => {
    const targets = visible.filter((c) => selectedKeys.has(c.key))
    if (targets.length === 0) return null
    let ok = 0
    let failed = 0
    for (const color of targets) {
      const record = inventoryByKey.get(color.key)
      const patch = buildPatch(color, record)
      if (patch === null) { ok++; continue }
      if (patch.__remove) {
        const res = await onClearRecord(color, { silent: true })
        if (res?.ok) ok++
        else failed++
        continue
      }
      const res = await onCommitQuantity(color, patch.quantity, patch.status, { silent: true })
      if (res?.ok) ok++
      else failed++
    }
    resetSelection()
    onBatchDone?.({ ok, failed, successKey })
    return { ok, failed }
  }

  const applyBatchQty = () => {
    const parsed = normalizeQuantityDraft(batchQty)
    if (!parsed.ok) return
    runBatch((_color, record) => ({
      quantity: parsed.quantity,
      status: statusForQuantity(parsed.quantity, record?.status || 'owned'),
    }), 'myBeads.inventory.batchQtyDone')
  }

  const applyBatchStatus = (status) => runBatch(
    (_color, record) => (status === 'out_of_stock'
      ? { quantity: 0, status }
      : { quantity: record?.quantity ?? null, status }),
    'myBeads.inventory.batchStatusDone',
  )

  const clearBatch = () => runBatch(
    (_color, record) => (record ? { __remove: true } : null),
    'myBeads.inventory.batchCleared',
  )

  const commitRow = async (color, quantity, status) => {
    setSavingKey(color.key)
    try {
      return await onCommitQuantity(color, quantity, status)
    } finally {
      setSavingKey(null)
    }
  }

  const builtinList = palettes.builtin
  const userPalettes = palettes.user

  // ── 空状态:必须先回答「我正在管理哪张色卡」────────────────
  const noUserPalettes = source === 'user' && userPalettes.length === 0
  const paletteHasNoColors = !noUserPalettes && paletteId && colors.length === 0

  return (
    <section className="my-beads-section inventory-workspace">
      <div className="my-beads-section-head">
        <h2>{t('myBeads.inventory.title')}</h2>
      </div>
      <p className="my-beads-hint small">{t('myBeads.inventory.hint')}</p>

      {/* 来源与色卡:两个有标签的选择区域 */}
      <div className="inventory-picker">
        <fieldset className="picker-source">
          <legend>{t('myBeads.inventory.source')}</legend>
          <div className="segmented" role="group">
            <button
              type="button"
              className={source === 'builtin' ? 'active' : ''}
              aria-pressed={source === 'builtin'}
              onClick={() => changeSource('builtin')}
            >
              {t('myBeads.inventory.builtin')}
            </button>
            <button
              type="button"
              className={source === 'user' ? 'active' : ''}
              aria-pressed={source === 'user'}
              onClick={() => changeSource('user')}
            >
              {t('myBeads.inventory.personal')}
            </button>
          </div>
        </fieldset>

        <label className="picker-palette">
          <span>{t('myBeads.inventory.paletteLabel')}</span>
          <select value={paletteId || ''} onChange={(e) => changePalette(e.target.value)}>
            {(source === 'builtin' ? builtinList : userPalettes).map((p) => (
              <option key={p.id} value={p.id}>
                {source === 'builtin'
                  ? t(`palette.brand.${p.id}`, p.nameZh || p.name)
                  : `${p.name}${p.beadSizeMm ? ` · ${p.beadSizeMm}mm` : ''}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {noUserPalettes ? (
        <div className="my-beads-empty-action">
          <Package size={20} aria-hidden="true" />
          <h3>{t('myBeads.inventory.noPalettes')}</h3>
          <p className="my-beads-hint small">{t('myBeads.inventory.noPalettesDesc')}</p>
          <div className="empty-actions">
            <button type="button" className="my-beads-btn primary" onClick={onCopyBuiltin}>
              <Copy size={14} />{t('myBeads.gettingStarted.copyBuiltin')}
            </button>
            <button type="button" className="my-beads-btn secondary" onClick={onNewPalette}>
              <Plus size={14} />{t('myBeads.gettingStarted.createCustom')}
            </button>
          </div>
        </div>
      ) : paletteHasNoColors ? (
        <div className="my-beads-empty-action">
          <ListChecks size={20} aria-hidden="true" />
          <h3>{t('myBeads.inventory.paletteNoColors')}</h3>
          <p className="my-beads-hint small">{t('myBeads.inventory.paletteNoColorsDesc')}</p>
          <button type="button" className="my-beads-btn primary" onClick={onGoPaletteColors}>
            {t('myBeads.inventory.manageColors')}
          </button>
        </div>
      ) : (
        <>
          {/* 摘要:每一项可点,点击即设置对应筛选 */}
          <div className="inventory-summary" role="group" aria-label={t('myBeads.inventory.summaryLabel')}>
            {SUMMARY_ITEMS.map((item) => (
              <button
                key={item.filter}
                type="button"
                className={`summary-chip${filter === item.filter ? ' active' : ''}`}
                aria-pressed={filter === item.filter}
                onClick={() => setFilter(filter === item.filter ? 'all' : item.filter)}
              >
                {t(item.key, { n: summary[item.field] })}
              </button>
            ))}
            <span className="summary-total">
              {t('myBeads.inventory.summary.totalQty', { n: summary.totalQty })}
            </span>
          </div>

          <div className="my-beads-filters inventory-toolbar">
            <label className="my-beads-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('myBeads.inventory.search')}
                aria-label={t('myBeads.inventory.search')}
              />
            </label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={t('myBeads.inventory.filterLabel')}
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f === 'all' ? t('myBeads.inventory.filterAll')
                    : f === 'recorded' ? t('myBeads.inventory.filterRecorded')
                      : f === 'owned' ? t('myBeads.inventory.filterOwned')
                        : f === 'low' ? t('myBeads.inventory.filterLow')
                          : f === 'out' ? t('myBeads.inventory.filterOut')
                            : t('myBeads.inventory.filterUnknown')}
                </option>
              ))}
            </select>
          </div>

          {selectedKeys.size > 0 && (
            <div className="my-beads-batch" role="region" aria-label={t('myBeads.inventory.batchTitle')}>
              <span className="my-beads-batch-count">
                {t('myBeads.inventory.batchSelected', { n: selectedKeys.size })}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="qty-input"
                value={batchQty}
                onChange={(e) => setBatchQty(e.target.value)}
                placeholder={t('myBeads.inventory.batchQtyPlaceholder')}
                aria-label={t('myBeads.inventory.batchQtyPlaceholder')}
              />
              <button type="button" className="my-beads-btn secondary" disabled={busy} onClick={applyBatchQty}>
                {t('myBeads.inventory.batchSetQty')}
              </button>
              <button type="button" className="my-beads-btn ghost" disabled={busy} onClick={() => applyBatchStatus('owned')}>
                {t('myBeads.inventory.markOwned')}
              </button>
              <button type="button" className="my-beads-btn ghost" disabled={busy} onClick={() => applyBatchStatus('low')}>
                {t('myBeads.inventory.markLow')}
              </button>
              <button type="button" className="my-beads-btn ghost" disabled={busy} onClick={() => applyBatchStatus('out_of_stock')}>
                {t('myBeads.inventory.markOut')}
              </button>
              <button type="button" className="my-beads-btn ghost" disabled={busy} onClick={clearBatch}>
                {t('myBeads.inventory.batchClear')}
              </button>
              <button type="button" className="my-beads-btn ghost" onClick={resetSelection}>
                {t('myBeads.inventory.batchCancel')}
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="my-beads-hint">{t('myBeads.inventory.filterEmpty')}</p>
          ) : (
            <>
              <label className="my-beads-select-all">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} />
                <span>
                  {t('myBeads.inventory.selectAll')}
                  {' · '}
                  {t('myBeads.inventory.selectAllHint', { n: visibleKeys.length })}
                </span>
              </label>
              <ul className="my-beads-inv-list">
                {visible.map((color) => (
                  <InventoryColorRow
                    key={color.key}
                    color={color}
                    record={inventoryByKey.get(color.key)}
                    selected={selectedKeys.has(color.key)}
                    saving={savingKey === color.key}
                    onToggleSelect={toggleKey}
                    onSetStatus={(status) => {
                      const record = inventoryByKey.get(color.key)
                      const quantity = status === 'out_of_stock' ? 0 : (record?.quantity ?? null)
                      return commitRow(color, quantity, status)
                    }}
                    onCommitQuantity={(quantity, status) => commitRow(color, quantity, status)}
                    onClearRecord={() => onClearRecord(color)}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
