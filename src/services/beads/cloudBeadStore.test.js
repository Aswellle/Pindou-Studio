import { describe, it, expect } from 'vitest'
import { createCloudBeadStore } from './cloudBeadStore'

/**
 * 云端仓库的协议测试(不连真实 Supabase)。
 *
 * 这里验证的是「发给 PostgREST 的写入形状」:user_id 必须显式带上,
 * 否则 RLS 的 with check 会拒绝,或者行直接违反 not null。
 * 真实的跨用户拒绝只能由带两个账号的 Supabase 集成测试证明,
 * 本仓库没有测试实例 —— 该项在交付说明里标为未验证。
 */

/** 极简链式假客户端:记录最后一次操作,thenable 以便 await */
function fakeClient({ data = null, error = null } = {}) {
  const calls = []
  const makeBuilder = (table) => {
    const op = { table, method: null, payload: null, options: null, filters: [], single: false }
    const builder = {
      insert(payload) { op.method = 'insert'; op.payload = payload; return builder },
      upsert(payload, options) { op.method = 'upsert'; op.payload = payload; op.options = options; return builder },
      update(payload) { op.method = 'update'; op.payload = payload; return builder },
      delete() { op.method = 'delete'; return builder },
      select() { if (!op.method) op.method = 'select'; return builder },
      eq(col, val) { op.filters.push([col, val]); return builder },
      order() { return builder },
      single() { op.single = true; return builder },
      then(resolve, reject) {
        calls.push(op)
        // 模拟 supabase-js:`.single()` 返回对象,否则返回数组
        let payload = data
        if (!error && payload !== null && !Array.isArray(payload) && !op.single) {
          payload = [payload]
        }
        const out = error
          ? { data: null, error }
          : { data: payload, error: null }
        return Promise.resolve(out).then(resolve, reject)
      },
    }
    return builder
  }
  return {
    calls,
    from(table) { return makeBuilder(table) },
  }
}

const USER_ID = 'user-1111'

describe('cloudBeadStore · 写入形状', () => {
  it('createPalette 的 insert 带 user_id 与规范化字段', async () => {
    const client = fakeClient({
      data: { id: 'pal-1', name: 'P', brand_name: null, series_name: null, bead_size_mm: 2.6, notes: null, created_at: 't', updated_at: 't' },
    })
    const store = createCloudBeadStore(client, USER_ID)
    const res = await store.createPalette({ name: 'P', beadSizeMm: 2.6 })

    expect(res.ok).toBe(true)
    expect(client.calls[0].table).toBe('user_palettes')
    expect(client.calls[0].method).toBe('insert')
    expect(client.calls[0].payload).toMatchObject({
      user_id: USER_ID,
      name: 'P',
      bead_size_mm: 2.6,
    })
    // snake_case 映射回 camelCase
    expect(res.palette.beadSizeMm).toBe(2.6)
  })

  it('addColor 的 insert 同时带 user_id 与 palette_id', async () => {
    const client = fakeClient({
      data: { id: 'col-1', palette_id: 'pal-1', code: 'A1', name: null, hex: '#FF0000', notes: null, sort_order: 0 },
    })
    const store = createCloudBeadStore(client, USER_ID)
    const res = await store.addColor('pal-1', { code: 'A1', hex: '#ff0000' })

    expect(res.ok).toBe(true)
    expect(client.calls[0].table).toBe('user_palette_colors')
    expect(client.calls[0].payload).toMatchObject({
      user_id: USER_ID,
      palette_id: 'pal-1',
      hex: '#FF0000',
    })
  })

  it('addColor 写入颜色来源,默认 factory', async () => {
    const client = fakeClient({
      data: { id: 'col-1', palette_id: 'pal-1', code: 'A1', hex: '#FF0000', sort_order: 0, source: 'measured' },
    })
    const store = createCloudBeadStore(client, USER_ID)

    await store.addColor('pal-1', { code: 'A1', hex: '#FF0000', source: 'measured' })
    expect(client.calls[0].payload.source).toBe('measured')

    // 未提供来源 → factory
    const client2 = fakeClient({ data: { id: 'col-2', palette_id: 'pal-1', code: 'A2', hex: '#00FF00', sort_order: 0 } })
    await createCloudBeadStore(client2, USER_ID).addColor('pal-1', { code: 'A2', hex: '#00FF00' })
    expect(client2.calls[0].payload.source).toBe('factory')
  })

  it('load 把 source 列映射到 UI 字段,旧行缺失时回退 factory', async () => {
    const client = fakeClient({
      data: [
        { id: 'col-1', palette_id: 'pal-1', code: 'A1', hex: '#FF0000', sort_order: 0, source: 'estimated' },
        { id: 'col-2', palette_id: 'pal-1', code: 'A2', hex: '#00FF00', sort_order: 1 },
      ],
    })
    const store = createCloudBeadStore(client, USER_ID)
    const loaded = await store.load()
    expect(loaded.colors[0].source).toBe('estimated')
    expect(loaded.colors[1].source).toBe('factory')
  })

  it('addColors 单次 insert 多行,每行带 user_id/palette_id/source 与递增 sort_order', async () => {
    const client = fakeClient({
      data: [
        { id: 'c1', palette_id: 'pal-1', code: 'B1', hex: '#0000FF', sort_order: 5, source: 'factory' },
        { id: 'c2', palette_id: 'pal-1', code: 'C1', hex: '#00FF00', sort_order: 6, source: 'measured' },
      ],
    })
    const store = createCloudBeadStore(client, USER_ID)
    const res = await store.addColors('pal-1', [
      { code: 'B1', hex: '#0000ff' },
      { code: 'C1', hex: '#00ff00', source: 'measured' },
    ], [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }, { id: 'x4' }, { id: 'x5' }])

    expect(res.ok).toBe(true)
    expect(client.calls).toHaveLength(1) // 整批一次写入
    expect(client.calls[0].method).toBe('insert')
    expect(client.calls[0].payload).toHaveLength(2)
    for (const row of client.calls[0].payload) {
      expect(row.user_id).toBe(USER_ID)
      expect(row.palette_id).toBe('pal-1')
    }
    // sort_order 接着已有 5 个颜色
    expect(client.calls[0].payload.map((r) => r.sort_order)).toEqual([5, 6])
    expect(client.calls[0].payload[1].source).toBe('measured')
  })

  it('addColors 任何一行非法:整批不发出请求', async () => {
    const client = fakeClient()
    const store = createCloudBeadStore(client, USER_ID)
    const res = await store.addColors('pal-1', [
      { code: 'B1', hex: '#0000FF' },
      { code: 'b1', hex: '#00FF00' }, // 批内重码
    ], [])

    expect(res.ok).toBe(false)
    expect(res.errors[0]).toMatchObject({ code: 'duplicateCode', index: 1 })
    expect(client.calls).toHaveLength(0)
  })

  it('createPaletteWithColors 批量 insert 每行都带 user_id', async () => {
    const client = fakeClient({
      data: { id: 'pal-1', name: 'P', brand_name: null, series_name: null, bead_size_mm: null, notes: null },
    })
    const store = createCloudBeadStore(client, USER_ID)
    await store.createPaletteWithColors(
      { name: 'P' },
      [{ code: 'A1', hex: '#FF0000' }, { code: 'A2', hex: '#00FF00' }],
    )
    const colorCall = client.calls.find((c) => c.table === 'user_palette_colors')
    expect(Array.isArray(colorCall.payload)).toBe(true)
    for (const row of colorCall.payload) {
      expect(row.user_id).toBe(USER_ID)
      expect(row.palette_id).toBe('pal-1')
    }
  })

  it('setInventory 的 upsert 带 user_id,并按 (user_id, palette_key) 去重', async () => {
    const client = fakeClient({
      data: { id: 'inv-1', palette_key: 'builtin:perler:P01', palette_color_id: null, quantity: 5, status: 'owned', notes: null, updated_at: 't' },
    })
    const store = createCloudBeadStore(client, USER_ID)
    const res = await store.setInventory({ paletteKey: 'builtin:perler:P01', quantity: 5 })

    expect(res.ok).toBe(true)
    expect(client.calls[0].method).toBe('upsert')
    expect(client.calls[0].payload).toMatchObject({
      user_id: USER_ID,
      palette_key: 'builtin:perler:P01',
      quantity: 5,
    })
    expect(client.calls[0].options.onConflict).toBe('user_id,palette_key')
  })

  it('负数库存不发请求,直接拒绝', async () => {
    const client = fakeClient()
    const store = createCloudBeadStore(client, USER_ID)
    const res = await store.setInventory({ paletteKey: 'k', quantity: -1 })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe('invalidQuantity')
    expect(client.calls).toHaveLength(0)
  })
})

describe('cloudBeadStore · 读取与错误', () => {
  it('load 把 snake_case 行映射为 UI 字段', async () => {
    const client = {
      calls: [],
      from(table) {
        const rows = {
          user_palettes: [{ id: 'p1', name: 'P', brand_name: 'B', series_name: 'S', bead_size_mm: '5.00', notes: '', created_at: 'c', updated_at: 'u' }],
          user_palette_colors: [{ id: 'c1', palette_id: 'p1', code: 'A1', name: '', hex: '#FF0000', notes: '', sort_order: 2 }],
          user_bead_inventory: [{ id: 'i1', palette_key: 'user:p1:c1', palette_color_id: 'c1', quantity: 7, status: 'low', notes: '', updated_at: 'u' }],
        }[table]
        const builder = {
          select() { return builder },
          order() { return builder },
          then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
        }
        return builder
      },
    }
    const store = createCloudBeadStore(client, USER_ID)
    const data = await store.load()
    expect(data.palettes[0]).toMatchObject({ id: 'p1', brandName: 'B', seriesName: 'S', beadSizeMm: 5 })
    expect(data.colors[0]).toMatchObject({ paletteId: 'p1', sortOrder: 2 })
    expect(data.inventory[0]).toMatchObject({ paletteKey: 'user:p1:c1', quantity: 7, status: 'low' })
  })

  it('数据库错误被转成 { ok:false },不伪装成功', async () => {
    const client = fakeClient({ error: { message: 'new row violates row-level security policy' } })
    const store = createCloudBeadStore(client, USER_ID)
    const res = await store.createPalette({ name: 'P' })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe('cloud')
    expect(store.takeError().detail).toMatch(/row-level security/)
  })

  it('未配置云端时所有写入返回 cloudNotConfigured', async () => {
    const store = createCloudBeadStore(null, null)
    expect((await store.createPalette({ name: 'P' })).errors[0].code).toBe('cloudNotConfigured')
    expect((await store.setInventory({ paletteKey: 'k' })).errors[0].code).toBe('cloudNotConfigured')
  })
})
