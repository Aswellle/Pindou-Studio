import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import ColorStatsBar from './ColorStatsBar'
import { calculateColorStats } from '../services/export/PatternDocument'
import { getPalette } from '../data/palettes'
import i18n from '../i18n'

/**
 * 侧栏颜色统计必须与导出图例同源(规格 04 §4 / §8)。
 *
 * 回归背景:ColorStatsBar 曾按「原始 hex」计数,而导出图例按「解析后的品牌
 * 色号」归并。两个不在色卡里的 hex 若落到同一品牌色,侧栏说 2 色、图例 1 行,
 * 用户按侧栏数量去买豆子就会买错。这里锁定两者数字一致。
 */

const PERLER = getPalette('perler')
const NEAR_WHITE_A = '#F2F2F3' // → P01
const NEAR_WHITE_B = '#F1F2F2' // → P01
const RED = '#E53935'          // → Perler 红色系(非精确命中)

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

describe('ColorStatsBar · 与导出图例同一口径', () => {
  it('两个 hex 落到同一品牌色号时只算一种颜色', () => {
    const data = [[NEAR_WHITE_A, NEAR_WHITE_B, RED, null]]
    const { container } = render(<ColorStatsBar canvasData={data} paletteId="perler" />)

    const values = [...container.querySelectorAll('.stats-chip-value')].map(n => n.textContent)
    const expected = calculateColorStats(data, 4, 1, PERLER)
    // 第一块是珠数,第二块是颜色数
    expect(values[0]).toBe(String(expected.reduce((n, s) => n + s.count, 0)))
    expect(values[1]).toBe(String(expected.length))
    // 两个近似白合并成一行,不是两行
    expect(expected).toHaveLength(2)
    expect(values[1]).toBe('2')
  })

  it('色卡列表逐行数量之和等于总珠数', () => {
    const data = [
      [RED, RED, NEAR_WHITE_A],
      [null, NEAR_WHITE_B, '#000000'],
    ]
    const { container } = render(<ColorStatsBar canvasData={data} paletteId="perler" />)

    const counts = [...container.querySelectorAll('.stats-swatch-count')]
      .map(n => Number(n.textContent))
    // RED 2 粒 + 两个近似白合并后 2 粒 + 黑色 1 粒 = 3 种颜色 / 5 颗
    expect(counts).toHaveLength(3)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5)

    const total = container.querySelectorAll('.stats-chip-value')[0].textContent
    expect(Number(total)).toBe(5)
  })

  it('每行都显示品牌色号(不是原始 hex)', () => {
    const data = [[NEAR_WHITE_A, RED]]
    const { container } = render(<ColorStatsBar canvasData={data} paletteId="perler" />)

    const labels = [...container.querySelectorAll('.stats-swatch-hex')].map(n => n.textContent)
    for (const label of labels) {
      // 形如 "P01 白色":以品牌色号开头,而不是 "#F2F2F3"
      expect(label).toMatch(/^[A-Z]+\d+\s/)
      expect(label.startsWith('#')).toBe(false)
    }
  })

  it('空画布显示占位文案,不渲染统计块', () => {
    const { container } = render(<ColorStatsBar canvasData={null} paletteId="perler" />)
    expect(container.querySelector('.color-stats-bar.empty')).toBeTruthy()
    expect(container.querySelector('.stats-chip-value')).toBeNull()
  })
})
