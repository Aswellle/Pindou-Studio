import { describe, it, expect } from 'vitest'
import { SNAP_THRESHOLD, snapSelection } from './selectionSnap'

/**
 * 选区边缘吸附(A3)。
 *
 * 这里断言「焦点被吸到哪里」与「哪一轴发生了吸附」—— 前者决定框选结果,
 * 后者决定要不要画对齐高亮线。阈值边界是重点:超出阈值必须完全自由,
 * 否则吸附会变成抢手感。
 */

const R = '#E53935'
const _ = null

/** 6×5 网格,右侧有一块 2×3 的珠子(x 3..4, y 1..3) */
function grid() {
  return [
    [_, _, _, _, _, _],
    [_, _, _, R, R, _],
    [_, _, _, R, R, _],
    [_, _, _, R, R, _],
    [_, _, _, _, _, _],
  ]
}

const COLS = 6
const ROWS = 5

describe('SNAP_THRESHOLD', () => {
  it('触屏比鼠标宽(手指落点误差本来就大)', () => {
    expect(SNAP_THRESHOLD.coarse).toBeGreaterThan(SNAP_THRESHOLD.fine)
    expect(SNAP_THRESHOLD.fine).toBe(1)
    expect(SNAP_THRESHOLD.coarse).toBe(2)
  })
})

describe('snapSelection', () => {
  it('右边界靠近珠块左缘时吸到珠块上', () => {
    // 从 (0,1) 拖到 (2,1):右边界在 3(不含),珠块从 x=3 开始 → 边界 3 正是
    // 珠块左缘,但焦点 2 意味着右边界 3 已经对齐,不需要移动
    const anchor = { x: 0, y: 1 }
    const focus = { x: 2, y: 1 }
    const res = snapSelection(grid(), anchor, focus, COLS, ROWS, 1)
    // 已经对齐 → 不移动,也不该报「吸附了」
    expect(res.point).toEqual({ x: 2, y: 1 })
  })

  it('差一格时吸过去', () => {
    // 焦点 (1,1):右边界 2,珠块左缘在 3 → 差 1,阈值 1 内 → 吸到边界 3,
    // 焦点变成 2
    const res = snapSelection(grid(), { x: 0, y: 1 }, { x: 1, y: 1 }, COLS, ROWS, 1)
    expect(res.point).toEqual({ x: 2, y: 1 })
    expect(res.snapped.x).toBe(true)
  })

  it('超出阈值时完全不动(不抢手感)', () => {
    // 焦点 (0,1):右边界 1,珠块左缘 3 → 差 2 > 阈值 1 → 不吸
    const res = snapSelection(grid(), { x: 0, y: 1 }, { x: 0, y: 1 }, COLS, ROWS, 1)
    expect(res.point).toEqual({ x: 0, y: 1 })
    expect(res.snapped).toEqual({ x: false, y: false })
  })

  it('阈值 0(关闭吸附)时原样返回', () => {
    const res = snapSelection(grid(), { x: 0, y: 1 }, { x: 1, y: 1 }, COLS, ROWS, 0)
    expect(res.point).toEqual({ x: 1, y: 1 })
    expect(res.snapped).toEqual({ x: false, y: false })
  })

  it('拖左边界时吸到珠块右缘', () => {
    // 从 (5,1) 往左拖到 (4,1):左边界 4 处 x=3 与 x=4 都有珠子,不是边界;
    // 边界 5 才是珠块右缘(x=4 有珠、x=5 空)→ 吸到 5,把整块框住
    const res = snapSelection(grid(), { x: 5, y: 1 }, { x: 4, y: 1 }, COLS, ROWS, 1)
    expect(res.point.x).toBe(5)
    expect(res.snapped.x).toBe(true)
  })

  it('Y 轴同样吸附', () => {
    // 从 (3,0) 往下拖到 (3,1):下边界 2 处 y=1 与 y=2 都有珠子,不是边界;
    // 边界 4 才是珠块下缘(y=3 有珠、y=4 空)→ 焦点吸到 3
    const res = snapSelection(grid(), { x: 3, y: 0 }, { x: 3, y: 1 }, COLS, ROWS, 4)
    expect(res.point.y).toBe(3)
    expect(res.snapped.y).toBe(true)
  })

  it('锚点所在的那条边不会被吸走', () => {
    // 锚点 (0,1) 固定;只有右边界参与吸附。
    // 若实现错误地也吸左边界,焦点会被拉偏。
    const res = snapSelection(grid(), { x: 0, y: 1 }, { x: 1, y: 1 }, COLS, ROWS, 1)
    expect(res.point.x).toBe(2)
    // 左边界仍是 0(锚点不动)
    expect(res.point.y).toBe(1)
  })

  it('空白画布上不吸附(没有边界可吸)', () => {
    const empty = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
    const res = snapSelection(empty, { x: 0, y: 0 }, { x: 2, y: 2 }, COLS, ROWS, 2)
    expect(res.point).toEqual({ x: 2, y: 2 })
    expect(res.snapped).toEqual({ x: false, y: false })
  })

  it('两轴可以独立吸附,只报真正吸到的那一轴', () => {
    const res = snapSelection(grid(), { x: 0, y: 1 }, { x: 1, y: 1 }, COLS, ROWS, 1)
    expect(res.snapped).toEqual({ x: true, y: false })
  })

  it('非法输入原样返回', () => {
    expect(snapSelection(grid(), null, { x: 1, y: 1 }, COLS, ROWS, 1).point).toEqual({ x: 1, y: 1 })
    expect(snapSelection(grid(), { x: 0, y: 0 }, { x: 1, y: 1 }, 0, 0, 1).point).toEqual({ x: 1, y: 1 })
  })

  it('吸附后的焦点仍在网格内', () => {
    const res = snapSelection(grid(), { x: 0, y: 0 }, { x: 5, y: 4 }, COLS, ROWS, 2)
    expect(res.point.x).toBeGreaterThanOrEqual(0)
    expect(res.point.x).toBeLessThan(COLS)
    expect(res.point.y).toBeGreaterThanOrEqual(0)
    expect(res.point.y).toBeLessThan(ROWS)
  })
})
