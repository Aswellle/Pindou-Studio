/**
 * 库存状态语义(规格 05 §2.3 / 重构规格 §2.3)。
 *
 * 五种状态必须彼此可区分,尤其不能把「未记录」当成「缺货」:
 *   unrecorded    —— 没有库存记录。用户尚未登记,不是缺货。
 *   ownedUnknown  —— 有记录、status=owned、数量未知。知道自己有,但没盘点。
 *   ownedQty      —— 有记录、status=owned、数量 > 0。
 *   low           —— 用户明确标记「数量不足」。数量可以仍是任意值。
 *   out           —— status=out_of_stock 或数量为 0。
 *
 * 数量输入是「草稿 + 提交」两段式:normalizeQuantityDraft 只做纯校验,
 * statusForQuantity 决定提交后该写什么状态。单行与批量共用同一套规则,
 * 避免出现「单行保存 0 变成缺货、批量保存 0 却仍是拥有」的不一致。
 *
 * 纯函数,不做 I/O,不依赖 React。
 */

export const STOCK_STATE = Object.freeze({
  UNRECORDED: 'unrecorded',
  OWNED_UNKNOWN: 'ownedUnknown',
  OWNED_QTY: 'ownedQty',
  LOW: 'low',
  OUT: 'out',
})

/** 库存记录 → 面向用户的五态之一 */
export function deriveStockState(record) {
  if (!record) return STOCK_STATE.UNRECORDED
  if (record.status === 'out_of_stock') return STOCK_STATE.OUT
  if (record.quantity === 0) return STOCK_STATE.OUT
  if (record.status === 'low') return STOCK_STATE.LOW
  if (record.quantity === null || record.quantity === undefined) return STOCK_STATE.OWNED_UNKNOWN
  return STOCK_STATE.OWNED_QTY
}

/**
 * 校验数量草稿。空串 = 数量未知(null),不是 0,也不是删除记录。
 * @returns {{ ok: true, quantity: number|null } | { ok: false, error: 'invalidQuantity' }}
 */
export function normalizeQuantityDraft(raw) {
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: true, quantity: null }
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'invalidQuantity' }
  return { ok: true, quantity: Math.trunc(n) }
}

/**
 * 数量提交后应写入的状态。
 *
 * - 数量 0 → 缺货;
 * - 数量为正、且原本是缺货 → 改回拥有(用户刚补货);
 * - 数量为正、原本手动标了「数量不足」→ 保留 low,不因为改了个数字就覆盖用户判断;
 * - 数量为空 → 保留原状态(原状态是缺货时改回拥有,否则「缺货 + 数量未知」自相矛盾)。
 */
export function statusForQuantity(quantity, currentStatus = 'owned') {
  if (quantity === 0) return 'out_of_stock'
  if (quantity === null || quantity === undefined) {
    return currentStatus === 'out_of_stock' ? 'owned' : currentStatus
  }
  if (currentStatus === 'low') return 'low'
  return 'owned'
}

/** 筛选值与状态的对应关系。筛选名与 §5.1 的摘要项一一对应。 */
export function matchesStockFilter(state, filter) {
  switch (filter) {
    case 'recorded': return state !== STOCK_STATE.UNRECORDED
    case 'owned': return state === STOCK_STATE.OWNED_UNKNOWN || state === STOCK_STATE.OWNED_QTY
    case 'low': return state === STOCK_STATE.LOW
    case 'out': return state === STOCK_STATE.OUT
    case 'unrecorded': return state === STOCK_STATE.UNRECORDED
    default: return true
  }
}

/**
 * 汇总当前色卡的库存状态。
 * @param {Array<{key: string}>} colors - 已带库存键的颜色列表
 * @param {Map<string, object>} inventoryByKey
 */
export function buildStockSummary(colors, inventoryByKey) {
  const summary = {
    total: 0,
    recorded: 0,
    owned: 0,
    low: 0,
    out: 0,
    unrecorded: 0,
    totalQty: 0,
  }
  for (const color of colors || []) {
    summary.total++
    const record = inventoryByKey?.get?.(color.key)
    const state = deriveStockState(record)
    if (state === STOCK_STATE.UNRECORDED) {
      summary.unrecorded++
      continue
    }
    summary.recorded++
    if (state === STOCK_STATE.LOW) summary.low++
    else if (state === STOCK_STATE.OUT) summary.out++
    else summary.owned++
    // 只有已知数量才计入合计;未知不能按 0 累加,否则「合计」会骗人
    if (typeof record?.quantity === 'number') summary.totalQty += record.quantity
  }
  return summary
}

/** 状态 → i18n 键(文案在组件里拼数量,这里只给标签部分) */
export const STOCK_STATE_LABEL_KEY = Object.freeze({
  [STOCK_STATE.UNRECORDED]: 'myBeads.inventory.state.unrecorded',
  [STOCK_STATE.OWNED_UNKNOWN]: 'myBeads.inventory.state.ownedUnknown',
  [STOCK_STATE.OWNED_QTY]: 'myBeads.inventory.state.ownedQty',
  [STOCK_STATE.LOW]: 'myBeads.inventory.state.low',
  [STOCK_STATE.OUT]: 'myBeads.inventory.state.out',
})
