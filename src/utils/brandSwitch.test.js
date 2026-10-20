import { describe, it, expect } from 'vitest'
import { planBrandSwitch, applyBrandSwitch } from './brandSwitch'
import { getPalette } from '../data/palettes'

/**
 * 品牌切换:预览 + 换色(规格 04 §4)。
 *
 * 契约:
 *   - plan 只读,给出逐色映射与影响面;
 *   - apply 一次产出新矩阵(调用方一条历史);
 *   - 无变化 → data 为 null,不压栈;
 *   - 空白格与非 hex 脏数据原样保留。
 */

const PERLER = getPalette('perler')
const HAMA = getPalette('hama')
// Perler P01 White = #F2F2F2;Hama 白色 #F2F2F2 大概率不同值,用实际色卡断言
const PERLER_WHITE = PERLER.colors.find(c => c.id === 'P01').hex

describe('brandSwitch · 预览', () => {
  it('逐色给出目标品牌最近色与影响面', () => {
    const data = [[PERLER_WHITE, PERLER_WHITE, null]]
    const plan = planBrandSwitch(data, 'hama')

    expect(plan.totalBeads).toBe(2)
    expect(plan.rows).toHaveLength(1)
    const row = plan.rows[0]
    expect(row.fromHex).toBe(PERLER_WHITE.toLowerCase())
    expect(row.count).toBe(2)
    // 目标色必须真实存在于 Hama 色卡
    expect(HAMA.colors.some(c => c.hex.toLowerCase() === row.toHex.toLowerCase())).toBe(true)
    expect(row.toId).toMatch(/^H\d+/)
    // 是否变化与 hex 是否真的不同保持一致
    expect(row.changed).toBe(row.toHex.toLowerCase() !== row.fromHex.toLowerCase())
  })

  it('统计按数量降序,且 totalBeads 等于非空格数', () => {
    const data = [
      [PERLER.colors[0].hex, PERLER.colors[0].hex, PERLER.colors[1].hex],
      [null, PERLER.colors[2].hex, null],
    ]
    const plan = planBrandSwitch(data, 'mard')
    expect(plan.totalBeads).toBe(4)
    const counts = plan.rows.map(r => r.count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('空画布 / 全空白 → 空计划', () => {
    expect(planBrandSwitch(null, 'hama')).toEqual({ rows: [], totalBeads: 0, changedCells: 0, changedColors: 0 })
    expect(planBrandSwitch([], 'hama').rows).toEqual([])
    expect(planBrandSwitch([[null, null]], 'hama').rows).toEqual([])
  })

  it('plan 不修改输入矩阵', () => {
    const data = [[PERLER_WHITE, null]]
    const snapshot = JSON.parse(JSON.stringify(data))
    planBrandSwitch(data, 'hama')
    expect(data).toEqual(snapshot)
  })
})

describe('brandSwitch · 应用', () => {
  it('把矩阵换成目标品牌色,空白格保留', () => {
    const data = [[PERLER_WHITE, PERLER_WHITE, null]]
    const plan = planBrandSwitch(data, 'hama')
    const { data: next, changed } = applyBrandSwitch(data, plan.rows)

    expect(changed).toBe(plan.changedCells)
    expect(next[0][2]).toBeNull()
    const target = plan.rows[0].toHex
    expect(next[0][0].toLowerCase()).toBe(target.toLowerCase())
    expect(next[0][1].toLowerCase()).toBe(target.toLowerCase())
  })

  it('无变化时返回 null(调用方不压栈)', () => {
    // 先把矩阵转到 Hama,再转一次 → 第二次应无变化
    const data = [[PERLER_WHITE]]
    const first = applyBrandSwitch(data, planBrandSwitch(data, 'hama').rows)
    const second = applyBrandSwitch(first.data, planBrandSwitch(first.data, 'hama').rows)
    expect(second.data).toBeNull()
    expect(second.changed).toBe(0)
  })

  it('大小写不同视为同一颜色(不产生无谓历史)', () => {
    const lower = PERLER_WHITE.toLowerCase()
    const upper = PERLER_WHITE.toUpperCase()
    const plan = planBrandSwitch([[lower, upper]], 'perler')
    // 已经在 Perler 上:两种写法都映射回自身
    expect(plan.rows).toHaveLength(1)
    expect(plan.changedCells).toBe(0)
    expect(applyBrandSwitch([[lower, upper]], plan.rows).data).toBeNull()
  })

  it('非 hex 脏数据原样保留,不参与映射', () => {
    const data = [[PERLER_WHITE, 'P18', 42, 'not-a-color']]
    const plan = planBrandSwitch(data, 'hama')
    const { data: next } = applyBrandSwitch(data, plan.rows)

    expect(next[0][1]).toBe('P18')
    expect(next[0][2]).toBe(42)
    expect(next[0][3]).toBe('not-a-color')
    expect(plan.totalBeads).toBe(1)
  })

  it('不修改输入矩阵(返回新对象)', () => {
    const data = [[PERLER_WHITE]]
    const snapshot = JSON.parse(JSON.stringify(data))
    const { data: next } = applyBrandSwitch(data, planBrandSwitch(data, 'hama').rows)
    expect(data).toEqual(snapshot)
    expect(next).not.toBe(data)
    expect(next[0]).not.toBe(data[0])
  })

  it('apply 只替换 plan 里标记的源色', () => {
    const data = [[PERLER_WHITE, '#123456']]
    const plan = planBrandSwitch(data, 'hama')
    const { data: next } = applyBrandSwitch(data, plan.rows)
    // '#123456' 也在 plan 里(它是合法 hex),但换完后两种颜色都应存在于目标色卡
    for (const cell of next[0]) {
      expect(HAMA.colors.some(c => c.hex.toLowerCase() === cell.toLowerCase())).toBe(true)
    }
  })
})
