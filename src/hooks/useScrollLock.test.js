import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollLock, __resetScrollLock } from './useScrollLock'

/**
 * 滚动锁引用计数:覆盖 R4 的两类真实故障
 *   - 叠加弹层时,后关闭的弹层把锁清掉(提前解锁);
 *   - 快速开关时,cleanup 恢复成上一个弹层写入的值(锁残留)。
 */

const bodyStyle = () => ({
  overflow: document.body.style.overflow,
  position: document.body.style.position,
  width: document.body.style.width,
  top: document.body.style.top,
})

beforeEach(() => {
  __resetScrollLock()
  document.body.removeAttribute('style')
  window.scrollTo = vi.fn()
})

afterEach(() => {
  __resetScrollLock()
  document.body.removeAttribute('style')
})

describe('useScrollLock', () => {
  it('持锁时隐藏溢出,释放后恢复原值', () => {
    document.body.style.overflow = 'auto'
    const { rerender } = renderHook(({ active }) => useScrollLock(active), {
      initialProps: { active: true },
    })
    expect(document.body.style.overflow).toBe('hidden')
    rerender({ active: false })
    expect(document.body.style.overflow).toBe('auto')
  })

  it('两个弹层叠加:先关一个不提前解锁,全部关闭才恢复', () => {
    const first = renderHook(() => useScrollLock(true))
    const second = renderHook(() => useScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')

    first.unmount()
    expect(document.body.style.overflow).toBe('hidden') // 仍被第二个持有

    second.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('快速开关不残留:卸载后 body 样式回到初始值', () => {
    for (let i = 0; i < 5; i += 1) {
      const { unmount } = renderHook(() => useScrollLock(true))
      unmount()
    }
    expect(bodyStyle()).toEqual({ overflow: '', position: '', width: '', top: '' })
  })

  it('fixed 锁固定 body 并记录滚动位置,释放后回滚', () => {
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    const { unmount } = renderHook(() => useScrollLock(true, { fixed: true }))
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.width).toBe('100%')
    expect(document.body.style.top).toBe('-120px')

    unmount()
    expect(document.body.style.position).toBe('')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 120)
  })

  it('fixed 锁先释放、普通锁仍在:降级为普通锁而不是解锁', () => {
    Object.defineProperty(window, 'scrollY', { value: 40, configurable: true })
    const plain = renderHook(() => useScrollLock(true))
    const fixed = renderHook(() => useScrollLock(true, { fixed: true }))
    expect(document.body.style.position).toBe('fixed')

    fixed.unmount()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.style.position).toBe('')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 40)

    plain.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('scrollY 为 0 时也显式回滚(不能只在真值时才恢复)', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    const { unmount } = renderHook(() => useScrollLock(true, { fixed: true }))
    expect(document.body.style.top).toBe('0px') // '-0px' 会被 CSSOM 归一化

    unmount()
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('三层叠加按任意顺序关闭都不提前解锁', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    const a = renderHook(() => useScrollLock(true))
    const b = renderHook(() => useScrollLock(true, { fixed: true }))
    const c = renderHook(() => useScrollLock(true))

    // 先关中间那层(fixed):应降级为普通锁,其余两层仍持有
    b.unmount()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.style.position).toBe('')

    // 再关第一层,最后一层仍在
    a.unmount()
    expect(document.body.style.overflow).toBe('hidden')

    c.unmount()
    expect(bodyStyle()).toEqual({ overflow: '', position: '', width: '', top: '' })
  })

  it('StrictMode 双挂载/双清理后不残留锁', () => {
    // StrictMode 会 effect → cleanup → effect,引用计数必须扛住这种成对操作
    const first = renderHook(() => useScrollLock(true))
    first.unmount()
    const second = renderHook(() => useScrollLock(true))
    second.unmount()
    expect(bodyStyle()).toEqual({ overflow: '', position: '', width: '', top: '' })
  })

  it('键盘开着时关闭弹层也能恢复 body 原值', () => {
    // 键盘打开不改 body 内联样式(只改 :root 变量),锁的保存/恢复不应受其影响
    document.documentElement.style.setProperty('--keyboard-height', '300px')
    const { unmount } = renderHook(() => useScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(bodyStyle()).toEqual({ overflow: '', position: '', width: '', top: '' })
    document.documentElement.removeAttribute('style')
  })
})
