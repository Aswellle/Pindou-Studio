/**
 * cellSampler — 按网格采样每个格子的颜色,并映射到品牌色卡。
 *
 * 纯函数(输入 RGBA 像素),与 gridDetector 配套:
 *   gridDetector 给出「网格线在哪」,本模块负责「每格是什么颜色」。
 *
 * 采样策略(对应 docs/agent-spec/03 §4B 第 4–5 步):
 *   - 每格只取**中心区域**(默认 50%),避开网格线、色号文字和珠子高光边缘;
 *   - 用中位数而不是均值:中心区域偶尔混入色号文字/高光时,中位数更稳;
 *   - 与背景色接近且占比高的格子判为空白(null)—— 图纸截图的白底不应变成一墙白珠;
 *   - 映射到色卡用 CIEDE2000(复用 utils/colorDiff),并保留 deltaE 供 UI 标注不确定格子;
 *   - 返回的可选颜色对象带色号与 hex,方便 UI 显示「P18 #F0B08A」。
 */

import { rgbToLab, ciede2000 } from '../../utils/colorDiff'

/** 默认采样中心区域比例(0.5 = 中心 50% 宽高) */
export const DEFAULT_SAMPLE_RATIO = 0.5
/** 默认空白判定:与背景色 CIEDE2000 距离小于该值视为空白 */
export const DEFAULT_BLANK_DELTA_E = 12
/** deltaE 超过该值标记为「不确定」,UI 应提示用户复核 */
export const UNCERTAIN_DELTA_E = 12

function clampRatio(v) {
  if (!Number.isFinite(v)) return DEFAULT_SAMPLE_RATIO
  return Math.min(0.9, Math.max(0.1, v))
}

function median(arr) {
  if (!arr.length) return 0
  const s = arr.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/**
 * 估算图纸背景色:取四角 12% 区域像素的中位数。
 * 纯白纸/纯深色底都能覆盖;若四角本身是图案,这个估计会偏,
 * 但空白判定只是辅助,用户可随时把某格手动标记为空白/颜色。
 */
export function estimateBackground(imageData) {
  const { data, width, height } = imageData
  const w = Math.max(1, Math.round(width * 0.12))
  const h = Math.max(1, Math.round(height * 0.12))
  const rs = []
  const gs = []
  const bs = []
  const corners = [
    [0, 0], [width - w, 0], [0, height - h], [width - w, height - h],
  ]
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        const o = (y * width + x) * 4
        if (data[o + 3] < 16) continue
        rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2])
      }
    }
  }
  if (!rs.length) return null
  return { r: median(rs), g: median(gs), b: median(bs) }
}

/**
 * 从网格采样颜色。
 *
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} imageData
 * @param {{x0:number,y0:number,x1:number,y1:number}} bounds - 网格线位置(见 gridDetector)
 * @param {number} cols
 * @param {number} rows
 * @param {Object} [options]
 * @param {number} [options.sampleRatio=0.5] - 每格采样中心区域比例
 * @param {{r:number,g:number,b:number}|null} [options.background] - 背景色;null 表示不判空白
 * @param {number} [options.blankDeltaE] - 与背景色距离小于该值判为空白
 * @returns {{ cells: Array<Array<string|null>>, hexes: string[][], blankRatio: number }}
 *   cells 为每格的采样 hex(未映射色卡),hexes 与 cells 相同(便于后续扩展保留原始采样)
 */
export function sampleGridColors(imageData, bounds, cols, rows, options = {}) {
  if (!imageData) return { cells: [], hexes: [], blankRatio: 0 }
  const { data, width, height } = imageData
  const ratio = clampRatio(options.sampleRatio)
  const background = options.background ?? null
  const blankDeltaE = options.blankDeltaE ?? DEFAULT_BLANK_DELTA_E

  if (!data || !bounds || !(cols > 0) || !(rows > 0)) {
    return { cells: [], hexes: [], blankRatio: 0 }
  }

  const cellW = (bounds.x1 - bounds.x0) / cols
  const cellH = (bounds.y1 - bounds.y0) / rows
  const cells = []
  let blank = 0

  for (let y = 0; y < rows; y++) {
    const row = []
    const cy = bounds.y0 + (y + 0.5) * cellH
    const halfH = Math.max(1, Math.round((cellH * ratio) / 2))
    const yStart = Math.max(0, Math.floor(cy - halfH))
    const yEnd = Math.min(height, Math.ceil(cy + halfH))

    for (let x = 0; x < cols; x++) {
      const cx = bounds.x0 + (x + 0.5) * cellW
      const halfW = Math.max(1, Math.round((cellW * ratio) / 2))
      const xStart = Math.max(0, Math.floor(cx - halfW))
      const xEnd = Math.min(width, Math.ceil(cx + halfW))

      const rs = []
      const gs = []
      const bs = []
      for (let py = yStart; py < yEnd; py++) {
        for (let px = xStart; px < xEnd; px++) {
          const o = (py * width + px) * 4
          if (data[o + 3] < 16) continue
          rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2])
        }
      }

      if (!rs.length) {
        row.push(null)
        blank++
        continue
      }

      const r = median(rs)
      const g = median(gs)
      const b = median(bs)
      const hex = toHex(r, g, b)

      if (background) {
        const d = ciede2000(
          rgbToLab(r, g, b),
          rgbToLab(background.r, background.g, background.b),
        )
        if (d < blankDeltaE) {
          row.push(null)
          blank++
          continue
        }
      }
      row.push(hex)
    }
    cells.push(row)
  }

  const total = cols * rows
  return {
    cells,
    hexes: cells.map((row) => row.slice()),
    blankRatio: total ? blank / total : 0,
  }
}

/**
 * 把采样 hex 映射到色卡(CIEDE2000)。
 *
 * 色卡颜色预先算好 Lab,避免每格重复转换 —— 200×200 时是 4 万次 × 色卡色数。
 *
 * @param {Array<Array<string|null>>} cells - sampleGridColors 的输出
 * @param {Array<{id:string, hex:string, rgb:{r:number,g:number,b:number}}>} paletteColors
 * @returns {{
 *   cells: Array<Array<string|null>>,     // 映射后的品牌色号(空白为 null)
 *   hexCells: Array<Array<string|null>>,  // 映射后的 hex(空白为 null)
 *   deltaEs: Array<Array<number|null>>,   // 每格色差;空白为 null
 *   colorIds: string[]                    // 本次用到的色号(去重、按首次出现排序)
 * }}
 */
export function mapCellsToPalette(cells, paletteColors) {
  const labs = paletteColors.map((c) => rgbToLab(c.rgb.r, c.rgb.g, c.rgb.b))
  // 按唯一采样色缓存:一张图纸通常只有几十种颜色,逐格比对 291 色会让
  // 140×140 的图跑上百万次 CIEDE2000。缓存后只需几十次。
  const cache = new Map()
  const match = (hex) => {
    if (cache.has(hex)) return cache.get(hex)
    const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(hex)
    let result = null
    if (m) {
      const lab = rgbToLab(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16))
      let bestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < labs.length; i++) {
        const d = ciede2000(lab, labs[i])
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      const color = paletteColors[bestIdx]
      result = { id: color.id, hex: color.hex, deltaE: bestDist }
    }
    cache.set(hex, result)
    return result
  }

  const out = []
  const hexOut = []
  const deltaOut = []
  const seen = new Set()
  const colorIds = []

  for (const row of cells) {
    const idRow = []
    const hexRow = []
    const dRow = []
    for (const hex of row) {
      const hit = hex ? match(hex) : null
      if (!hit) {
        idRow.push(null); hexRow.push(null); dRow.push(null)
        continue
      }
      idRow.push(hit.id)
      hexRow.push(hit.hex)
      dRow.push(hit.deltaE)
      if (!seen.has(hit.id)) {
        seen.add(hit.id)
        colorIds.push(hit.id)
      }
    }
    out.push(idRow)
    hexOut.push(hexRow)
    deltaOut.push(dRow)
  }

  return { cells: out, hexCells: hexOut, deltaEs: deltaOut, colorIds }
}

/**
 * 统计色差超过阈值的格子数(供 UI 提示「N 个格子建议复核」)。
 */
export function countUncertain(deltaEs, threshold = UNCERTAIN_DELTA_E) {
  let n = 0
  for (const row of deltaEs) {
    for (const d of row) if (d != null && d > threshold) n++
  }
  return n
}
