import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

/**
 * 云端模板库按路由加载。
 *
 * 首页画布 / 教程 / 备料页不需要模板矩阵;模板 JSON 约 540KB,
 * 在移动端首屏拉它会把带宽和主线程都占掉。这里锁定:
 *   - active=false 时不发任何请求,也不报 loading;
 *   - active 从 false 切到 true 时,首帧先报 loading,再发起一次拉取;
 *   - 默认(不传 active)保持旧的挂载即拉取行为。
 */

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('../services/supabase', () => ({
  supabase: { from: mocks.from },
  SUPABASE_PROXIED: true,
}))

import useCloudTemplates from './useCloudTemplates'

const makeQuery = rows => {
  const query = {
    select: () => query,
    order: () => query,
    abortSignal: () => Promise.resolve({ data: rows, error: null }),
  }
  return query
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.from.mockImplementation(table => makeQuery(table === 'categories' ? [] : []))
})

describe('useCloudTemplates · active 门控', () => {
  it('active=false 时不请求云端,也不报加载中', async () => {
    const { result } = renderHook(() => useCloudTemplates({ active: false }))
    await Promise.resolve()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('active 从 false 切到 true:首帧 loading=true,随后拉取并结束', async () => {
    const { result, rerender } = renderHook(({ active }) => useCloudTemplates({ active }), {
      initialProps: { active: false },
    })
    expect(mocks.from).not.toHaveBeenCalled()

    rerender({ active: true })
    // 首帧不能先渲染空模板库
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('默认 active=true:挂载即拉取(兼容既有调用方)', async () => {
    const { result } = renderHook(() => useCloudTemplates())
    await waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})
