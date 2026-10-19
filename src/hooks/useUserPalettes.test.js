import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUserPalettes } from './useUserPalettes'

/**
 * useUserPalettes 的本地模式测试。
 *
 * 云端模式需要真实 Supabase 才能验证 RLS;本仓库没有测试实例,
 * 因此云端仅验证「配置缺失时正确回退到本地」与「加载失败不冒充成功」,
 * 越权访问一律标为未验证(见 docs/implementation 的发布阻断项)。
 */

vi.mock('../services/supabase', () => ({
  supabase: null,
  SUPABASE_URL: '',
  SUPABASE_DIRECT_URL: '',
  SUPABASE_PROXIED: false,
}))

beforeEach(() => {
  localStorage.clear()
})

const P = { name: '我的色卡', brandName: '自制', beadSizeMm: 2.6 }

describe('useUserPalettes · 本地模式', () => {
  it('未登录时使用本地仓库并完成首次加载', async () => {
    const { result } = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mode).toBe('local')
    expect(result.current.palettes).toEqual([])
  })

  it('新建色卡后立即可见并持久化,刷新(新 hook 实例)后仍在', async () => {
    const first = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(first.result.current.loading).toBe(false))

    let res
    await act(async () => {
      res = await first.result.current.createPalette(P)
    })
    expect(res.ok).toBe(true)
    expect(first.result.current.palettes).toHaveLength(1)

    first.unmount()
    const second = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.palettes).toHaveLength(1)
    expect(second.result.current.palettes[0].name).toBe('我的色卡')
  })

  it('非法输入返回错误并写入 error,不新增色卡', async () => {
    const { result } = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let res
    await act(async () => {
      res = await result.current.createPalette({ name: '   ' })
    })
    expect(res.ok).toBe(false)
    expect(result.current.error.code).toBe('nameRequired')
    expect(result.current.palettes).toHaveLength(0)
  })

  it('颜色增删改与库存联动:删除色卡同时清掉其库存', async () => {
    const { result } = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let paletteId
    await act(async () => {
      const res = await result.current.createPalette(P)
      paletteId = res.palette.id
    })
    let colorId
    await act(async () => {
      const res = await result.current.addColor(paletteId, { code: 'A1', hex: '#ff0000' })
      expect(res.ok).toBe(true)
      colorId = res.color.id
    })
    expect(result.current.colorsByPalette.get(paletteId)).toHaveLength(1)

    await act(async () => {
      await result.current.setInventory({
        paletteKey: `user:${paletteId}:${colorId}`,
        paletteColorId: colorId,
        quantity: 12,
      })
    })
    expect(result.current.inventoryByKey.get(`user:${paletteId}:${colorId}`).quantity).toBe(12)

    await act(async () => {
      await result.current.deletePalette(paletteId)
    })
    expect(result.current.palettes).toHaveLength(0)
    expect(result.current.colors).toHaveLength(0)
    expect(result.current.inventory).toHaveLength(0)
  })

  it('复制内置色卡得到独立 ID,内置数据不被修改', async () => {
    const { result } = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const builtin = {
      id: 'perler',
      name: 'Perler',
      nameZh: 'Perler 拼豆',
      beadSize: 5,
      colors: [
        { id: 'P01', name: 'White', nameZh: '白色', hex: '#F2F2F2' },
        { id: 'P02', name: 'Creme', nameZh: '奶油白', hex: '#F4E2A8' },
      ],
    }
    const snapshot = JSON.stringify(builtin)
    await act(async () => {
      await result.current.copyBuiltinPalette(builtin, 'Perler 副本')
    })
    expect(result.current.palettes).toHaveLength(1)
    expect(result.current.palettes[0].id).not.toBe('perler')
    expect(result.current.palettes[0].name).toBe('Perler 副本')
    expect(result.current.colors).toHaveLength(2)
    // 内置对象原样未动
    expect(JSON.stringify(builtin)).toBe(snapshot)
  })

  it('重复色号被拒绝且不产生第二条颜色', async () => {
    const { result } = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let paletteId
    await act(async () => {
      paletteId = (await result.current.createPalette(P)).palette.id
    })
    await act(async () => {
      await result.current.addColor(paletteId, { code: 'A1', hex: '#FF0000' })
    })
    let dup
    await act(async () => {
      dup = await result.current.addColor(paletteId, { code: 'a1', hex: '#00FF00' })
    })
    expect(dup.ok).toBe(false)
    expect(result.current.colors).toHaveLength(1)
  })

  it('库存按 paletteKey 索引,内置色卡与个人色卡可共存', async () => {
    const { result } = renderHook(() => useUserPalettes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setInventory({ paletteKey: 'builtin:perler:P01', quantity: 100 })
      await result.current.setInventory({ paletteKey: 'builtin:perler:P02', quantity: null })
    })
    expect(result.current.inventory).toHaveLength(2)
    expect(result.current.inventoryByKey.get('builtin:perler:P01').quantity).toBe(100)
    expect(result.current.inventoryByKey.get('builtin:perler:P02').quantity).toBeNull()
  })
})
