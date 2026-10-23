import { describe, it, expect } from 'vitest'
import {
  createLassoSelection,
  pointInLassoSelection,
  forEachLassoCell,
  countLassoCells,
  lassoToRect,
  clampLassoToGrid,
  boundsFromMask,
} from './lassoSelection'

/**
 * 套索几何。
 *
 * 核心是扫描线填充的正确性:凹多边形、自交、跨行边界都要选对格子。
 */

/** 把一个格子坐标列表整理成集合,便于比较 */
function cellsOf(sel, cols, rows) {
  const out = []
  forEachLassoCell(sel, cols, rows, (x, y) => out.push(`${x},${y}`))
  return out.sort()
}

describe('createLassoSelection', () => {
  it('三角形:只选中三角形内的格子', () => {
    // 在 10×10 画布上画一个覆盖左上角的三角形
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }],
      10, 10,
    )
    expect(sel).not.toBeNull()
    expect(sel.kind).toBe('lasso')
    // (0,0) 在三角形内;(5,5) 在斜边外侧
    expect(pointInLassoSelection(sel, { x: 0, y: 0 })).toBe(true)
    expect(pointInLassoSelection(sel, { x: 5, y: 5 })).toBe(false)
    expect(pointInLassoSelection(sel, { x: 1, y: 1 })).toBe(true)
  })

  it('矩形轨迹选中的格子数与矩形选区一致', () => {
    // 从 (2,2) 到 (6,6) 的矩形:应当是 5×5 = 25 格
    const sel = createLassoSelection(
      [{ x: 2, y: 2 }, { x: 7, y: 2 }, { x: 7, y: 7 }, { x: 2, y: 7 }],
      10, 10,
    )
    expect(countLassoCells(sel, 10, 10)).toBe(25)
    expect(sel.bounds).toEqual({ x: 2, y: 2, w: 5, h: 5 })
  })

  it('顶点恰好落在格子中心线上时按半开区间处理(不重复计数)', () => {
    // 用户画套索得到的是浮点坐标,顶点落在 y = y0 + 0.5 这条格子中心线
    // 上是真实会发生的。此时若用 >= 判断,局部极值顶点会被两条边各算一次,
    // 交点成对抵消,整行都选不中。
    // 这个三角形的上边 y = 0.5 恰好是第 0 行的中心线。
    const sel = createLassoSelection(
      [{ x: 0, y: 0.5 }, { x: 4, y: 0.5 }, { x: 4, y: 4 }],
      10, 10,
    )
    expect(sel).not.toBeNull()
    // 第 0 行必须被选中(否则说明顶点被算了两次)
    expect(pointInLassoSelection(sel, { x: 0, y: 0 })).toBe(true)
    expect(pointInLassoSelection(sel, { x: 3, y: 0 })).toBe(true)
  })

  it('凹多边形(L 形)不会把凹口也选进去', () => {
    // L 形:左上 2×2 的竖条 + 底部 4×2 的横条,凹口落在右上角 (x>2, y<2)
    const sel = createLassoSelection(
      [
        { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 },
        { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 0, y: 4 },
      ],
      10, 10,
    )
    expect(sel).not.toBeNull()
    // 凹口内(右上)必须不被选中
    expect(pointInLassoSelection(sel, { x: 3, y: 0 })).toBe(false)
    expect(pointInLassoSelection(sel, { x: 3, y: 1 })).toBe(false)
    // 竖条与横条都在选区内
    expect(pointInLassoSelection(sel, { x: 0, y: 0 })).toBe(true)
    expect(pointInLassoSelection(sel, { x: 1, y: 1 })).toBe(true)
    expect(pointInLassoSelection(sel, { x: 3, y: 3 })).toBe(true)
  })

  it('轨迹不足三点返回 null', () => {
    expect(createLassoSelection([{ x: 0, y: 0 }, { x: 1, y: 1 }], 10, 10)).toBeNull()
    expect(createLassoSelection([], 10, 10)).toBeNull()
    expect(createLassoSelection(null, 10, 10)).toBeNull()
  })

  it('覆盖不到任何格子时返回 null(不是空选区)', () => {
    const sel = createLassoSelection(
      [{ x: 100, y: 100 }, { x: 101, y: 100 }, { x: 100, y: 101 }],
      10, 10,
    )
    expect(sel).toBeNull()
  })

  it('轨迹超出画布时只保留画布内的部分', () => {
    const sel = createLassoSelection(
      [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }],
      10, 10,
    )
    expect(sel).not.toBeNull()
    // 外接矩形被裁到画布内
    expect(sel.bounds.x).toBe(0)
    expect(sel.bounds.y).toBe(0)
    expect(sel.bounds.w).toBe(5)
    expect(sel.bounds.h).toBe(5)
  })

  it('记录掩码的坐标系尺寸(没有它无法反解坐标)', () => {
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }],
      10, 8,
    )
    expect(sel.cols).toBe(10)
    expect(sel.rows).toBe(8)
  })
})

describe('pointInLassoSelection', () => {
  it('矩形选区(非 lasso)一律返回 false,避免误用', () => {
    expect(pointInLassoSelection({ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 0 })).toBe(false)
  })

  it('外接矩形之外直接短路,不读掩码', () => {
    const sel = createLassoSelection(
      [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }],
      10, 10,
    )
    expect(pointInLassoSelection(sel, { x: 9, y: 9 })).toBe(false)
    expect(pointInLassoSelection(sel, { x: -1, y: 0 })).toBe(false)

    // 短路是**正确性**问题,不只是性能:掩码是画布大小,而 bounds 之外的
    // 坐标可能仍然落在掩码数组范围内(比如 (9,9) 对 10×10 掩码合法)。
    // 这里把掩码的 bounds 之外区域人为点亮,验证短路确实拦住了它们。
    const tampered = { ...sel, mask: new Uint8Array(sel.mask) }
    tampered.mask[9 * 10 + 9] = 1
    tampered.mask[2 * 10 + 9] = 1 // 行在 bounds 内、列在外
    expect(pointInLassoSelection(tampered, { x: 9, y: 9 })).toBe(false)
    expect(pointInLassoSelection(tampered, { x: 9, y: 2 })).toBe(false)
  })

  it('空值安全', () => {
    expect(pointInLassoSelection(null, { x: 0, y: 0 })).toBe(false)
    expect(pointInLassoSelection({ kind: 'lasso' }, { x: 0, y: 0 })).toBe(false)
  })
})

describe('lassoToRect', () => {
  it('返回外接矩形', () => {
    const sel = createLassoSelection(
      [{ x: 2, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 2, y: 7 }],
      10, 10,
    )
    // 坐标是**格子边界**语义:轨迹从格 (2,3) 的左上角拉到格 (5,6) 的右下角,
    // 覆盖的格子中心是 x∈[2.5,5.5] → 2..5 共 4 列
    expect(lassoToRect(sel)).toEqual({ x: 2, y: 3, w: 4, h: 4 })
  })

  it('非套索返回 null', () => {
    expect(lassoToRect({ x: 0, y: 0, w: 2, h: 2 })).toBeNull()
    expect(lassoToRect(null)).toBeNull()
  })
})

describe('clampLassoToGrid', () => {
  it('画布尺寸没变时原样返回同一个对象', () => {
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }],
      10, 10,
    )
    expect(clampLassoToGrid(sel, 10, 10)).toBe(sel)
  })

  it('画布变大时保留原有选区并重建掩码坐标系', () => {
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }],
      10, 10,
    )
    const clamped = clampLassoToGrid(sel, 20, 20)
    expect(clamped).not.toBe(sel)
    expect(clamped.cols).toBe(20)
    expect(clamped.rows).toBe(20)
    // 选中格子数不变
    expect(countLassoCells(clamped, 20, 20)).toBe(countLassoCells(sel, 10, 10))
    expect(pointInLassoSelection(clamped, { x: 0, y: 0 })).toBe(true)
  })

  it('画布变小时裁掉越界部分', () => {
    const sel = createLassoSelection(
      [{ x: 5, y: 5 }, { x: 9, y: 5 }, { x: 9, y: 9 }, { x: 5, y: 9 }],
      10, 10,
    )
    const clamped = clampLassoToGrid(sel, 7, 7)
    expect(clamped).not.toBeNull()
    expect(clamped.cols).toBe(7)
    // 只剩 (5,5)(6,6) 这一小块
    expect(clamped.bounds.x).toBe(5)
    expect(clamped.bounds.w).toBe(2)
    expect(pointInLassoSelection(clamped, { x: 6, y: 6 })).toBe(true)
    expect(pointInLassoSelection(clamped, { x: 8, y: 8 })).toBe(false)
  })

  it('全部越界时返回 null', () => {
    const sel = createLassoSelection(
      [{ x: 5, y: 5 }, { x: 9, y: 5 }, { x: 9, y: 9 }, { x: 5, y: 9 }],
      10, 10,
    )
    expect(clampLassoToGrid(sel, 3, 3)).toBeNull()
  })
})

describe('boundsFromMask', () => {
  it('从掩码反推外接矩形', () => {
    const cols = 5
    const rows = 4
    const mask = new Uint8Array(cols * rows)
    mask[1 * cols + 2] = 1
    mask[2 * cols + 3] = 1
    expect(boundsFromMask(mask, cols, rows)).toEqual({ x: 2, y: 1, w: 2, h: 2 })
  })

  it('全零掩码返回 null', () => {
    expect(boundsFromMask(new Uint8Array(25), 5, 5)).toBeNull()
  })
})

describe('cellsOf 辅助(自检)', () => {
  it('与 countLassoCells 口径一致', () => {
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
      10, 10,
    )
    expect(cellsOf(sel, 10, 10)).toHaveLength(countLassoCells(sel, 10, 10))
  })
})
