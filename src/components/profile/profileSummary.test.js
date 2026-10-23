import { describe, it, expect } from 'vitest'
import { buildProfileSummary, pickRecentWorks, inventoryQuantityState } from './profileSummary'

/**
 * 资产聚合口径。
 *
 * 最重要的两条不变式:
 *   1. 加载中 / 出错 → null,不是 0(否则用户会以为资产丢了);
 *   2. quantity: null(未知)绝不参与求和,也与 quantity: 0(确实没有)区分。
 */

const beadStore = (over = {}) => ({
  mode: 'cloud',
  loading: false,
  error: null,
  palettes: [],
  colors: [],
  inventory: [],
  pendingLocal: 0,
  ...over,
})

const work = (id, savedAt, over = {}) => ({
  id,
  name: `作品 ${id}`,
  gridWidth: 29,
  gridHeight: 29,
  savedAt,
  canvasData: [[null]],
  ...over,
})

describe('buildProfileSummary · 加载与错误状态', () => {
  it('作品加载中时数量为 null,不报 0', () => {
    const s = buildProfileSummary({ works: [], worksLoading: true, beadStore: beadStore() })
    expect(s.worksCount).toBeNull()
    expect(s.worksLoading).toBe(true)
    expect(s.recentWorks).toEqual([])
  })

  it('云端作品读取失败时数量为 null,并标记为降级', () => {
    const s = buildProfileSummary({
      works: [work(1, '2026-10-01T00:00:00Z')],
      worksLoading: false,
      worksError: { code: 'loadFailed' },
      beadStore: beadStore(),
    })
    expect(s.worksCount).toBeNull()
    expect(s.worksDegraded).toBe(true)
  })

  it('拼豆资产加载中时各项为 null', () => {
    const s = buildProfileSummary({ works: [], worksLoading: false, beadStore: beadStore({ loading: true }) })
    expect(s.palettesCount).toBeNull()
    expect(s.colorsCount).toBeNull()
    expect(s.inventoryEntriesCount).toBeNull()
    expect(s.knownQuantityTotal).toBeNull()
  })

  it('拼豆资产出错时数量为 null,不把空列表当真实空态', () => {
    const s = buildProfileSummary({
      works: [],
      worksLoading: false,
      beadStore: beadStore({ error: { code: 'loadFailed' } }),
    })
    expect(s.palettesCount).toBeNull()
    expect(s.beadsError).toEqual({ code: 'loadFailed' })
  })
})

describe('buildProfileSummary · 计数', () => {
  it('正常数据下返回真实数量', () => {
    const s = buildProfileSummary({
      works: [work(1, '2026-10-01T00:00:00Z'), work(2, '2026-10-02T00:00:00Z')],
      worksLoading: false,
      beadStore: beadStore({
        palettes: [{ id: 'p1' }, { id: 'p2' }],
        colors: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
        inventory: [{ quantity: 100 }, { quantity: 50 }],
      }),
    })
    expect(s.worksCount).toBe(2)
    expect(s.palettesCount).toBe(2)
    expect(s.colorsCount).toBe(3)
    expect(s.inventoryEntriesCount).toBe(2)
    expect(s.knownQuantityTotal).toBe(150)
  })

  it('确实为空时返回 0(与加载中/出错的 null 区分)', () => {
    const s = buildProfileSummary({ works: [], worksLoading: false, beadStore: beadStore() })
    expect(s.worksCount).toBe(0)
    expect(s.palettesCount).toBe(0)
    expect(s.inventoryEntriesCount).toBe(0)
    expect(s.knownQuantityTotal).toBe(0)
  })

  it('缺少 beadStore 时不崩溃,资产项为 null', () => {
    const s = buildProfileSummary({ works: [], worksLoading: false })
    expect(s.palettesCount).toBeNull()
    expect(s.beadMode).toBe('local')
  })
})

describe('buildProfileSummary · 库存数量口径', () => {
  it('quantity: null 不参与求和,单独计入未知条目', () => {
    const s = buildProfileSummary({
      works: [],
      worksLoading: false,
      beadStore: beadStore({
        inventory: [{ quantity: null }, { quantity: 30 }, { quantity: null }],
      }),
    })
    expect(s.knownQuantityTotal).toBe(30)
    expect(s.unknownQuantityEntriesCount).toBe(2)
    expect(s.inventoryEntriesCount).toBe(3)
  })

  it('quantity: 0 是已知数量,计入总和而不是未知', () => {
    const s = buildProfileSummary({
      works: [],
      worksLoading: false,
      beadStore: beadStore({ inventory: [{ quantity: 0 }, { quantity: 10 }] }),
    })
    expect(s.knownQuantityTotal).toBe(10)
    expect(s.unknownQuantityEntriesCount).toBe(0)
  })

  it('非法数量(NaN / 负数 / 字符串)既不计入总和也不计入未知', () => {
    const s = buildProfileSummary({
      works: [],
      worksLoading: false,
      beadStore: beadStore({
        inventory: [{ quantity: Number.NaN }, { quantity: -5 }, { quantity: '20' }, { quantity: 7 }],
      }),
    })
    expect(s.knownQuantityTotal).toBe(7)
    expect(s.unknownQuantityEntriesCount).toBe(0)
    expect(s.inventoryEntriesCount).toBe(4)
  })
})

describe('buildProfileSummary · 本机待导入', () => {
  it('pendingLocal 独立展示,不并入任何总数', () => {
    const s = buildProfileSummary({
      works: [],
      worksLoading: false,
      beadStore: beadStore({ palettes: [{ id: 'p1' }], pendingLocal: 2 }),
    })
    expect(s.pendingLocalCount).toBe(2)
    expect(s.palettesCount).toBe(1) // 不含本机待导入
  })

  it('本地模式下 pendingLocal 恒为 0', () => {
    const s = buildProfileSummary({
      works: [],
      worksLoading: false,
      beadStore: beadStore({ mode: 'local', pendingLocal: 0 }),
    })
    expect(s.pendingLocalCount).toBe(0)
    expect(s.beadMode).toBe('local')
  })
})

describe('pickRecentWorks', () => {
  it('按 savedAt 倒序取前 3 件', () => {
    const list = [
      work(1, '2026-10-01T00:00:00Z'),
      work(2, '2026-10-03T00:00:00Z'),
      work(3, '2026-10-02T00:00:00Z'),
      work(4, '2026-10-04T00:00:00Z'),
    ]
    const recent = pickRecentWorks(list, 3)
    expect(recent.map(w => w.id)).toEqual([4, 2, 3])
  })

  it('缺少 savedAt 的作品排在最后,不被当成最新', () => {
    const list = [work(1, null), work(2, '2026-10-01T00:00:00Z')]
    expect(pickRecentWorks(list, 3).map(w => w.id)).toEqual([2, 1])
  })

  it('只返回元数据,不复制 canvasData', () => {
    const recent = pickRecentWorks([work(1, '2026-10-01T00:00:00Z')], 3)
    expect(recent[0]).toEqual({
      id: 1,
      name: '作品 1',
      width: 29,
      height: 29,
      savedAt: '2026-10-01T00:00:00Z',
    })
    expect(recent[0].canvasData).toBeUndefined()
  })

  it('矩形作品保留真实宽高;gridWidth 缺失时回退 gridSize', () => {
    const rect = pickRecentWorks([work(1, '2026-10-01T00:00:00Z', { gridWidth: 57, gridHeight: 29 })], 3)
    expect(rect[0].width).toBe(57)
    expect(rect[0].height).toBe(29)

    const legacy = pickRecentWorks([{ id: 2, gridSize: 87, savedAt: '2026-10-01T00:00:00Z' }], 3)
    expect(legacy[0].width).toBe(87)
    expect(legacy[0].height).toBe(87)
  })

  it('空数组与非数组输入都安全', () => {
    expect(pickRecentWorks([], 3)).toEqual([])
    expect(pickRecentWorks(null, 3)).toEqual([])
  })
})

describe('inventoryQuantityState', () => {
  it('区分空 / 全已知 / 全未知 / 混合', () => {
    const base = { inventoryEntriesCount: 0, unknownQuantityEntriesCount: 0 }
    expect(inventoryQuantityState(base)).toBe('empty')
    expect(inventoryQuantityState({ inventoryEntriesCount: 2, unknownQuantityEntriesCount: 0 })).toBe('known')
    expect(inventoryQuantityState({ inventoryEntriesCount: 2, unknownQuantityEntriesCount: 2 })).toBe(
      'unknown'
    )
    expect(inventoryQuantityState({ inventoryEntriesCount: 2, unknownQuantityEntriesCount: 1 })).toBe('mixed')
  })

  it('数据未就绪时返回 unknown-loading', () => {
    expect(inventoryQuantityState(null)).toBe('unknown-loading')
    expect(inventoryQuantityState({ inventoryEntriesCount: null })).toBe('unknown-loading')
  })
})
