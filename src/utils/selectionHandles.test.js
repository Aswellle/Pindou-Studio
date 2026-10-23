import { describe, it, expect } from 'vitest'
import {
  HANDLE_IDS,
  HANDLE_CURSORS,
  HANDLE_HIT_PX,
  handlePoints,
  hitTestHandle,
  resizeSelection,
} from './selectionHandles'

/**
 * 选区 resize 手柄的纯几何。
 *
 * 这里断言的是「拖哪个手柄 → 选区变成什么形状」和「哪个点算按住了手柄」,
 * 与画布渲染、指针事件无关 —— 后者在 Canvas.test.jsx 里覆盖。
 */

const SEL = { x: 2, y: 3, w: 4, h: 2 } // 覆盖 x 2..5, y 3..4

describe('handlePoints', () => {
  it('八个手柄落在四条边与四个角上', () => {
    const pts = handlePoints(SEL)
    expect(pts.map(p => p.id)).toEqual(HANDLE_IDS)
    expect(pts).toContainEqual({ id: 'nw', x: 2, y: 3 })
    expect(pts).toContainEqual({ id: 'ne', x: 6, y: 3 })
    expect(pts).toContainEqual({ id: 'se', x: 6, y: 5 })
    expect(pts).toContainEqual({ id: 'sw', x: 2, y: 5 })
    // 边中点在边上,不在格中心
    expect(pts).toContainEqual({ id: 'n', x: 4, y: 3 })
    expect(pts).toContainEqual({ id: 's', x: 4, y: 5 })
    expect(pts).toContainEqual({ id: 'w', x: 2, y: 4 })
    expect(pts).toContainEqual({ id: 'e', x: 6, y: 4 })
  })

  it('没有选区时返回空列表', () => {
    expect(handlePoints(null)).toEqual([])
  })
})

describe('HANDLE_CURSORS', () => {
  it('对角线方向互不相同(拖错方向要立刻手感不对)', () => {
    expect(HANDLE_CURSORS.nw).toBe('nwse-resize')
    expect(HANDLE_CURSORS.se).toBe('nwse-resize')
    expect(HANDLE_CURSORS.ne).toBe('nesw-resize')
    expect(HANDLE_CURSORS.sw).toBe('nesw-resize')
    expect(HANDLE_CURSORS.n).toBe('ns-resize')
    expect(HANDLE_CURSORS.e).toBe('ew-resize')
  })

  it('触屏命中区不小于 24px', () => {
    expect(HANDLE_HIT_PX.coarse).toBeGreaterThanOrEqual(24)
  })
})

describe('hitTestHandle', () => {
  it('在手柄上按下时命中该手柄', () => {
    expect(hitTestHandle(SEL, { x: 2.1, y: 3.1 }, { radius: 1 })).toBe('nw')
    expect(hitTestHandle(SEL, { x: 5.9, y: 4.9 }, { radius: 1 })).toBe('se')
    expect(hitTestHandle(SEL, { x: 4, y: 5 }, { radius: 1 })).toBe('s')
  })

  it('离所有手柄都远时返回 null(交给内部拖动)', () => {
    expect(hitTestHandle(SEL, { x: 4, y: 4 }, { radius: 0.5 })).toBeNull()
  })

  it('半径 0 时不命中任何手柄', () => {
    expect(hitTestHandle(SEL, { x: 2, y: 3 }, { radius: 0 })).toBeNull()
  })

  it('最小选区(1×1)也留得下拖动区,不会被八个手柄铺满', () => {
    const one = { x: 0, y: 0, w: 1, h: 1 }
    // 正中:即便给很大的半径也要能拖动内容,不能只能 resize
    expect(hitTestHandle(one, { x: 0.5, y: 0.5 }, { radius: 5 })).toBeNull()
    // 角落仍然命中手柄
    expect(hitTestHandle(one, { x: 0, y: 0 }, { radius: 5 })).toBe('nw')
  })

  it('多个手柄都在范围内时取最近的', () => {
    const thin = { x: 0, y: 0, w: 2, h: 2 }
    // (1.9, 0.1) 更靠近 ne(2,0) 而不是 n(1,0)
    expect(hitTestHandle(thin, { x: 1.9, y: 0.1 }, { radius: 2 })).toBe('ne')
  })
})

describe('resizeSelection', () => {
  const COLS = 10
  const ROWS = 8

  it('拖右下角:左上角不动,右下角跟到指针所在格', () => {
    const next = resizeSelection(SEL, 'se', { x: 7.4, y: 6.2 }, COLS, ROWS)
    expect(next).toEqual({ x: 2, y: 3, w: 6, h: 4 })
  })

  it('拖左上角:右下角不动', () => {
    const next = resizeSelection(SEL, 'nw', { x: 0.2, y: 1.9 }, COLS, ROWS)
    expect(next).toEqual({ x: 0, y: 1, w: 6, h: 4 })
  })

  it('拖右边手柄只改宽度,高度不变', () => {
    const next = resizeSelection(SEL, 'e', { x: 8, y: 0 }, COLS, ROWS)
    expect(next).toEqual({ x: 2, y: 3, w: 7, h: 2 })
  })

  it('拖上手柄只改上边界', () => {
    const next = resizeSelection(SEL, 'n', { x: 0, y: 1 }, COLS, ROWS)
    expect(next).toEqual({ x: 2, y: 1, w: 4, h: 4 })
  })

  it('指针所在格算被覆盖:拖到第 4 列,右边界到 5', () => {
    const next = resizeSelection({ x: 0, y: 0, w: 2, h: 2 }, 'e', { x: 4, y: 0 }, COLS, ROWS)
    expect(next.w).toBe(5)
  })

  it('格内位置取整向下:刚过格子中线也算这一格', () => {
    // 用 floor 而不是 round:拖到第 4 格的 0.6 处,右边界应当是 5(覆盖第 4 格)。
    // round 会在 0.5 就跳格,手柄跟手指差半格,手感发飘。
    const early = resizeSelection({ x: 0, y: 0, w: 2, h: 2 }, 'e', { x: 4.4, y: 0 }, COLS, ROWS)
    const late = resizeSelection({ x: 0, y: 0, w: 2, h: 2 }, 'e', { x: 4.9, y: 0 }, COLS, ROWS)
    expect(early.w).toBe(5)
    expect(late.w).toBe(5)
    // 差一点点没进第 4 格:右边界停在 4
    const before = resizeSelection({ x: 0, y: 0, w: 2, h: 2 }, 'e', { x: 3.99, y: 0 }, COLS, ROWS)
    expect(before.w).toBe(4)
  })

  it('越界被钳制在网格内,不会跑出画布', () => {
    const far = resizeSelection(SEL, 'se', { x: 99, y: 99 }, COLS, ROWS)
    expect(far.x + far.w).toBe(COLS)
    expect(far.y + far.h).toBe(ROWS)

    const negative = resizeSelection(SEL, 'nw', { x: -5, y: -5 }, COLS, ROWS)
    expect(negative.x).toBe(0)
    expect(negative.y).toBe(0)
    // 对角锚点仍在原位
    expect(negative.x + negative.w).toBe(6)
    expect(negative.y + negative.h).toBe(5)
  })

  it('最小 1×1:继续往里拖不会翻转成负宽高', () => {
    const next = resizeSelection(SEL, 'e', { x: 2, y: 3 }, COLS, ROWS)
    expect(next).toEqual({ x: 2, y: 3, w: 1, h: 2 })

    const nextW = resizeSelection(SEL, 'w', { x: 9, y: 3 }, COLS, ROWS)
    expect(nextW).toEqual({ x: 5, y: 3, w: 1, h: 2 })
  })

  it('非法输入原样返回,不产生 NaN', () => {
    expect(resizeSelection(SEL, 'se', { x: 1, y: 1 }, 0, 0)).toBe(SEL)
    expect(resizeSelection(null, 'se', { x: 1, y: 1 }, COLS, ROWS)).toBeNull()
    expect(resizeSelection(SEL, null, { x: 1, y: 1 }, COLS, ROWS)).toBe(SEL)
  })

  it('resize 只改矩形,不返回矩阵(选区不在撤销栈里)', () => {
    const next = resizeSelection(SEL, 'se', { x: 7, y: 6 }, COLS, ROWS)
    expect(Object.keys(next).sort()).toEqual(['h', 'w', 'x', 'y'])
  })
})
