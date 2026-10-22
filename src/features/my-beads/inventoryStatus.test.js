import { describe, it, expect } from 'vitest'
import {
  STOCK_STATE,
  deriveStockState,
  normalizeQuantityDraft,
  statusForQuantity,
  matchesStockFilter,
  buildStockSummary,
} from './inventoryStatus'

/**
 * 库存五态语义(重构规格 §2.3)。重点:未知 ≠ 缺货、0 ≠ 空值。
 */

describe('deriveStockState', () => {
  it('没有记录是「未记录」,不是缺货', () => {
    expect(deriveStockState(null)).toBe(STOCK_STATE.UNRECORDED)
    expect(deriveStockState(undefined)).toBe(STOCK_STATE.UNRECORDED)
  })

  it('有记录但数量为 null 是「有库存 · 数量未知」', () => {
    expect(deriveStockState({ status: 'owned', quantity: null })).toBe(STOCK_STATE.OWNED_UNKNOWN)
  })

  it('数量为正数是「有库存 · N 颗」', () => {
    expect(deriveStockState({ status: 'owned', quantity: 120 })).toBe(STOCK_STATE.OWNED_QTY)
  })

  it('数量 0 一律视为缺货,即使状态还写着 owned', () => {
    expect(deriveStockState({ status: 'owned', quantity: 0 })).toBe(STOCK_STATE.OUT)
  })

  it('status=low 优先于数量,用户手动标记不被数字覆盖', () => {
    expect(deriveStockState({ status: 'low', quantity: 8 })).toBe(STOCK_STATE.LOW)
  })

  it('status=out_of_stock 即使数量非空也是缺货', () => {
    expect(deriveStockState({ status: 'out_of_stock', quantity: 3 })).toBe(STOCK_STATE.OUT)
  })
})

describe('normalizeQuantityDraft', () => {
  it('空串保存为 null(数量未知),不是 0', () => {
    expect(normalizeQuantityDraft('')).toEqual({ ok: true, quantity: null })
    expect(normalizeQuantityDraft('   ')).toEqual({ ok: true, quantity: null })
    expect(normalizeQuantityDraft(null)).toEqual({ ok: true, quantity: null })
  })

  it('0 是合法数量', () => {
    expect(normalizeQuantityDraft('0')).toEqual({ ok: true, quantity: 0 })
  })

  it('负数与非数字被拒绝', () => {
    expect(normalizeQuantityDraft('-1').ok).toBe(false)
    expect(normalizeQuantityDraft('abc').ok).toBe(false)
  })

  it('小数截断为整数', () => {
    expect(normalizeQuantityDraft('12.9')).toEqual({ ok: true, quantity: 12 })
  })
})

describe('statusForQuantity', () => {
  it('提交 0 → 缺货', () => {
    expect(statusForQuantity(0, 'owned')).toBe('out_of_stock')
  })

  it('从缺货补成正数 → 改回拥有', () => {
    expect(statusForQuantity(50, 'out_of_stock')).toBe('owned')
  })

  it('原本手动标记「数量不足」时保留 low', () => {
    expect(statusForQuantity(50, 'low')).toBe('low')
  })

  it('数量未知时保留原状态;原本缺货则改回拥有(缺货 + 数量未知自相矛盾)', () => {
    expect(statusForQuantity(null, 'owned')).toBe('owned')
    expect(statusForQuantity(null, 'low')).toBe('low')
    expect(statusForQuantity(null, 'out_of_stock')).toBe('owned')
  })
})

describe('matchesStockFilter', () => {
  it('「未记录」与「拥有」互斥', () => {
    expect(matchesStockFilter(STOCK_STATE.UNRECORDED, 'unrecorded')).toBe(true)
    expect(matchesStockFilter(STOCK_STATE.UNRECORDED, 'owned')).toBe(false)
    expect(matchesStockFilter(STOCK_STATE.OWNED_UNKNOWN, 'unrecorded')).toBe(false)
    expect(matchesStockFilter(STOCK_STATE.OWNED_UNKNOWN, 'owned')).toBe(true)
  })

  it('「已登记」覆盖除未记录外的所有状态', () => {
    expect(matchesStockFilter(STOCK_STATE.OWNED_QTY, 'recorded')).toBe(true)
    expect(matchesStockFilter(STOCK_STATE.LOW, 'recorded')).toBe(true)
    expect(matchesStockFilter(STOCK_STATE.OUT, 'recorded')).toBe(true)
    expect(matchesStockFilter(STOCK_STATE.UNRECORDED, 'recorded')).toBe(false)
  })

  it('all 放行一切', () => {
    expect(matchesStockFilter(STOCK_STATE.OUT, 'all')).toBe(true)
  })
})

describe('buildStockSummary', () => {
  const colors = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }]
  const inventory = new Map([
    ['a', { status: 'owned', quantity: 100 }],
    ['b', { status: 'owned', quantity: null }],
    ['c', { status: 'low', quantity: 5 }],
    ['d', { status: 'out_of_stock', quantity: 0 }],
  ])

  it('五类计数彼此独立', () => {
    const s = buildStockSummary(colors, inventory)
    expect(s.total).toBe(4)
    expect(s.recorded).toBe(4)
    expect(s.owned).toBe(2)
    expect(s.low).toBe(1)
    expect(s.out).toBe(1)
    expect(s.unrecorded).toBe(0)
  })

  it('合计只累加已知数量,未知不按 0 计入', () => {
    const s = buildStockSummary(colors, inventory)
    expect(s.totalQty).toBe(105) // 100 + 5 + 0,b 是 null 不计
  })

  it('无记录的颜色计入未记录', () => {
    const s = buildStockSummary([{ key: 'x' }], new Map())
    expect(s.unrecorded).toBe(1)
    expect(s.recorded).toBe(0)
  })
})
