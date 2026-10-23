/**
 * viewportGeometry — 视觉视口几何判定(纯函数,无 DOM 依赖)。
 *
 * 从 useKeyboardSafe 抽出来的原因:键盘判定是这套基础设施里唯一有分支逻辑的部分,
 * 但它嵌在 useEffect 闭包里,只能靠模拟整个浏览器环境来测。抽成纯函数后可以穷举
 * 「无键盘 / 软键盘 / 硬件键盘 / 双指缩放 / 地址栏动画 / stale offset / 无
 * visualViewport」这些输入组合,而不必渲染组件。
 *
 * 判定规则(与 VIEWPORT_MODEL.md 一致):
 *   1. 双指缩放(scale ≠ 1)绝不判键盘 —— 缩放同样会让 visualViewport.height 变小,
 *      误判会把浮层内容压到屏幕顶部;
 *   2. 只有文本类控件聚焦才可能进入键盘态(焦点闩锁)。地址栏收起、旋转、切后台
 *      都会让视口尺寸变化,但焦点不在文本控件上,不能当成键盘;
 *   3. 几何差值 ≥ KEYBOARD_MIN_INSET 才算键盘。软键盘 ≥200px,地址栏/工具栏动画
 *      <80px,120px 落在两者中间;
 *   4. 键盘关闭时所有输出归一化为「布局视口」,不保留任何 offsetTop 残留
 *      (iOS 26 有键盘收起后 offsetTop 不归零的报告)。
 */

/** 键盘最小遮挡高度:低于此值视为浏览器 UI 变化而非键盘 */
export const KEYBOARD_MIN_INSET = 120

/** 缩放判定容差:visualViewport.scale 的浮点噪声 */
const SCALE_EPSILON = 0.01

/**
 * 计算下一帧的视口状态。
 *
 * @param {object} input
 * @param {number} input.layoutHeight - 布局视口高(window.innerHeight)
 * @param {number|null} input.visualHeight - visualViewport.height;null 表示浏览器不支持
 * @param {number} [input.offsetTop=0] - visualViewport.offsetTop
 * @param {number} [input.offsetLeft=0] - visualViewport.offsetLeft
 * @param {number} [input.scale=1] - visualViewport.scale
 * @param {boolean} [input.textFocused=false] - 当前焦点是否在会唤起软键盘的文本控件上
 * @param {boolean} [input.latched=false] - 上一帧的焦点闩锁状态
 * @param {boolean} [input.wasKeyboardOpen=false] - 上一帧的键盘开合状态
 * @returns {{
 *   keyboardOpen: boolean,
 *   keyboardHeight: number,
 *   visibleHeight: number,
 *   visibleTop: number,
 *   visibleLeft: number,
 *   latched: boolean,
 *   changed: boolean,
 * }}
 *
 * `changed` 表示键盘开合状态相对上一帧是否翻转,调用方用它决定要不要补一次
 * 焦点可见性修正(键盘刚打开/刚收起时几何变了,元素可能已经越界)。
 */
export function computeViewport({
  layoutHeight,
  visualHeight,
  offsetTop = 0,
  offsetLeft = 0,
  scale = 1,
  textFocused = false,
  latched = false,
  wasKeyboardOpen = false,
}) {
  // 无 visualViewport:退化到布局视口,键盘高度不可测 → 0。
  // 闩锁一并解除,避免浏览器升级/降级切换后残留状态。
  if (visualHeight == null) {
    return {
      keyboardOpen: false,
      keyboardHeight: 0,
      visibleHeight: layoutHeight,
      visibleTop: 0,
      visibleLeft: 0,
      latched: false,
      changed: wasKeyboardOpen,
    }
  }

  const zoomed = Math.abs((scale || 1) - 1) > SCALE_EPSILON
  // 负的 offsetTop 没有物理意义(视觉视口不可能跑到布局视口上方),统一夹到 0。
  // inset 与 visibleTop 必须用同一个值,否则键盘高度会多算负偏移的绝对值:
  // offsetTop = -30 时旧实现给出 374(应为 344),浮层底部多让出 30px 空白。
  const clampedTop = Math.max(0, offsetTop)
  // visualHeight 下限保护:旋转 / 切后台的瞬间 Safari 会报 0 或负数,
  // 若此时焦点闩锁仍为真,visibleHeight 会被写成 0 → --vh: 0px → 根壳塌成零高。
  const safeVisualHeight = Math.max(1, visualHeight)
  const inset = Math.max(0, layoutHeight - safeVisualHeight - clampedTop)

  // 焦点闩锁:缩放状态下绝不判键盘;文本控件聚焦才置真;
  // 几何差值回到阈值以下才解除 —— 这样 focusout 之后键盘收起动画期间
  // 变量不会中途跳回全高(页面不抖),动画结束、几何真正恢复后自然解除。
  let nextLatched = latched
  if (zoomed) nextLatched = false
  else if (textFocused) nextLatched = true
  else if (inset < KEYBOARD_MIN_INSET) nextLatched = false

  const keyboardOpen = !zoomed && nextLatched && inset >= KEYBOARD_MIN_INSET

  return {
    keyboardOpen,
    keyboardHeight: keyboardOpen ? inset : 0,
    // 键盘关闭时一律归一化为布局视口:不把 stale offsetTop / 收缩后的视觉高
    // 传给组件,否则根壳会缩水、浮层会偏移。
    visibleHeight: keyboardOpen ? safeVisualHeight : layoutHeight,
    visibleTop: keyboardOpen ? clampedTop : 0,
    visibleLeft: keyboardOpen ? offsetLeft : 0,
    latched: nextLatched,
    changed: keyboardOpen !== wasKeyboardOpen,
  }
}

/**
 * 焦点可见性修正量(纯函数)。
 *
 * 坐标系:getBoundingClientRect() 返回相对【布局视口】的坐标;用户真正看得见的
 * 窗口是视觉视口 [visualTop, visualTop + visualHeight]。只和滚动容器的 clientHeight
 * 比较不够 —— 容器高度已随 --visible-vh 收缩,元素「在容器内」不等于「在键盘上方」:
 * iOS 会自动平移视觉视口(offsetTop > 0),此时容器顶边已经跑到可视区之上,
 * 按容器高度算出的下沿落在键盘后面。所以取容器可视区 ∩ 视觉视口作为有效可见带。
 *
 * @param {object} input
 * @param {number} input.elementTop - 元素顶边(布局视口坐标)
 * @param {number} input.elementBottom - 元素底边
 * @param {number} input.scrollerTop - 滚动容器顶边
 * @param {number} input.scrollerHeight - 滚动容器可视高(clientHeight)
 * @param {number} input.visualTop - 视觉视口顶(布局视口坐标)
 * @param {number} input.visualHeight - 视觉视口高
 * @param {number} [input.pad=10] - 元素与带边缘的留白
 * @returns {number} 需要给 scrollTop 加的增量;0 表示已在带内、无需调整
 */
export function focusScrollDelta({
  elementTop,
  elementBottom,
  scrollerTop,
  scrollerHeight,
  visualTop,
  visualHeight,
  pad = 10,
}) {
  const bandTop = Math.max(scrollerTop, visualTop)
  const bandBottom = Math.min(scrollerTop + scrollerHeight, visualTop + visualHeight)
  const bandHeight = bandBottom - bandTop
  // 容器完全在可视区外:交给浏览器原生滚动,不在这里抢
  if (bandHeight <= 0) return 0

  const top = elementTop - bandTop
  const bottom = elementBottom - bandTop

  // 可见带窄于 2×pad 时,「上边留白」与「下边留白」两个目标互相矛盾:
  // 满足一个必然违反另一个,反复修正会以 ±2×pad 来回跳。
  // 这种极窄带(键盘动画极值、横屏低高度)只保顶边可见,不试图同时满足两端。
  if (bandHeight < pad * 2) return top < pad ? top - pad : 0

  if (top < pad) return top - pad
  if (bottom > bandHeight - pad) return bottom - bandHeight + pad
  return 0
}

/**
 * 弹出菜单(fixed 定位)在视觉视口内的落点。
 *
 * 菜单是 position:fixed,坐标系是**视觉视口**而不是布局视口:键盘弹起时
 * window.innerHeight 不收缩,iOS 还会平移视觉视口(offsetTop > 0)。只取
 * vv.height 会把菜单摆到键盘上方偏高处。
 *
 * 关键在于**双向**夹紧:只约束下沿不够 —— 触发按钮可能还在可见带内,
 * 但菜单向上展开会越过带顶(vTop > 0 时尤其明显)。因此两个方向都夹回带内。
 *
 * @param {object} p
 * @param {{top:number,bottom:number,left:number,right:number}} p.rect 触发按钮的布局矩形
 * @param {number} p.menuWidth 菜单宽度
 * @param {number} p.menuHeight 菜单高度
 * @param {number} p.vTop 视觉视口上沿(offsetTop,已钳到 ≥0)
 * @param {number} p.vBottom 视觉视口下沿(offsetTop + height)
 * @param {number} p.viewportWidth 布局视口宽度(横向夹紧用)
 * @param {'below'|'above'} p.prefer 首选展开方向
 * @param {number} [p.gap] 与触发按钮的间距
 * @param {number} [p.margin] 与视口边缘的最小间距
 * @returns {{left:number, top:number}}
 */
export function placePopupMenu({
  rect,
  menuWidth,
  menuHeight,
  vTop,
  vBottom,
  viewportWidth,
  prefer,
  gap = 6,
  margin = 8,
}) {
  const mh = menuHeight
  const mw = menuWidth

  // 横向:品牌菜单左对齐,导出菜单右对齐(按钮在卡片右下角)
  let left = prefer === 'below' ? rect.left : rect.right - mw
  if (left + mw > viewportWidth - margin) left = Math.max(margin, viewportWidth - mw - margin)
  if (left < margin) left = margin

  // 纵向:先按首选方向摆,越界就翻到另一侧,最后无条件夹回带内
  let top = prefer === 'below' ? rect.bottom + gap : rect.top - mh - gap
  if (top + mh > vBottom - margin) top = Math.max(vTop + margin, rect.top - mh - gap)
  if (top < vTop + margin) top = Math.min(rect.bottom + gap, vBottom - mh - margin)
  // 可见带比菜单还矮时,上面两条会互相把对方推出去。此时只能保证顶边可见
  // (内容可滚),绝不能让菜单整个跑到带外 —— 取带顶与「放下所需位置」的较大者,
  // 再退一步夹到带底之内。
  if (top + mh > vBottom - margin) top = Math.max(vTop + margin, vBottom - mh - margin)
  if (top < vTop + margin) top = vTop + margin

  return { left, top }
}
