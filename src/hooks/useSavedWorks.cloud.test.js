import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'

/**
 * useSavedWorks · 云端模式(迁移 0024 元数据列)。
 *
 * 覆盖两件在真实云端才会暴露的事:
 *   1. 来源类别与项目模型版本确实被写进 works 行(否则「导入 → 保存 → 重开」
 *      的来源信息只存在本地,换设备就丢);
 *   2. 迁移 0024 尚未执行时(列不存在),保存**不得整体失败** ——
 *      元数据是附加信息,作品本体(canvas_data/尺寸/色卡)必须照常落库。
 *      这里用假客户端模拟 PostgREST 的 PGRST204。
 */

const cloud = {
  rows: [],
  missingColumns: new Set(),
  inserted: [],   // 每次 insert 调用(含失败重试),用于断言重试确实发生
  upserted: [],
  failNext: null, // 强制下一次写入返回该错误(模拟真实业务失败)
  failSelect: null, // 强制作品列表查询失败(模拟云端读取失败 → 降级本机)
}

const missingError = (col) => ({
  code: 'PGRST204',
  message: `Could not find the '${col}' column of 'works' in the schema cache`,
  details: null,
})

/** 把待写入行按「已存在列」裁剪;缺列时返回错误 */
function applyRow(row) {
  for (const col of cloud.missingColumns) {
    if (Object.hasOwn(row, col)) return { error: missingError(col) }
  }
  return { row: { id: `row-${cloud.rows.length + 1}`, ...row } }
}

function makeBuilder(kind, payload) {
  const resolve = () => {
    if (kind === 'select') {
      if (cloud.failSelect) return { data: null, error: cloud.failSelect }
      return { data: cloud.rows, error: null }
    }
    if (kind === 'insert') {
      cloud.inserted.push(payload)
      if (cloud.failNext) return { data: null, error: cloud.failNext }
      const res = applyRow(payload)
      if (res.error) return { data: null, error: res.error }
      cloud.rows.push(res.row)
      return { data: res.row, error: null }
    }
    if (kind === 'upsert') {
      cloud.upserted.push(payload)
      const written = []
      for (const row of payload) {
        const res = applyRow(row)
        if (res.error) return { data: null, error: res.error }
        cloud.rows.push(res.row)
        written.push(res.row)
      }
      return { data: written, error: null }
    }
    return { data: null, error: null }
  }

  const builder = {
    select() { return builder },
    eq() { return builder },
    order() { return Promise.resolve(resolve()) },
    single() {
      const r = resolve()
      return Promise.resolve({ data: r.data, error: r.error })
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected)
    },
  }
  return builder
}

vi.mock('../services/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => makeBuilder('select'),
      insert: (row) => makeBuilder('insert', row),
      upsert: (rows) => makeBuilder('upsert', rows),
      delete: () => makeBuilder('delete'),
    }),
  },
}))

const { useSavedWorks } = await import('./useSavedWorks')

const USER = { id: 'user-1' }
const blank = (w, h) => Array.from({ length: h }, () => Array.from({ length: w }, () => null))

beforeEach(() => {
  cloud.rows = []
  cloud.missingColumns = new Set()
  cloud.inserted = []
  cloud.upserted = []
  cloud.failNext = null
  cloud.failSelect = null
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useSavedWorks · 云端元数据列(迁移 0024)', () => {
  it('保存时写入来源类别与项目模型版本,返回的作品带回来源', async () => {
    const { result } = renderHook(() => useSavedWorks(USER))

    await act(async () => {
      await result.current.saveWork({
        id: 1,
        name: '导入的图纸',
        canvasData: blank(12, 10),
        gridSize: 12,
        paletteId: 'mard',
        savedAt: '2026-10-19T00:00:00.000Z',
        sourceKind: 'chart-import',
      })
    })

    const [row] = cloud.inserted
    expect(row.source_kind).toBe('chart-import')
    expect(row.schema_version).toBe(1)
    expect(result.current.works[0].sourceKind).toBe('chart-import')
  })

  it('手绘作品不写 source_kind(避免把「无来源」写成假来源)', async () => {
    const { result } = renderHook(() => useSavedWorks(USER))

    await act(async () => {
      await result.current.saveWork({
        id: 2,
        name: '手绘',
        canvasData: blank(9, 9),
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
      })
    })

    expect(cloud.inserted[0]).not.toHaveProperty('source_kind')
    // schema_version 是每行都写的模型版本标记
    expect(cloud.inserted[0].schema_version).toBe(1)
  })

  it('迁移未执行(缺列)时自动降级重试,作品本体仍保存成功', async () => {
    cloud.missingColumns = new Set(['source_kind'])
    const { result } = renderHook(() => useSavedWorks(USER))

    let ok
    await act(async () => {
      ok = await result.current.saveWork({
        id: 3,
        name: '缺列的库',
        canvasData: blank(9, 9),
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
        sourceKind: 'native-file',
      })
    })

    expect(ok).toBe(true)
    // 第一次带元数据失败,第二次去掉元数据成功
    expect(cloud.inserted).toHaveLength(2)
    expect(cloud.inserted[0]).toHaveProperty('source_kind')
    expect(cloud.inserted[1]).not.toHaveProperty('source_kind')
    expect(cloud.inserted[1]).not.toHaveProperty('schema_version')
    // 作品本体字段在重试中完整保留
    expect(cloud.inserted[1].canvas_data).toHaveLength(9)
    expect(cloud.inserted[1].grid_size).toBe(9)
    expect(cloud.inserted[1].palette_id).toBe('perler')
  })

  it('非缺列错误不会触发降级重试(真实失败必须上报,不能假装成功)', async () => {
    // 权限/网络类错误与 0024 无关 → 不重试,如实返回失败
    cloud.failNext = { code: '42501', message: 'new row violates row-level security policy' }
    const { result } = renderHook(() => useSavedWorks(USER))

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let ok
    await act(async () => {
      ok = await result.current.saveWork({
        id: 4,
        name: '真实失败',
        canvasData: blank(9, 9),
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
      })
    })

    expect(ok).toBe(false)
    expect(cloud.inserted).toHaveLength(1)   // 没有重试
    spy.mockRestore()
  })

  it('登录迁移的 upsert 同样在缺列时降级,不阻断本地作品上云', async () => {
    cloud.missingColumns = new Set(['schema_version'])
    localStorage.setItem('saved-works', JSON.stringify([{
      id: 5,
      name: '本机作品',
      canvasData: blank(9, 9),
      gridSize: 9,
      paletteId: 'perler',
      savedAt: '2026-10-19T00:00:00.000Z',
    }]))

    const { result } = renderHook(() => useSavedWorks(USER))
    await act(async () => { await Promise.resolve() })

    // 第一次 upsert 带元数据失败 → 第二次不带元数据成功
    expect(cloud.upserted).toHaveLength(2)
    expect(cloud.upserted[0][0]).toHaveProperty('schema_version')
    expect(cloud.upserted[1][0]).not.toHaveProperty('schema_version')
    expect(cloud.upserted[1][0].canvas_data).toHaveLength(9)
    // 迁移成功后才清空本机(失败时保留)
    expect(localStorage.getItem('saved-works')).toBeNull()
    expect(result.current.syncCount).toBe(1)
  })
})

describe('useSavedWorks · 云端读取失败的对外状态', () => {
  it('读取失败时置位 worksError,同时仍回退到本机作品', async () => {
    cloud.failSelect = { message: 'network unreachable' }
    localStorage.setItem('saved-works', JSON.stringify([{
      id: 9,
      name: '本机作品',
      canvasData: blank(9, 9),
      gridSize: 9,
      paletteId: 'perler',
      savedAt: '2026-10-19T00:00:00.000Z',
    }]))

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSavedWorks(USER))

    await waitFor(() => expect(result.current.worksLoading).toBe(false))

    // 失败事实被暴露出来 —— 个人中心据此显示「当前为本机数据」而不是「你没有作品」
    expect(result.current.worksError).toEqual(
      expect.objectContaining({ code: 'loadFailed' })
    )
    // 但数据没有丢:仍是本机那份
    expect(result.current.works).toHaveLength(1)
    expect(result.current.works[0].name).toBe('本机作品')
    spy.mockRestore()
  })

  it('读取成功后 worksError 为 null(失败后重试恢复)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    cloud.failSelect = { message: 'temporary' }
    const { result } = renderHook(() => useSavedWorks(USER))
    await waitFor(() => expect(result.current.worksError).not.toBeNull())

    // 模拟网络恢复:重新挂载(等价于用户刷新页面)
    cleanup()
    cloud.failSelect = null
    cloud.rows = [{
      id: 'row-1', name: '云端作品', canvas_data: blank(9, 9),
      grid_size: 9, grid_width: null, grid_height: null,
      palette_id: 'perler', saved_at: '2026-10-20T00:00:00.000Z',
    }]
    const second = renderHook(() => useSavedWorks(USER))
    await waitFor(() => expect(second.result.current.worksLoading).toBe(false))

    expect(second.result.current.worksError).toBeNull()
    expect(second.result.current.works[0].name).toBe('云端作品')
    spy.mockRestore()
  })
})
