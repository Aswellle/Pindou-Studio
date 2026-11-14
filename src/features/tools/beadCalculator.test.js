import { describe, it, expect } from 'vitest'
import { GRID_PRESETS, MAX_GRID, beadEstimate, beadPresetRows, parseGridValue } from './beadCalculator'

describe('parseGridValue', () => {
  it('接受 1–500 的整数', () => {
    expect(parseGridValue('29')).toBe(29)
    expect(parseGridValue(57.9)).toBe(57)
    expect(parseGridValue(1)).toBe(1)
  })

  it('超过上限时夹到上限', () => {
    expect(parseGridValue(9999)).toBe(MAX_GRID)
  })

  it('非法输入返回 null(页面显示空态而不是 0)', () => {
    expect(parseGridValue('')).toBe(null)
    expect(parseGridValue('abc')).toBe(null)
    expect(parseGridValue(0)).toBe(null)
    expect(parseGridValue(-5)).toBe(null)
  })
})

describe('beadEstimate', () => {
  it('29×29 满格 = 841 颗', () => {
    const out = beadEstimate({ width: 29, height: 29, fillRatio: 1 })
    expect(out.cells).toBe(841)
    expect(out.beads).toBe(841)
    expect(out.perColor).toBe(null)
  })

  it('八成填充按比例估算并取整', () => {
    const out = beadEstimate({ width: 29, height: 29, fillRatio: 0.8 })
    expect(out.beads).toBe(673) // 841 × 0.8 = 672.8
  })

  it('57×57 八成填充 = 2599 颗(静态正文里的示例必须与函数一致)', () => {
    expect(beadEstimate({ width: 57, height: 57, fillRatio: 0.8 }).beads).toBe(2599)
  })

  it('颜色数给出每色平均,向上取整', () => {
    const out = beadEstimate({ width: 29, height: 29, fillRatio: 0.8, colorCount: 12 })
    expect(out.perColor).toBe(57) // ceil(673 / 12)
  })

  it('填充比例越界时夹到 0–1', () => {
    expect(beadEstimate({ width: 10, height: 10, fillRatio: 5 }).beads).toBe(100)
    expect(beadEstimate({ width: 10, height: 10, fillRatio: -1 }).beads).toBe(0)
  })

  it('非法尺寸返回 null', () => {
    expect(beadEstimate({ width: '', height: 29 })).toBe(null)
    expect(beadEstimate({ width: 29, height: 0 })).toBe(null)
    expect(beadEstimate()).toBe(null)
  })

  it('矩形网格按宽 × 高计算', () => {
    const out = beadEstimate({ width: 57, height: 29, fillRatio: 1 })
    expect(out.cells).toBe(1653)
  })
})

describe('beadPresetRows', () => {
  it('覆盖全部预设尺寸,并给出八成/六成用量', () => {
    const rows = beadPresetRows()
    expect(rows.map(r => r.size)).toEqual(GRID_PRESETS)
    for (const row of rows) {
      expect(row.cells).toBe(row.size * row.size)
      expect(row.filled80).toBe(Math.round(row.cells * 0.8))
      expect(row.filled60).toBe(Math.round(row.cells * 0.6))
    }
  })
})
