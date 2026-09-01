import { useEffect } from 'react'

// 全屏浮层类:聚焦这些容器内的输入框由 overlay 收缩机制处理(--visible-vh),
// 不做主动滚动;页面内输入框(后台表单、联系消息回复、登录页等)用 nearest 兜底。
const OVERLAY_SELECTOR = [
  '.modal-overlay',
  '.contact-overlay',
  '.image-quantizer-overlay',
  '.admin-modal-overlay',
  '.users-confirm-overlay',
  '.profile-confirm-overlay',
  '.load-confirm-overlay',
  '.quantizer-zoom',
].join(',')

/**
 * 防复发机制:iOS Safari 键盘安全 + 全站视觉视口基础设施(单一事实来源)。
 *
 * 根因:键盘唤起时 iOS 只收缩 visual viewport,布局视口不变。任何用 `100vh`/布局视口
 * 计算高度的可滚动容器(页面、模态框、面板)在键盘弹出时其可视区不收缩,聚焦输入框
 * 会被顶出/被键盘盖住,表现为「白板」「滚不到底部按钮」。
 *
 * 系统级处理(在 App.jsx 挂载一次,全站生效):
 *  1. 监听 visualViewport 的 resize/scroll,把「可视高度」写入 --visible-vh。
 *  2. 视觉视口相对布局视口的偏移写入 --visible-vh-top / --visual-offset-left。
 *  3. 键盘高度(布局视口 − 视觉视口 − 顶部偏移)写入 --keyboard-height,
 *     供「不随视口收缩的容器」按需使用(全屏浮层已随 --visible-vh 收缩,无需再加)。
 *  4. --vh = min(innerHeight, visualViewport.height) * 0.01,作为整棵树(#root/.app)
 *     高度基准,随键盘/URL 栏收缩。
 *
 * 用法:在 App.jsx 调用一次 useKeyboardSafe();由各容器 CSS 引用
 * --visible-vh(/--visible-vh-top/--keyboard-height/--vh)。
 */
export default function useKeyboardSafe() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    let raf = 0
    const set = (k, v) => root.style.setProperty(k, v)
    const update = () => {
      raf = 0
      if (!vv) {
        // 无 visualViewport 的旧浏览器:退化用 window.innerHeight,键盘高度不可测得 → 0
        const inner = window.innerHeight || 0
        set('--visible-vh', `${inner}px`)
        set('--visible-vh-top', '0px')
        set('--visual-offset-left', '0px')
        set('--keyboard-height', '0px')
        set('--vh', `${inner * 0.01}px`)
        return
      }
      const inner = window.innerHeight || 0
      // 可视高度:键盘弹出时收缩 → 容器 height 随之收缩,聚焦输入框不被盖住
      set('--visible-vh', `${vv.height}px`)
      // 视觉视口相对布局视口的纵向/横向偏移(键盘安全 / 顶部刘海)
      set('--visible-vh-top', `${vv.offsetTop}px`)
      set('--visual-offset-left', `${vv.offsetLeft}px`)
      // 键盘高度 = 布局视口 − 视觉视口 − 顶部偏移;全屏浮层靠 --visible-vh 收缩
      // 已解决,此变量仅给「不收缩的容器」按需读取(如想保持全高但给底部留空)。
      const keyboardHeight = Math.max(0, inner - vv.height - vv.offsetTop)
      set('--keyboard-height', `${keyboardHeight}px`)
      // --vh:整棵树(#root/.app)高度基准。键盘弹出时 visualViewport 收缩,
      // 用 min(innerHeight, visualViewport.height) 使布局随键盘收缩(旧方案只监听
      // resize,不监听键盘 focusin/focusout → 白板根因)。
      const vh = Math.min(inner, vv.height) * 0.01
      set('--vh', `${vh}px`)
    }
    // 找到输入框最近的「可滚动」祖先(排除 html/body/不可滚动元素),仅内层滚动容器。
    // 键盘弹出时让输入框在这个内层容器里可见 —— 不滚动 body/html(那会把整页内容
    // 顶到屏幕上方 → 视觉视口看到容器之外 → 白板,已证实)。
    const getScrollAncestor = (el) => {
      let node = el.parentElement
      while (node && node !== document.documentElement && node !== document.body) {
        const style = window.getComputedStyle(node)
        const oy = style.overflowY
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight) {
          return node
        }
        node = node.parentElement
      }
      return null
    }
    // 确保聚焦的页面内输入框在可视区:优先滚到「最近的滚动容器底部对齐」(block:'end'),
    // 让输入框贴住容器底部(下方恰好是容器内容,不露白);找不到滚动容器时退化为
    // scrollIntoView nearest 兜底。不用 center/scrollTo(与 iOS 自动滚动打架)。
    const ensureFocusedVisible = () => {
      const el = document.activeElement
      if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      if (el.closest(OVERLAY_SELECTOR)) return
      const scroller = getScrollAncestor(el)
      if (scroller) {
        const elRect = el.getBoundingClientRect()
        const scRect = scroller.getBoundingClientRect()
        // 输入框顶部要露出可视区:滚动使输入框底部贴近滚动容器底部(下方不露白)
        const target = elRect.bottom - scRect.top - scroller.clientHeight + elRect.height + 10
        if (scroller.scrollTop < target) {
          scroller.scrollTop = target
        }
      } else {
        try { el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) } catch { /* 忽略 */ }
      }
    }
    // 高频事件(键盘动画 / 滚动)合并到单次 rAF:更新视口变量后再确保聚焦输入框可见
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        update()
        ensureFocusedVisible()
      })
    }
    const onFocusOut = () => schedule()
    const onFocusIn = (e) => {
      // 聚焦输入框仅更新视口变量:键盘弹出把 --visible-vh 收缩,overlay/modal 高度随之收缩,
      // 配合 overlay 顶对齐 + 内容可滚,输入框自然落在键盘上方。
      schedule()
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        if (!el.closest(OVERLAY_SELECTOR)) {
          // 页面内输入框(非全屏浮层):键盘弹出后滚到最近滚动容器底部(输入框贴底,
          // 下方不露白);overlay 内输入框由 overlay 收缩机制处理,不做主动滚动。
          requestAnimationFrame(() => ensureFocusedVisible())
        }
      }
    }
    update()
    vv?.addEventListener('resize', schedule)
    vv?.addEventListener('scroll', schedule)
    // 关键:键盘唤起/收起由 focusin/focusout 驱动——旧 --vh 实现漏掉这两者
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      vv?.removeEventListener('resize', schedule)
      vv?.removeEventListener('scroll', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}
