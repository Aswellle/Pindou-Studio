import { describe, it, expect } from 'vitest'
import { detectChartGrid, DETECT_MIN_CELL, DETECT_MAX_GRID } from './gridDetector'

/**
 * 合成一张「拼豆图纸截图」:
 *   - 白底
 *   - cols × rows 个格子,每格一种颜色
 *   - 每格边界画 1px 深色网格线
 *   - 可选外边距(margin)模拟图纸留白
 */
function makeChart({
  cols = 12,
  rows = 8,
  cell = 20,
  margin = 30,
  lineColor = [30, 30, 30],
  palette = [
    [229, 57, 53], [66, 165, 245], [102, 187, 106],
    [255, 202, 40], [171, 71, 188], [255, 255, 255],
  ],
} = {}) {
  // +1:保证最后一条右边/下边网格线也落在图像内(真实截图同样如此)
  const width = cols * cell + margin * 2 + 1
  const height = rows * cell + margin * 2 + 1
  const data = new Uint8ClampedArray(width * height * 4)
  const fill = (x, y, [r, g, b]) => {
    const o = (y * width + x) * 4
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) fill(x, y, [250, 250, 250])
  }
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const color = palette[(gx * 3 + gy * 5) % palette.length]
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          fill(margin + gx * cell + x, margin + gy * cell + y, color)
        }
      }
    }
  }
  // 网格线(画在每格的左/上边界,外加最后一条右边/下边)
  for (let gy = 0; gy <= rows; gy++) {
    const y = margin + gy * cell
    if (y >= height) continue
    for (let x = margin; x < margin + cols * cell + 1 && x < width; x++) fill(x, y, lineColor)
  }
  for (let gx = 0; gx <= cols; gx++) {
    const x = margin + gx * cell
    if (x >= width) continue
    for (let y = margin; y < margin + rows * cell + 1 && y < height; y++) fill(x, y, lineColor)
  }
  return { data, width, height }
}

describe('gridDetector · 正常图纸', () => {
  it('识别出列数、行数与网格边界', () => {
    const img = makeChart({ cols: 12, rows: 8, cell: 20, margin: 30 })
    const res = detectChartGrid(img)
    expect(res.ok).toBe(true)
    expect(res.cols).toBe(12)
    expect(res.rows).toBe(8)
    expect(res.bounds.x0).toBe(30)
    expect(res.bounds.y0).toBe(30)
    expect(res.bounds.x1).toBe(30 + 12 * 20)
    expect(res.bounds.y1).toBe(30 + 8 * 20)
    expect(res.cellWidth).toBeCloseTo(20, 5)
    expect(res.cellHeight).toBeCloseTo(20, 5)
    expect(res.status).toBe('auto')
  })

  it('矩形图纸不被当成正方形', () => {
    const res = detectChartGrid(makeChart({ cols: 20, rows: 5, cell: 16, margin: 10 }))
    expect(res.ok).toBe(true)
    expect(res.cols).toBe(20)
    expect(res.rows).toBe(5)
  })

  it('没有外边距时从第一像素开始也能识别', () => {
    const res = detectChartGrid(makeChart({ cols: 10, rows: 10, cell: 24, margin: 0 }))
    expect(res.ok).toBe(true)
    expect(res.cols).toBe(10)
    expect(res.rows).toBe(10)
  })
})

describe('gridDetector · 失败必须可解释', () => {
  it('纯色图没有周期性', () => {
    const width = 200
    const height = 150
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    const res = detectChartGrid({ data, width, height })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('failed')
    expect(res.reason).toBe('noPeriodicity')
  })

  it('图片尺寸过小', () => {
    const res = detectChartGrid({ data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('invalidImage')
  })

  it('像素数据长度与宽高不符', () => {
    const res = detectChartGrid({ data: new Uint8ClampedArray(10), width: 100, height: 100 })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('invalidImage')
  })

  it('超过最大网格数时拒绝而不是截断', () => {
    const res = detectChartGrid(
      makeChart({ cols: 20, rows: 20, cell: 10, margin: 5 }),
      { maxGrid: 15 },
    )
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('gridTooLarge')
    expect(res.cols).toBe(20)
    expect(res.rows).toBe(20)
  })

  it('格子小于最小尺寸时拒绝', () => {
    const res = detectChartGrid(makeChart({ cols: 10, rows: 10, cell: 3, margin: 2 }), { minCell: DETECT_MIN_CELL })
    expect(res.ok).toBe(false)
  })
})

describe('gridDetector · 默认上限', () => {
  it('DETECT_MAX_GRID 与画布上限一致', () => {
    expect(DETECT_MAX_GRID).toBe(200)
  })
})
