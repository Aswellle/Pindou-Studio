import { describe, it, expect, beforeAll } from 'vitest'
import {
  createPatternDocument,
  calculateColorStats,
  createBrandColorResolver,
} from './PatternDocument'
import { renderPatternDocumentToSVG } from './VectorRenderer'
import { getPalette } from '../../data/palettes'
import i18n from '../../i18n'

/**
 * 颜色统计口径一致性(规格 04 §4 / §8)。
 *
 * 背景:侧栏 ColorStatsBar、移动端徽章、文本导出、PNG/SVG 图例此前各自计数 ——
 * 侧栏按原始 hex,图例按解析后的品牌色号。内置模板这类「不在色卡里的 hex」
 * 一旦有两个值落到同一个品牌色,侧栏说 2 色、图例只有 1 行,用户拿到的
 * 采购数量对不上。这个文件锁定「同一份矩阵 → 同一组数字」的契约。
 */

const PERLER = getPalette('perler')
// P01 White = #F2F2F2。这两个近似值都会落到 P01(精确未命中 → CIEDE2000 就近)
const NEAR_WHITE_A = '#F2F2F3'
const NEAR_WHITE_B = '#F1F2F2'
const RED = '#E53935' // 不在 Perler 色卡里 → 就近匹配到某个红色系色号

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

describe('颜色统计 · 全应用同一口径', () => {
  it('两个不同 hex 落到同一品牌色号时合并为一行,总数不丢', () => {
    const grid = [[NEAR_WHITE_A, NEAR_WHITE_B, NEAR_WHITE_A, null]]
    const stats = calculateColorStats(grid, 4, 1, PERLER)

    expect(stats).toHaveLength(1)
    expect(stats[0].id).toBe('P01')
    expect(stats[0].count).toBe(3)
    // 总珠数 = 非空白格数
    expect(stats.reduce((n, s) => n + s.count, 0)).toBe(3)
  })

  it('PatternDocument.stats 与侧栏使用的 calculateColorStats 完全一致', () => {
    const grid = [
      [NEAR_WHITE_A, RED, RED, null],
      [null, NEAR_WHITE_B, RED, '#000000'],
    ]
    const doc = createPatternDocument({
      canvasData: grid,
      gridSize: 4,
      gridWidth: 4,
      gridHeight: 2,
      paletteId: 'perler',
      palette: PERLER,
    })

    expect(doc.stats).toEqual(calculateColorStats(grid, 4, 2, PERLER))
    // 分组只重排,不改变任何计数
    const grouped = Object.values(doc.palette.groups).flat()
    expect(grouped.reduce((n, s) => n + s.count, 0))
      .toBe(doc.stats.reduce((n, s) => n + s.count, 0))
    expect(grouped).toHaveLength(doc.stats.length)
  })

  it('文本导出的色号解析与图例统计同源(非标准 hex 不再输出 ?? / --)', () => {
    const resolver = createBrandColorResolver(PERLER.colors)
    const grid = [[NEAR_WHITE_A, RED, '#000000']]
    const stats = calculateColorStats(grid, 3, 1, PERLER)

    for (const cell of grid[0]) {
      const code = resolver.codeFor(cell)
      expect(code).not.toBe('')
      expect(code).not.toBe(cell)
      expect(stats.map(s => s.id)).toContain(code)
    }
    // 每个格子都能在统计里找到对应色号,不会出现图例有、格子没编号的情况
    expect(stats.reduce((n, s) => n + s.count, 0)).toBe(3)
  })

  it('SVG 图例的用色数与统计行数一致', () => {
    const grid = [
      [NEAR_WHITE_A, NEAR_WHITE_B, RED],
      [RED, null, '#000000'],
    ]
    const doc = createPatternDocument({
      canvasData: grid,
      gridSize: 3,
      paletteId: 'perler',
      palette: PERLER,
    })
    const svg = renderPatternDocumentToSVG(doc)
    const total = doc.stats.reduce((n, s) => n + s.count, 0)
    // 图例标题里同时给出「色数 / 珠数」,两者都必须来自 doc.stats
    expect(svg).toContain(i18n.t('export.legendTotal', { n: doc.stats.length, m: total }))
  })

  it('编辑之后重新统计即得到新数字(不存在过期缓存)', () => {
    const before = [[RED, RED, null, null]]
    const beforeStats = calculateColorStats(before, 4, 1, PERLER)

    // 模拟一次编辑:第二格改成白色,其余不动
    const after = [[RED, NEAR_WHITE_A, null, null]]
    const afterStats = calculateColorStats(after, 4, 1, PERLER)

    expect(beforeStats.find(s => s.id === 'P01')).toBeUndefined()
    expect(afterStats.find(s => s.id === 'P01')?.count).toBe(1)
    expect(afterStats.reduce((n, s) => n + s.count, 0)).toBe(2)
    // 同一 palette 数组重复统计不会拿到上一次的缓存结果
    expect(calculateColorStats(before, 4, 1, PERLER)).toEqual(beforeStats)
  })

  it('非法单元格被忽略而不是抛异常(历史脏数据防御)', () => {
    const grid = [[42, 'P01', 'not-a-color', undefined, NEAR_WHITE_A, null]]
    expect(() => calculateColorStats(grid, 6, 1, PERLER)).not.toThrow()
    const stats = calculateColorStats(grid, 6, 1, PERLER)
    // 'P01' 走品牌码直查;'not-a-color' 与数字、undefined 不计入
    expect(stats.reduce((n, s) => n + s.count, 0)).toBe(2)
    expect(stats.map(s => s.id)).toContain('P01')
  })

  it('声明尺寸大于矩阵实际形状时不越界读取', () => {
    const grid = [[RED, null]]
    const stats = calculateColorStats(grid, 10, 10, PERLER)
    expect(stats.reduce((n, s) => n + s.count, 0)).toBe(1)

    const doc = createPatternDocument({
      canvasData: grid,
      gridSize: 10,
      gridWidth: 10,
      gridHeight: 10,
      paletteId: 'perler',
      palette: PERLER,
    })
    // 声明尺寸仍保留在 metadata(供布局),但统计只按真实数据
    expect(doc.metadata.width).toBe(10)
    expect(doc.stats.reduce((n, s) => n + s.count, 0)).toBe(1)
  })
})
