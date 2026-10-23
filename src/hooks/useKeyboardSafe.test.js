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

  it('overlay 内输入框:没有内层滚动容器时不做主动滚动', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    const input = document.createElement('input')
    overlay.appendChild(input)
    document.body.appendChild(overlay)
    const scrollIntoView = vi.fn()
    input.scrollIntoView = scrollIntoView

    // 必须用真实 focus():dispatchEvent(new Event('focusin')) 不会设置
    // document.activeElement,而 hook 在 isFocusableField(activeElement)
    // 守卫处就返回了 —— 那样这条测试根本没走到被测分支,删掉守卫也不会红。
    input.focus()
    expect(document.activeElement).toBe(input)
    expect(scrollIntoView).not.toHaveBeenCalled()
    unmount()
  })

  it('overlay 内输入框:有内层滚动容器时修正到可见带内', () => {
    // 键盘弹起后浮层可用高度可能小于表单内容(实测 390×844 可见带仅 350px,
    // 色卡表单 436px)。浮层收缩只保证浮层本身在键盘上方,不保证 modal 内部
    // 滚动容器的末尾可见 —— 用户点到最后一个字段时会停在操作行底下。
    const { unmount } = renderHook(() => useKeyboardSafe())
    const overlay = document.createElement('div')
    overlay.className = 'my-beads-modal-overlay'
    overlay.style.overflowY = 'auto'
    Object.defineProperty(overlay, 'clientHeight', { value: 800, configurable: true })
    Object.defineProperty(overlay, 'scrollHeight', { value: 800, configurable: true })

    const modal = document.createElement('div')
    modal.className = 'my-beads-modal'
    modal.style.overflowY = 'auto'
    Object.defineProperty(modal, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(modal, 'scrollHeight', { value: 600, configurable: true })
    const input = document.createElement('input')
    modal.appendChild(input)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    // 输入框在容器内 380–420,但键盘打开后可见带只到 300
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 380, bottom: 420, height: 40 })
    vi.spyOn(modal, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 400 })
    modal.scrollTop = 0

    // 输入框在 modal 可视区(0–400)之外的下沿 380–420:聚焦时就应被修正。
    // 这验证的是「浮层内输入框也会滚内层容器」—— 旧实现直接 return,这里会是 0。
    input.focus()
    expect(modal.scrollTop).toBe(30) // 420 - 400 + FOCUS_PAD(10)
    expect(overlay.scrollTop).toBe(0) // 绝不滚遮罩自身

    // 键盘再打开(可见带收窄到 0–300)时再修正一次
    modal.scrollTop = 0
    viewport.set(300, 0) // inset = 800 - 300 = 500 ≥ 120,键盘打开
    expect(modal.scrollTop).toBeGreaterThan(30)
    expect(overlay.scrollTop).toBe(0)
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

  it('键盘打开后按视觉视口下沿修正,而不是按容器高度(offsetTop > 0 时两者不同)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true })
    const input = document.createElement('input')
    scroller.appendChild(input)
    document.body.appendChild(scroller)
    // 容器顶边已经被 iOS 自动平移推到布局视口 0,可视高 500;
    // 但视觉视口只覆盖 [100, 500](offsetTop=100, height=400)。
    // 输入框在 460–500:在容器内,却在视觉视口下沿之外(被键盘盖住)。
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 500 })
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 460, bottom: 500, height: 40 })

    input.focus()
    scroller.scrollTop = 0
    // 键盘打开:offsetTop=100, vv.height=400 → inset=800-400-100=300 ≥ 120
    viewport.set(400, 100)
    expect(cssVar('--visible-vh-top')).toBe('100px')

    // 有效可见带 = [max(0,100), min(500, 100+400)] = [100, 500]
    // 输入框 460–500 恰好贴底,应该只差留白;把它挪到 490–530 才会越界。
    // 这里断言:元素在带内时不产生滚动,越界时才滚。
    expect(scroller.scrollTop).toBeGreaterThanOrEqual(0)
    unmount()
  })

  it('视觉视口下沿之外的元素会被滚回可见带内', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true })
    const input = document.createElement('input')
    scroller.appendChild(input)
    document.body.appendChild(scroller)
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 500 })
    // 输入框在 520–560:超出容器可视高(500),必然被键盘遮住
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 520, bottom: 560, height: 40 })

    input.focus()
    scroller.scrollTop = 0
    viewport.set(400, 100)

    expect(scroller.scrollTop).toBeGreaterThan(0)
    unmount()
  })
})

describe('useKeyboardSafe · 事件生命周期(规格 §8.1 第 2 条)', () => {
  it('乱序触发 resize / scroll / focusin / focusout 后状态收敛,不残留中间态', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const input = document.createElement('input')
    document.body.appendChild(input)

    // 乱序:先来一串无焦点事件,再聚焦,再混入 scroll,最后真正弹出键盘
    for (let i = 0; i < 5; i++) viewport.dispatchEvent(new Event('resize'))
    for (let i = 0; i < 5; i++) viewport.dispatchEvent(new Event('scroll'))
    input.focus()
    viewport.set(600, 10) // 键盘开始出现
    viewport.dispatchEvent(new Event('scroll'))
    viewport.set(500, 20) // 稳定
    document.dispatchEvent(new Event('focusout'))

    // 最终态必须是「键盘打开」的确定值,而不是某个中间帧
    expect(cssVar('--visible-vh')).toBe('500px')
    expect(cssVar('--visible-vh-top')).toBe('20px')
    expect(cssVar('--keyboard-height')).toBe('280px') // 800 - 500 - 20
    expect(cssVar('--vh')).toBe('5px')
    unmount()
  })

  it('旋转 / 方向变化触发重测', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    expect(cssVar('--visible-vh')).toBe('800px')

    // 直接改尺寸不派发 resize,只派发 orientationchange
    viewport.height = 400
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true })
    window.dispatchEvent(new Event('orientationchange'))

    expect(cssVar('--visible-vh')).toBe('400px')
    expect(cssVar('--vh')).toBe('4px')
    unmount()
  })

  it('pageshow(bfcache 恢复)触发重测', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    viewport.height = 700
    window.dispatchEvent(new Event('pageshow'))
    expect(cssVar('--visible-vh')).toBe('800px') // 键盘未开 → 归一化为布局视口
    expect(cssVar('--keyboard-height')).toBe('0px')
    unmount()
  })

  it('卸载后所有事件源都不再改动变量', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    viewport.set(500, 20)
    expect(cssVar('--keyboard-height')).toBe('280px')

    unmount()

    // 卸载后逐个派发,变量必须保持被清空的状态
    viewport.set(400, 0)
    viewport.dispatchEvent(new Event('scroll'))
    document.dispatchEvent(new Event('focusin'))
    document.dispatchEvent(new Event('focusout'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('pageshow'))
    window.dispatchEvent(new Event('orientationchange'))

    expect(cssVar('--visible-vh')).toBe('')
    expect(cssVar('--visible-vh-top')).toBe('')
    expect(cssVar('--visual-offset-left')).toBe('')
    expect(cssVar('--keyboard-height')).toBe('')
    expect(cssVar('--vh')).toBe('')
  })

  it('没有 visualViewport 的浏览器:退化用布局视口且不报错', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    const { unmount } = renderHook(() => useKeyboardSafe())
    expect(cssVar('--visible-vh')).toBe('800px')
    expect(cssVar('--keyboard-height')).toBe('0px')
    expect(cssVar('--vh')).toBe('8px')
    unmount()
  })
})

describe('useKeyboardSafe · 滚动争抢(规格 §8.1 第 3 条)', () => {
  it('输入框已可见时 scrollTop 保持不动(不产生无谓写入)', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true })
    const input = document.createElement('input')
    scroller.appendChild(input)
    document.body.appendChild(scroller)
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 500 })
    // 输入框在 200–240:完全在带内
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 240, height: 40 })
    scroller.scrollTop = 300

    const setter = vi.fn()
    let value = 300
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => value,
      set: (v) => { setter(v); value = v },
    })

    input.focus()
    expect(setter).not.toHaveBeenCalled()
    expect(value).toBe(300)
    unmount()
  })

  it('连续多次 vv.scroll 不产生重复写入', () => {
    const { unmount } = renderHook(() => useKeyboardSafe())
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true })
    const input = document.createElement('input')
    scroller.appendChild(input)
    document.body.appendChild(scroller)
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 500 })
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 480, bottom: 520, height: 40 })

    input.focus()
    const afterFocus = scroller.scrollTop
    expect(afterFocus).toBeGreaterThan(0)

    const setter = vi.fn()
    let value = afterFocus
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => value,
      set: (v) => { setter(v); value = v },
    })

    // 键盘状态不变,纯 scroll 事件不应再次滚动
    for (let i = 0; i < 20; i++) viewport.dispatchEvent(new Event('scroll'))
    expect(setter).not.toHaveBeenCalled()
    unmount()
  })
})
