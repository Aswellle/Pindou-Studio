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
    // 键盘弹出时临时放开 body/html 滚动锁定:body overflow:hidden 使 iOS 26 无法滚动
    // 页面,被迫用「视觉视口滚动而内容不跟随」的方式显示聚焦输入框 → 容器与视觉视口
    // 错位 → 键盘上方白板(后台联系消息等复现)。放开后 iOS 原生滚动页面/容器,内容跟随,
    // 视觉视口 offsetTop 归零。body 内容高度 = --vh(正好一屏),放开后无可滚范围,无副作用。
    let scrollUnlocked = false
    const unlockScroll = () => {
      if (scrollUnlocked) return
      scrollUnlocked = true
      document.documentElement.style.overflow = 'auto'
      document.body.style.overflow = 'auto'
    }
    const relockScroll = () => {
      if (!scrollUnlocked) return
      scrollUnlocked = false
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
    // 确保聚焦的页面内输入框在可视区:nearest 最小滚动(仅不在可视区才滚),不用 center/scrollTo
    const ensureFocusedVisible = () => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        if (!el.closest(OVERLAY_SELECTOR)) {
          try { el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) } catch { /* 忽略 */ }
        }
      }
    }
    // 高频事件(键盘动画 / 滚动)合并到单次 rAF:更新视口变量后再确保聚焦输入框可见
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        update()
        ensureFocusedVisible()
      })
    }
    const onFocusOut = () => {
      schedule()
      relockScroll()
    }
    const onFocusIn = (e) => {
      // 聚焦输入框仅更新视口变量:键盘弹出把 --visible-vh 收缩,overlay/modal 高度随之收缩,
      // 配合 overlay 顶对齐 + 内容可滚,输入框自然落在键盘上方。
      schedule()
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        if (!el.closest(OVERLAY_SELECTOR)) {
          // 页面内输入框(非全屏浮层):放开 body 滚动让 iOS 原生滚动(内容跟随,offsetTop 归零),
          // 并立即同步 nearest(抢在 iOS 自动滚动前)兜底;键盘弹出后由 schedule 再补一次。
          unlockScroll()
          try { el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) } catch { /* 忽略 */ }
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
