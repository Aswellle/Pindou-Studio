import { useEffect } from 'react'
import { computeViewport, computeRawViewport, focusScrollDelta } from './viewportGeometry'

// 全屏浮层类:浮层**遮罩自身**永不滚动,由 overlay 收缩机制处理(--visible-vh);
// 但浮层**内部**的滚动容器(如 .my-beads-modal)会被修正到可见带内 ——
// 浮层收缩只保证遮罩在键盘上方,不保证内部表单末尾可见。
// 页面内输入框(后台表单、联系消息回复、登录页等)同样用内层滚动容器修正。
// 新增全屏浮层时必须同步加入 index.css 的共享浮层组(mobileOverlayContract.test.js 强制)。
const OVERLAY_SELECTOR = [
  '.modal-overlay',
  '.admin-modal-overlay',
  '.users-confirm-overlay',
  '.profile-confirm-overlay',
  '.load-confirm-overlay',
  '.my-beads-modal-overlay',
  '.quantizer-zoom',
].join(',')

// 本 hook 负责写入的 CSS 变量(卸载时逐一清理)
const VARS = ['--visible-vh', '--visible-vh-top', '--visual-offset-left', '--keyboard-height', '--vh',
  '--raw-visual-vh', '--raw-visual-top']

// 焦点可见性留白(输入框与滚动容器边缘之间)
const FOCUS_PAD = 10

// focusout 后的收敛轮询上限(帧)。约 500ms,覆盖键盘收起动画;
// 每帧重新测量,判定已关闭即停,不是固定延时。
const SETTLE_MAX_FRAMES = 30

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
 *  - `--raw-visual-vh` / `--raw-visual-top`
 *                          **原始**视觉视口(高 / 顶偏移),不做任何键盘判定。
 *                          给「整页框必须等于可见区域」的页面用(如 /contact):
 *                          键盘判定有阈值,一旦漏判(布局视口也一起缩小时
 *                          几何差 < 120px),上面的变量会归一化回布局视口高,
 *                          整页就会按错误高度排版。原始值没有这个前提。
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
    // 键盘收起后的有界收敛轮询(见 beginSettle 注释)
    let settleRaf = 0
    let settleLeft = 0
    // 本帧是否请求了焦点可见性修正(rAF 合并期间只保留最后一次意图)
    let wantFocusCheck = false
    // 焦点闩锁:文本控件聚焦后置真,几何恢复或缩放时解除
    let keyboardLatched = false
    // 上一帧的键盘状态,用于识别「刚打开 / 刚关闭」并补一次焦点修正
    let lastKeyboardOpen = false
    // 最近一次测量得到的视觉视口窗口(布局视口坐标),供焦点可见性修正使用
    let visualTop = 0
    let visualHeight = 0
    const set = (k, v) => root.style.setProperty(k, v)

    // 采样一组几何值并写入变量;返回键盘状态是否发生变化。
    // 判定逻辑在 viewportGeometry(纯函数,可穷举测试);这里只负责读 DOM、写变量。
    // 同一帧内只读取一次布局视口高,避免「先读新高度、后读旧偏移」的不一致。
    // 用 window.innerHeight 而不是 documentElement.clientHeight:前者是既有实现
    // 一直在用的量,键盘关闭时与 visualViewport.height 相等;clientHeight 在 iOS 上
    // 究竟是「小视口」还是「大视口」无法在本机验证,不冒险改语义。
    const measure = () => {
      const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0

      const next = computeViewport({
        layoutHeight,
        visualHeight: vv ? vv.height : null,
        offsetTop: vv ? vv.offsetTop : 0,
        offsetLeft: vv ? vv.offsetLeft : 0,
        scale: vv ? vv.scale : 1,
        textFocused: isTextInput(document.activeElement),
        latched: keyboardLatched,
        wasKeyboardOpen: lastKeyboardOpen,
      })

      set('--visible-vh', `${next.visibleHeight}px`)
      set('--visible-vh-top', `${next.visibleTop}px`)
      set('--visual-offset-left', `${next.visibleLeft}px`)
      set('--keyboard-height', `${next.keyboardHeight}px`)
      // 根壳基准:键盘打开时取视觉视口高(根壳再由 max() 补上 offsetTop),
      // 其余情况恒为布局视口高 —— 缩放与地址栏动画都不再改变整棵树的高度。
      set('--vh', `${next.visibleHeight * 0.01}px`)

      // 原始视觉视口(不做键盘判定):给「整页 = 可见区域」的页面用。
      // 与上面的归一化变量并列存在 —— 浮层需要的是「键盘开没开」这个判断,
      // 而独立页需要的是「此刻用户看得见多大一块」,后者不该受判定阈值影响。
      const raw = computeRawViewport({
        layoutHeight,
        visualHeight: vv ? vv.height : null,
        offsetTop: vv ? vv.offsetTop : 0,
      })
      set('--raw-visual-vh', `${raw.height}px`)
      set('--raw-visual-top', `${raw.top}px`)

      // 供 ensureFocusedVisible 使用:视觉视口在布局视口坐标系里的窗口
      visualTop = next.visibleTop
      visualHeight = next.visibleHeight
      keyboardLatched = next.latched
      lastKeyboardOpen = next.keyboardOpen
      return next.changed
    }

    // 找到输入框最近的「可滚动」祖先(排除 html/body/不可滚动元素/浮层遮罩本身)。
    // 键盘弹出时让输入框在这个内层容器里可见 —— 不滚动 body/html(那会把整页内容
    // 顶到屏幕上方 → 视觉视口看到容器之外 → 白板,已证实),也不滚动浮层遮罩
    // (它是 fixed + inset:0,滚它等于把整个 modal 顶出可视区)。
    const getScrollAncestor = (el) => {
      let node = el.parentElement
      while (node && node !== document.documentElement && node !== document.body) {
        // 浮层遮罩本身不作为滚动目标:它承载的是 fixed 定位的整屏容器
        if (node.matches?.(OVERLAY_SELECTOR)) return null
        const style = window.getComputedStyle(node)
        const oy = style.overflowY
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight) {
          return node
        }
        node = node.parentElement
      }
      return null
    }

    // 确保聚焦的输入框在可视区。
    //
    // 坐标系:getBoundingClientRect() 返回的是相对【布局视口】的坐标;而键盘弹起后
    // 用户真正看得见的窗口是视觉视口 [visualTop, visualTop + visualHeight]。
    // 只和滚动容器的 clientHeight 比较是不够的 —— 容器高度已经随 --visible-vh 收缩,
    // 元素"在容器内"不等于"在键盘上方":iOS 会自动平移视觉视口(offsetTop > 0),
    // 此时容器的顶边已经跑到可视区之上,按容器高度算出来的下沿落在键盘后面。
    // 因此先取容器与视觉视口的交集作为有效可见带,再把元素修到带内。
    //
    // 上下两个方向都处理;单次、非平滑赋值,不与 iOS 原生滚动动画叠加。
    //
    // 浮层内输入框:浮层自身收缩(--visible-vh)解决"浮层被键盘盖住",但**不解决**
    // 浮层内部 modal 的滚动 —— modal 有 max-height + overflow-y:auto,键盘弹起后
    // 可用高度可能小于内容,最后一个字段/操作行会落在滚动区外。所以这里不整体跳过
    // 浮层,只排除「滚动浮层自身」(overlay 是 fixed 定位的遮罩,滚它等于把整个
    // modal 顶出视口,正是白板元凶),允许修正浮层内部的滚动容器。
    const ensureFocusedVisible = () => {
      const el = document.activeElement
      if (!isFocusableField(el)) return
      const overlay = el.closest(OVERLAY_SELECTOR)
      const scroller = getScrollAncestor(el)
      // 浮层内且没有内层滚动容器:交给浮层收缩机制,不做任何滚动
      if (overlay && !scroller) return
      // 页面内且无滚动容器:兜底 nearest(不会带动其它可滚动祖先)
      if (!scroller) {
        try { el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) } catch { /* 忽略 */ }
        return
      }
      const elRect = el.getBoundingClientRect()
      const scRect = scroller.getBoundingClientRect()

      // 有效可见带(布局视口坐标)= 容器可视区 ∩ 视觉视口;算术在纯函数里,可单测。
      const delta = focusScrollDelta({
        elementTop: elRect.top,
        elementBottom: elRect.bottom,
        scrollerTop: scRect.top,
        scrollerHeight: scroller.clientHeight,
        visualTop,
        visualHeight,
        pad: FOCUS_PAD,
      })
      if (delta !== 0) scroller.scrollTop += delta
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

    // 键盘收起后的收敛轮询。
    //
    // 为什么需要:闩锁只有在「几何真正恢复」时才解除,而它依赖 visualViewport
    // 继续派发 resize。iOS 上存在不派发的路径 —— 点键盘右下角「完成」收起、
    // 或 interactive-widget=resizes-content 生效导致视觉视口高度不变 ——
    // 此时最后一次 measure 停在键盘打开态,--vh 保持收缩值,根壳比布局视口矮,
    // 页面底部就悬在浏览器视口底部之上,而且再也回不来(没有后续事件唤醒)。
    //
    // 这里不是固定延时:每帧重新测量,一旦判定键盘已关就立即停止;最多 30 帧
    // (约 500ms)后放弃,不会变成常驻轮询。
    const stopSettle = () => {
      if (settleRaf) { cancelAnimationFrame(settleRaf); settleRaf = 0 }
      settleLeft = 0
    }
    const settleStep = () => {
      settleRaf = 0
      if (settleLeft <= 0) return
      settleLeft -= 1
      measure()
      if (lastKeyboardOpen && settleLeft > 0) settleRaf = requestAnimationFrame(settleStep)
      else settleLeft = 0
    }
    const beginSettle = () => {
      stopSettle()
      settleLeft = SETTLE_MAX_FRAMES
      settleRaf = requestAnimationFrame(settleStep)
    }

    const onFocusIn = (e) => {
      // 所有输入框聚焦都要做一次可见性修正:
      //  - 页面内输入框 → 滚最近的页面滚动容器;
      //  - 浮层内输入框 → 滚浮层内部 modal 的滚动容器(键盘已开时,浮层收缩不再
      //    变化,若不主动修正,用户点到最后一个字段时它会停在 sticky 操作行底下)。
      // 浮层遮罩自身被 getScrollAncestor 排除,不会把整个 modal 顶出视口。
      stopSettle()
      if (isFocusableField(e.target)) requestFocusCheck()
      else scheduleMeasure()
    }
    // focusout 时 activeElement 立刻变 body,但键盘还在播放收起动画。
    // 先重新测量;闩锁会保持到几何真正恢复,变量不会中途跳回全高。
    // 再启动有界收敛,兜住「收起后不再有 resize 事件」的路径。
    const onFocusOut = () => {
      scheduleMeasure()
      beginSettle()
    }
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
      stopSettle()
      // 卸载时清掉本 hook 写入的变量(规格 08 §8):避免污染测试环境或
      // 同一文档里的其他应用实例。只移除自己设置的键,不动 :root 上的其他自定义属性。
      for (const key of VARS) root.style.removeProperty(key)
    }
  }, [])
}
