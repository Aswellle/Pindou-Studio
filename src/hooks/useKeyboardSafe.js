import { useEffect } from 'react'

/**
 * 防复发机制:iOS Safari 键盘安全。
 *
 * 根因:键盘唤起时 iOS 只收缩 visual viewport,布局视口不变。任何用 `100vh`/布局视口
 * 计算高度的可滚动容器(页面、模态框、面板)在键盘弹出时其可视区不收缩,聚焦输入框
 * 会被顶出/被键盘盖住,表现为「白板」「滚不到底部按钮」。
 *
 * 系统级处理(在入口/main 一次调用,全站生效):
 *  1. 监听 visualViewport 的 resize,把「可视高度」写入 --visible-vh(CSS 变量)。
 *  2. 监听视觉视口偏移,把「当前视口顶部偏移」写入 --visible-vh-top。
 *  3. 任何需要响应键盘收缩的滚动容器,用
 *        height: calc(var(--visible-vh) - var(--visible-offset, 0px))
 *     即可随键盘自动收缩/复位,无需每个组件各自处理。
 *
 * 用法:在 main.jsx 调用一次 <KeyboardSafeProvider/> 或 useKeyboardSafe();
 * 由各容器 CSS 引用 --visible-vh(/--visible-vh-top)。
 */
export default function useKeyboardSafe() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    const update = () => {
      if (!vv) return
      const inner = window.innerHeight || 0
      // 可视高度:键盘弹出时收缩 → 容器 height 随之收缩,聚焦输入框不被盖住
      root.style.setProperty('--visible-vh', `${vv.height}px`)
      // 视觉视口相对布局视口的纵向偏移(键盘安全 / 顶部刘海):供容器加偏移补偿
      root.style.setProperty('--visible-vh-top', `${vv.offsetTop}px`)
      // --vh:整棵树(#root/.app)高度基准。键盘弹出时 visualViewport 收缩,
      // 用 min(innerHeight, visualViewport.height) 使布局随键盘收缩(旧方案只监听
      // resize,不监听键盘 focusin/focusout → 白板根因)。
      const vh = Math.min(inner, vv.height) * 0.01
      root.style.setProperty('--vh', `${vh}px`)
    }
    const onFocusOut = () => requestAnimationFrame(update)
    const onFocusIn = (e) => {
      // 先更新视口变量
      update()
      // 把聚焦输入框滚入可视区:任何输入框(注册/登录/搜索/回复/密码)聚焦时,
      // 即使所在滚动容器随键盘收缩,也能保证输入框露出(全站统一兜底,不重复写每组件)
      const el = e.target
      if (el instanceof window.HTMLElement && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) {
        try {
          el.scrollIntoView?.({ block: 'center', behavior: 'instant' })
        } catch (err) { /* 忽略 */ }
      }
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    // 关键:键盘唤起/收起由 focusin/focusout 驱动——旧 --vh 实现漏掉这两者
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])
}
