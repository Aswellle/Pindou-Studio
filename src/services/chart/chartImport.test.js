import { describe, it, expect } from 'vitest'
import { buildChartProject, analyzeChart, CHART_ERROR_CODES } from './chartImport'
import { validateProject } from '../project/projectModel'

const RED = [229, 57, 53]
const BLUE = [66, 165, 245]
const WHITE = [255, 255, 255]
const LINE = [30, 30, 30]

const PALETTE = [
  { id: 'M01', hex: '#E53935', rgb: { r: 229, g: 57, b: 53 } },
  { id: 'M02', hex: '#42A5F5', rgb: { r: 66, g: 165, b: 245 } },
  { id: 'M03', hex: '#F2F2F2', rgb: { r: 242, g: 242, b: 242 } },
]

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
  return {
    imageData: { data, width, height },
    bounds: { x0: margin, y0: margin, x1: margin + cols * cell, y1: margin + rows * cell },
    cols,
    rows,
  }
}

describe('chartImport · 端到端', () => {
  it('图片 → 检测 → 采样 → 配色 → 合法项目', () => {
    const chart = makeChart([
      [RED, BLUE, RED],
      [BLUE, RED, BLUE],
    ])
    const detection = analyzeChart(chart.imageData)
    expect(detection.ok).toBe(true)
    expect(detection.cols).toBe(3)
    expect(detection.rows).toBe(2)

    const res = buildChartProject({
      imageData: chart.imageData,
      bounds: detection.bounds,
      cols: detection.cols,
      rows: detection.rows,
      paletteColors: PALETTE,
      paletteId: 'mard',
      name: '识别测试',
      filename: 'chart.png',
    })
    expect(res.ok).toBe(true)
    expect(res.project.schemaVersion).toBe(1)
    expect(res.project.source.kind).toBe('chart-import')
    expect(res.project.source.filename).toBe('chart.png')
    expect(res.project.palette.paletteId).toBe('mard')
    expect(res.project.grid.width).toBe(3)
    expect(res.project.grid.height).toBe(2)
    expect(res.project.grid.cells).toEqual([
      ['#E53935', '#42A5F5', '#E53935'],
      ['#42A5F5', '#E53935', '#42A5F5'],
    ])
    // 产出必须能通过存储层校验
    expect(validateProject(res.project, { minDimension: 1 }).ok).toBe(true)
    expect(res.stats.colorIds).toEqual(['M01', 'M02'])
    expect(res.stats.beadCount).toBe(6)
    expect(res.stats.blankCount).toBe(0)
  })

  it('白底格子默认识别为空白', () => {
    const chart = makeChart([
      [RED, WHITE],
      [WHITE, BLUE],
    ])
    const res = buildChartProject({
      imageData: chart.imageData,
      bounds: chart.bounds,
      cols: chart.cols,
      rows: chart.rows,
      paletteColors: PALETTE,
    })
    expect(res.ok).toBe(true)
    expect(res.project.grid.cells).toEqual([
      ['#E53935', null],
      [null, '#42A5F5'],
    ])
    expect(res.stats.blankCount).toBe(2)
  })

  it('removeBackground=false 时保留所有格子', () => {
    const chart = makeChart([
      [RED, WHITE],
      [WHITE, BLUE],
    ])
    const res = buildChartProject({
      imageData: chart.imageData,
      bounds: chart.bounds,
      cols: chart.cols,
      rows: chart.rows,
      paletteColors: PALETTE,
      removeBackground: false,
    })
    expect(res.ok).toBe(true)
    expect(res.project.grid.cells[0][1]).toBe('#F2F2F2')
    expect(res.stats.blankCount).toBe(0)
  })

  it('手动覆盖的列数/行数生效', () => {
    const chart = makeChart([
      [RED, BLUE, RED, BLUE],
      [BLUE, RED, BLUE, RED],
    ])
    // 用户坚持按 2×1 采样:每格覆盖两个真实格子
    const res = buildChartProject({
      imageData: chart.imageData,
      bounds: chart.bounds,
      cols: 2,
      rows: 1,
      paletteColors: PALETTE,
    })
    expect(res.ok).toBe(true)
    expect(res.project.grid.width).toBe(2)
    expect(res.project.grid.height).toBe(1)
  })

  it('人工修正覆盖采样结果(指定颜色 / 标记空白)', () => {
    const chart = makeChart([
      [RED, BLUE],
      [BLUE, RED],
    ])
    const res = buildChartProject({
      imageData: chart.imageData,
      bounds: chart.bounds,
      cols: 2,
      rows: 2,
      paletteColors: PALETTE,
      overrides: { '0,0': '#42A5F5', '1,1': null },
    })
    expect(res.ok).toBe(true)
    expect(res.project.grid.cells).toEqual([
      ['#42A5F5', '#42A5F5'],
      ['#42A5F5', null],
    ])
    expect(res.stats.overrideCount).toBe(2)
    expect(res.stats.colorIds).toEqual(['M02'])
  })

  it('越界的修正键被忽略,不越界写数组', () => {
    const chart = makeChart([[RED, BLUE]])
    const res = buildChartProject({
      imageData: chart.imageData,
      bounds: chart.bounds,
      cols: 2,
      rows: 1,
      paletteColors: PALETTE,
      overrides: { '5,0': null, '-1,0': '#000000', 'x,y': '#000000' },
    })
    expect(res.ok).toBe(true)
    expect(res.stats.overrideCount).toBe(0)
    expect(res.project.grid.cells[0]).toHaveLength(2)
  })
})

describe('chartImport · 拒绝', () => {
  const base = () => {
    const chart = makeChart([[RED, BLUE], [BLUE, RED]])
    return { ...chart, paletteColors: PALETTE }
  }

  it('非法列数/行数', () => {
    for (const [cols, rows] of [[0, 2], [2, 0], [1.5, 2], ['2', 2], [null, 2]]) {
      const args = { ...base(), cols, rows }
      const res = buildChartProject(args)
      expect(res.ok).toBe(false)
      expect(res.errors[0].code).toBe(CHART_ERROR_CODES.INVALID_GRID)
    }
  })

  it('超过 200 的网格被拒绝,不做静默截断', () => {
    const chart = base()
    const res = buildChartProject({ ...chart, cols: 201, rows: 2 })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(CHART_ERROR_CODES.GRID_TOO_LARGE)
  })

  it('缺少图片/色卡', () => {
    const chart = base()
    expect(buildChartProject({ ...chart, imageData: null }).errors[0].code)
      .toBe(CHART_ERROR_CODES.INVALID_IMAGE)
    expect(buildChartProject({ ...chart, paletteColors: [] }).errors[0].code)
      .toBe(CHART_ERROR_CODES.SAMPLE_FAILED)
  })

  it('边界退化(小于格数)时拒绝', () => {
    const chart = base()
    const res = buildChartProject({
      ...chart,
      bounds: { x0: 12, y0: 12, x1: 13, y1: 13 },
      cols: 50,
      rows: 50,
    })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(CHART_ERROR_CODES.INVALID_GRID)
  })

  it('analyzeChart 对无效输入返回失败而不是抛错', () => {
    expect(analyzeChart(null).status).toBe('failed')
    expect(analyzeChart({ data: null, width: 10, height: 10 }).status).toBe('failed')
  })
})
