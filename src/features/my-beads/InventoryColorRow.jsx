/**
 * InventoryColorRow — 单个颜色的库存行。
 *
 * 数量输入是「草稿 + 提交」:输入时只改本地草稿,Enter / 失焦才写 store。
 * 旧实现每次 onChange 都写库,把 25 改成 100 时会依次持久化 2、1、0。
 *
 * 状态操作:有库存 / 数量不足 / 缺货 / 清除记录。清除记录与「缺货」是两件事 ——
 * 前者删除记录(回到未记录),后者写入 quantity=0。
 *
 * 行结构:信息区(.inv-row-head:勾选 / 色块 / 色号 / 名称 / 状态)+ 操作区
 * (.stock-controls:状态三选一 + 数量 + 保存 + 更多)。桌面端两块并排,空间不够
 * 时操作区整块换行;移动端信息区占首行,操作区独占后续行(状态按钮一行、
 * 数量与「更多」一行),每个触控目标都能拿到 ≥40px。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, AlertTriangle, MoreHorizontal, Trash2, RotateCcw } from 'lucide-react'
import StockStateTag from './StockStateTag'
import {
  STOCK_STATE,
  deriveStockState,
  normalizeQuantityDraft,
  statusForQuantity,
} from './inventoryStatus'

export default function InventoryColorRow({
  color,
  record,
  selected,
  onToggleSelect,
  onSetStatus,
  onCommitQuantity,
  onClearRecord,
  onFeedback,
  saving,
}) {
  const { t } = useTranslation()
  const state = deriveStockState(record)
  const savedQty = record?.quantity
  const [draft, setDraft] = useState(savedQty === null || savedQty === undefined ? '' : String(savedQty))
  const [invalid, setInvalid] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef(null)
  const menuRef = useRef(null)

  // 「更多操作」菜单:点外部或按 Escape 关闭。
  // 移动端菜单浮在行内,不关会让下一次点击落空(先关菜单、没点到目标)。
  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  // 记录被外部改写(批量操作 / 切换色卡 / 云端刷新)时同步草稿。
  // 依赖 savedQty 而不是 record 对象:同一数量下不打断用户正在输入的内容。
  // 换颜色时父级用 key={color.key} 重新挂载,这里无需再依赖 color.key。
  useEffect(() => {
    setDraft(savedQty === null || savedQty === undefined ? '' : String(savedQty))
    setInvalid(false)
  }, [savedQty])

  const commit = async () => {
    const parsed = normalizeQuantityDraft(draft)
    if (!parsed.ok) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    const currentStatus = record?.status || 'owned'
    const nextStatus = statusForQuantity(parsed.quantity, currentStatus)
    // 与已保存值完全一致时不重复写库
    if (record && parsed.quantity === savedQty && nextStatus === currentStatus) return
    // 操作反馈:移动端行内控件小,没有回执时用户无法判断是否生效
    const res = await onCommitQuantity(parsed.quantity, nextStatus)
    if (res?.ok) onFeedback?.('saved', color, parsed.quantity)
    else onFeedback?.('failed', color)
  }

  /** 状态按钮点击:带上操作类型,让父级能给出对应的回执文案 */
  const setStatus = async (status) => {
    const res = await onSetStatus(status)
    if (res?.ok) onFeedback?.(status, color)
    else onFeedback?.('failed', color)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      // 恢复最后一次保存的数量,不写库
      e.preventDefault()
      e.stopPropagation()
      setDraft(savedQty === null || savedQty === undefined ? '' : String(savedQty))
      setInvalid(false)
    }
  }

  const dirty = (() => {
    const parsed = normalizeQuantityDraft(draft)
    if (!parsed.ok) return true
    return !record || parsed.quantity !== savedQty
  })()

  return (
    <li className={`my-beads-inv-row${selected ? ' selected' : ''}`} data-key={color.key}>
      {/* 行首:勾选 + 色块 + 色号/名称。移动端这一组占满首行。 */}
      <div className="inv-row-head">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(color.key)}
          aria-label={`${t('myBeads.inventory.selectRow')} ${color.code}`}
        />

        <span className="swatch" style={{ background: color.hex }} aria-hidden="true" />
        <span className="code">{color.code}</span>
        <span className="name">{color.name || ''}</span>
        <span className="hex">{color.hex}</span>

        <StockStateTag state={state} quantity={savedQty} />
      </div>

      <div className="stock-controls">
        {/* 状态三选一:桌面端是三个独立按钮,移动端由 CSS 收成一段分段控件 */}
        <div className="stock-status-group" role="group" aria-label={t('myBeads.inventory.statusGroup')}>
          <button
            type="button"
            className={`stock-btn${state === STOCK_STATE.OWNED_UNKNOWN || state === STOCK_STATE.OWNED_QTY ? ' on' : ''}`}
            title={t('myBeads.inventory.markOwned')}
            aria-label={`${t('myBeads.inventory.markOwned')} ${color.code}`}
            aria-pressed={state === STOCK_STATE.OWNED_UNKNOWN || state === STOCK_STATE.OWNED_QTY}
            disabled={saving}
            onClick={() => setStatus('owned')}
          >
            <Check size={13} />
            <span className="stock-btn-label">{t('myBeads.inventory.shortOwned')}</span>
          </button>
          <button
            type="button"
            className={`stock-btn${state === STOCK_STATE.LOW ? ' low' : ''}`}
            title={t('myBeads.inventory.markLow')}
            aria-label={`${t('myBeads.inventory.markLow')} ${color.code}`}
            aria-pressed={state === STOCK_STATE.LOW}
            disabled={saving}
            onClick={() => setStatus('low')}
          >
            <AlertTriangle size={13} />
            <span className="stock-btn-label">{t('myBeads.inventory.shortLow')}</span>
          </button>
          <button
            type="button"
            className={`stock-btn${state === STOCK_STATE.OUT ? ' out' : ''}`}
            title={t('myBeads.inventory.markOut')}
            aria-label={`${t('myBeads.inventory.markOut')} ${color.code}`}
            aria-pressed={state === STOCK_STATE.OUT}
            disabled={saving}
            onClick={() => setStatus('out_of_stock')}
          >
            <X size={13} />
            <span className="stock-btn-label">{t('myBeads.inventory.shortOut')}</span>
          </button>
        </div>

        <div className="qty-save-group">
          <label className="qty-field">
            <span className="sr-only">{`${t('myBeads.inventory.qtyLabel')} ${color.code}`}</span>
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              className={`qty-input${invalid ? ' invalid' : ''}`}
              value={draft}
              placeholder={t('myBeads.inventory.qtyUnknown')}
              disabled={saving}
              onChange={(e) => { setDraft(e.target.value); setInvalid(false) }}
              onBlur={commit}
              onKeyDown={onKeyDown}
            />
            <span className="qty-unit">{t('myBeads.inventory.qtyUnit')}</span>
          </label>

          <button
            type="button"
            className="my-beads-icon-btn small qty-save-btn"
            disabled={saving || !dirty}
            title={t('myBeads.inventory.save')}
            aria-label={`${t('myBeads.inventory.save')} ${color.code}`}
            onClick={commit}
          >
            {saving ? '…' : <Check size={12} />}
          </button>

          <div className="row-menu" ref={menuRef}>
            <button
              type="button"
              className="my-beads-icon-btn small"
              aria-label={`${t('myBeads.inventory.moreActions')} ${color.code}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              // 没有记录时菜单仍有可用项(标记有货),此前 disabled={!record}
              // 让按钮完全没反应 —— 用户点「更多」却什么都不发生。
              disabled={saving}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="row-menu-pop" role="menu">
                {record && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => { setMenuOpen(false); onClearRecord() }}
                  >
                    <Trash2 size={13} />{t('myBeads.inventory.clearRecord')}
                  </button>
                )}
                {/* 没有记录时给出可执行项:直接标记有货(数量未知) */}
                {!record && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setStatus('owned') }}
                  >
                    <RotateCcw size={13} />{t('myBeads.inventory.markOwnedUnknown')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {invalid && (
        <p className="row-error" role="alert">{t('myBeads.inventory.qtyDraftInvalid')}</p>
      )}
    </li>
  )
}
