/**
 * 豆子数量计算器(纯函数)。
 *
 * 用户真正要回答的问题是「这张图纸大概要买多少颗豆子」。网格尺寸与空置比例
 * 就够给出量级正确的估算;精确值只有图纸本身知道(非空格数),
 * 所以页面明确把它标成估算,并给出去图纸页核对实际颗数的入口。
 */

/** 应用支持的常用方形网格尺寸(与画布预设一致) */
export const GRID_PRESETS = [29, 57, 87, 114, 140, 170]

/** 单边上限:超过它的输入多半是误填,直接夹住而不是算出天文数字 */
export const MAX_GRID = 500

/**
 * 解析一维网格输入。
 * @returns {number|null} 1–500 的整数;非法输入返回 null(页面显示空态而不是 0)
 */
export function parseGridValue(value) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(n, MAX_GRID)
}

/**
 * 估算用豆量。
 *
 * @param {object} input
 * @param {number|string} input.width 网格宽(格)
 * @param {number|string} input.height 网格高(格)
 * @param {number} [input.fillRatio] 实际填充比例 0–1(非空格占比)
 * @param {number} [input.colorCount] 颜色数,用于估算每色平均用量
 * @returns {{cols:number,rows:number,cells:number,fill:number,beads:number,perColor:number|null}|null}
 */
export function beadEstimate({ width, height, fillRatio = 1, colorCount = 0 } = {}) {
  const cols = parseGridValue(width)
  const rows = parseGridValue(height)
  if (!cols || !rows) return null

  const rawFill = Number(fillRatio)
  const fill = Number.isFinite(rawFill) ? Math.min(1, Math.max(0, rawFill)) : 1
  const cells = cols * rows
  const beads = Math.round(cells * fill)

  const colors = Math.floor(Number(colorCount))
  const perColor = Number.isFinite(colors) && colors > 0 ? Math.ceil(beads / colors) : null

  return { cols, rows, cells, fill, beads, perColor }
}

/** 常见网格尺寸的用量表(静态正文与页面共用) */
export function beadPresetRows() {
  return GRID_PRESETS.map(size => {
    const cells = size * size
    return {
      size,
      cells,
      filled80: Math.round(cells * 0.8),
      filled60: Math.round(cells * 0.6),
    }
  })
}
