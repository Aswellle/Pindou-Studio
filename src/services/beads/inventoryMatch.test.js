import { describe, it, expect } from 'vitest'
import {
  matchColorStats,
  matchCanvasToInventory,
  applyColorMapping,
  buildShoppingList,
  summarize,
  MAPPING_STATUS,
  COLOR_STATUS,
  STOCK_STATUS,
  DEFAULT_CLOSE_THRESHOLD,
} from './inventoryMatch'

/**
 * 测试色卡(颜色是刻意挑选的:ΔE00 已用 src/utils/colorDiff 实测)
 *   RED   #FF0000
 *   NEAR  #FE0000  → 与 RED ΔE 0.21(接近)
 *   FAR   #FF6666  → 与 RED ΔE 15.00(较大色差)
 *   BLUE  #0000FF
 */
const CANDIDATES = [
  { id: 'R', code: 'R1', name: 'Red', hex: '#FF0000', beadSizeMm: 5 },
  { id: 'N', code: 'N1', name: 'Near Red', hex: '#FE0000', beadSizeMm: 5 },
  { id: 'F', code: 'F1', name: 'Far Red', hex: '#FF6666', beadSizeMm: 5 },
  { id: 'B', code: 'B1', name: 'Blue', hex: '#0000FF', beadSizeMm: 5 },
]

const stat = (hex, count) => ({ hex, count })

describe('inventoryMatch · 颜色状态', () => {
  it('精确命中:HEX 相同(大小写不敏感)→ colorStatus exact,ΔE = 0', () => {
    const { items } = matchColorStats({ stats: [stat('#ff0000', 10)], candidates: CANDIDATES })
    expect(items[0].colorStatus).toBe(COLOR_STATUS.EXACT)
    expect(items[0].deltaE00).toBe(0)
    expect(items[0].targetColor.code).toBe('R1')
    expect(items[0].requiredCount).toBe(10)
    // 没有库存记录时,综合状态提示"尚未记录库存"(未知 ≠ 缺货)
    expect(items[0].mappingStatus).toBe(MAPPING_STATUS.UNKNOWN_INVENTORY)
  })

  it('精确命中 + 库存已记录 → mappingStatus exact', () => {
    const inventory = new Map([['R', { quantity: 20 }]])
    const { items } = matchColorStats({
      stats: [stat('#ff0000', 10)],
      candidates: CANDIDATES,
      inventory,
    })
    expect(items[0].mappingStatus).toBe(MAPPING_STATUS.EXACT)
  })

  it('接近匹配:ΔE 在阈值内 → close', () => {
    // #FF0001 与 #FF0000 的 ΔE 极小,目标色应是 R1
    const { items } = matchColorStats({ stats: [stat('#FF0001', 4)], candidates: CANDIDATES })
    expect(items[0].colorStatus).toBe(COLOR_STATUS.CLOSE)
    expect(items[0].deltaE00).toBeLessThanOrEqual(DEFAULT_CLOSE_THRESHOLD)
    expect(items[0].autoApplicable).toBe(true)
  })

  it('较大色差 → poor-match,且不允许自动替换', () => {
    // 只有 FAR 候选时,#FF0000 与 #FF6666 ΔE ≈ 15
    const { items } = matchColorStats({
      stats: [stat('#FF0000', 3)],
      candidates: [CANDIDATES[2]],
    })
    expect(items[0].colorStatus).toBe(COLOR_STATUS.POOR)
    expect(items[0].mappingStatus).toBe(MAPPING_STATUS.POOR)
    expect(items[0].autoApplicable).toBe(false)
  })

  it('阈值可配置:调高阈值后同一对颜色变成 close', () => {
    const { items } = matchColorStats({
      stats: [stat('#FF0000', 3)],
      candidates: [CANDIDATES[2]],
      closeThreshold: 20,
    })
    expect(items[0].colorStatus).toBe(COLOR_STATUS.CLOSE)
  })

  it('目标色卡为空 → missing(不伪造最近色)', () => {
    const { items } = matchColorStats({ stats: [stat('#FF0000', 3)], candidates: [] })
    expect(items[0].mappingStatus).toBe(MAPPING_STATUS.MISSING)
    expect(items[0].targetColor).toBeNull()
  })
})

describe('inventoryMatch · 尺寸兼容', () => {
  it('图纸要求 5mm、目标色卡全是 2.6mm → incompatible-size,不计算色差', () => {
    const small = CANDIDATES.map((c) => ({ ...c, beadSizeMm: 2.6 }))
    const { items } = matchColorStats({
      stats: [stat('#FF0000', 5)],
      candidates: small,
      requiredBeadSizeMm: 5,
    })
    expect(items[0].mappingStatus).toBe(MAPPING_STATUS.INCOMPATIBLE_SIZE)
    expect(items[0].targetColor).toBeNull()
    expect(items[0].autoApplicable).toBe(false)
  })

  it('尺寸一致(含浮点容差)时正常匹配', () => {
    const { items } = matchColorStats({
      stats: [stat('#FF0000', 5)],
      candidates: CANDIDATES.map((c) => ({ ...c, beadSizeMm: 5.0 })),
      requiredBeadSizeMm: 5,
    })
    expect(items[0].mappingStatus).not.toBe(MAPPING_STATUS.INCOMPATIBLE_SIZE)
  })

  it('个人色卡未填直径(未知)不判为不兼容', () => {
    const unknownSize = CANDIDATES.map((c) => ({ ...c, beadSizeMm: null }))
    const { items } = matchColorStats({
      stats: [stat('#FF0000', 5)],
      candidates: unknownSize,
      requiredBeadSizeMm: 5,
    })
    expect(items[0].mappingStatus).not.toBe(MAPPING_STATUS.INCOMPATIBLE_SIZE)
  })
})

describe('inventoryMatch · 库存', () => {
  const stats = [stat('#FF0000', 10)]

  it('库存未知(null)≠ 缺货:状态 unknown-inventory,不计算短缺', () => {
    const inventory = new Map([['R', { quantity: null }]])
    const { items } = matchColorStats({ stats, candidates: CANDIDATES, inventory })
    expect(items[0].stockStatus).toBe(STOCK_STATUS.UNKNOWN)
    expect(items[0].mappingStatus).toBe(MAPPING_STATUS.UNKNOWN_INVENTORY)
    expect(items[0].shortageCount).toBeNull()
    expect(items[0].stockCount).toBeNull()
  })

  it('没有库存记录同样视为未知,而不是 0', () => {
    const { items } = matchColorStats({ stats, candidates: CANDIDATES })
    expect(items[0].stockStatus).toBe(STOCK_STATUS.UNKNOWN)
    expect(items[0].shortageCount).toBeNull()
  })

  it('库存充足 → sufficient,shortageCount = 0', () => {
    const inventory = new Map([['R', { quantity: 25 }]])
    const { items } = matchColorStats({ stats, candidates: CANDIDATES, inventory })
    expect(items[0].stockStatus).toBe(STOCK_STATUS.SUFFICIENT)
    expect(items[0].shortageCount).toBe(0)
  })

  it('库存不足 → shortageCount = 需求 − 库存', () => {
    const inventory = new Map([['R', { quantity: 4 }]])
    const { items } = matchColorStats({ stats, candidates: CANDIDATES, inventory })
    expect(items[0].stockStatus).toBe(STOCK_STATUS.SHORTAGE)
    expect(items[0].shortageCount).toBe(6)
  })

  it('库存为 0 → out-of-stock,短缺 = 全部需求', () => {
    const inventory = new Map([['R', { quantity: 0 }]])
    const { items } = matchColorStats({ stats, candidates: CANDIDATES, inventory })
    expect(items[0].stockStatus).toBe(STOCK_STATUS.OUT_OF_STOCK)
    expect(items[0].shortageCount).toBe(10)
  })

  it('库存不足不改变颜色质量判定(autoApplicable 只看色差)', () => {
    const inventory = new Map([['R', { quantity: 0 }]])
    const { items } = matchColorStats({ stats, candidates: CANDIDATES, inventory })
    expect(items[0].colorStatus).toBe(COLOR_STATUS.EXACT)
    expect(items[0].autoApplicable).toBe(true)
  })
})

describe('inventoryMatch · 矩阵输入与统计', () => {
  it('数量统计等于矩阵实际计数,空白格不计', () => {
    const canvasData = [
      ['#FF0000', '#FF0000', null],
      [null, '#0000FF', '#FF0000'],
    ]
    const { items, summary } = matchCanvasToInventory({ canvasData, candidates: CANDIDATES })
    const red = items.find((i) => i.sourceHex === '#FF0000')
    const blue = items.find((i) => i.sourceHex === '#0000FF')
    expect(red.requiredCount).toBe(3)
    expect(blue.requiredCount).toBe(1)
    expect(summary.colorCount).toBe(2)
    expect(summary.requiredBeads).toBe(4)
  })

  it('summary 汇总各状态数量与总短缺', () => {
    const items = [
      { mappingStatus: 'exact', requiredCount: 10, shortageCount: 3 },
      { mappingStatus: 'exact', requiredCount: 5, shortageCount: 0 },
      { mappingStatus: 'poor-match', requiredCount: 2, shortageCount: null },
    ]
    expect(summarize(items)).toEqual({
      colorCount: 3,
      requiredBeads: 17,
      shortageBeads: 3,
      byStatus: { exact: 2, 'poor-match': 1 },
    })
  })
})

describe('inventoryMatch · applyColorMapping', () => {
  const grid = () => [
    ['#FF0000', null, '#0000FF'],
    ['#FF0000', '#00FF00', null],
  ]

  it('一次性替换并返回变更格数', () => {
    const res = applyColorMapping(grid(), [{ from: '#FF0000', to: '#FF6666' }])
    expect(res.changed).toBe(2)
    expect(res.data.flat().filter((c) => c === '#FF6666')).toHaveLength(2)
    // 空白格数量不变
    expect(res.data.flat().filter((c) => c === null)).toHaveLength(2)
  })

  it('无变化 → data 为 null(调用方不压历史)', () => {
    expect(applyColorMapping(grid(), [{ from: '#123456', to: '#FFFFFF' }]).data).toBeNull()
    expect(applyColorMapping(grid(), []).data).toBeNull()
    expect(applyColorMapping(grid(), [{ from: '#FF0000', to: '#FF0000' }]).data).toBeNull()
  })

  it('同一事务里的链式映射互不吞并(A→B、B→C 各按原值映射)', () => {
    const res = applyColorMapping(grid(), [
      { from: '#FF0000', to: '#0000FF' },
      { from: '#0000FF', to: '#00FF00' },
    ])
    // 原红 → 蓝,原蓝 → 绿,原绿不变
    expect(res.data[0]).toEqual(['#0000FF', null, '#00FF00'])
    expect(res.data[1]).toEqual(['#0000FF', '#00FF00', null])
  })

  it('非法映射值被忽略,不改动矩阵', () => {
    const res = applyColorMapping(grid(), [{ from: 'red', to: '#FFFFFF' }])
    expect(res.data).toBeNull()
  })

  it('空矩阵安全返回', () => {
    expect(applyColorMapping([], [{ from: '#FF0000', to: '#0000FF' }]).data).toBeNull()
    expect(applyColorMapping(null, [{ from: '#FF0000', to: '#0000FF' }]).data).toBeNull()
  })
})

describe('inventoryMatch · 采购清单', () => {
  it('只列库存已知且不足的颜色,按色号自然排序;未知库存单独归类', () => {
    const items = [
      { targetColor: { code: 'B10' }, stockStatus: STOCK_STATUS.SHORTAGE, shortageCount: 5 },
      { targetColor: { code: 'B2' }, stockStatus: STOCK_STATUS.SHORTAGE, shortageCount: 3 },
      { targetColor: { code: 'A1' }, stockStatus: STOCK_STATUS.UNKNOWN, shortageCount: null },
      { targetColor: { code: 'C1' }, stockStatus: STOCK_STATUS.SUFFICIENT, shortageCount: 0 },
    ]
    const list = buildShoppingList(items)
    expect(list.need.map((i) => i.targetColor.code)).toEqual(['B2', 'B10'])
    expect(list.unknown.map((i) => i.targetColor.code)).toEqual(['A1'])
    expect(list.totalShortage).toBe(8)
  })
})
