import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import useAutoSave, { AUTOSAVE_STATES, AUTOSAVE_DELAY_MS } from './useAutoSave'
import { loadDraft, clearDraft, __resetForTests as resetWorksStore } from '../services/project/worksStore'

/**
 * 自动保存草稿的契约(规格 03 §7)。
 *
 * 锁的是四条硬约束:
 *   1. 防抖:连续改动只在停下来之后写一次,不是每笔都写;
 *   2. 首次挂载不写:打开首页不能把真正的草稿覆盖成空白画布;
 *   3. 失败静默:存储不可用时只改状态,不抛异常、不弹框;
 *   4. 关闭开关后不再写盘(用户关掉自动保存时行为与改造前一致)。
 *
 * 真机/真实 IndexedDB 行为仍需手工验收;这里锁的是「同样的改动序列永远得到
 * 同样的写盘次数」,防止后续调整防抖实现时悄悄退化成每帧写盘。
 */

const blank = (n = 2) => Array.from({ length: n }, () => Array.from({ length: n }, () => null))
const painted = (n = 2) => Array.from({ length: n }, () => Array.from({ length: n }, () => '#E53935'))

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  resetWorksStore()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** 推进防抖计时器并让异步写盘落地 */
async function flush(ms = AUTOSAVE_DELAY_MS + 10) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  // saveDraft 是异步 IndexedDB 事务,再让出几轮微任务
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('useAutoSave · 防抖与写盘', () => {
  it('首次挂载不写草稿(打开首页不覆盖已有草稿)', async () => {
    const first = blank()
    renderHook(() => useAutoSave({ canvasData: first, meta: { gridSize: 2 } }))
    await flush()

    expect(await loadDraft()).toBeNull()
  })

  it('画布变化后防抖到时写一次草稿', async () => {
    const { rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: { gridSize: 2, paletteId: 'perler' } }),
      { initialProps: { data: blank() } },
    )

    rerender({ data: painted() })
    await flush()

    const draft = await loadDraft()
    expect(draft).not.toBeNull()
    expect(draft.canvasData[0][0]).toBe('#E53935')
    expect(draft.gridSize).toBe(2)
    expect(draft.paletteId).toBe('perler')
  })

  it('连续多次改动只写一次(防抖,不是每笔都写)', async () => {
    // 直接数写盘次数 —— 只看最终内容无法区分「写了一次」和「写了三次、最后那次赢」
    const store = await import('../services/project/worksStore')
    const spy = vi.spyOn(store, 'saveDraft')

    const { rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: {} }),
      { initialProps: { data: blank() } },
    )

    // 三次改动间隔 500ms,都没到 2s 防抖窗口
    rerender({ data: painted() })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    rerender({ data: blank(3) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    rerender({ data: painted(4) })
    await flush()

    expect(spy).toHaveBeenCalledTimes(1)
    // 最终落盘的是最后一次的内容
    const draft = await loadDraft()
    expect(draft.canvasData).toHaveLength(4)
    expect(draft.canvasData[0][0]).toBe('#E53935')
    spy.mockRestore()
  })

  it('写盘后状态从 pending 走到 saved', async () => {
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: {} }),
      { initialProps: { data: blank() } },
    )
    expect(result.current.state).toBe(AUTOSAVE_STATES.IDLE)

    rerender({ data: painted() })
    expect(result.current.state).toBe(AUTOSAVE_STATES.PENDING)

    await flush()
    await waitFor(() => expect(result.current.state).toBe(AUTOSAVE_STATES.SAVED))
    expect(result.current.savedAt).toBeTruthy()
  })

  it('再次改动会从 saved 回到 pending', async () => {
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: {} }),
      { initialProps: { data: blank() } },
    )
    rerender({ data: painted() })
    await flush()
    await waitFor(() => expect(result.current.state).toBe(AUTOSAVE_STATES.SAVED))

    rerender({ data: blank(3) })
    expect(result.current.state).toBe(AUTOSAVE_STATES.PENDING)
  })
})

describe('useAutoSave · 关闭开关', () => {
  it('enabled=false 时不写草稿,状态为 off', async () => {
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: {}, enabled: false }),
      { initialProps: { data: blank() } },
    )
    expect(result.current.state).toBe(AUTOSAVE_STATES.OFF)

    rerender({ data: painted() })
    await flush()

    expect(await loadDraft()).toBeNull()
    expect(result.current.state).toBe(AUTOSAVE_STATES.OFF)
  })

  it('运行中关掉开关:立刻停掉待写的草稿', async () => {
    const { result, rerender } = renderHook(
      ({ data, enabled }) => useAutoSave({ canvasData: data, meta: {}, enabled }),
      { initialProps: { data: blank(), enabled: true } },
    )

    rerender({ data: painted(), enabled: true })
    expect(result.current.state).toBe(AUTOSAVE_STATES.PENDING)

    // 防抖还没到就关掉
    rerender({ data: painted(), enabled: false })
    await flush()

    expect(await loadDraft()).toBeNull()
    expect(result.current.state).toBe(AUTOSAVE_STATES.OFF)
  })
})

describe('useAutoSave · 失败静默', () => {
  it('IndexedDB 不可用时状态变 failed,不抛异常', async () => {
    globalThis.indexedDB = undefined
    resetWorksStore()

    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: {} }),
      { initialProps: { data: blank() } },
    )
    rerender({ data: painted() })

    await expect(flush()).resolves.toBeUndefined()
    await waitFor(() => expect(result.current.state).toBe(AUTOSAVE_STATES.FAILED))
  })
})

describe('useAutoSave · 基线重置与草稿丢弃', () => {
  it('resetBaseline 后同一矩阵不再被当成改动', async () => {
    const data = painted()
    const { result, rerender } = renderHook(
      ({ d }) => useAutoSave({ canvasData: d, meta: {} }),
      { initialProps: { d: blank() } },
    )

    act(() => { result.current.resetBaseline(data) })
    rerender({ d: data })
    await flush()

    expect(await loadDraft()).toBeNull()
  })

  it('discardDraft 清掉草稿并回到 idle', async () => {
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: {} }),
      { initialProps: { data: blank() } },
    )
    rerender({ data: painted() })
    await flush()
    await waitFor(() => expect(result.current.state).toBe(AUTOSAVE_STATES.SAVED))

    await act(async () => { await result.current.discardDraft() })

    expect(await loadDraft()).toBeNull()
    expect(result.current.state).toBe(AUTOSAVE_STATES.IDLE)
    expect(result.current.savedAt).toBeNull()
  })

  it('readDraft 返回已写入的草稿', async () => {
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: { gridSize: 2 } }),
      { initialProps: { data: blank() } },
    )
    rerender({ data: painted() })
    await flush()

    const draft = await act(async () => result.current.readDraft())
    expect(draft.canvasData[0][0]).toBe('#E53935')
  })
})

describe('useAutoSave · 与作品存储互不干扰', () => {
  it('写草稿不会往作品列表里加条目', async () => {
    const { listWorks } = await import('../services/project/worksStore')
    const { rerender } = renderHook(
      ({ data }) => useAutoSave({ canvasData: data, meta: {} }),
      { initialProps: { data: blank() } },
    )
    rerender({ data: painted() })
    await flush()

    expect(await loadDraft()).not.toBeNull()
    expect(await listWorks()).toEqual([])
  })

  it('清理残留草稿(测试间隔离)', async () => {
    await clearDraft()
    expect(await loadDraft()).toBeNull()
  })
})
