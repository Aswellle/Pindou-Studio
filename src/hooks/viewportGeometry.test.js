import { describe, it, expect } from 'vitest'
import {
  computeViewport, focusScrollDelta, placePopupMenu, KEYBOARD_MIN_INSET,
} from './viewportGeometry'

/**
 * 视口几何判定的穷举测试(规格 §8.1 第 1 条)。
 *
 * 这些用例不渲染组件、不模拟浏览器 —— 只喂几何数字,断言判定结果。
 * 覆盖:无键盘 / 软键盘 / 硬件键盘 / 双指缩放 / 地址栏动画 / stale offset /
 * 无 visualViewport / 焦点闩锁的建立与解除。
 *
 * 真机行为仍需按 M5 的设备矩阵手工验收;这里锁的是「同样的输入永远得到同样的判定」,
 * 防止后续调整阈值时无意改变某类场景的语义。
 */

const LAYOUT = 844 // iPhone 14 Pro 竖屏布局视口高

/** 构造一次判定的便捷入口,默认「无键盘、无焦点」 */
const run = (over = {}) => computeViewport({ layoutHeight: LAYOUT, visualHeight: LAYOUT, ...over })

describe('computeViewport · 键盘开合判定', () => {
  it('无键盘:全部归一化为布局视口', () => {
    const r = run()
    expect(r.keyboardOpen).toBe(false)
    expect(r.keyboardHeight).toBe(0)
    expect(r.visibleHeight).toBe(LAYOUT)
    expect(r.visibleTop).toBe(0)
    expect(r.changed).toBe(false)
  })

  it('软键盘 + 文本焦点:判定为打开,高度为几何差值', () => {
    const r = run({ visualHeight: 500, offsetTop: 0, textFocused: true })
    expect(r.keyboardOpen).toBe(true)
    expect(r.keyboardHeight).toBe(344) // 844 - 500 - 0
    expect(r.visibleHeight).toBe(500)
    expect(r.visibleTop).toBe(0)
  })

  it('软键盘 + offsetTop > 0:iOS 自动平移时差值要减掉偏移', () => {
    // 视觉视口覆盖 [20, 520]:高度 500、偏移 20 → 键盘高 = 844-500-20 = 324
    const r = run({ visualHeight: 500, offsetTop: 20, textFocused: true })
    expect(r.keyboardOpen).toBe(true)
    expect(r.keyboardHeight).toBe(324)
    expect(r.visibleTop).toBe(20)
  })

  it('硬件键盘(有焦点但视口不收缩):不判键盘', () => {
    // 外接键盘不占屏幕,visualViewport.height 不变 → inset 0 < 阈值
    const r = run({ visualHeight: LAYOUT, offsetTop: 0, textFocused: true })
    expect(r.keyboardOpen).toBe(false)
    expect(r.keyboardHeight).toBe(0)
    expect(r.visibleHeight).toBe(LAYOUT)
  })

  it('地址栏动画(收缩 < 阈值):不判键盘', () => {
    const r = run({ visualHeight: LAYOUT - 60, textFocused: true })
    expect(KEYBOARD_MIN_INSET).toBe(120)
    expect(r.keyboardOpen).toBe(false)
    expect(r.visibleHeight).toBe(LAYOUT)
  })

  it('恰好等于阈值:判为键盘(边界含等号)', () => {
    const r = run({ visualHeight: LAYOUT - KEYBOARD_MIN_INSET, textFocused: true })
    expect(r.keyboardOpen).toBe(true)
    expect(r.keyboardHeight).toBe(KEYBOARD_MIN_INSET)
  })

  it('低于阈值 1px:不判键盘', () => {
    const r = run({ visualHeight: LAYOUT - KEYBOARD_MIN_INSET + 1, textFocused: true })
    expect(r.keyboardOpen).toBe(false)
  })

  it('无文本焦点时即使视口大幅收缩也不判键盘(旋转 / 切后台)', () => {
    const r = run({ visualHeight: 400, offsetTop: 0, textFocused: false })
    expect(r.keyboardOpen).toBe(false)
    expect(r.keyboardHeight).toBe(0)
    expect(r.visibleHeight).toBe(LAYOUT)
  })
})

describe('computeViewport · 双指缩放', () => {
  it('scale ≠ 1 时绝不判键盘', () => {
    // 放大 2 倍:visualViewport.height 会变成约 422,几何上像键盘,但实际是缩放
    const r = run({ visualHeight: 422, offsetTop: 0, scale: 2, textFocused: true })
    expect(r.keyboardOpen).toBe(false)
    expect(r.keyboardHeight).toBe(0)
    expect(r.visibleHeight).toBe(LAYOUT)
  })

  it('缩放到 1.5 倍也解除已有闩锁', () => {
    const r = run({ visualHeight: 400, scale: 1.5, textFocused: true, latched: true, wasKeyboardOpen: true })
    expect(r.keyboardOpen).toBe(false)
    expect(r.latched).toBe(false)
    expect(r.changed).toBe(true) // 从开到关
  })

  it('scale 的浮点噪声(0.005)不算缩放', () => {
    const r = run({ visualHeight: 500, scale: 1.005, textFocused: true })
    expect(r.keyboardOpen).toBe(true)
  })

  it('scale 从 1 恢复到 1 后,焦点仍在时可重新判键盘', () => {
    const r = run({ visualHeight: 500, scale: 1, textFocused: true, latched: false, wasKeyboardOpen: false })
    expect(r.keyboardOpen).toBe(true)
  })
})

describe('computeViewport · 焦点闩锁', () => {
  it('焦点离开但几何尚未恢复:闩锁保持,不中途跳回全高', () => {
    // focusout 后键盘还在播放收起动画:焦点没了,但 inset 仍 ≥ 阈值
    const r = run({ visualHeight: 500, textFocused: false, latched: true, wasKeyboardOpen: true })
    expect(r.latched).toBe(true)
    expect(r.keyboardOpen).toBe(true)
    expect(r.visibleHeight).toBe(500)
    expect(r.changed).toBe(false) // 状态没翻转,页面不抖
  })

  it('几何真正恢复后闩锁解除', () => {
    const r = run({ visualHeight: LAYOUT, textFocused: false, latched: true, wasKeyboardOpen: true })
    expect(r.latched).toBe(false)
    expect(r.keyboardOpen).toBe(false)
    expect(r.changed).toBe(true) // 刚收起 → 调用方补一次焦点修正
  })

  it('几何永不恢复时,收敛耗尽可强制解除(settleExpired)', () => {
    // iOS 26 已知 bug(Apple Forums 800125 / FB19889436):键盘收起后
    // visualViewport.height 不恢复。此时「布局视口 − 视觉视口 ≥ 120」恒成立,
    // 只靠几何永远解不开闩锁 → 键盘高度永久非零 → 页面底部留下大片空白。
    const stuck = run({ visualHeight: 500, textFocused: false, latched: true, wasKeyboardOpen: true })
    expect(stuck.latched).toBe(true) // 没有第二条路径时:卡死

    const expired = run({
      visualHeight: 500, textFocused: false, latched: true, wasKeyboardOpen: true, settleExpired: true,
    })
    expect(expired.latched).toBe(false)
    expect(expired.keyboardOpen).toBe(false)
    expect(expired.keyboardHeight).toBe(0)
    expect(expired.changed).toBe(true)
  })

  it('settleExpired 不解除「仍在输入」的闩锁', () => {
    // 用户还在文本框里:几何即使异常,也不能把内容顶回键盘后面
    const r = run({
      visualHeight: 500, textFocused: true, latched: true, wasKeyboardOpen: true, settleExpired: true,
    })
    expect(r.latched).toBe(true)
    expect(r.keyboardOpen).toBe(true)
  })

  it('stale offsetTop 在键盘关闭时被归一化为 0', () => {
    // iOS 26 报告过:键盘收起后 offsetTop 仍残留 20
    const r = run({ visualHeight: LAYOUT, offsetTop: 20, textFocused: false, latched: false })
    expect(r.keyboardOpen).toBe(false)
    expect(r.visibleTop).toBe(0)
    expect(r.visibleHeight).toBe(LAYOUT)
  })

  it('visualHeight 瞬时报 0 时不让根壳塌成零高', () => {
    // 旋转 / 切后台 / 键盘动画极值:Safari 会短暂报 0。
    // 若直接参与计算,visibleHeight 写成 0 → --vh: 0px → #root height: 0,
    // 整棵树塌陷一帧白屏。下限保护必须把它抬到 1。
    const r = run({ visualHeight: 0, textFocused: true, latched: true })
    expect(r.visibleHeight).toBeGreaterThan(0)
    expect(r.visibleHeight).toBe(1)
  })

  it('visualHeight 为负时同样被下限保护', () => {
    const r = run({ visualHeight: -50, textFocused: true, latched: true })
    expect(r.visibleHeight).toBeGreaterThan(0)
  })

  it('stale offsetTop 在键盘打开时正常参与差值计算', () => {
    const r = run({ visualHeight: 500, offsetTop: 20, textFocused: true })
    expect(r.visibleTop).toBe(20)
    expect(r.keyboardHeight).toBe(324)
  })

  it('负的 offsetTop 被夹到 0(视觉视口不可能在布局视口上方)', () => {
    const r = run({ visualHeight: 500, offsetTop: -10, textFocused: true })
    expect(r.visibleTop).toBe(0)
  })
})

describe('computeViewport · 无 visualViewport', () => {
  it('visualHeight 为 null 时退化到布局视口', () => {
    const r = run({ visualHeight: null, textFocused: true })
    expect(r.keyboardOpen).toBe(false)
    expect(r.keyboardHeight).toBe(0)
    expect(r.visibleHeight).toBe(LAYOUT)
    expect(r.visibleTop).toBe(0)
    expect(r.latched).toBe(false)
  })

  it('从「键盘开」退化到「不支持」时报告 changed', () => {
    const r = run({ visualHeight: null, wasKeyboardOpen: true })
    expect(r.changed).toBe(true)
  })
})

describe('computeViewport · changed 语义', () => {
  it('打开方向翻转', () => {
    const r = run({ visualHeight: 500, textFocused: true, wasKeyboardOpen: false })
    expect(r.changed).toBe(true)
  })

  it('保持打开不翻转', () => {
    const r = run({ visualHeight: 500, textFocused: true, wasKeyboardOpen: true })
    expect(r.changed).toBe(false)
  })

  it('保持关闭不翻转', () => {
    const r = run({ visualHeight: 600, textFocused: false, wasKeyboardOpen: false })
    expect(r.changed).toBe(false)
  })
})

describe('computeViewport · 乱序事件后最终稳定', () => {
  it('键盘开 → 收起动画中途 → 真正恢复:每步判定单调', () => {
    // 1. 聚焦 + 键盘弹出
    let s = { latched: false, wasKeyboardOpen: false }
    let r = run({
      visualHeight: 500,
      textFocused: true,
      latched: s.latched,
      wasKeyboardOpen: s.wasKeyboardOpen,
    })
    expect(r.keyboardOpen).toBe(true)
    s = { latched: r.latched, wasKeyboardOpen: r.keyboardOpen }

    // 2. focusout,但视觉视口还没恢复(收起动画中途)
    r = run({ visualHeight: 620, textFocused: false, latched: s.latched, wasKeyboardOpen: s.wasKeyboardOpen })
    expect(r.keyboardOpen).toBe(true) // 仍在动画中,保持打开
    s = { latched: r.latched, wasKeyboardOpen: r.keyboardOpen }

    // 3. 动画结束,视觉视口恢复
    r = run({
      visualHeight: LAYOUT,
      textFocused: false,
      latched: s.latched,
      wasKeyboardOpen: s.wasKeyboardOpen,
    })
    expect(r.keyboardOpen).toBe(false)
    expect(r.latched).toBe(false)
    expect(r.visibleHeight).toBe(LAYOUT)
  })
})

describe('focusScrollDelta · 焦点可见性修正', () => {
  const base = {
    scrollerTop: 0,
    scrollerHeight: 500,
    visualTop: 0,
    visualHeight: 500,
    pad: 10,
  }

  it('元素完全在带内:不滚', () => {
    expect(focusScrollDelta({ ...base, elementTop: 200, elementBottom: 240 })).toBe(0)
  })

  it('元素在带上方:向上滚(负增量)', () => {
    // 顶边 -30,留白 10 → 需要上移 40
    expect(focusScrollDelta({ ...base, elementTop: -30, elementBottom: 10 })).toBe(-40)
  })

  it('元素在带下方:向下滚(正增量)', () => {
    // 底边 520,带高 500,留白 10 → 需要下移 30
    expect(focusScrollDelta({ ...base, elementTop: 480, elementBottom: 520 })).toBe(30)
  })

  it('恰好贴底(底边 = 带高 - 留白):不滚', () => {
    expect(focusScrollDelta({ ...base, elementTop: 450, elementBottom: 490 })).toBe(0)
  })

  it('offsetTop > 0 时按视觉视口下沿判定,而不是容器下沿', () => {
    // 容器 [0,500],视觉视口 [100,500](offsetTop=100, height=400) → 带 [100,500],带高 400
    // 元素 460–500:在容器内,底边也恰在带底,但留白 10 → 需下移 10
    // 若错误地按容器下沿(500)判定,这里会算出 0(不滚),元素就贴在键盘边缘。
    const delta = focusScrollDelta({
      ...base,
      scrollerHeight: 500,
      visualTop: 100,
      visualHeight: 400,
      elementTop: 460,
      elementBottom: 500,
    })
    expect(delta).toBe(10) // 400 - (400 - 10)
  })

  it('容器完全在可视区外:返回 0,交给原生滚动', () => {
    // 视觉视口在容器下方,交集为空
    const delta = focusScrollDelta({
      ...base,
      scrollerTop: 0,
      scrollerHeight: 500,
      visualTop: 600,
      visualHeight: 200,
      elementTop: 100,
      elementBottom: 140,
    })
    expect(delta).toBe(0)
  })

  it('容器比视觉视口高:有效带取交集', () => {
    // 容器 [0,800],视觉视口 [0,300] → 带 [0,300]
    const delta = focusScrollDelta({
      ...base,
      scrollerHeight: 800,
      visualTop: 0,
      visualHeight: 300,
      elementTop: 320,
      elementBottom: 360,
    })
    expect(delta).toBe(70) // 360 - 300 + 10
  })

  it('容器顶边低于视觉视口顶:带顶取容器顶', () => {
    // 容器 [200,700],视觉视口 [0,844] → 带 [200,700]
    const delta = focusScrollDelta({
      ...base,
      scrollerTop: 200,
      scrollerHeight: 500,
      visualTop: 0,
      visualHeight: 844,
      elementTop: 150,
      elementBottom: 190,
    })
    expect(delta).toBe(-60) // (150-200) - 10
  })
})

describe('placePopupMenu · 弹出菜单在视觉视口内的落点', () => {
  // 典型场景:390×844 手机,键盘弹起后视觉视口 [400, 800](offsetTop=400)
  const base = {
    menuWidth: 160,
    menuHeight: 100,
    vTop: 0,
    vBottom: 800,
    viewportWidth: 390,
    prefer: 'below',
  }

  it('首选向下展开:菜单贴按钮下沿', () => {
    const { top, left } = placePopupMenu({
      ...base,
      rect: { top: 100, bottom: 140, left: 20, right: 60 },
    })
    expect(top).toBe(146) // 140 + 6
    expect(left).toBe(20)
  })

  it('下方放不下时翻到按钮上方', () => {
    const { top } = placePopupMenu({
      ...base,
      rect: { top: 700, bottom: 740, left: 20, right: 60 },
    })
    expect(top).toBe(594) // 700 - 100 - 6
  })

  it('视觉视口下移后,向上展开越过带顶时翻到按钮下方', () => {
    // 键盘弹起:vTop=400,vBottom=800。按钮 420–460 在带内,
    // 但菜单向上展开 top = 420-100-6 = 314,在带顶之上 86px。
    const { top } = placePopupMenu({
      ...base,
      vTop: 400,
      vBottom: 800,
      rect: { top: 420, bottom: 460, left: 20, right: 60 },
      prefer: 'above',
    })
    // 翻到按钮下方 466(460+6),整个菜单仍在带内 —— 比硬夹到带顶更贴近用户预期
    expect(top).toBe(466)
    expect(top).toBeGreaterThanOrEqual(400)
    expect(top + 100).toBeLessThanOrEqual(800)
  })

  it('可见带比菜单还矮时:保证顶边可见,不把菜单推到带外', () => {
    // 带只有 100 高([400,500]),菜单也是 100 —— 加减 8px 留白后必然放不下。
    // 此时只能保顶边(标题/关闭按钮)可见,底部溢出由内容滚动兜底。
    const { top } = placePopupMenu({
      ...base,
      vTop: 400,
      vBottom: 500,
      rect: { top: 420, bottom: 460, left: 20, right: 60 },
      prefer: 'below',
    })
    expect(top).toBe(408) // vTop + margin,顶边在带内
    expect(top).toBeGreaterThanOrEqual(400)
    expect(top).toBeLessThanOrEqual(500)
  })

  it('右对齐菜单不越过右边界', () => {
    const { left } = placePopupMenu({
      ...base,
      rect: { top: 100, bottom: 140, left: 300, right: 380 },
      prefer: 'above',
    })
    // 380 - 160 = 220,加宽 160 → 380 ≤ 390-8 = 382,不需要夹紧
    expect(left).toBe(220)

    const narrow = placePopupMenu({
      ...base,
      viewportWidth: 320,
      rect: { top: 100, bottom: 140, left: 280, right: 316 },
      prefer: 'above',
    })
    // 316 - 160 = 156 → 156+160 = 316 > 312 → 夹到 320-160-8 = 152
    expect(narrow.left).toBe(152)
  })

  it('左边界不会为负', () => {
    const { left } = placePopupMenu({
      ...base,
      rect: { top: 100, bottom: 140, left: 2, right: 40 },
    })
    expect(left).toBe(8)
  })
})

describe('focusScrollDelta · 极窄可见带不震荡', () => {
  const narrow = {
    scrollerTop: 0,
    scrollerHeight: 15, // 带高 15 < 2×pad(20)
    visualTop: 0,
    visualHeight: 15,
    pad: 10,
  }

  it('带窄于 2×pad 且元素贴顶时向上修正一次', () => {
    // 元素 5–25,顶边 5 < pad 10 → delta = 5 - 10 = -5
    expect(focusScrollDelta({ ...narrow, elementTop: 5, elementBottom: 25 })).toBe(-5)
  })

  it('修正后再次调用不再产生反向增量(否则会以 ±25 来回跳)', () => {
    // 第一次 -2 后元素变成 108–128 的等价场景:元素已越过 pad,不再要求下沿
    const after = focusScrollDelta({ ...narrow, elementTop: 12, elementBottom: 32 })
    expect(after).toBe(0)
  })

  it('元素远低于极窄带时也只保证顶边,不追求下沿', () => {
    // 带高 15、pad 10:下沿目标 bandHeight - pad = 5,与顶边目标矛盾,
    // 此时顶边已在带内 → 不滚,交给用户自己滚
    expect(focusScrollDelta({ ...narrow, elementTop: 40, elementBottom: 60 })).toBe(0)
  })
})
