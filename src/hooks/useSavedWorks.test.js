import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useSavedWorks } from './useSavedWorks'

/**
 * M3:作品持久化的读写收口。
 *
 * 本文件只覆盖**本地模式**(云端由 rowToWork/workToRow 单测 + 迁移 SQL 约束),
 * 因为本地模式是未登录用户与离线场景的唯一路径,且完全可测:
 *   - 写入时尺寸以 canvasData 实际形状为准(修复历史上声明尺寸与数据不一致);
 *   - 读取时同样归一,旧数据无需回填。
 */

// 固定「云端未配置」路径:useSavedWorks 在 supabase 为 null 时走 localStorage
vi.mock('../services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null }
})

const KEY = 'saved-works'
const blank = (w, h) => Array.from({ length: h }, () => Array.from({ length: w }, () => null))

const readStored = () => JSON.parse(localStorage.getItem(KEY) || '[]')

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useSavedWorks · 本地模式写入归一', () => {
  it('保存时以 canvasData 实际形状覆盖不一致的声明尺寸', async () => {
    const { result } = renderHook(() => useSavedWorks(null))

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

    const stored = readStored()
    expect(stored).toHaveLength(1)
    expect(stored[0].gridSize).toBe(12)
    expect(stored[0].gridWidth).toBe(12)
    expect(stored[0].gridHeight).toBe(10)
    expect(stored[0].paletteId).toBe('mard')
    expect(stored[0].name).toBe('错位作品')
  })

  it('方形作品落库时 gridWidth/gridHeight 为 null', async () => {
    const { result } = renderHook(() => useSavedWorks(null))

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

    const [work] = readStored()
    expect(work.gridWidth).toBeNull()
    expect(work.gridHeight).toBeNull()
    expect(work.gridSize).toBe(9)
  })

  it('保存后 hook 返回值与落库值一致', async () => {
    const { result } = renderHook(() => useSavedWorks(null))

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
})

describe('useSavedWorks · 本地模式读取归一', () => {
  it('预置的旧数据(声明尺寸错位)在读取时被修正', () => {
    localStorage.setItem(KEY, JSON.stringify([{
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
    const [work] = result.current.works
    expect(work.gridSize).toBe(12)
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
    expect(work.paletteId).toBe('hama')
  })

  it('预置的参差行被补齐,矩阵矩形', () => {
    localStorage.setItem(KEY, JSON.stringify([{
      id: 11,
      name: '参差',
      canvasData: [['#FF0000', '#FF0000', '#FF0000'], ['#00FF00']],
      gridSize: 3,
      paletteId: 'perler',
      savedAt: '2026-09-01T00:00:00.000Z',
    }]))

    const { result } = renderHook(() => useSavedWorks(null))
    expect(result.current.works[0].canvasData[1]).toEqual(['#00FF00', null, null])
  })

  it('损坏的 localStorage 仍走备份 + 清空分支,不抛异常', () => {
    localStorage.setItem(KEY, '{not json')
    const { result } = renderHook(() => useSavedWorks(null))
    expect(result.current.works).toEqual([])
    expect(localStorage.getItem(KEY + '-corrupt')).toBe('{not json')
  })

  it('非数组的历史值不会让 hook 崩溃', () => {
    localStorage.setItem(KEY, JSON.stringify({ oops: true }))
    const { result } = renderHook(() => useSavedWorks(null))
    expect(result.current.works).toEqual([])
  })
})
