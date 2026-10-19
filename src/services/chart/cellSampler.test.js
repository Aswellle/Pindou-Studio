import { describe, it, expect } from 'vitest'
import {
  sampleGridColors,
  mapCellsToPalette,
  estimateBackground,
  countUncertain,
  DEFAULT_BLANK_DELTA_E,
  UNCERTAIN_DELTA_E,
} from './cellSampler'

const RED = [229, 57, 53]
const BLUE = [66, 165, 245]
const WHITE = [255, 255, 255]
const LINE = [30, 30, 30]

/**
 * 造一张 2×2 的图纸:cell=20,1px 网格线,四角白底(用于背景估计)。
 * 格子颜色由 cellColors[y][x] 指定。
 */
function makeChart(cellColors, { cell = 20, margin = 12 } = {}) {
  const rows = cellColors.length
  const cols = cellColors[0].length
  const width = cols * cell + margin * 2 + 1
  const height = rows * cell + margin * 2 + 1
  const data = new Uint8ClampedArray(width * height * 4)
  const fill = (x, y, [r, g, b]) => {
    const o = (y * width + x) * 4
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) fill(x, y, WHITE)
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          fill(margin + gx * cell + x, margin + gy * cell + y, cellColors[gy][gx])
        }
      }
    }
  }
  for (let gy = 0; gy <= rows; gy++) {
    const y = margin + gy * cell
    for (let x = margin; x <= margin + cols * cell && x < width; x++) fill(x, y, LINE)
  }
  for (let gx = 0; gx <= cols; gx++) {
    const x = margin + gx * cell
    for (let y = margin; y <= margin + rows * cell && y < height; y++) fill(x, y, LINE)
  }
  const bounds = { x0: margin, y0: margin, x1: margin + cols * cell, y1: margin + rows * cell }
  return { imageData: { data, width, height }, bounds, cols, rows, cell }
}

const PALETTE = [
  { id: 'P24', hex: '#E53935', rgb: { r: 229, g: 57, b: 53 } },
  { id: 'P31', hex: '#42A5F5', rgb: { r: 66, g: 165, b: 245 } },
  { id: 'P01', hex: '#F2F2F2', rgb: { r: 242, g: 242, b: 242 } },
]

describe('cellSampler · 采样', () => {
  it('每格取中心区域颜色,不被网格线污染', () => {
    const chart = makeChart([
      [RED, BLUE],
      [BLUE, RED],
    ])
    const res = sampleGridColors(chart.imageData, chart.bounds, chart.cols, chart.rows)
    expect(res.cells).toEqual([
      ['#E53935', '#42A5F5'],
      ['#42A5F5', '#E53935'],
    ])
    expect(res.blankRatio).toBe(0)
  })

  it('与背景接近的格子判为空白', () => {
    const chart = chartImage()
    const bg = estimateBackground(chart.imageData)
    const res = sampleGridColors(chart.imageData, chart.bounds, chart.cols, chart.rows, { background: bg })
    // 第 2 行第 2 格是白色 → null
    expect(res.cells[1][1]).toBeNull()
    expect(res.cells[0][0]).toBe('#E53935')
  })

  it('传 background: null 时不判空白', () => {
    const chart = chartImage()
    const res = sampleGridColors(chart.imageData, chart.bounds, chart.cols, chart.rows, { background: null })
    expect(res.cells[1][1]).not.toBeNull()
  })

  it('无效输入返回空结果而不是抛错', () => {
    expect(sampleGridColors(null, null, 2, 2).cells).toEqual([])
    expect(sampleGridColors({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, null, 1, 1).cells).toEqual([])
  })

  function chartImage() {
    return makeChart([
      [RED, BLUE],
      [BLUE, WHITE],
    ])
  }
})

describe('cellSampler · 背景估计', () => {
  it('取四角中位数作为背景色', () => {
    const chart = makeChart([
      [RED, BLUE],
      [BLUE, RED],
    ])
    const bg = estimateBackground(chart.imageData)
    expect(bg).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('cellSampler · 映射到色卡', () => {
  it('按 CIEDE2000 映射并返回色号与色差', () => {
    const res = mapCellsToPalette(
      [['#E53935', '#42A5F5'], [null, '#F0F0F0']],
      PALETTE,
    )
    expect(res.cells).toEqual([
      ['P24', 'P31'],
      [null, 'P01'],
    ])
    expect(res.hexCells[0][0]).toBe('#E53935')
    expect(res.deltaEs[0][0]).toBeCloseTo(0, 3)
    expect(res.deltaEs[1][0]).toBeNull()
    expect(res.colorIds).toEqual(['P24', 'P31', 'P01'])
  })

  it('相同采样色只计算一次(结果一致)', () => {
    const res = mapCellsToPalette([['#E53935', '#E53935', '#E53935']], PALETTE)
    expect(res.cells[0]).toEqual(['P24', 'P24', 'P24'])
  })

  it('色差超过阈值时计入不确定格子', () => {
    const deltaEs = [[0, 2], [UNCERTAIN_DELTA_E + 1, null]]
    expect(countUncertain(deltaEs)).toBe(1)
    expect(countUncertain([[DEFAULT_BLANK_DELTA_E, DEFAULT_BLANK_DELTA_E]])).toBe(0)
  })

  it('非法 hex 不产生假颜色', () => {
    const res = mapCellsToPalette([['#XYZ', null]], PALETTE)
    expect(res.cells[0]).toEqual([null, null])
    expect(res.colorIds).toEqual([])
  })
})
