import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import useKeyboardSafe from './useKeyboardSafe'

/**
 * 视口变量与清理(规格 08 §8):
 *   - visualViewport 的 resize/scroll 与键盘 focusin/focusout 都驱动变量更新;
 *   - 卸载时移除监听并清掉自己写入的 :root 变量,不污染其他实例;
 *   - overlay 内输入框不做主动滚动;页面内输入框滚动最近的滚动容器。
 * jsdom 不模拟 iOS 原生键盘,这里只验证测量/清理协议。
 */

class FakeViewport extends EventTarget {
  constructor(height, offsetTop = 0) {
    super()
    this.height = height
    this.offsetTop = offsetTop
    this.offsetLeft = 0
    this.scale = 1
  }

  set(height, offsetTop = 0, scale = 1) {
    this.height = height
    this.offsetTop = offsetTop
    this.scale = scale
    this.dispatchEvent(new Event('resize'))
  }
}

let viewport

beforeEach(() => {
  viewport = new FakeViewport(800)
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  // jsdom 没有 rAF 的即时语义;用同步回调让断言无需等待。
  // 注意:mock 需要吞掉参数 —— hook 里 `raf = requestAnimationFrame(cb)` 拿到返回值后
  // 再判断 `if (!raf)`,回调里又会把 raf 置 0;若 mock 返回 1 且同步执行回调,
  // 回调把 raf 清零后赋值语句又把 raf 写回 1,下一次 schedule 就被永久跳过。
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const cssVar = (name) => document.documentElement.style.getPropertyValue(name)

describe('useKeyboardSafe', () => {
  it('挂载时写入视口变量,resize 后更新', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    expect(cssVar('--visible-vh')).toBe('800px')
    expect(cssVar('--vh')).toBe('8px')

    // --keyboard-height 只在「文本输入聚焦且未缩放」时才计入差值(见下一条用例)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    // focus 触发的 rAF 用的是当前(尚未变化)视口尺寸,这里显式再同步一次
    viewport.dispatchEvent(new Event('resize'))

    viewport.set(500, 20)
    expect(cssVar('--visible-vh')).toBe('500px')
    expect(cssVar('--visible-vh-top')).toBe('20px')
    expect(cssVar('--keyboard-height')).toBe('280px') // 800 - 500 - 20
    expect(cssVar('--vh')).toBe('5px')
    unmount()
  })

  it('双指缩放造成的视觉视口收缩不算键盘高度', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    // 有文本输入聚焦,但页面被放大到 2 倍:差值来自缩放而非键盘
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    viewport.set(400, 0, 2)
    expect(cssVar('--keyboard-height')).toBe('0px')
    unmount()
  })

  it('无文本输入聚焦时不算键盘高度(几何差值来自地址栏动画等)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    // 焦点在按钮/复选框上不会唤起键盘
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    document.body.appendChild(checkbox)
    checkbox.focus()

    viewport.set(400, 0)
    expect(cssVar('--keyboard-height')).toBe('0px')
    unmount()
  })

  it('卸载时移除监听并清理自己写入的变量', () => {
    const removeSpy = vi.spyOn(viewport, 'removeEventListener')
    const docRemove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useKeyboardSafe())
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
    expect(docRemove).toHaveBeenCalledWith('focusin', expect.any(Function))
    expect(docRemove).toHaveBeenCalledWith('focusout', expect.any(Function))
    expect(cssVar('--visible-vh')).toBe('')
    expect(cssVar('--keyboard-height')).toBe('')
    expect(cssVar('--vh')).toBe('')
  })

  it('页面内输入框聚焦时滚动最近的可滚动容器,而不是 body', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 600, configurable: true })
    scroller.scrollTop = 0
    const input = document.createElement('input')
    scroller.appendChild(input)
    document.body.appendChild(scroller)
    // getBoundingClientRect 在 jsdom 恒为 0,这里给出确定的几何
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 340, height: 40 })
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 200 })

    // focus() 会更新 document.activeElement 并派发 focusin(hook 读取 activeElement)
    input.focus()
    expect(scroller.scrollTop).toBeGreaterThan(0)
    unmount()
  })

  it('overlay 内输入框不做主动滚动', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    const input = document.createElement('input')
    overlay.appendChild(input)
    document.body.appendChild(overlay)
    const scrollIntoView = vi.fn()
    input.scrollIntoView = scrollIntoView

    input.dispatchEvent(new Event('focusin', { bubbles: true }))
    expect(scrollIntoView).not.toHaveBeenCalled()
    unmount()
  })

  it('键盘关闭后 offsetTop 残留被归一化为 0(不把 stale offset 传给组件)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    // 键盘打开:iOS 26 会自动平移视觉视口
    viewport.set(500, 20)
    expect(cssVar('--visible-vh-top')).toBe('20px')
    expect(cssVar('--keyboard-height')).toBe('280px')

    // 键盘关闭,但 offsetTop 仍残留 20(WebKit 报告过的行为)
    viewport.set(800, 20)
    expect(cssVar('--visible-vh-top')).toBe('0px')
    expect(cssVar('--keyboard-height')).toBe('0px')
    expect(cssVar('--visible-vh')).toBe('800px')
    expect(cssVar('--vh')).toBe('8px')
    unmount()
  })

  it('地址栏动画级别的视口变化不算键盘(阈值以上才判键盘)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    // 只收缩 60px:地址栏/工具栏量级,低于 KEYBOARD_MIN_INSET(120)
    viewport.set(740, 0)
    expect(cssVar('--keyboard-height')).toBe('0px')
    expect(cssVar('--visible-vh')).toBe('800px')

    // 收缩到 300px:真实键盘
    viewport.set(500, 0)
    expect(cssVar('--keyboard-height')).toBe('300px')
    unmount()
  })

  it('视觉视口 scroll 不再无条件滚动聚焦元素(只在焦点/键盘状态变化时修正)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 600, configurable: true })
    const input = document.createElement('input')
    scroller.appendChild(input)
    document.body.appendChild(scroller)
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 340, height: 40 })
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 200 })
    input.focus()
    const afterFocus = scroller.scrollTop
    expect(afterFocus).toBeGreaterThan(0)

    // 键盘已经打开、焦点不变:纯 vv.scroll 不应再改动滚动位置
    scroller.scrollTop = afterFocus
    for (let i = 0; i < 10; i++) viewport.dispatchEvent(new Event('scroll'))
    expect(scroller.scrollTop).toBe(afterFocus)
    unmount()
  })

  it('聚焦元素在可视区上方时向上修正(双向,不只是向下)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 600, configurable: true })
    const input = document.createElement('input')
    scroller.appendChild(input)
    document.body.appendChild(scroller)
    // 输入框顶边在容器可视区上方 30px(被上方内容遮住)
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: -30, bottom: 10, height: 40 })
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 200 })
    scroller.scrollTop = 100

    input.focus()
    // 向上滚:100 + (-30 - 10) = 60
    expect(scroller.scrollTop).toBeLessThan(100)
    unmount()
  })

  it('页面重新可见时重新测量(后台返回不会停留在旧值)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    viewport.set(500, 20)
    expect(cssVar('--keyboard-height')).toBe('280px')

    // 直接改值但不派发 resize:模拟「离开期间键盘高度已变,回来后没有任何事件」
    viewport.height = 400
    document.dispatchEvent(new Event('visibilitychange'))
    expect(cssVar('--keyboard-height')).toBe('380px') // 800 - 400 - 20
    unmount()
  })
})
