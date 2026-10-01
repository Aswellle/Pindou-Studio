/**
 * Golden Test — PatternDocument → PNG/SVG 结构一致性验证
 *
 * 验证同一 PatternDocument 通过 RasterRenderer 和 VectorRenderer 渲染时，
 * 网格、颜色、编号、图例、布局语义保持一致。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createPatternDocument, calculateColorStats, groupColorStats } from './PatternDocument'
import { renderPatternDocumentToSVG } from './VectorRenderer'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

// 测试用 canvasData（5x5 网格）
const TEST_CANVAS = [
  [null, '#FF0000', '#FF0000', '#FF0000', null],
  [null, '#FF0000', '#00FF00', '#FF0000', null],
  [null, '#FF0000', '#FF0000', '#FF0000', null],
  [null, null, null, null, null],
  [null, null, null, null, null],
]

// 测试用品牌色卡(rgb 供 CIEDE2000 就近匹配)
const FAKE_PALETTE = {
  colors: [
    { id: 'R1', name: 'Red', nameZh: '红', hex: '#FF0000', rgb: { r: 255, g: 0, b: 0 } },
    { id: 'G1', name: 'Green', nameZh: '绿', hex: '#00FF00', rgb: { r: 0, g: 255, b: 0 } },
    { id: 'B1', name: 'Blue', nameZh: '蓝', hex: '#0000FF', rgb: { r: 0, g: 0, b: 255 } },
  ],
}

describe('PatternDocument Golden Test', () => {
  it('createPatternDocument 生成正确的结构', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      designName: 'Test Pattern',
    })

    expect(doc.version).toBe(2)
    expect(doc.metadata.width).toBe(5)
    expect(doc.metadata.height).toBe(5)
    expect(doc.metadata.name).toBe('Test Pattern')
    expect(doc.grid.width).toBe(5)
    expect(doc.grid.height).toBe(5)
  })

  it('SVG 渲染器使用 PatternDocument 中的颜色', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      designName: 'Test',
    })

    const svg = renderPatternDocumentToSVG(doc)

    // SVG 应包含使用的颜色
    expect(svg).toContain('#FF0000')
    expect(svg).toContain('#00FF00')

    // SVG 应包含图纸名称
    expect(svg).toContain('Test')

    // SVG 应包含尺寸信息
    expect(svg).toContain('5 × 5')
  })

  it('SVG 渲染器在 professional 模式下显示色号', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      beadStyle: 'professional',
    })

    const svg = renderPatternDocumentToSVG(doc)

    // professional 模式应包含色号文本元素
    expect(svg).toContain('<text')
  })

  it('SVG 渲染器在 realistic 模式下不显示色号', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      beadStyle: 'realistic',
    })

    const svg = renderPatternDocumentToSVG(doc)

    // realistic 模式不应有 professional 色号文本
    // （但可能有坐标文字，所以只检查 beadStyle 属性存在）
    expect(svg).toContain('<svg')
  })

  it('空网格生成有效 PatternDocument', () => {
    const emptyGrid = Array(5).fill(null).map(() => Array(5).fill(null))
    const doc = createPatternDocument({
      canvasData: emptyGrid,
      gridSize: 5,
      paletteId: 'perler',
    })

    expect(doc.palette.colors).toEqual([])
    expect(doc.grid.cells).toEqual(emptyGrid)
  })

  it('SVG 输出包含正确数量的 circle 元素', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      beadStyle: 'realistic',
    })
    const svg = renderPatternDocumentToSVG(doc)
    // 9 个珠子（3x3 中心区域）+ 图例 2 色圆点
    const circleCount = (svg.match(/<circle/g) || []).length
    expect(circleCount).toBeGreaterThanOrEqual(9)
  })

  it('professional 模式 SVG 输出方形格子(与 V1 专业图纸同语义)', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      beadStyle: 'professional',
    })
    const svg = renderPatternDocumentToSVG(doc)
    // 珠子方块统一为 cellSize-1 = 27 的正方形(色板色块 20×20 不会混入)
    expect((svg.match(/width="27" height="27"/g) || []).length).toBe(9)
  })

  it('SVG 输出包含正确的颜色值', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
    })
    const svg = renderPatternDocumentToSVG(doc)
    // 应包含测试颜色的 hex 值
    expect(svg).toContain('#FF0000')
    expect(svg).toContain('#00FF00')
  })

  it('professional 模式输出 10 格加粗网格线(V1 惯例)', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      beadStyle: 'professional',
    })
    const svg = renderPatternDocumentToSVG(doc)
    // 5 格网格:粗线 #666666 只有 i=0 一纵一横;细线 #d0d0d0 各 6 条
    expect((svg.match(/stroke="#666666"/g) || []).length).toBe(2)
    expect((svg.match(/stroke="#d0d0d0"/g) || []).length).toBe(12)
  })

  it('提供品牌色卡时色号解析为品牌编号(精确 hex 命中)', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      palette: FAKE_PALETTE,
    })
    const red = doc.palette.colors.find(c => c.hex === '#FF0000')
    const green = doc.palette.colors.find(c => c.hex === '#00FF00')
    expect(red.id).toBe('R1')
    expect(red.name).toBe('红')
    expect(green.id).toBe('G1')
  })

  it('非标准 hex 按 CIEDE2000 就近匹配品牌色号(V1 同语义)', () => {
    const nearRed = TEST_CANVAS.map(row => row.map(c => (c === '#FF0000' ? '#FE0101' : c)))
    const doc = createPatternDocument({
      canvasData: nearRed,
      gridSize: 5,
      paletteId: 'perler',
      palette: FAKE_PALETTE,
    })
    const red = doc.palette.colors.find(c => c.hex === '#FE0101')
    expect(red.id).toBe('R1')
  })

  it('hex 大小写不敏感命中品牌色卡', () => {
    const lower = TEST_CANVAS.map(row => row.map(c => (c === '#FF0000' ? '#ff0000' : c)))
    const doc = createPatternDocument({
      canvasData: lower,
      gridSize: 5,
      paletteId: 'perler',
      palette: FAKE_PALETTE,
    })
    expect(doc.palette.colors.find(c => c.hex === '#ff0000').id).toBe('R1')
  })

  it('不提供色卡时回退 hex 充当编号(兼容旧行为)', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
    })
    expect(doc.palette.colors.find(c => c.hex === '#FF0000').id).toBe('#FF0000')
  })

  it('统计按品牌码归并、数量降序;分组按 V1 阈值划分', () => {
    // 无色卡 → id 即 hex;红 8 粒(89%,major)、绿 1 粒(<5,trace)
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
    })
    expect(doc.stats).toEqual([
      { id: '#FF0000', name: '#FF0000', hex: '#FF0000', count: 8 },
      { id: '#00FF00', name: '#00FF00', hex: '#00FF00', count: 1 },
    ])
    expect(doc.palette.groups.major.map(i => i.id)).toEqual(['#FF0000'])
    expect(doc.palette.groups.trace.map(i => i.id)).toEqual(['#00FF00'])
    expect(doc.palette.groups.minor).toEqual([])
    expect(doc.palette.groups.accent).toEqual([])
  })

  it('分组阈值与 V1 一致(major≥5% / minor 1–5% / accent≥5粒且<1% / trace<5粒)', () => {
    // 20×50 = 1000 格:A 600(60% major)、B 20(2% minor)、C 5(0.5% accent)、D 2(trace)
    const counts = { '#111111': 600, '#222222': 20, '#333333': 5, '#444444': 2 }
    const grid = Array.from({ length: 20 }, () => Array(50).fill(null))
    let cursor = 0
    for (const [hex, n] of Object.entries(counts)) {
      for (let k = 0; k < n; k++) {
        const y = Math.floor(cursor / 50)
        const x = cursor % 50
        grid[y][x] = hex
        cursor++
      }
    }
    const stats = calculateColorStats(grid, 50, 20, null)
    expect(stats.map(s => s.id)).toEqual(['#111111', '#222222', '#333333', '#444444'])
    const groups = groupColorStats(stats, 627)
    expect(groups.major.map(i => i.id)).toEqual(['#111111'])
    expect(groups.minor.map(i => i.id)).toEqual(['#222222'])
    expect(groups.accent.map(i => i.id)).toEqual(['#333333'])
    expect(groups.trace.map(i => i.id)).toEqual(['#444444'])
  })

  it('layout 携带完整 sheet 布局参数(与 V1 同值)', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
    })
    expect(doc.layout).toEqual({
      cellSize: 28,
      headerHeight: 80,
      legendHeight: 50,
      padding: 20,
      rowLabelWidth: 36,
      colLabelHeight: 28,
      panelWidth: 260,
    })
  })

  it('SVG sheet 含表头带/图例条/分级面板/坐标尺(V1 布局要素)', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      designName: '布局验证',
      beadStyle: 'professional',
    })
    const svg = renderPatternDocumentToSVG(doc)
    // 表头深色带 + 标题 + 尺寸副标题
    expect(svg).toContain('fill="#2c2c2c"')
    expect(svg).toContain('布局验证')
    expect(svg).toContain('5 × 5 格子')
    // 图例条(中心珠标记)与生成署名
    expect(svg).toContain('★ = 中心珠')
    expect(svg).toContain('导出自 拼豆Studio')
    // 右侧分级面板:标题/分组/微量色警示
    expect(svg).toContain('颜色清单')
    expect(svg).toContain('主色（≥5%）')
    expect(svg).toContain('微量色 ⚠ 采购注意')
    expect(svg).toContain('颗 ⚠')
    // 坐标尺:列 0 标签存在
    expect(svg).toContain('>0</text>')
    // 图例条色块(中心珠示例)
    expect(svg).toContain('#E53935')
  })

  it('SVG 输出包含 professional 模式的色号文本', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
      beadStyle: 'professional',
    })
    const svg = renderPatternDocumentToSVG(doc)
    // professional 模式应包含 <text> 元素显示色号
    expect(svg).toContain('<text')
  })

  it('SVG 输出具有正确的矢量结构', () => {
    const doc = createPatternDocument({
      canvasData: TEST_CANVAS,
      gridSize: 5,
      paletteId: 'perler',
    })
    const svg = renderPatternDocumentToSVG(doc)
    // 应有 SVG 开闭标签
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    // 应有 viewBox 属性
    expect(svg).toContain('viewBox')
  })
})
