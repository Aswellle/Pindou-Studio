/**
 * 导出后扣减库存(规格 05 §3:只有用户主动开启「完成一张作品后记账」才执行)。
 *
 * 规则:
 *   - 默认关闭,必须由用户显式打开;
 *   - 只在**导出成功后**执行,导出失败不动库存;
 *   - 扣减量 = 该颜色在图纸里的实际颗数(与导出口径同源);
 *   - 数量未知(null)的库存不参与扣减 —— 未知 ≠ 0,不能凭空减成负数;
 *   - 扣到 0 时状态置为 out_of_stock,其余保持原状态;
 *   - 返回逐色变更明细,调用方据此写库存并提示用户。
 *
 * 纯函数,不做 I/O。
 */

import { collectColorStats } from '../../utils/selectionUtils'
import { normalizeHex, paletteKeyForBuiltin, paletteKeyForUser } from './personalPalette'

/**
 * 计算扣减计划。
 *
 * @param {object} opts
 * @param {Array<Array<string|null>>} opts.canvasData
 * @param {Map<string, object>|Array<object>} opts.inventory - 按 paletteKey 索引或记录数组
 * @param {string} opts.paletteId - 当前色卡 id
 * @param {'builtin'|'user'} opts.paletteKind - 色卡归属
 * @param {(hex:string) => {id:string}|null} opts.resolveColor
 *        把图纸 HEX 解析为目标色卡颜色(通常传 createBrandColorResolver 的 resolve)
 * @returns {{ entries: Array<{paletteKey:string, colorId:string, hex:string, used:number,
 *            before:number, after:number, status:string}>, skippedUnknown: number,
 *            totalDeducted: number }}
 */
export function planInventoryDeduction({
  canvasData,
  inventory,
  paletteId,
  paletteKind,
  resolveColor,
}) {
  const stats = collectColorStats(canvasData)
  const inv = toMap(inventory)
  const entries = []
  let skippedUnknown = 0
  let totalDeducted = 0

  for (const { hex, count } of stats) {
    const normalized = normalizeHex(hex) || hex
    const color = resolveColor ? resolveColor(normalized) : null
    if (!color || color.id == null) continue

    const paletteKey = paletteKind === 'user'
      ? paletteKeyForUser(paletteId, color.id)
      : paletteKeyForBuiltin(paletteId, color.id)

    const rec = inv.get(paletteKey)
    // 没有记录 / 数量未知:不扣减(未知不是 0,扣了会变成负数)
    if (!rec || rec.quantity === null || rec.quantity === undefined) {
      skippedUnknown++
      continue
    }
    const before = Math.max(0, Math.trunc(Number(rec.quantity)))
    if (before === 0) continue
    const used = count
    const after = Math.max(0, before - used)
    const status = after === 0 ? 'out_of_stock' : (rec.status === 'out_of_stock' ? 'owned' : rec.status)
    entries.push({
      paletteKey,
      colorId: color.id,
      hex: normalized,
      used,
      before,
      after,
      status,
    })
    totalDeducted += before - after
  }

  return { entries, skippedUnknown, totalDeducted }
}

function toMap(inventory) {
  if (!inventory) return new Map()
  if (inventory instanceof Map) return inventory
  if (Array.isArray(inventory)) {
    const m = new Map()
    for (const i of inventory) if (i?.paletteKey) m.set(i.paletteKey, i)
    return m
  }
  return new Map(Object.entries(inventory))
}

/**
 * 把扣减计划逐条写回库存。写入失败不中断其余条目,返回成功/失败计数,
 * 由调用方如实提示(规格 05:不允许静默丢失)。
 *
 * @param {{entries: Array}} plan - planInventoryDeduction 的返回值
 * @param {(payload: object) => Promise<{ok: boolean}>} setInventory
 * @returns {Promise<{ok: number, failed: number}>}
 */
export async function applyInventoryDeduction(plan, setInventory) {
  let ok = 0
  let failed = 0
  for (const entry of plan?.entries || []) {
    const res = await setInventory({
      paletteKey: entry.paletteKey,
      paletteColorId: null,
      quantity: entry.after,
      status: entry.status,
    })
    if (res?.ok) ok++
    else failed++
  }
  return { ok, failed }
}

/**
 * 「导出成功后记账」的完整流程:开关判断 → 计算计划 → 逐条写回。
 *
 * 开关判断放在这里而不是调用方,是为了让「默认关闭时一个库存都不写」
 * 成为可测试的契约,而不是散落在组件里的 if。
 *
 * @param {object} opts - 同 planInventoryDeduction,外加 enabled 开关
 * @param {(payload: object) => Promise<{ok: boolean}>} setInventory
 * @returns {Promise<{skipped: boolean, entries: Array, skippedUnknown: number,
 *          totalDeducted: number, ok: number, failed: number}>}
 */
export async function runInventoryDeduction({ enabled, ...planOpts }, setInventory) {
  if (!enabled) {
    return { skipped: true, entries: [], skippedUnknown: 0, totalDeducted: 0, ok: 0, failed: 0 }
  }
  const plan = planInventoryDeduction(planOpts)
  if (plan.entries.length === 0) {
    return { skipped: false, ...plan, ok: 0, failed: 0 }
  }
  const { ok, failed } = await applyInventoryDeduction(plan, setInventory)
  return { skipped: false, ...plan, ok, failed }
}
