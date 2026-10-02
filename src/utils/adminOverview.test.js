import { describe, it, expect } from 'vitest'
import {
  buildTrend,
  computeLibraryStats,
  checkContentHealth,
  normalizeTrend,
  patternColorCount,
  patternDims,
} from './adminOverview'

const day = (date, email = 0, username = 0) => ({ date, email, username })

describe('normalizeTrend', () => {
  it('按日期升序、同日期合并求和、非法行丢弃', () => {
    const rows = normalizeTrend([
      day('2026-10-02', 1, 0),
      { date: 'bad', email: 5 },
      null,
      day('2026-10-01', 2, 3),
      day('2026-10-02', 4, 1),
    ])
    expect(rows.map((r) => r.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(rows[1]).toMatchObject({ email: 5, username: 1, total: 6 })
  })

  it('负值/非数字按 0 计', () => {
    const [row] = normalizeTrend([{ date: '2026-10-02', email: -3, username: 'x' }])
    expect(row).toMatchObject({ email: 0, username: 0, total: 0 })
  })

  it('非数组输入返回空数组', () => {
    expect(normalizeTrend(undefined)).toEqual([])
  })
})

describe('buildTrend', () => {
  it('只保留最近 days 天,并给出峰值', () => {
    const series = [day('2026-09-01', 9), day('2026-10-01', 2), day('2026-10-02', 4)]
    const trend = buildTrend(series, { days: 2 })
    expect(trend.bars.map((b) => b.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(trend.peak).toBe(4)
    expect(trend.windowTotal).toBe(6)
    // 柱高交给图表库换算,纯计算层不再产出百分比
    expect(trend.bars[0]).toEqual({ date: '2026-10-01', email: 2, username: 0, total: 2 })
  })

  it('拆分两种注册方式并给出窗口合计', () => {
    const trend = buildTrend([day('2026-10-01', 2, 1), day('2026-10-02', 0, 3)])
    expect(trend.emailTotal).toBe(2)
    expect(trend.usernameTotal).toBe(4)
    expect(trend.windowTotal).toBe(6)
    expect(trend.hasData).toBe(true)
  })

  it('全零窗口 hasData=false 但序列仍完整(图表照常渲染 14 天刻度)', () => {
    const series = Array.from({ length: 14 }, (_, i) => day(`2026-09-${String(i + 19).padStart(2, '0')}`))
    const trend = buildTrend(series)
    expect(trend.hasData).toBe(false)
    expect(trend.peak).toBe(0)
    expect(trend.bars).toHaveLength(14)
    expect(trend.bars.every((b) => b.total === 0)).toBe(true)
  })
})

describe('patternColorCount / patternDims', () => {
  it('统计唯一颜色数,忽略 null 与非法结构', () => {
    expect(patternColorCount([[null, '#fff'], ['#fff', '#000']])).toBe(2)
    expect(patternColorCount([[null, null]])).toBe(0)
    expect(patternColorCount(null)).toBe(0)
    expect(patternColorCount([null, '#fff'])).toBe(0)
  })

  it('尺寸取首行长度作为列数', () => {
    expect(patternDims([['#fff', '#000'], ['#fff', '#000']])).toEqual({ rows: 2, cols: 2 })
    expect(patternDims([])).toBe(null)
    expect(patternDims([[]])).toBe(null)
    expect(patternDims('x')).toBe(null)
  })
})

describe('computeLibraryStats', () => {
  const templates = [
    { id: 'a', name: 'A', category: 'animal', difficulty: 'easy', paletteId: 'mard', source: 'builtin', downloadCount: 30 },
    { id: 'b', name: 'B', category: 'animal', difficulty: 'hard', paletteId: 'perler', source: 'custom', downloadCount: 10 },
    { id: 'c', name: 'C', category: 'food', difficulty: 'easy', paletteId: 'perler', source: 'custom', downloadCount: 0 },
  ]
  const categories = [{ id: 'animal', label: '动物' }, { id: 'food', label: '食物' }, { id: 'holiday', label: '节日' }]

  it('规模/来源/下载量与平均下载', () => {
    const stats = computeLibraryStats(templates, categories)
    expect(stats).toMatchObject({ total: 3, builtin: 1, custom: 2, downloads: 40, avgDownloads: 13, hasDownloads: true })
  })

  it('分类分布包含零模板的分类,并按数量降序', () => {
    const stats = computeLibraryStats(templates, categories)
    expect(stats.byCategory.map((row) => row.id)).toEqual(['animal', 'food', 'holiday'])
    expect(stats.byCategory.map((row) => row.count)).toEqual([2, 1, 0])
    expect(stats.byCategory[0].share).toBeCloseTo(2 / 3, 5)
  })

  it('难度分布覆盖全部模板,品牌维度不再统计(模板可转换色卡)', () => {
    const stats = computeLibraryStats(templates, categories)
    expect(stats.byDifficulty.map((row) => row.id)).toEqual(['easy', 'hard'])
    expect(stats.byPalette).toBe(undefined)
  })

  it('热门模板按下载量降序取前 5,且不修改入参顺序', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, downloadCount: i }))
    const stats = computeLibraryStats(many, [])
    expect(stats.topDownloaded.map((tpl) => tpl.downloadCount)).toEqual([6, 5, 4, 3, 2])
    expect(many[0].id).toBe('t0')
  })

  it('空库不抛错', () => {
    expect(computeLibraryStats(undefined, undefined)).toMatchObject({ total: 0, downloads: 0, hasDownloads: false, avgDownloads: 0 })
  })
})

describe('checkContentHealth', () => {
  const validPaletteIds = ['perler', 'mard']

  it('干净内容返回 ok', () => {
    const clean = [{ id: 'a', name: 'A', nameZh: '甲', category: 'animal', size: 2, paletteId: 'perler', pattern: [['#fff', '#000'], ['#000', '#fff']] }]
    expect(checkContentHealth(clean, [{ id: 'animal' }], { validPaletteIds })).toEqual({ issues: [], ok: true })
  })

  it('分别命中缺中文名/无效色卡/重名/单色/尺寸不符/图案无效', () => {
    const templates = [
      { id: 'a', name: 'Dup', nameZh: '重复', category: 'animal', size: 2, paletteId: 'perler', pattern: [['#fff', '#000'], ['#000', '#fff']] },
      { id: 'b', name: 'Dup', category: 'animal', size: 9, paletteId: 'unknown', pattern: [['#fff', '#000']] },
      { id: 'c', name: 'Mono', nameZh: '单色', category: 'animal', size: 1, paletteId: 'mard', pattern: [['#fff']] },
      { id: 'd', name: 'Broken', nameZh: '损坏', category: 'animal', size: 1, paletteId: 'mard', pattern: 'nope' },
    ]
    const { issues } = checkContentHealth(templates, [{ id: 'animal' }], { validPaletteIds })
    const byCode = Object.fromEntries(issues.map((issue) => [issue.code, issue]))

    expect(byCode.duplicateName).toMatchObject({ count: 1, severity: 'warn', samples: ['dup'] })
    expect(byCode.unknownPalette).toMatchObject({ count: 1, severity: 'warn', samples: ['Dup'] })
    expect(byCode.missingNameZh.count).toBe(1) // b 缺中文名(a/c/d 都有)
    expect(byCode.thinColors).toMatchObject({ count: 1, samples: ['单色'] })
    expect(byCode.sizeMismatch).toMatchObject({ count: 1, samples: ['Dup'] })
    expect(byCode.invalidPattern).toMatchObject({ count: 1, samples: ['损坏'] })
  })

  it('空分类与分类不存在分别统计', () => {
    const templates = [{ id: 'a', name: 'A', nameZh: '甲', category: 'ghost', size: 1, paletteId: 'perler', pattern: [['#fff', '#000']] }]
    const { issues } = checkContentHealth(templates, [{ id: 'animal' }, { id: 'food' }], { validPaletteIds })
    const byCode = Object.fromEntries(issues.map((issue) => [issue.code, issue]))
    expect(byCode.emptyCategory.samples).toEqual(['animal', 'food'])
    expect(byCode.orphanCategory.samples).toEqual(['甲'])
  })

  it('未提供有效色卡列表时不误报色卡问题;warn 排在 info 之前', () => {
    const templates = [
      { id: 'a', name: 'X', category: 'animal', size: 2, paletteId: 'whatever', pattern: [['#fff', '#000']] },
      { id: 'b', name: 'X', nameZh: '乙', category: 'animal', size: 2, paletteId: 'weird', pattern: [['#fff', '#000']] },
    ]
    const { issues } = checkContentHealth(templates, [{ id: 'animal' }], {})
    expect(issues.map((issue) => issue.code)).toEqual(['duplicateName', 'missingNameZh'])
    expect(issues.map((issue) => issue.severity)).toEqual(['warn', 'info'])
  })

  it('样例最多取 3 条', () => {
    const templates = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`, name: `T${i}`, category: 'animal', size: 2, paletteId: 'perler', pattern: [['#fff', '#000']],
    }))
    const { issues } = checkContentHealth(templates, [{ id: 'animal' }], { validPaletteIds })
    expect(issues[0]).toMatchObject({ code: 'missingNameZh', count: 5 })
    expect(issues[0].samples).toHaveLength(3)
  })
})
