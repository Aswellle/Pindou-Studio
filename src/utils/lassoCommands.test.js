import { describe, it, expect } from 'vitest'
import {
  fillLasso,
  clearLasso,
  mirrorLasso,
  rotateLasso,
  copyLasso,
  cutLasso,
  moveLasso,
  copyMoveLasso,
  pasteLasso,
} from './lassoCommands'
import { createLassoSelection } from './lassoSelection'

/**
 * 套索命令。
 *
 * 这些命令的返回形状与 selectionUtils 的矩形版一致(`{ data, changed, selection }`),
 * 调用方按 selection.kind 分派。因此测试重点不是"能不能用",而是
 * **语义与矩形版对齐** —— 用户不该需要学第二套规则。
 */

/** 造一个 rows×cols 的空矩阵 */
function blank(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(null))
}

/** 在空矩阵上按坐标填色 */
function paint(rows, cols, cells) {
  const m = blank(rows, cols)
  for (const [x, y, c] of cells) m[y][x] = c
  return m
}

/** 一个 5×5 的方块套索,左上角在 (1,1) */
function squareSel() {
  return createLassoSelection(
    [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 6 }, { x: 1, y: 6 }],
    10, 10,
  )
}

describe('fillLasso', () => {
  it('默认只改已有珠子,空位跳过并计数', () => {
    const data = paint(4, 4, [[1, 1, '#AAA'], [2, 2, '#BBB']])
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
      4, 4,
    )
    const r = fillLasso(data, sel, '#F00')

    expect(r.changed).toBe(2)
    expect(r.skippedEmpty).toBe(14) // 16 格里只有 2 格有珠子
    expect(r.data[1][1]).toBe('#F00')
    expect(r.data[2][2]).toBe('#F00')
    expect(r.data[0][0]).toBeNull() // 空位没被填
  })

  it('includeEmpty 时连空位一起填', () => {
    const data = paint(4, 4, [[1, 1, '#AAA']])
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
      4, 4,
    )
    const r = fillLasso(data, sel, '#F00', { includeEmpty: true })
    expect(r.changed).toBe(16)
    expect(r.skippedEmpty).toBe(0)
    expect(r.data[0][0]).toBe('#F00')
  })

  it('颜色本来就一致时 data 为 null(不压历史)', () => {
    const data = paint(4, 4, [[1, 1, '#F00']])
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
      4, 4,
    )
    const r = fillLasso(data, sel, '#F00')
    expect(r.changed).toBe(0)
    expect(r.data).toBeNull()
  })

  it('只影响掩码内的格子(套索外同色不动)', () => {
    const data = paint(6, 6, [[0, 0, '#AAA'], [5, 5, '#AAA']])
    const sel = createLassoSelection(
      [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }],
      6, 6,
    )
    const r = fillLasso(data, sel, '#F00', { includeEmpty: true })
    expect(r.data[0][0]).toBe('#AAA')
    expect(r.data[5][5]).toBe('#AAA')
    expect(r.data[2][2]).toBe('#F00')
  })

  it('不修改入参', () => {
    const data = paint(4, 4, [[1, 1, '#AAA']])
    const snapshot = JSON.parse(JSON.stringify(data))
    fillLasso(data, squareSel(), '#F00', { includeEmpty: true })
    expect(data).toEqual(snapshot)
  })
})

describe('clearLasso', () => {
  it('清空选区内所有格子', () => {
    const data = paint(4, 4, [[1, 1, '#AAA'], [2, 2, '#BBB'], [0, 0, '#CCC']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      4, 4,
    )
    const r = clearLasso(data, sel)
    expect(r.changed).toBe(2)
    expect(r.data[1][1]).toBeNull()
    expect(r.data[2][2]).toBeNull()
    expect(r.data[0][0]).toBe('#CCC') // 选区外保留
  })
})

describe('mirrorLasso', () => {
  it('绕外接矩形水平翻转,内容确实换位', () => {
    // 4 格宽的方块,只填最左一列
    const data = paint(5, 5, [[1, 1, '#A'], [1, 2, '#B']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }, { x: 1, y: 5 }],
      5, 5,
    )
    const r = mirrorLasso(data, sel, 'horizontal')

    // 外接矩形 x∈[1,4],最左列 x=1 翻到 x=4
    expect(r.data[1][4]).toBe('#A')
    expect(r.data[2][4]).toBe('#B')
    expect(r.data[1][1]).toBeNull()
  })

  it('垂直翻转', () => {
    const data = paint(5, 5, [[1, 1, '#A']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }, { x: 1, y: 5 }],
      5, 5,
    )
    const r = mirrorLasso(data, sel, 'vertical')
    // 外接矩形 y∈[1,4],最上行翻到最下行
    expect(r.data[4][1]).toBe('#A')
    expect(r.data[1][1]).toBeNull()
  })

  it('翻转后的源格不在掩码内时跳过 —— 这是套索与矩形的唯一语义差别', () => {
    // 关键场景:掩码在**外接矩形内**留了个缺口。
    // 用这个梯形让第 0 行只覆盖 x∈{0,1},而第 1 行覆盖 x∈{0,1,2},
    // 于是外接矩形宽 3,但 (2,0) 在掩码外。
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }],
      4, 4,
    )
    expect(sel.bounds).toEqual({ x: 0, y: 0, w: 3, h: 2 })
    expect(sel.mask[0 * 4 + 2]).toBe(0) // (2,0) 不在选区内

    // (2,0) 在外接矩形内但不在套索内 —— 画布上它可以有珠子。
    // 水平镜像时 (0,0) 的源格正是 (2,0):若不检查掩码,
    // 这个套索外的珠子会被搬进套索里,污染选区内容。
    const data = paint(4, 4, [[0, 0, '#A'], [2, 0, '#OUTSIDE']])
    const r = mirrorLasso(data, sel, 'horizontal')

    // 掩码内的所有格镜像后都落回掩码内或需要跳过,内容不变
    expect(r.changed).toBe(0)
    expect(r.data).toBeNull()
  })

  it('翻转后的源格在掩码内时正常搬运(不误伤合法翻转)', () => {
    // 同样的竖条,内容在外接矩形内,翻转后应原地不动
    const data = paint(4, 4, [[0, 1, '#A']])
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 3 }, { x: 0, y: 3 }],
      4, 4,
    )
    const r = mirrorLasso(data, sel, 'horizontal')
    // 1 列宽,翻转是恒等变换,内容不变,不产生历史
    expect(r.changed).toBe(0)
    expect(r.data).toBeNull()
  })

  it('对称内容镜像后无变化,返回 data:null', () => {
    const data = blank(5, 5)
    for (let y = 1; y <= 4; y++) for (let x = 1; x <= 4; x++) data[y][x] = '#SAME'
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }, { x: 1, y: 5 }],
      5, 5,
    )
    const r = mirrorLasso(data, sel, 'horizontal')
    expect(r.changed).toBe(0)
    expect(r.data).toBeNull()
  })
})

describe('rotateLasso', () => {
  it('顺时针旋转把最左列搬到最上行', () => {
    // 3×3 方块,只填左列
    const data = paint(5, 5, [[1, 1, '#A'], [1, 2, '#B'], [1, 3, '#C']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      5, 5,
    )
    const r = rotateLasso(data, sel, 'cw')

    // cw 下左列 → 上行,且**自下而上**映射为**从左到右**
    // (与 selectionUtils.rotateSelection 的 rotated[r][c]=block[h-1-c][r] 一致)
    expect(r.data[1][1]).toBe('#C')
    expect(r.data[1][2]).toBe('#B')
    expect(r.data[1][3]).toBe('#A')
    // 原位置清空
    expect(r.data[2][1]).toBeNull()
  })

  it('顺时针再逆时针旋转回原位(往返稳定)', () => {
    const data = paint(5, 5, [[1, 1, '#A'], [1, 2, '#B'], [1, 3, '#C']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      5, 5,
    )
    const cw = rotateLasso(data, sel, 'cw')
    const back = rotateLasso(cw.data, cw.selection, 'ccw')
    expect(back.data).toEqual(data)
  })

  it('逆时针旋转把最左列搬到最下行', () => {
    const data = paint(5, 5, [[1, 1, '#A'], [1, 2, '#B'], [1, 3, '#C']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      5, 5,
    )
    const r = rotateLasso(data, sel, 'ccw')
    // ccw 下左列 → 下行,**自上而下**映射为**从左到右**
    expect(r.data[3][1]).toBe('#A')
    expect(r.data[3][2]).toBe('#B')
    expect(r.data[3][3]).toBe('#C')
  })

  it('返回新的 selection(外接矩形宽高互换),调用方必须采纳', () => {
    // 2×4 的长方形选区,旋转后应变成 4×2
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 }, { x: 1, y: 3 }],
      10, 10,
    )
    expect(sel.bounds).toMatchObject({ w: 4, h: 2 })

    const data = blank(10, 10)
    const r = rotateLasso(data, sel, 'cw')
    expect(r.selection).not.toBeNull()
    // 旋转后宽高互换(空内容时 changed 为 0,但 selection 仍然更新)
    expect(r.selection.bounds).toMatchObject({ w: 2, h: 4 })
    expect(r.selection.kind).toBe('lasso')
  })

  it('空选区旋转不产生历史,但 selection 仍然返回', () => {
    const data = blank(6, 6)
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      6, 6,
    )
    const r = rotateLasso(data, sel, 'cw')
    expect(r.changed).toBe(0)
    expect(r.data).toBeNull()
    expect(r.selection).not.toBeNull()
  })
})

describe('copyLasso / cutLasso', () => {
  it('复制出的 block 是外接矩形大小,选区外填 null', () => {
    const data = paint(5, 5, [[1, 1, '#A'], [2, 2, '#B']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      5, 5,
    )
    const c = copyLasso(data, sel)
    expect(c.w).toBe(3)
    expect(c.h).toBe(3)
    expect(c.block[0][0]).toBe('#A')
    expect(c.block[1][1]).toBe('#B')
    expect(c.block[0][2]).toBeNull() // 外接矩形内但不在选区/无内容
    // 掩码记录形状
    expect(c.mask[0]).toBe(1)
    expect(c.mask[8]).toBe(1)
  })

  it('全空选区不产生 block', () => {
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      5, 5,
    )
    const c = copyLasso(blank(5, 5), sel)
    expect(c.block).toBeNull()
    expect(c.mask).toBeNull()
  })

  it('剪切同时返回内容与原图被清空的结果', () => {
    const data = paint(5, 5, [[1, 1, '#A'], [0, 0, '#OUT']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      5, 5,
    )
    const r = cutLasso(data, sel)
    expect(r.block[0][0]).toBe('#A')
    expect(r.changed).toBe(1)
    expect(r.data[1][1]).toBeNull()
    expect(r.data[0][0]).toBe('#OUT') // 选区外不动
  })

  it('空选区剪切不产生历史', () => {
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      5, 5,
    )
    const r = cutLasso(blank(5, 5), sel)
    expect(r.data).toBeNull()
    expect(r.changed).toBe(0)
  })
})

describe('moveLasso', () => {
  it('搬走内容并留下空位,选区跟着走', () => {
    const data = paint(6, 6, [[1, 1, '#A'], [2, 1, '#B']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }],
      6, 6,
    )
    const r = moveLasso(data, sel, 2, 2)

    expect(r.data[3][3]).toBe('#A')
    expect(r.data[3][4]).toBe('#B')
    expect(r.data[1][1]).toBeNull()
    expect(r.selection.bounds).toMatchObject({ x: 3, y: 3 })
  })

  it('越界时 clamp 到画布内,不丢内容', () => {
    const data = paint(6, 6, [[1, 1, '#A']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }],
      6, 6,
    )
    // 往右推 100 格:整个 2×2 外接矩形贴到右边界
    const r = moveLasso(data, sel, 100, 0)
    expect(r.selection.bounds.x).toBe(4) // 6 - 2
    expect(r.data[1][4]).toBe('#A')
  })

  it('位移为 0 时不动也不压历史', () => {
    const sel = squareSel()
    const r = moveLasso(blank(10, 10), sel, 0, 0)
    expect(r.data).toBeNull()
    expect(r.changed).toBe(0)
  })

  it('移到已贴边时返回原选区', () => {
    const data = paint(6, 6, [[1, 1, '#A']])
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }],
      6, 6,
    )
    const r = moveLasso(data, sel, -5, -5)
    // 已经贴左上角,clamp 后位移为 0
    expect(r.data).toBeNull()
    expect(r.changed).toBe(0)
  })
})

describe('copyMoveLasso', () => {
  it('留下原件,在偏移处再放一份', () => {
    const data = paint(6, 6, [[1, 1, '#A']])
    const sel = createLassoSelection(
      [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }],
      6, 6,
    )
    const r = copyMoveLasso(data, sel, 2, 0)

    expect(r.data[1][1]).toBe('#A') // 原件还在
    expect(r.data[1][3]).toBe('#A') // 副本
    expect(r.selection.bounds).toMatchObject({ x: 3, y: 1 })
  })
})

describe('pasteLasso', () => {
  /** 三角形套索:选中 (0,0)(1,0)(0,1),外接矩形 2×2 但右下角不在掩码内 */
  function triangleSel() {
    return createLassoSelection(
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
      6, 6,
    )
  }

  it('只贴掩码内的格子,不抹掉落点处原有的珠子', () => {
    const data = paint(6, 6, [[0, 0, '#A'], [1, 1, '#EXISTING']])
    const sel = triangleSel()
    const clip = copyLasso(data, sel)

    // 贴到 (2,2):掩码内只有 (0,0)(1,0)(0,1) → (2,2)(3,2)(2,3)
    const r = pasteLasso(data, clip, 2, 2)
    expect(r.data[2][2]).toBe('#A')
    // 落点外接矩形内的「掩码外」格子必须保持原样 ——
    // 若按整块粘贴,(3,3) 会被写成 null(剪贴板占位),把原有珠子抹掉
    expect(r.data[3][3]).toBeNull()
  })

  it('落点处掩码外的已有内容不被剪贴板的占位 null 覆盖', () => {
    const data = paint(6, 6, [[0, 0, '#A'], [3, 3, '#KEEP']])
    const sel = triangleSel()
    const clip = copyLasso(data, sel)

    const r = pasteLasso(data, clip, 2, 2)
    // (3,3) 是外接矩形 (2,2)-(3,3) 的右下角,不在三角形掩码内
    expect(r.data[3][3]).toBe('#KEEP')
  })

  it('粘贴后返回的选区保留掩码形状', () => {
    const data = paint(6, 6, [[0, 0, '#A']])
    const clip = copyLasso(data, triangleSel())
    const r = pasteLasso(data, clip, 2, 2)

    expect(r.selection.kind).toBe('lasso')
    expect(r.selection.cols).toBe(6)
    expect(r.selection.mask[2 * 6 + 2]).toBe(1)
    expect(r.selection.mask[3 * 6 + 3]).toBe(0)
  })

  it('无掩码的矩形剪贴板退化为整块粘贴', () => {
    const data = blank(6, 6)
    const clip = { w: 2, h: 2, block: [['#A', '#B'], ['#C', '#D']], mask: null }
    const r = pasteLasso(data, clip, 1, 1)
    expect(r.data[1][1]).toBe('#A')
    expect(r.data[2][2]).toBe('#D')
    expect(r.selection).toEqual({ x: 1, y: 1, w: 2, h: 2 })
  })

  it('空剪贴板返回空结果', () => {
    expect(pasteLasso(blank(4, 4), { block: null }, 0, 0).data).toBeNull()
    expect(pasteLasso(blank(4, 4), null, 0, 0).data).toBeNull()
  })

  it('内容完全相同返回 data:null(不压历史)', () => {
    const data = paint(6, 6, [[0, 0, '#A']])
    const clip = copyLasso(data, triangleSel())
    // 贴回原位:掩码内颜色相同
    const r = pasteLasso(data, clip, 0, 0)
    expect(r.changed).toBe(0)
    expect(r.data).toBeNull()
  })
})

describe('边界:空数据与空选区', () => {
  it('空矩阵不崩溃', () => {
    expect(fillLasso([], squareSel(), '#F00').data).toBeNull()
    expect(clearLasso([], squareSel()).data).toBeNull()
    expect(mirrorLasso([], squareSel()).data).toBeNull()
    expect(rotateLasso([], squareSel()).data).toBeNull()
    expect(copyLasso([], squareSel()).block).toBeNull()
    expect(moveLasso([], squareSel(), 1, 1).data).toBeNull()
  })

  it('null 选区不崩溃', () => {
    const data = blank(4, 4)
    expect(fillLasso(data, null, '#F00').data).toBeNull()
    expect(mirrorLasso(data, null).data).toBeNull()
    expect(rotateLasso(data, null).data).toBeNull()
    expect(copyLasso(data, null).block).toBeNull()
  })
})
