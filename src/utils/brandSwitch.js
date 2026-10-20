/**
 * 品牌切换:把画布上的 HEX 真正迁移到目标品牌色卡(规格 04 §4)。
 *
 * 背景:
 *   切换色卡此前只改「色号解析口径」——画布矩阵里仍是旧品牌的 HEX,
 *   导出时靠 CIEDE2000 就近匹配出目标品牌色号。用户以为换了豆子,
 *   实际拿到的是近似值,而且无法撤销、无法预览。
 *
 * 契约:
 *   - planBrandSwitch 只读,返回逐色映射与影响面,供预览;
 *   - applyBrandSwitch 一次性产出新矩阵,调用方 setCanvas 一条历史;
 *   - 空矩阵 / 目标色卡为空 / 无任何变化 → data 为 null(调用方不压栈);
 *   - 只处理合法 #RRGGBB,空白格与非 hex 脏数据原样保留。
 */

import { findClosestColor } from '../data/palettes'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * 计算「当前矩阵 → 目标品牌」的逐色映射。
 *
 * @param {Array<Array<string|null>>} canvasData
 * @param {string} targetPaletteId
 * @returns {{
 *   rows: Array<{ fromHex: string, toHex: string, count: number, toId: string, toName: string, changed: boolean }>,
 *   totalBeads: number,
 *   changedCells: number,
 *   changedColors: number,
 * }}
 */
export function planBrandSwitch(canvasData, targetPaletteId) {
  const empty = { rows: [], totalBeads: 0, changedCells: 0, changedColors: 0 }
  if (!Array.isArray(canvasData) || canvasData.length === 0) return empty

  // 按小写归并:同一颜色大小写不同视为同一种(画布历史上两种都出现过)
  const counts = new Map()
  let totalBeads = 0
  for (const row of canvasData) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      if (typeof cell !== 'string' || !HEX_RE.test(cell)) continue
      const key = cell.toLowerCase()
      counts.set(key, (counts.get(key) || 0) + 1)
      totalBeads++
    }
  }
  if (counts.size === 0) return empty

  const rows = []
  let changedCells = 0
  let changedColors = 0
  for (const [fromKey, count] of counts) {
    const match = findClosestColor(fromKey, targetPaletteId)
    if (!match) continue
    const changed = match.hex.toLowerCase() !== fromKey
    if (changed) {
      changedCells += count
      changedColors++
    }
    rows.push({
      fromHex: fromKey,
      toHex: match.hex,
      count,
      toId: match.id,
      toName: match.nameZh || match.name || match.id,
      changed,
    })
  }

  rows.sort((a, b) => b.count - a.count || a.fromHex.localeCompare(b.fromHex))
  return { rows, totalBeads, changedCells, changedColors }
}

/**
 * 按 plan 的映射替换矩阵中的颜色。返回新矩阵;无变化时 data 为 null。
 *
 * @param {Array<Array<string|null>>} canvasData
 * @param {Array<{fromHex: string, toHex: string}>} rows - planBrandSwitch().rows
 * @returns {{ data: Array<Array<string|null>>|null, changed: number }}
 */
export function applyBrandSwitch(canvasData, rows) {
  if (!Array.isArray(canvasData) || !Array.isArray(rows) || rows.length === 0) {
    return { data: null, changed: 0 }
  }
  const map = new Map()
  for (const row of rows) {
    if (row.fromHex && row.toHex && row.fromHex.toLowerCase() !== row.toHex.toLowerCase()) {
      map.set(row.fromHex.toLowerCase(), row.toHex)
    }
  }
  if (map.size === 0) return { data: null, changed: 0 }

  let changed = 0
  const data = canvasData.map((row) => {
    if (!Array.isArray(row)) return row
    return row.map((cell) => {
      if (typeof cell !== 'string') return cell
      const to = map.get(cell.toLowerCase())
      if (to === undefined) return cell
      changed++
      return to
    })
  })
  return changed ? { data, changed } : { data: null, changed: 0 }
}
