import { describe, it, expect } from 'vitest'
import { planInventoryDeduction, applyInventoryDeduction, runInventoryDeduction } from './inventoryDeduction'

/**
 * 导出后扣减库存(规格 05 §3)。
 * 只有用户主动开启才执行;未知库存不扣;扣到 0 标记缺货。
 */

const CANVAS = [
  ['#FF0000', '#FF0000', '#0000FF'],
  [null, '#FF0000', '#00FF00'],
]

const resolve = (hex) => {
  const map = { '#FF0000': { id: 'P28' }, '#0000FF': { id: 'P01' }, '#00FF00': { id: 'P99' } }
  return map[hex] || null
}

const inv = (records) => new Map(records.map((r) => [r.paletteKey, r]))

describe('inventoryDeduction · 扣减计划', () => {
  it('按图纸实际颗数扣减,返回逐色明细', () => {
    const inventory = inv([
      { paletteKey: 'builtin:perler:P28', quantity: 100, status: 'owned' },
      { paletteKey: 'builtin:perler:P01', quantity: 50, status: 'owned' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    // 红 3 颗、蓝 1 颗;绿没有库存记录 → 跳过
    expect(plan.entries).toHaveLength(2)
    const red = plan.entries.find((e) => e.paletteKey === 'builtin:perler:P28')
    expect(red).toMatchObject({ used: 3, before: 100, after: 97, status: 'owned' })
    const blue = plan.entries.find((e) => e.paletteKey === 'builtin:perler:P01')
    expect(blue).toMatchObject({ used: 1, before: 50, after: 49 })
    expect(plan.totalDeducted).toBe(4)
  })

  it('数量未知(null)不参与扣减,计入 skippedUnknown', () => {
    const inventory = inv([
      { paletteKey: 'builtin:perler:P28', quantity: null, status: 'owned' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    expect(plan.entries).toHaveLength(0)
    expect(plan.skippedUnknown).toBeGreaterThan(0)
    expect(plan.totalDeducted).toBe(0)
  })

  it('没有库存记录同样跳过,不凭空创建负数', () => {
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory: new Map(), paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    expect(plan.entries).toHaveLength(0)
    expect(plan.totalDeducted).toBe(0)
  })

  it('扣到 0 时状态置为 out_of_stock', () => {
    const inventory = inv([
      { paletteKey: 'builtin:perler:P01', quantity: 1, status: 'owned' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    const blue = plan.entries.find((e) => e.paletteKey === 'builtin:perler:P01')
    expect(blue).toMatchObject({ after: 0, status: 'out_of_stock' })
  })

  it('库存少于用量时扣到 0,不会出现负数', () => {
    const inventory = inv([
      { paletteKey: 'builtin:perler:P28', quantity: 1, status: 'owned' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    const red = plan.entries.find((e) => e.paletteKey === 'builtin:perler:P28')
    expect(red.after).toBe(0)
    expect(red.status).toBe('out_of_stock')
  })

  it('个人色卡使用 user: 前缀的库存键', () => {
    const inventory = inv([
      { paletteKey: 'user:pal-1:P28', quantity: 10, status: 'owned' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'pal-1', paletteKind: 'user', resolveColor: resolve,
    })
    expect(plan.entries[0].paletteKey).toBe('user:pal-1:P28')
    expect(plan.entries[0].after).toBe(7)
  })

  it('无法解析到目标色卡颜色的 HEX 被跳过', () => {
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory: new Map(), paletteId: 'perler', paletteKind: 'builtin',
      resolveColor: () => null,
    })
    expect(plan.entries).toHaveLength(0)
  })

  it('已经是 0 的库存不产生条目(无可扣)', () => {
    const inventory = inv([
      { paletteKey: 'builtin:perler:P28', quantity: 0, status: 'out_of_stock' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    expect(plan.entries).toHaveLength(0)
  })
})

describe('inventoryDeduction · 写回', () => {
  it('逐条写回扣减后的数量与状态', async () => {
    const inventory = inv([
      { paletteKey: 'builtin:perler:P28', quantity: 3, status: 'owned' },
      { paletteKey: 'builtin:perler:P01', quantity: 50, status: 'owned' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    const writes = []
    const res = await applyInventoryDeduction(plan, async (payload) => {
      writes.push(payload)
      return { ok: true }
    })
    expect(res).toEqual({ ok: 2, failed: 0 })
    // 红 3 颗刚好用完 → 0 + out_of_stock;蓝仍有 49
    expect(writes.find((w) => w.paletteKey === 'builtin:perler:P28'))
      .toMatchObject({ quantity: 0, status: 'out_of_stock', paletteColorId: null })
    expect(writes.find((w) => w.paletteKey === 'builtin:perler:P01'))
      .toMatchObject({ quantity: 49, status: 'owned' })
  })

  it('单条写入失败不中断其余条目,失败数如实返回', async () => {
    const inventory = inv([
      { paletteKey: 'builtin:perler:P28', quantity: 10, status: 'owned' },
      { paletteKey: 'builtin:perler:P01', quantity: 10, status: 'owned' },
    ])
    const plan = planInventoryDeduction({
      canvasData: CANVAS, inventory, paletteId: 'perler', paletteKind: 'builtin', resolveColor: resolve,
    })
    let n = 0
    const res = await applyInventoryDeduction(plan, async () => {
      n++
      return { ok: n !== 1 } // 第一条失败
    })
    expect(res).toEqual({ ok: 1, failed: 1 })
    expect(n).toBe(2) // 第二条仍然尝试写入
  })

  it('空计划不写任何东西', async () => {
    let calls = 0
    const res = await applyInventoryDeduction({ entries: [] }, async () => { calls++; return { ok: true } })
    expect(res).toEqual({ ok: 0, failed: 0 })
    expect(calls).toBe(0)
  })
})

describe('inventoryDeduction · 开关契约(规格 05 §3)', () => {
  const inventory = () => inv([
    { paletteKey: 'builtin:perler:P28', quantity: 100, status: 'owned' },
    { paletteKey: 'builtin:perler:P01', quantity: 50, status: 'owned' },
  ])

  it('开关关闭:一次库存写入都不发生', async () => {
    let calls = 0
    const res = await runInventoryDeduction({
      enabled: false,
      canvasData: CANVAS, inventory: inventory(), paletteId: 'perler',
      paletteKind: 'builtin', resolveColor: resolve,
    }, async () => { calls++; return { ok: true } })
    expect(res.skipped).toBe(true)
    expect(calls).toBe(0)
  })

  it('开关开启:扣减并写回,返回总数与成功数', async () => {
    const writes = []
    const res = await runInventoryDeduction({
      enabled: true,
      canvasData: CANVAS, inventory: inventory(), paletteId: 'perler',
      paletteKind: 'builtin', resolveColor: resolve,
    }, async (p) => { writes.push(p); return { ok: true } })
    expect(res.skipped).toBe(false)
    expect(res.totalDeducted).toBe(4)
    expect(res.ok).toBe(2)
    expect(res.failed).toBe(0)
    expect(writes).toHaveLength(2)
  })

  it('开启但没有可扣的颜色:不写库存,skippedUnknown 如实返回', async () => {
    let calls = 0
    const res = await runInventoryDeduction({
      enabled: true,
      canvasData: CANVAS, inventory: new Map(), paletteId: 'perler',
      paletteKind: 'builtin', resolveColor: resolve,
    }, async () => { calls++; return { ok: true } })
    expect(res.skipped).toBe(false)
    expect(res.entries).toHaveLength(0)
    expect(res.skippedUnknown).toBe(3) // 红/蓝/绿三种颜色都没有库存记录
    expect(calls).toBe(0)
  })
})
