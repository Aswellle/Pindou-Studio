/**
 * 图纸颜色 → 目标色卡 + 库存的匹配服务(M6)。
 *
 * 输入是画布矩阵(或已统计的颜色用量)、目标色卡颜色列表、库存记录;
 * 输出每种颜色的匹配结果(目标色号、ΔE00、需求/库存/短缺、状态)。
 *
 * 规则(对应 docs/agent-spec/05 §4):
 *   1. 精确 HEX 命中优先(ΔE00 = 0);
 *   2. 否则用 CIEDE2000 找最近色 —— 复用 utils/colorDiff 的颜色科学函数,
 *      不在这里重复实现;
 *   3. 尺寸/材料不兼容时先排除,不能默认把 2.6mm 与 5mm 混用;
 *   4. 阈值可配置,默认 6(ΔE00 > 6 视为较大色差 poor-match,需用户确认);
 *   5. 库存未知(null)不等于缺货:两者是不同状态,未知时不给 shortageCount;
 *   6. poor-match 不自动替换。
 *
 * 本文件是纯函数,不做 I/O。
 */

import { rgbToLab, ciede2000 } from '../../utils/colorDiff'
import { hexToRgb } from '../colorUtils'
import { collectColorStats } from '../../utils/selectionUtils'
import { normalizeHex } from './personalPalette'

/** 颜色匹配状态(与规格书 mappingStatus 取值一一对应) */
export const MAPPING_STATUS = Object.freeze({
  EXACT: 'exact',
  CLOSE: 'close',
  POOR: 'poor-match',
  MISSING: 'missing',
  INCOMPATIBLE_SIZE: 'incompatible-size',
  UNKNOWN_INVENTORY: 'unknown-inventory',
})

/** 仅描述颜色本身的匹配质量(与库存无关,便于 UI 单独展示色差徽章) */
export const COLOR_STATUS = Object.freeze({
  EXACT: 'exact',
  CLOSE: 'close',
  POOR: 'poor-match',
  MISSING: 'missing',
})

export const STOCK_STATUS = Object.freeze({
  UNKNOWN: 'unknown',
  SUFFICIENT: 'sufficient',
  SHORTAGE: 'shortage',
  OUT_OF_STOCK: 'out-of-stock',
})

/**
 * 默认阈值。ΔE00 ≈ 1 为刚好可察觉,≈ 5 为明显但同色系。
 * 6 是保守取值:超过它就不应静默替换,交给用户确认。
 * 这是工程默认值,不是"客观正确"的结论(规格书明确要求可调)。
 */
export const DEFAULT_CLOSE_THRESHOLD = 6

/** 尺寸比较容差(mm):2.6 与 2.60 视为相同 */
const SIZE_EPSILON = 0.05

function isUsableSize(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0
}

/**
 * 目标色卡候选:统一成 { id, code, name, hex, beadSizeMm }。
 * 内置色卡用 id 作色号;个人色卡用 code。
 */
export function normalizeCandidates(colors, { beadSizeMm = null } = {}) {
  const out = []
  for (const c of colors || []) {
    if (!c) continue
    const hex = normalizeHex(c.hex)
    if (!hex) continue
    out.push({
      id: String(c.id ?? c.code ?? ''),
      code: String(c.code ?? c.id ?? ''),
      name: typeof c.name === 'string' && c.name ? c.name : String(c.code ?? c.id ?? ''),
      hex,
      beadSizeMm: isUsableSize(c.beadSizeMm) ? Number(c.beadSizeMm) : beadSizeMm,
    })
  }
  return out
}

/**
 * 计算每种源颜色的匹配结果。
 *
 * @param {object} opts
 * @param {Array<Array<string|null>>} opts.canvasData - 画布矩阵(只读)
 * @param {Array} opts.candidates - 目标色卡颜色(见 normalizeCandidates)
 * @param {Map<string, object>|object} [opts.inventory] - 按目标颜色 id 索引:
 *        { quantity: number|null, status?: 'owned'|'low'|'out_of_stock' }
 * @param {number|null} [opts.requiredBeadSizeMm] - 图纸要求的豆子直径
 * @param {number} [opts.closeThreshold] - ΔE00 阈值,默认 6
 */
export function matchCanvasToInventory({
  canvasData,
  candidates,
  inventory = null,
  requiredBeadSizeMm = null,
  closeThreshold = DEFAULT_CLOSE_THRESHOLD,
}) {
  const stats = collectColorStats(canvasData)
  return matchColorStats({ stats, candidates, inventory, requiredBeadSizeMm, closeThreshold })
}

/**
 * 同 matchCanvasToInventory,但接受已统计好的 [{ hex, count }]。
 * 采购清单/重新计算时复用,避免重复扫描矩阵。
 */
export function matchColorStats({
  stats,
  candidates,
  inventory = null,
  requiredBeadSizeMm = null,
  closeThreshold = DEFAULT_CLOSE_THRESHOLD,
}) {
  const normalized = normalizeCandidates(candidates)
  const inv = toInventoryMap(inventory)

  // 尺寸兼容:目标色卡与图纸要求都已知且不一致 → 整张色卡不可用。
  // 个人色卡未填直径时不做判断(未知 ≠ 不兼容)。
  const sizeMismatch = isUsableSize(requiredBeadSizeMm)
    && normalized.length > 0
    && normalized.every((c) => isUsableSize(c.beadSizeMm))
    && normalized.every((c) => Math.abs(c.beadSizeMm - Number(requiredBeadSizeMm)) > SIZE_EPSILON)

  const candidateLabs = normalized.map((c) => {
    const rgb = hexToRgb(c.hex)
    return rgbToLab(rgb.r, rgb.g, rgb.b)
  })

  const items = (stats || []).map(({ hex, count }) => {
    const sourceHex = normalizeHex(hex) || hex
    const requiredCount = count
    const base = {
      sourceHex,
      requiredCount,
      targetColor: null,
      deltaE00: null,
      stockCount: null,
      shortageCount: null,
      mappingStatus: MAPPING_STATUS.MISSING,
      colorStatus: COLOR_STATUS.MISSING,
      stockStatus: STOCK_STATUS.UNKNOWN,
      autoApplicable: false,
    }

    if (sizeMismatch) {
      return {
        ...base,
        mappingStatus: MAPPING_STATUS.INCOMPATIBLE_SIZE,
        autoApplicable: false,
      }
    }
    if (normalized.length === 0) return base

    // 1) 精确命中(HEX 大小写不敏感,normalizeCandidates 已统一大写)
    let best = null
    let bestDelta = Infinity
    const sourceRgb = hexToRgb(sourceHex)
    const sourceLab = rgbToLab(sourceRgb.r, sourceRgb.g, sourceRgb.b)
    for (let i = 0; i < normalized.length; i++) {
      const d = ciede2000(sourceLab, candidateLabs[i])
      if (d < bestDelta) { bestDelta = d; best = normalized[i] }
    }
    if (!best) return base

    const colorStatus = bestDelta === 0
      ? COLOR_STATUS.EXACT
      : (bestDelta <= closeThreshold ? COLOR_STATUS.CLOSE : COLOR_STATUS.POOR)

    // 2) 库存:quantity === null 表示"未记录数量",不是 0
    const record = inv.get(best.id) || null
    const stockCount = record && record.quantity !== null && record.quantity !== undefined
      ? Math.max(0, Math.trunc(Number(record.quantity)))
      : null
    let stockStatus = STOCK_STATUS.UNKNOWN
    if (stockCount !== null) {
      if (stockCount === 0) stockStatus = STOCK_STATUS.OUT_OF_STOCK
      else if (stockCount < requiredCount) stockStatus = STOCK_STATUS.SHORTAGE
      else stockStatus = STOCK_STATUS.SUFFICIENT
    }
    // 只在库存已知时计算短缺;未知 ≠ 缺货,不能按 0 处理
    const shortageCount = stockCount === null ? null : Math.max(0, requiredCount - stockCount)

    // 3) 综合状态:可执行的阻塞原因优先于"匹配得多准"
    let mappingStatus
    if (colorStatus === COLOR_STATUS.POOR) mappingStatus = MAPPING_STATUS.POOR
    else if (stockStatus === STOCK_STATUS.UNKNOWN) mappingStatus = MAPPING_STATUS.UNKNOWN_INVENTORY
    else if (colorStatus === COLOR_STATUS.EXACT) mappingStatus = MAPPING_STATUS.EXACT
    else mappingStatus = MAPPING_STATUS.CLOSE

    return {
      sourceHex,
      requiredCount,
      targetColor: best,
      deltaE00: Math.round(bestDelta * 100) / 100,
      stockCount,
      shortageCount,
      mappingStatus,
      colorStatus,
      stockStatus,
      // 批量"仅自动接受精确/接近匹配":只看颜色质量,库存不足由用户另行决定
      autoApplicable: colorStatus === COLOR_STATUS.EXACT || colorStatus === COLOR_STATUS.CLOSE,
    }
  })

  return {
    items,
    summary: summarize(items),
  }
}

function toInventoryMap(inventory) {
  if (!inventory) return new Map()
  if (inventory instanceof Map) return inventory
  return new Map(Object.entries(inventory))
}

export function summarize(items) {
  const byStatus = {}
  let required = 0
  let shortage = 0
  for (const it of items || []) {
    byStatus[it.mappingStatus] = (byStatus[it.mappingStatus] || 0) + 1
    required += it.requiredCount || 0
    if (it.shortageCount) shortage += it.shortageCount
  }
  return {
    colorCount: (items || []).length,
    requiredBeads: required,
    shortageBeads: shortage,
    byStatus,
  }
}

/**
 * 一次性应用替换映射(单个事务)。
 * - 空白格永远不动;
 * - 同时映射:同一次调用里 A→B、B→C 时,A 变成 B、B 变成 C(而非 A 变 C),
 *   避免链式替换互相吞并;
 * - 返回 { data: null, changed: 0 } 表示没有变化,调用方不应压历史。
 *
 * @param {Array<Array<string|null>>} canvasData
 * @param {Array<{ from: string, to: string }>} entries
 */
export function applyColorMapping(canvasData, entries) {
  if (!Array.isArray(canvasData) || canvasData.length === 0) return { data: null, changed: 0 }
  const map = new Map()
  for (const e of entries || []) {
    const from = normalizeHex(e?.from)
    const to = normalizeHex(e?.to)
    if (!from || !to || from === to) continue
    map.set(from, to)
  }
  if (map.size === 0) return { data: null, changed: 0 }

  let changed = 0
  const next = canvasData.map((row) => row.map((cell) => {
    const hex = normalizeHex(cell)
    if (!hex) return cell // 空白格 / 非法旧值原样保留
    const to = map.get(hex)
    if (to === undefined || to === hex) return cell
    changed++
    return to
  }))
  return changed ? { data: next, changed } : { data: null, changed: 0 }
}

/**
 * 采购清单:只保留需要采购(库存已知且不足 / 缺货)的颜色,
 * 按色号排序(规格书要求"按品牌色号排序")。
 * 库存未知的颜色单独归入 unknown,不冒充缺货。
 */
export function buildShoppingList(items) {
  const need = []
  const unknown = []
  for (const it of items || []) {
    if (!it.targetColor) continue
    if (it.stockStatus === STOCK_STATUS.UNKNOWN) unknown.push(it)
    else if (it.shortageCount > 0) need.push(it)
  }
  const byCode = (a, b) => String(a.targetColor.code).localeCompare(
    String(b.targetColor.code), undefined, { numeric: true, sensitivity: 'base' }
  )
  need.sort(byCode)
  unknown.sort(byCode)
  return {
    need,
    unknown,
    totalShortage: need.reduce((n, it) => n + it.shortageCount, 0),
  }
}
