import { useEffect } from 'react'

// 全屏浮层类:聚焦这些容器内的输入框由 overlay 收缩机制处理(--visible-vh),
// 不做主动滚动;页面内输入框(后台表单、联系消息回复、登录页等)用内层滚动容器修正。
// 新增全屏浮层时必须同步加入 index.css 的共享浮层组(mobileOverlayContract.test.js 强制)。
const OVERLAY_SELECTOR = [
  '.modal-overlay',
  '.contact-overlay',
  '.admin-modal-overlay',
  '.users-confirm-overlay',
  '.profile-confirm-overlay',
  '.load-confirm-overlay',
  '.my-beads-modal-overlay',
  '.quantizer-zoom',
].join(',')

// 本 hook 负责写入的 CSS 变量(卸载时逐一清理)
const VARS = ['--visible-vh', '--visible-vh-top', '--visual-offset-left', '--keyboard-height', '--vh']

// 键盘最小遮挡高度:软键盘 ≥200px,地址栏/工具栏动画 <80px,120px 落在两者中间。
// 低于该值一律视为「浏览器 UI 变化」而不是键盘,避免地址栏收起时把页面当成键盘打开。
const KEYBOARD_MIN_INSET = 120

// 焦点可见性留白(输入框与滚动容器边缘之间)
const FOCUS_PAD = 10

// 会唤起软键盘的文本类控件。select 在 iOS 上弹的是滚轮选择器、不改变视觉视口,
// 因此不参与键盘判定(但仍参与焦点可见性修正)。
const TEXT_INPUT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'time', 'week'])

const isTextInput = (el) => {
  if (!el) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase())
  return false
}

const isFocusableField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')

/**
 * 防复发机制:iOS Safari 键盘安全 + 全站视觉视口基础设施(单一事实来源)。
 *
 * 根因:键盘唤起时 iOS 只收缩 visual viewport,布局视口不变。任何用 `100vh`/布局视口
 * 计算高度的可滚动容器(页面、模态框、面板)在键盘弹出时其可视区不收缩,聚焦输入框
 * 会被顶出/被键盘盖住,表现为「白板」「滚不到底部按钮」。
 *
 * 唯一几何模型(详见 docs/implementation/ios-safari-viewport/VIEWPORT_MODEL.md):
 *  根壳 #root 的高度取「布局视口高」与「视觉视口底部」的较大值 ——
 *  `max(--vh * 100, --visible-vh-top + --visible-vh)`。
 *  这样根壳在任何时刻都覆盖到视觉视口底部,又永远不会超过布局视口(不会被 body 裁掉);
 *  子壳(.app / .mobile-layout)只继承 100%,不再各自叠加补偿。
 *  全屏浮层是 fixed + 布局视口坐标,用同一组变量的内边距把内容框进视觉视口。
 *
 * 变量语义(键盘关闭时一律归一化为「布局视口」,不保留任何键盘残留):
 *  - `--visible-vh`        键盘打开时为 visualViewport.height,否则为布局视口高。
 *  - `--visible-vh-top`    键盘打开时为 visualViewport.offsetTop,否则恒为 0。
 *                          iOS 26 存在「键盘关闭后 offsetTop 不归零」的报告,
 *                          归一化后该残留不会传给任何组件。
 *  - `--keyboard-height`   键盘打开时为 布局视口 − 视觉视口 − 顶部偏移,否则恒为 0。
 *  - `--vh`                根壳高度基准 = 上述可视高 * 0.01。
 *  - `--visual-offset-left` 横向偏移(当前无消费者,为横向 safe-area 预留)。
 *
 * 键盘状态用「焦点闩锁 + 几何阈值」判定,不使用任何定时器:
 *  文本控件聚焦 → 闩锁置真;缩放、或几何差回到阈值以下 → 闩锁解除。
 *  这样 focusout 之后键盘收起动画期间变量不会中途跳回全高(页面不抖),
 *  而动画结束、几何真正恢复后闩锁自然解除。
 *
 * 测量与滚动分离:只有 focusin、以及键盘开合的那一次几何变化会触发焦点可见性修正;
 * `visualViewport.scroll` 只更新变量,不再无条件滚动聚焦元素。
 *
 * 用法:在 App.jsx 调用一次 useKeyboardSafe();由各容器 CSS 引用上述变量。
 */
export default function useKeyboardSafe() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    let raf = 0
    // 本帧是否请求了焦点可见性修正(rAF 合并期间只保留最后一次意图)
    let wantFocusCheck = false
    // 焦点闩锁:文本控件聚焦后置真,几何恢复或缩放时解除
    let keyboardLatched = false
    // 上一帧的键盘状态,用于识别「刚打开 / 刚关闭」并补一次焦点修正
    let lastKeyboardOpen = false
    const set = (k, v) => root.style.setProperty(k, v)

    // 采样一组几何值并写入变量;返回键盘状态是否发生变化。
    // 同一帧内只读取一次布局视口高,避免「先读新高度、后读旧偏移」的不一致。
    // 用 window.innerHeight 而不是 documentElement.clientHeight:前者是既有实现
    // 一直在用的量,键盘关闭时与 visualViewport.height 相等;clientHeight 在 iOS 上
    // 究竟是「小视口」还是「大视口」无法在本机验证,不冒险改语义。
    const measure = () => {
      const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0

      if (!vv) {
        // 无 visualViewport 的旧浏览器:退化用布局视口,键盘高度不可测得 → 0(估算)
        set('--visible-vh', `${layoutHeight}px`)
        set('--visible-vh-top', '0px')
        set('--visual-offset-left', '0px')
        set('--keyboard-height', '0px')
        set('--vh', `${layoutHeight * 0.01}px`)
        const changed = lastKeyboardOpen
        lastKeyboardOpen = false
        keyboardLatched = false
        return changed
      }

      const scale = vv.scale || 1
      const zoomed = Math.abs(scale - 1) > 0.01
      const inset = Math.max(0, layoutHeight - vv.height - vv.offsetTop)

      // 焦点闩锁:缩放状态下绝不判键盘(否则放大页面会把差值当成键盘高度,
      // 浮层内容被压到屏幕顶部);文本控件聚焦才置真,几何回到阈值以下才解除。
      if (zoomed) keyboardLatched = false
      else if (isTextInput(document.activeElement)) keyboardLatched = true
      else if (inset < KEYBOARD_MIN_INSET) keyboardLatched = false

      const keyboardOpen = !zoomed && keyboardLatched && inset >= KEYBOARD_MIN_INSET

      const visualHeight = keyboardOpen ? vv.height : layoutHeight
      const visualTop = keyboardOpen ? Math.max(0, vv.offsetTop) : 0
      const keyboardHeight = keyboardOpen ? inset : 0

      set('--visible-vh', `${visualHeight}px`)
      set('--visible-vh-top', `${visualTop}px`)
      set('--visual-offset-left', `${keyboardOpen ? vv.offsetLeft : 0}px`)
      set('--keyboard-height', `${keyboardHeight}px`)
      // 根壳基准:键盘打开时取视觉视口高(根壳再由 max() 补上 offsetTop),
      // 其余情况恒为布局视口高 —— 缩放与地址栏动画都不再改变整棵树的高度。
      set('--vh', `${visualHeight * 0.01}px`)

      const changed = keyboardOpen !== lastKeyboardOpen
      lastKeyboardOpen = keyboardOpen
      return changed
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

    // 确保聚焦的页面内输入框在可视区。
    // 全程在同一坐标系内计算:输入框相对滚动容器可视区顶部的偏移,与 clientHeight 比较。
    // (旧实现用「视口相对偏移 − clientHeight」与 scrollTop 比较,量纲不一致:
    //  页面一旦滚动过,判据恒为假,长列表里的行内输入框再也不会被修正。)
    // 上下两个方向都处理;单次、非平滑赋值,不与 iOS 原生滚动动画叠加。
    const ensureFocusedVisible = () => {
      const el = document.activeElement
      if (!isFocusableField(el)) return
      if (el.closest(OVERLAY_SELECTOR)) return
      const scroller = getScrollAncestor(el)
      if (!scroller) {
        // 没有内层滚动容器时才兜底:nearest 不会带动其它可滚动祖先
        try { el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) } catch { /* 忽略 */ }
        return
      }
      const elRect = el.getBoundingClientRect()
      const scRect = scroller.getBoundingClientRect()
      const top = elRect.top - scRect.top
      const bottom = elRect.bottom - scRect.top
      const viewHeight = scroller.clientHeight
      if (top < FOCUS_PAD) {
        scroller.scrollTop += top - FOCUS_PAD
      } else if (bottom > viewHeight - FOCUS_PAD) {
        scroller.scrollTop += bottom - viewHeight + FOCUS_PAD
      }
    }

    // 高频事件(键盘动画 / 滚动)合并到单次 rAF,只做测量;
    // 焦点修正由 wantFocusCheck 或「键盘状态刚变化」触发,不再每次 vv.scroll 都滚一次。
    const scheduleMeasure = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const keyboardChanged = measure()
        if (wantFocusCheck || keyboardChanged) ensureFocusedVisible()
        wantFocusCheck = false
      })
    }
    const requestFocusCheck = () => {
      wantFocusCheck = true
      scheduleMeasure()
    }

    const onFocusIn = (e) => {
      // 页面内输入框:键盘展开后修正一次可见性;浮层内输入框由浮层收缩机制处理
      if (isFocusableField(e.target) && !e.target.closest(OVERLAY_SELECTOR)) requestFocusCheck()
      else scheduleMeasure()
    }
    // focusout 时 activeElement 立刻变 body,但键盘还在播放收起动画。
    // 这里只重新测量;闩锁会保持到几何真正恢复,变量不会中途跳回全高。
    const onFocusOut = () => scheduleMeasure()
    // 生命周期重校验:从后台返回、bfcache 恢复、旋转后都要重新读一次真实值,
    // 否则变量会停留在离开前的旧状态。
    const onVisibilityChange = () => { if (!document.hidden) scheduleMeasure() }
    const onPageShow = () => scheduleMeasure()
    const onOrientationChange = () => scheduleMeasure()

    measure()
    vv?.addEventListener('resize', scheduleMeasure)
    vv?.addEventListener('scroll', scheduleMeasure)
    window.addEventListener('resize', scheduleMeasure)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('orientationchange', onOrientationChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    // 关键:键盘唤起/收起由 focusin/focusout 驱动——旧 --vh 实现漏掉这两者
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      vv?.removeEventListener('resize', scheduleMeasure)
      vv?.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('orientationchange', onOrientationChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (raf) cancelAnimationFrame(raf)
      // 卸载时清掉本 hook 写入的变量(规格 08 §8):避免污染测试环境或
      // 同一文档里的其他应用实例。只移除自己设置的键,不动 :root 上的其他自定义属性。
      for (const key of VARS) root.style.removeProperty(key)
    }
  }, [])
}
