import { describe, it, expect } from 'vitest'
import { categoryStats, categoryStatsText } from './categoryStats'

const tpl = (pattern, difficulty) => ({ pattern, difficulty })

describe('categoryStats', () => {
  it('统计尺寸区间、用色区间、难度与总用豆量', () => {
    const stats = categoryStats([
      tpl([['#a', '#b'], ['#a', null]], 'easy'),
      tpl([['#c', '#c', '#c'], ['#c', '#d', '#c'], ['#c', '#c', '#c']], 'medium'),
    ])
    expect(stats).toMatchObject({
      count: 2,
      minW: 2,
      minH: 2,
      maxW: 3,
      maxH: 3,
      minColors: 2,
      maxColors: 2,
      easy: 1,
      medium: 1,
      hard: 0,
    })
    // 3 + 9 = 12 颗
    expect(stats.beads).toBe(12)
  })

  it('空输入与损坏模板返回 null,不产出空摘要', () => {
    expect(categoryStats([])).toBe(null)
    expect(categoryStats([{ pattern: [] }])).toBe(null)
    expect(categoryStats(null)).toBe(null)
  })

  it('忽略没有图案的条目', () => {
    const stats = categoryStats([{ pattern: [] }, tpl([['#a']], 'hard')])
    expect(stats.count).toBe(1)
    expect(stats.hard).toBe(1)
  })
})

describe('categoryStatsText', () => {
  it('尺寸相同显示单一尺寸,不同则显示区间', () => {
    const same = categoryStats([tpl([['#a', '#a'], ['#a', '#a']], 'easy')])
    expect(categoryStatsText(same)).toContain('尺寸 2×2')

    const range = categoryStats([
      tpl([['#a']], 'easy'),
      tpl([['#b', '#b'], ['#b', '#b']], 'hard'),
    ])
    expect(categoryStatsText(range)).toContain('尺寸 1×1 – 2×2')
  })

  it('摘要包含张数、难度分布与用豆量(便于与图库筛选页区分)', () => {
    const stats = categoryStats([
      tpl([['#a', '#b']], 'easy'),
      tpl([['#a', '#b']], 'hard'),
    ])
    const text = categoryStatsText(stats)
    expect(text).toContain('本类共 2 张')
    expect(text).toContain('简单 1 / 困难 1')
    expect(text).toContain('用豆量约 4 颗')
    expect(categoryStatsText(null)).toBe('')
  })
})
