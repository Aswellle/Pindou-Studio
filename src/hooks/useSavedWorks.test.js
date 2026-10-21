import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { useSavedWorks, SAVE_STATES } from './useSavedWorks'
import { __resetForTests as resetWorksStore } from '../services/project/worksStore'

/**
 * 本地模式的作品持久化契约。
 *
 * M9.2 起本地作品存 IndexedDB(worksStore),localStorage 仅作兼容/兜底:
 *   - 写入时尺寸以 canvasData 实际形状为准(修复历史上声明尺寸与数据不一致);
 *   - 读取时同样归一,旧数据无需回填;
 *   - 首次运行把 localStorage 的 `saved-works` 一次性搬进 IndexedDB。
 *
 * 云端由 rowToWork/workToRow 单测 + 迁移 SQL 约束覆盖(见 .cloud.test.js)。
 */

vi.mock('../services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null }
})

const LEGACY_KEY = 'saved-works'
const blank = (w, h) => Array.from({ length: h }, () => Array.from({ length: w }, () => null))

/**
 * 等 hook 完成首次异步加载。
 *
 * 不能只等 worksLoading 变 false:它初值是 true,但异步链(迁移 → 读库)
 * 跨多个微任务,waitFor 的轮询可能在 setWorks 生效之前就看到 false。
 * 这里显式把整个异步链推完再断言。
 */
const waitForLoad = async (result) => {
  await act(async () => {
    // 连续让出微任务,直到 loading 落地且 works 已写入
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
    }
    await new Promise((r) => setTimeout(r, 0))
  })
  await waitFor(() => expect(result.current.worksLoading).toBe(false))
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

/** 直接读 IndexedDB 里的作品(验证落库结果,而不是 hook 内存态) */
async function readStored() {
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('pindou-works', 1)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('works')) d.createObjectStore('works', { keyPath: 'id' })
    }
  })
  return new Promise((resolve) => {
    const t = db.transaction('works', 'readonly')
    const req = t.objectStore('works').getAll()
    t.oncomplete = () => resolve(req.result || [])
  })
}

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  // 清连接缓存:dbPromise 是模块级缓存,换了 IDBFactory 必须一起重置,
  // 否则会继续用上一个用例的库
  resetWorksStore()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useSavedWorks · 本地模式写入归一', () => {
  it('保存时以 canvasData 实际形状覆盖不一致的声明尺寸', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    await act(async () => {
      await result.current.saveWork({
        id: 1,
        name: '错位作品',
        canvasData: blank(12, 10),
        gridSize: 29,          // 声明 29×29,实际 12×10
        gridWidth: null,
        gridHeight: null,
        paletteId: 'mard',
        savedAt: '2026-10-19T00:00:00.000Z',
      })
    })

    const stored = await readStored()
    expect(stored).toHaveLength(1)
    expect(stored[0].gridSize).toBe(12)
    expect(stored[0].gridWidth).toBe(12)
    expect(stored[0].gridHeight).toBe(10)
    expect(stored[0].paletteId).toBe('mard')
    expect(stored[0].name).toBe('错位作品')
  })

  it('方形作品落库时 gridWidth/gridHeight 为 null', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    await act(async () => {
      await result.current.saveWork({
        id: 2,
        name: '方形',
        canvasData: blank(9, 9),
        gridSize: 9,
        gridWidth: 9,   // 显式传了方形宽高,也应归一为 null
        gridHeight: 9,
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
      })
    })

    const [work] = await readStored()
    expect(work.gridWidth).toBeNull()
    expect(work.gridHeight).toBeNull()
    expect(work.gridSize).toBe(9)
  })

  it('保存后 hook 返回值与落库值一致', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    await act(async () => {
      await result.current.saveWork({
        id: 3,
        name: '矩形',
        canvasData: blank(12, 10),
        gridSize: 29,
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
      })
    })

    expect(result.current.works).toHaveLength(1)
    expect(result.current.works[0].gridWidth).toBe(12)
    expect(result.current.works[0].gridHeight).toBe(10)
  })

  it('图库复制来源 id 在本地往返中原样保留(数字与 uuid 均可)', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    await act(async () => {
      await result.current.saveWork({
        id: 4,
        name: '复制内置',
        canvasData: blank(9, 9),
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
        sourceTemplateId: 7,
      })
    })
    await act(async () => {
      await result.current.saveWork({
        id: 5,
        name: '复制云端',
        canvasData: blank(9, 9),
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:01.000Z',
        sourceTemplateId: 'a1b2c3d4-0000-0000-0000-000000000000',
      })
    })

    const stored = (await readStored()).sort((a, b) => a.id - b.id)
    expect(stored).toHaveLength(2)
    expect(stored[0].sourceTemplateId).toBe(7)
    expect(stored[1].sourceTemplateId).toBe('a1b2c3d4-0000-0000-0000-000000000000')
  })

  it('来源类别随作品落库,重新读取后仍可区分导入/复制/手绘', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)
    await act(async () => {
      await result.current.saveWork({
        id: 6,
        name: '导入的图纸',
        canvasData: blank(9, 9),
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
        sourceKind: 'chart-import',
      })
    })

    expect((await readStored())[0].sourceKind).toBe('chart-import')

    // 重新挂载 = 用户下次打开页面;来源必须还在,否则「导入」会退化成「手绘」
    cleanup()
    const reopened = renderHook(() => useSavedWorks(null))
    await waitForLoad(reopened.result)
    expect(reopened.result.current.works[0].sourceKind).toBe('chart-import')
  })

  it('未提供来源时不会凭空写入 sourceKind(手绘作品保持无来源)', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)
    await act(async () => {
      await result.current.saveWork({
        id: 7,
        name: '手绘',
        canvasData: blank(9, 9),
        paletteId: 'perler',
        savedAt: '2026-10-19T00:00:00.000Z',
      })
    })
    expect((await readStored())[0].sourceKind).toBeUndefined()
  })
})

describe('useSavedWorks · updateWork(重新指定色卡)', () => {
  it('本地模式:只改 paletteId,画布数据与 id 不变,并落库', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    const canvas = [[null, null], [null, null]]
    await act(async () => {
      await result.current.saveWork({
        id: 'w-1',
        name: '作品',
        canvasData: canvas,
        gridSize: 2,
        paletteId: 'perler',
        savedAt: '2026-10-20T00:00:00.000Z',
      })
    })

    let ok = false
    await act(async () => {
      ok = await result.current.updateWork({
        ...result.current.works[0],
        paletteId: 'mard',
      })
    })
    expect(ok).toBe(true)

    const stored = await readStored()
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('w-1')
    expect(stored[0].paletteId).toBe('mard')
    expect(stored[0].canvasData).toEqual(canvas)
    // hook 内存态同步更新,不需要刷新
    expect(result.current.works[0].paletteId).toBe('mard')
  })

  it('没有 id 的作品直接返回 false,不写库', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    let ok = true
    await act(async () => {
      ok = await result.current.updateWork({ name: '无 id', canvasData: blank(2, 2) })
    })
    expect(ok).toBe(false)
    expect(await readStored()).toHaveLength(0)
  })
})

describe('useSavedWorks · 旧 localStorage 数据迁移', () => {
  it('首次加载把 saved-works 搬进 IndexedDB,并清掉原键', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{
      id: 20,
      name: '老作品',
      canvasData: blank(9, 9),
      gridSize: 9,
      paletteId: 'hama',
      savedAt: '2026-09-01T00:00:00.000Z',
    }]))

    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    expect(result.current.works).toHaveLength(1)
    expect(result.current.works[0].name).toBe('老作品')
    // 数据已进 IndexedDB
    expect(await readStored()).toHaveLength(1)
    // 原键已清理,备份保留原始 JSON
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem('saved-works-migrated'))).toHaveLength(1)
  })

  it('迁移只发生一次:再次加载不会重复插入', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{
      id: 21, name: '老作品', canvasData: blank(9, 9), gridSize: 9,
      paletteId: 'hama', savedAt: '2026-09-01T00:00:00.000Z',
    }]))

    const first = renderHook(() => useSavedWorks(null))
    await waitForLoad(first.result)
    cleanup()

    const second = renderHook(() => useSavedWorks(null))
    await waitForLoad(second.result)
    expect(second.result.current.works).toHaveLength(1)
  })
})

describe('useSavedWorks · 本地模式读取归一', () => {
  it('预置的旧数据(声明尺寸错位)在读取时被修正', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{
      id: 10,
      name: '旧作品',
      canvasData: blank(12, 10),
      gridSize: 29,
      gridWidth: null,
      gridHeight: null,
      paletteId: 'hama',
      savedAt: '2026-09-01T00:00:00.000Z',
    }]))

    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    const [work] = result.current.works
    expect(work.gridSize).toBe(12)
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
    expect(work.paletteId).toBe('hama')
  })

  it('预置的参差行被补齐,矩阵矩形', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{
      id: 11,
      name: '参差',
      canvasData: [['#FF0000', '#FF0000', '#FF0000'], ['#00FF00']],
      gridSize: 3,
      paletteId: 'perler',
      savedAt: '2026-09-01T00:00:00.000Z',
    }]))

    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)
    expect(result.current.works[0].canvasData[1]).toEqual(['#00FF00', null, null])
  })

  it('损坏的 localStorage 仍走备份 + 清空分支,不抛异常', async () => {
    localStorage.setItem(LEGACY_KEY, '{not json')

    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    expect(result.current.works).toEqual([])
    expect(localStorage.getItem(`${LEGACY_KEY}-corrupt`)).toBe('{not json')
  })

  it('非数组的历史值不会让 hook 崩溃', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ oops: true }))

    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)
    expect(result.current.works).toEqual([])
  })
})

describe('useSavedWorks · 保存状态机', () => {
  it('初始为 idle', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)
    expect(result.current.saveState).toBe(SAVE_STATES.IDLE)
  })

  it('markDirty 后变为 dirty,保存成功后变为 saved', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    act(() => { result.current.markDirty() })
    expect(result.current.saveState).toBe(SAVE_STATES.DIRTY)

    await act(async () => {
      await result.current.saveWork({
        id: 30, name: '状态测试', canvasData: blank(9, 9),
        paletteId: 'perler', savedAt: '2026-10-19T00:00:00.000Z',
      })
    })
    expect(result.current.saveState).toBe(SAVE_STATES.SAVED)
  })

  it('保存进行中 markDirty 不会把状态打回 dirty', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    // 让仓储写入挂起,以便在 saving 状态下插入 markDirty
    let release
    const gate = new Promise((r) => { release = r })
    const store = await import('../services/project/worksStore')
    const spy = vi.spyOn(store, 'saveWorkRecord').mockImplementation(async (_w) => {
      await gate
      return { ok: true }
    })

    let savePromise
    act(() => {
      savePromise = result.current.saveWork({
        id: 31, name: '慢保存', canvasData: blank(9, 9),
        paletteId: 'perler', savedAt: '2026-10-19T00:00:00.000Z',
      })
    })

    await waitFor(() => expect(result.current.saveState).toBe(SAVE_STATES.SAVING))
    act(() => { result.current.markDirty() })
    // 保存请求还没回来,状态必须仍是 saving,不能被 markDirty 打回 dirty
    expect(result.current.saveState).toBe(SAVE_STATES.SAVING)

    release()
    await act(async () => { await savePromise })
    expect(result.current.saveState).toBe(SAVE_STATES.SAVED)
    spy.mockRestore()
  })

  it('保存失败时变为 failed 并返回 false', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    // 让仓储写入明确失败(模拟配额不足)
    const store = await import('../services/project/worksStore')
    const spy = vi.spyOn(store, 'saveWorkRecord').mockResolvedValue({ ok: false, reason: 'quota' })

    let ok
    await act(async () => {
      ok = await result.current.saveWork({
        id: 32, name: '失败保存', canvasData: blank(9, 9),
        paletteId: 'perler', savedAt: '2026-10-19T00:00:00.000Z',
      })
    })

    expect(ok).toBe(false)
    expect(result.current.saveState).toBe(SAVE_STATES.FAILED)
    spy.mockRestore()
  })

  it('较早的保存响应后到,不会覆盖较新保存写入的列表', async () => {
    const { result } = renderHook(() => useSavedWorks(null))
    await waitForLoad(result)

    // 让第一次保存挂起,第二次保存先完成 —— 模拟慢网络/连续点击
    const store = await import('../services/project/worksStore')
    let releaseFirst
    const firstGate = new Promise((r) => { releaseFirst = r })
    let call = 0
    const spy = vi.spyOn(store, 'saveWorkRecord').mockImplementation(async (_w) => {
      call++
      if (call === 1) await firstGate
      return { ok: true }
    })

    let firstPromise
    act(() => {
      firstPromise = result.current.saveWork({
        id: 40, name: '先发', canvasData: blank(9, 9),
        paletteId: 'perler', savedAt: '2026-10-19T00:00:00.000Z',
      })
    })
    await waitFor(() => expect(call).toBe(1))

    // 第二次保存(后发)先完成
    await act(async () => {
      await result.current.saveWork({
        id: 41, name: '后发', canvasData: blank(9, 9),
        paletteId: 'perler', savedAt: '2026-10-19T00:00:01.000Z',
      })
    })
    const afterSecond = result.current.works.map((w) => w.id)

    // 再放行第一次保存:它已不是最新请求,不得把列表改回去
    releaseFirst()
    await act(async () => { await firstPromise })

    expect(result.current.works.map((w) => w.id)).toEqual(afterSecond)
    // 后发的作品必须在列表里,先发的不能把后发的挤掉
    expect(result.current.works.map((w) => w.id)).toContain(41)
    spy.mockRestore()
  })
})
