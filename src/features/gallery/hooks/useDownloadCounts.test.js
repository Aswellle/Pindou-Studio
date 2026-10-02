import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useDownloadCounts from './useDownloadCounts'

vi.mock('../../../services/supabase', () => ({
  supabase: { rpc: vi.fn() },
}))

import { supabase } from '../../../services/supabase'

beforeEach(() => {
  localStorage.clear()
  // 用 resetAllMocks 而非 clearAllMocks:后者只清调用记录、保留 mockImplementation,
  // 会让「RPC 成功」用例的 mockResolvedValue 泄漏到先执行的用例,导致计数断言随机失败(顺序依赖)。
  vi.resetAllMocks()
})

describe('useDownloadCounts 本地模式', () => {
  it('初始为 0,bump 后本地 +1 并持久化,不触发云端 RPC', async () => {
    const { result } = renderHook(() => useDownloadCounts({ cloudEnabled: false }))
    const tpl = { id: 't1', name: 'A' }
    expect(result.current.getDownloadCount(tpl)).toBe(0)
    await act(async () => { await result.current.bumpDownload(tpl) })
    expect(result.current.getDownloadCount(tpl)).toBe(1)
    expect(JSON.parse(localStorage.getItem('template-downloads'))).toEqual({ t1: 1 })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

describe('useDownloadCounts 云端模式', () => {
  it('取 DB 与本地的较大值并叠加乐观增量', async () => {
    localStorage.setItem('template-downloads', JSON.stringify({ t2: 3 }))
    const { result } = renderHook(() => useDownloadCounts({ cloudEnabled: true }))
    const tpl = { id: 't2', name: 'B', downloadCount: 10 }
    expect(result.current.getDownloadCount(tpl)).toBe(10)
    // RPC 挂起(未返回)时观察乐观值:max(10, 3+1) + 1 —— 不依赖 RPC 回执时序
    let resolveRpc
    supabase.rpc.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve }))
    act(() => { result.current.bumpDownload(tpl) })
    expect(result.current.getDownloadCount(tpl)).toBe(11)
    await act(async () => { resolveRpc({ error: null }) }) // 收尾:让 RPC 回执,避免悬挂
  })

  it('RPC 成功后回冲乐观增量并触发云库刷新,避免与 DB 双算', async () => {
    supabase.rpc.mockResolvedValue({ error: null })
    const onCloudSync = vi.fn()
    const { result } = renderHook(() => useDownloadCounts({ cloudEnabled: true, onCloudSync }))
    const tpl = { id: 't3', name: 'C' }
    await act(async () => { await result.current.bumpDownload(tpl) })
    // DB 已 +1:delta 回冲,显示 = max(0, local=1) = 1
    expect(result.current.getDownloadCount(tpl)).toBe(1)
    expect(onCloudSync).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('increment_template_download', { p_id: 't3' })
  })

  it('RPC 返回 error 时不回冲,保守保留乐观计数', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'boom' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useDownloadCounts({ cloudEnabled: true }))
    const tpl = { id: 't4', name: 'D' }
    await act(async () => { await result.current.bumpDownload(tpl) })
    expect(result.current.getDownloadCount(tpl)).toBe(2) // local 1 + delta 1
    warn.mockRestore()
  })
})

describe('脏数据容错', () => {
  it('localStorage JSON 损坏时按空对象处理', () => {
    localStorage.setItem('template-downloads', '{oops')
    const { result } = renderHook(() => useDownloadCounts({}))
    expect(result.current.getDownloadCount({ id: 'x' })).toBe(0)
  })
})
