/**
 * 图纸整理(编辑器「整理」面板)的纯函数:删色、合并相近色、裁切。
 *
 * 三条约束与既有命令层保持一致:
 *   · 纯函数,不改入参(调用方拿返回值走 setCanvas / resetCanvas);
 *   · 只处理 `#RRGGBB` 字符串与 null,其它脏值原样放过;
 *   · 一次整理 = 一次事务(删色/减色推一条历史;裁切重建画布并重置历史,
 *     与「换网格」同语义,由 App 侧执行)。
 */

import { collectColorStats } from './selectionUtils'
import { hexToRgb } from '../services/colorUtils'
import { rgbToLab, ciede2000 } from './colorDiff'

function dims(canvasData) {
  const rows = Array.isArray(canvasData) ? canvasData.length : 0
  const cols = rows > 0 && Array.isArray(canvasData[0]) ? canvasData[0].length : 0
  return { rows, cols }
}

function isHex(cell) {
  return typeof cell === 'string' && /^#[0-9a-fA-F]{6}$/.test(cell)
}

/**
 * 删除一种颜色:该色的所有珠子清成空白,其余颜色不动。
 * @returns {{data:Array<Array<string|null>>, removed:number}|null} 没有命中返回 null
 */
export function removeCanvasColor(canvasData, hex) {
  if (!isHex(hex) || !Array.isArray(canvasData)) return null
  const needle = hex.toLowerCase()
  let removed = 0
  const data = canvasData.map(row =>
    row.map(cell => {
      if (isHex(cell) && cell.toLowerCase() === needle) {
        removed += 1
        return null
      }
      return cell
    })
  )
  return removed > 0 ? { data, removed } : null
}

/**
 * 合并相近色:保留用量最多的 keepCount 种颜色,其余颜色逐色并按 CIEDE2000
 * 归并到最近的一种保留色。颗数不变,只减少买豆种类。
 *
 * 保留的是「画布上实际使用的颜色」而不是整张品牌色卡 —— 从图纸用色里选代表色
 * 才能保证结果仍然是用户已经买过/看得惯的那几种豆。
 *
 * @param {Array<Array<string|null>>} canvasData
 * @param {{keepCount:number}} options
 * @returns {{data:Array, before:number, after:number, mapping:Map<string,string>}|null}
 */
export function reduceCanvasColors(canvasData, { keepCount } = {}) {
  const { rows } = dims(canvasData)
  if (rows === 0 || !Number.isInteger(keepCount) || keepCount < 1) return null

  const stats = collectColorStats(canvasData)
  if (stats.length <= keepCount) return null

  const kept = stats.slice(0, keepCount).map(c => {
    const { r, g, b } = hexToRgb(c.hex)
    return { hex: c.hex, lab: rgbToLab(r, g, b) }
  })
  const mapping = new Map()
  for (const c of stats.slice(keepCount)) {
    const { r, g, b } = hexToRgb(c.hex)
    const lab = rgbToLab(r, g, b)
    let best = kept[0]
    let bestDelta = Number.POSITIVE_INFINITY
    for (const k of kept) {
      const delta = ciede2000(lab, k.lab)
      if (delta < bestDelta) {
        bestDelta = delta
        best = k
      }
    }
    mapping.set(c.hex.toLowerCase(), best.hex)
  }

  const data = canvasData.map(row =>
    row.map(cell => {
      if (!isHex(cell)) return cell
      return mapping.get(cell.toLowerCase()) || cell
    })
  )
  return { data, before: stats.length, after: kept.length, mapping }
}

/**
 * 按外接框裁切;越界部分自动钳制到画布内。
 * @returns {{data:Array, width:number, height:number, offsetX:number, offsetY:number}|null}
 */
export function cropCanvas(canvasData, bounds) {
  const { rows, cols } = dims(canvasData)
  if (rows === 0 || cols === 0 || !bounds) return null
  const x = Math.max(0, Math.floor(bounds.x))
  const y = Math.max(0, Math.floor(bounds.y))
  const width = Math.min(cols - x, Math.floor(bounds.w))
  const height = Math.min(rows - y, Math.floor(bounds.h))
  if (width <= 0 || height <= 0) return null

  const data = canvasData.slice(y, y + height).map(row => row.slice(x, x + width))
  return { data, width, height, offsetX: x, offsetY: y }
}

/**
 * 裁到内容边界:去掉四周全空的边,padding 为额外保留的空白格。
 * 画布全空时返回 null(没有可裁的内容)。
 */
export function cropCanvasToContent(canvasData, { padding = 0 } = {}) {
  const { rows, cols } = dims(canvasData)
  if (rows === 0 || cols === 0) return null

  let minX = cols
  let minY = rows
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!canvasData[y][x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX) return null

  const pad = Math.max(0, Math.floor(Number(padding) || 0))
  return cropCanvas(canvasData, {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + 1 + pad * 2,
    h: maxY - minY + 1 + pad * 2,
  })
}
