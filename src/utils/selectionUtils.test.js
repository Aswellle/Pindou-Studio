import { describe, it, expect } from 'vitest'
import {
  normalizeSelection,
  pointInSelection,
  fillSelection,
  clearSelection,
  mirrorSelection,
  rotateSelection,
  countColor,
  collectColorStats,
  replaceColor,
  liftSelection,
  stampBlock,
  clampMove,
  moveSelection,
  copyMoveSelection,
  copySelection,
  pasteBlock,
} from './selectionUtils'

const R = '#E53935'
const G = '#43A047'
const B = '#1E88E5'

/** 4×3 grid: rows=3, cols=4 */
function grid() {
  return [
    [R, R, G, G],
    [R, null, G, B],
    [null, B, B, null],
  ]
}

const clone = (d) => d.map(r => [...r])

describe('selectionUtils · normalizeSelection', () => {
  it('把任意两角规范成左上角 + 宽高', () => {
    expect(normalizeSelection({ x: 3, y: 2 }, { x: 1, y: 0 }, 4, 3))
      .toEqual({ x: 1, y: 0, w: 3, h: 3 })
  })

  it('锚点与焦点相同 → 1×1 选区', () => {
    expect(normalizeSelection({ x: 2, y: 1 }, { x: 2, y: 1 }, 4, 3))
      .toEqual({ x: 2, y: 1, w: 1, h: 1 })
  })

  it('越界坐标被钳制到网格内(不产生负宽高)', () => {
    const sel = normalizeSelection({ x: -5, y: -5 }, { x: 99, y: 99 }, 4, 3)
    expect(sel).toEqual({ x: 0, y: 0, w: 4, h: 3 })
  })

  it('空输入返回 null', () => {
    expect(normalizeSelection(null, { x: 0, y: 0 }, 4, 3)).toBeNull()
    expect(normalizeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }, 0, 3)).toBeNull()
  })
})

describe('selectionUtils · pointInSelection', () => {
  const sel = { x: 1, y: 1, w: 2, h: 2 }
  it('边界包含左上、不包含右下外沿', () => {
    expect(pointInSelection(sel, { x: 1, y: 1 })).toBe(true)
    expect(pointInSelection(sel, { x: 2, y: 2 })).toBe(true)
    expect(pointInSelection(sel, { x: 3, y: 2 })).toBe(false)
    expect(pointInSelection(sel, { x: 0, y: 1 })).toBe(false)
  })
})

describe('selectionUtils · fill / clear', () => {
  // 规格 04 §2:默认只改已有珠子,空白格保持空白。
  it('默认只填充已有珠子,空白格保持空白', () => {
    const data = grid()
    // 区域 (0,0)-(1,1) 内:(0,0)=R (1,0)=R (0,1)=R (1,1)=null
    const res = fillSelection(data, { x: 0, y: 0, w: 2, h: 2 }, B)
    expect(res.changed).toBe(3)
    expect(res.skippedEmpty).toBe(1)
    expect(res.data[0]).toEqual([B, B, G, G])
    expect(res.data[1][0]).toBe(B)
    expect(res.data[1][1]).toBeNull() // 空白格没有被填上
    // 原矩阵未被修改
    expect(data[0]).toEqual([R, R, G, G])
  })

  it('includeEmpty 打开时连空白格一起填(显式开关路径)', () => {
    const res = fillSelection(grid(), { x: 0, y: 0, w: 2, h: 2 }, B, { includeEmpty: true })
    expect(res.changed).toBe(4)
    expect(res.skippedEmpty).toBe(0)
    expect(res.data[1][1]).toBe(B)
  })

  it('全空选区默认不产生变更,并报告跳过数量(供 UI 提示)', () => {
    const data = [[null, null], [null, null]]
    const res = fillSelection(data, { x: 0, y: 0, w: 2, h: 2 }, B)
    expect(res).toEqual({ data: null, changed: 0, skippedEmpty: 4 })
  })

  it('已全是目标色 → data 为 null(调用方不应压栈)', () => {
    const data = [[B, B], [B, B]]
    expect(fillSelection(data, { x: 0, y: 0, w: 2, h: 2 }, B))
      .toEqual({ data: null, changed: 0, skippedEmpty: 0 })
  })

  it('clearSelection 等同填充 null', () => {
    const res = clearSelection(grid(), { x: 0, y: 0, w: 1, h: 3 })
    expect(res.data.map(r => r[0])).toEqual([null, null, null])
    expect(res.changed).toBe(2)
  })

  it('越界选区被裁剪,不越界写入', () => {
    // 目标格 (3,2) 是空白格,需要显式打开 includeEmpty
    const res = fillSelection(grid(), { x: 3, y: 2, w: 9, h: 9 }, B, { includeEmpty: true })
    expect(res.changed).toBe(1)
    expect(res.data[2][3]).toBe(B)
    expect(res.data).toHaveLength(3)
  })
})

describe('selectionUtils · mirror', () => {
  it('水平镜像左右翻转选区', () => {
    const res = mirrorSelection(grid(), { x: 0, y: 0, w: 4, h: 1 }, 'horizontal')
    expect(res.data[0]).toEqual([G, G, R, R])
  })

  it('垂直镜像上下翻转选区', () => {
    const data = [[R], [G], [B]]
    const res = mirrorSelection(data, { x: 0, y: 0, w: 1, h: 3 }, 'vertical')
    expect(res.data.map(r => r[0])).toEqual([B, G, R])
  })

  it('对称内容 → null(不压栈)', () => {
    const data = [[R, R], [R, R]]
    expect(mirrorSelection(data, { x: 0, y: 0, w: 2, h: 2 }).data).toBeNull()
  })
})

describe('selectionUtils · rotate', () => {
  it('顺时针旋转 2×3 → 3×2 并返回新选区', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [0, 0, 0],
    ]
    const res = rotateSelection(data, { x: 0, y: 0, w: 3, h: 2 }, 'cw')
    expect(res.selection).toEqual({ x: 0, y: 0, w: 2, h: 3 })
    // 原选区第 3 列被清空(它属于旧矩形);新块只有 2 列宽
    expect(res.data).toEqual([
      [4, 1, null],
      [5, 2, null],
      [6, 3, 0],
    ])
  })

  it('逆时针是顺时针的逆', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [0, 0, 0],
    ]
    const cw = rotateSelection(data, { x: 0, y: 0, w: 3, h: 2 }, 'cw').data
    const back = rotateSelection(cw, { x: 0, y: 0, w: 2, h: 3 }, 'ccw').data
    expect(back.slice(0, 2)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ])
  })

  it('空白格随内容一起旋转(null 不被丢弃)', () => {
    const data = [
      [R, null],
      [null, G],
    ]
    const res = rotateSelection(data, { x: 0, y: 0, w: 2, h: 2 }, 'cw')
    expect(res.data).toEqual([
      [null, R],
      [G, null],
    ])
  })

  it('旋转后保持在网格内(贴边选区)', () => {
    const data = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 1, 2],
      [0, 0, 3, 4],
    ]
    const res = rotateSelection(data, { x: 2, y: 2, w: 2, h: 2 }, 'cw')
    expect(res.selection.x).toBeGreaterThanOrEqual(0)
    expect(res.selection.y).toBeGreaterThanOrEqual(0)
    expect(res.selection.x + res.selection.w).toBeLessThanOrEqual(4)
    expect(res.selection.y + res.selection.h).toBeLessThanOrEqual(4)
  })

  it('全空选区 → data 为 null,但选框仍换成旋转后的形状', () => {
    const data = [[null, null], [null, null]]
    const res = rotateSelection(data, { x: 0, y: 0, w: 2, h: 3 })
    expect(res.data).toBeNull()
    // 3×2 → 2×3:选框形状必须跟随,否则下一次旋转会基于错误矩形
    expect(res.selection).toEqual({ x: 0, y: 0, w: 3, h: 2 })
  })
})

describe('selectionUtils · 颜色统计与替换', () => {
  it('countColor 只数指定颜色,不把空白算进去', () => {
    expect(countColor(grid(), R)).toBe(3)
    expect(countColor(grid(), null)).toBe(0)
    expect(countColor(grid(), '#000000')).toBe(0)
  })

  it('collectColorStats 按使用量降序,忽略非法值', () => {
    const data = [
      [R, R, R],
      [G, G, 'P18'],
      [null, null, null],
    ]
    expect(collectColorStats(data)).toEqual([
      { hex: R, count: 3 },
      { hex: G, count: 2 },
    ])
  })

  it('replaceColor 一次性替换,不碰空白格', () => {
    const res = replaceColor(grid(), R, B)
    expect(res.changed).toBe(3)
    expect(res.data.flat().filter(c => c === R)).toHaveLength(0)
    // 原网格共 3 个空白格,替换前后数量必须不变
    expect(res.data.flat().filter(c => c === null)).toHaveLength(3)
  })

  it('替换成同色 / 源色不存在 → null', () => {
    expect(replaceColor(grid(), R, R).data).toBeNull()
    expect(replaceColor(grid(), '#123456', B).data).toBeNull()
  })

  it('替换目标为 null 表示批量擦除', () => {
    const res = replaceColor(grid(), G, null)
    expect(res.changed).toBe(3)
    expect(res.data.flat().filter(c => c === G)).toHaveLength(0)
  })
})

describe('selectionUtils · 移动(剪切 + 盖印)', () => {
  it('liftSelection 挖出选区内容并把原位置清空', () => {
    const { data, block } = liftSelection(grid(), { x: 0, y: 0, w: 2, h: 2 })
    expect(block).toEqual([[R, R], [R, null]])
    expect(data[0]).toEqual([null, null, G, G])
  })

  it('stampBlock 在目标位置写回,越界部分被裁剪', () => {
    const base = [[null, null, null], [null, null, null]]
    const res = stampBlock(base, [[R, G], [B, R]], 2, 1)
    expect(res.data[1]).toEqual([null, null, R])
    expect(res.changed).toBe(1)
  })

  it('移动 = 挖出 + 盖印,内容不丢', () => {
    const source = grid()
    const { data: lifted, block } = liftSelection(source, { x: 0, y: 0, w: 2, h: 2 })
    const moved = stampBlock(lifted, block, 2, 1).data
    expect(moved[1].slice(2, 4)).toEqual([R, R])
    expect(moved[2].slice(2, 4)).toEqual([R, null])
    expect(moved[0].slice(0, 2)).toEqual([null, null])
  })

  it('原地盖印 → null', () => {
    const data = clone(grid())
    const { block } = liftSelection(data, { x: 2, y: 0, w: 2, h: 1 })
    expect(stampBlock(data, block, 2, 0).data).toBeNull()
  })
})

describe('selectionUtils · 拖拽移动选区(M5.2)', () => {
  it('clampMove 保证整块留在画布内(钳制而非裁剪)', () => {
    const sel = { x: 1, y: 1, w: 2, h: 2 } // 4×3 网格
    // 向右最多到 x=2(右边缘),向上不能出顶
    expect(clampMove(sel, 99, 0, 4, 3)).toEqual({ dx: 1, dy: 0 })
    expect(clampMove(sel, -99, 0, 4, 3)).toEqual({ dx: -1, dy: 0 })
    expect(clampMove(sel, 0, -99, 4, 3)).toEqual({ dx: 0, dy: -1 })
    expect(clampMove(sel, 0, 99, 4, 3)).toEqual({ dx: 0, dy: 0 })
  })

  it('moveSelection 移动内容并返回新选区', () => {
    const res = moveSelection(grid(), { x: 0, y: 0, w: 2, h: 2 }, 2, 1)
    expect(res.selection).toEqual({ x: 2, y: 1, w: 2, h: 2 })
    expect(res.data[1].slice(2, 4)).toEqual([R, R])
    expect(res.data[2].slice(2, 4)).toEqual([R, null])
    // 原位置已清空(未与目标区域重叠的部分)
    expect(res.data[0].slice(0, 2)).toEqual([null, null])
  })

  it('越界移动被钳制,整块内容完整落在画布内', () => {
    const source = grid()
    const res = moveSelection(source, { x: 0, y: 0, w: 2, h: 2 }, 99, 99)
    // 钳制到右下角
    expect(res.selection).toEqual({ x: 2, y: 1, w: 2, h: 2 })
    // 块内容原样落在新位置(而不是被画布边缘裁掉一半)
    expect(res.data[1].slice(2, 4)).toEqual([R, R])
    expect(res.data[2].slice(2, 4)).toEqual([R, null])
  })

  it('偏移为 0 / 空选区 → data 为 null(不压栈)', () => {
    expect(moveSelection(grid(), { x: 0, y: 0, w: 2, h: 2 }, 0, 0).data).toBeNull()
    expect(moveSelection(grid(), null, 1, 1).data).toBeNull()
  })

  it('移动全空区域 → data 为 null,但选区跟随', () => {
    const empty = [[null, null, null, null], [null, null, null, null], [null, null, null, null]]
    const res = moveSelection(empty, { x: 0, y: 0, w: 2, h: 2 }, 1, 0)
    expect(res.data).toBeNull()
    expect(res.selection).toEqual({ x: 1, y: 0, w: 2, h: 2 })
  })

  it('不修改输入矩阵', () => {
    const source = grid()
    const snapshot = clone(source)
    moveSelection(source, { x: 0, y: 0, w: 2, h: 2 }, 1, 1)
    expect(source).toEqual(snapshot)
  })
})

describe('selectionUtils · 复制拖动(A2)', () => {
  it('复制到新位置,原位置内容保持不变', () => {
    // 与 moveSelection 的关键区别:原件必须还在。用户按 Alt 拖动是「再要一份」,
    // 不是「搬到别处」—— 若原件被清空,这个手势就只是换了名字的移动。
    const res = copyMoveSelection(grid(), { x: 0, y: 0, w: 2, h: 2 }, 2, 1)

    expect(res.selection).toEqual({ x: 2, y: 1, w: 2, h: 2 })
    // 副本
    expect(res.data[1].slice(2, 4)).toEqual([R, R])
    expect(res.data[2].slice(2, 4)).toEqual([R, null])
    // 原件仍在原处
    expect(res.data[0].slice(0, 2)).toEqual([R, R])
    expect(res.data[1].slice(0, 2)).toEqual([R, null])
  })

  it('越界同样钳制,副本完整落在画布内', () => {
    const res = copyMoveSelection(grid(), { x: 0, y: 0, w: 2, h: 2 }, 99, 99)
    expect(res.selection).toEqual({ x: 2, y: 1, w: 2, h: 2 })
    expect(res.data[1].slice(2, 4)).toEqual([R, R])
    expect(res.data[2].slice(2, 4)).toEqual([R, null])
    // 原件不动
    expect(res.data[0][0]).toBe(R)
  })

  it('偏移为 0 → data 为 null(不压栈)', () => {
    expect(copyMoveSelection(grid(), { x: 0, y: 0, w: 2, h: 2 }, 0, 0).data).toBeNull()
  })

  it('复制全空区域 → data 为 null,选区仍跟随', () => {
    // 复制一份空白等于什么都没做,不该压一条空历史
    const empty = Array.from({ length: 3 }, () => Array(4).fill(null))
    const res = copyMoveSelection(empty, { x: 0, y: 0, w: 2, h: 2 }, 1, 0)
    expect(res.data).toBeNull()
    expect(res.selection).toEqual({ x: 1, y: 0, w: 2, h: 2 })
  })

  it('副本盖在相同内容上 → data 为 null(没有实际变化)', () => {
    // 整块同色:复制到另一处同色区域,矩阵不变,不该产生一条空历史
    const same = Array.from({ length: 3 }, () => Array(4).fill(R))
    expect(copyMoveSelection(same, { x: 0, y: 0, w: 2, h: 2 }, 2, 0).data).toBeNull()
  })

  it('不修改输入矩阵', () => {
    const source = grid()
    const snapshot = clone(source)
    copyMoveSelection(source, { x: 0, y: 0, w: 2, h: 2 }, 1, 1)
    expect(source).toEqual(snapshot)
  })
})

describe('copySelection / pasteBlock · 选区复制与粘贴', () => {
  it('复制不修改原矩阵,返回块与来源尺寸', () => {
    const source = grid()
    const snapshot = clone(source)
    const res = copySelection(source, { x: 0, y: 0, w: 2, h: 2 })

    expect(res.block).toEqual([[R, R], [R, null]])
    expect(res.w).toBe(2)
    expect(res.h).toBe(2)
    expect(source).toEqual(snapshot) // 复制是只读的
  })

  it('复制空选区 → block 为 null(调用方据此禁用粘贴)', () => {
    const empty = [[null, null], [null, null]]
    expect(copySelection(empty, { x: 0, y: 0, w: 2, h: 2 }).block).toBeNull()
  })

  it('复制 null / 空矩阵 → block 为 null', () => {
    expect(copySelection(grid(), null).block).toBeNull()
    expect(copySelection([], { x: 0, y: 0, w: 1, h: 1 }).block).toBeNull()
  })

  it('粘贴到空位写入内容,并返回跟随的新选区', () => {
    const clip = { w: 2, h: 2, block: [[R, G], [null, B]] }
    const empty = [[null, null, null, null], [null, null, null, null], [null, null, null, null]]
    const res = pasteBlock(empty, clip, 1, 1)

    expect(res.data[1][1]).toBe(R)
    expect(res.data[1][2]).toBe(G)
    expect(res.data[2][1]).toBeNull()
    expect(res.data[2][2]).toBe(B)
    expect(res.selection).toEqual({ x: 1, y: 1, w: 2, h: 2 })
  })

  it('可重复粘贴:同一份剪贴板贴两次得到两份内容', () => {
    const clip = { w: 1, h: 1, block: [[R]] }
    const empty = [[null, null, null], [null, null, null], [null, null, null]]
    const first = pasteBlock(empty, clip, 0, 0)
    const second = pasteBlock(first.data, clip, 2, 2)

    expect(second.data[0][0]).toBe(R)
    expect(second.data[2][2]).toBe(R)
    expect(second.selection).toEqual({ x: 2, y: 2, w: 1, h: 1 })
  })

  it('跨边界粘贴越界裁剪,不报错', () => {
    const clip = { w: 3, h: 3, block: [[R, R, R], [R, R, R], [R, R, R]] }
    const empty = [[null, null], [null, null]]
    const res = pasteBlock(empty, clip, 1, 1)

    // 只有 (1,1) 落在 2×2 网格内
    expect(res.data[1][1]).toBe(R)
    expect(res.changed).toBe(1)
    // 选区按块尺寸给出,但由调用方按网格钳制
    expect(res.selection.w).toBe(3)
  })

  it('越界是裁剪而不是钳制:溢出列整列丢弃,不会挤到最后一列上', () => {
    // 这条用例专门区分 clip 与 clamp —— 全同色块两者结果一样,必须用不同色。
    // 2 列宽的块贴在 3 列网格的最后一列:裁剪 → 只落第 0 列(G);
    // 钳制 → 第 1 列会被夹到同一格并覆盖成 R,最终变成 R。
    const clip = { w: 2, h: 1, block: [[G, R]] }
    const empty = [[null, null, null], [null, null, null]]
    const res = pasteBlock(empty, clip, 2, 0)

    expect(res.data[0][2]).toBe(G)
    expect(res.data[0][0]).toBeNull()
    expect(res.data[0][1]).toBeNull()
    expect(res.changed).toBe(1)
  })

  it('越界是裁剪而不是钳制(行方向同理)', () => {
    const clip = { w: 1, h: 2, block: [[G], [R]] }
    const empty = [[null], [null], [null]]
    const res = pasteBlock(empty, clip, 0, 2)

    expect(res.data[2][0]).toBe(G)
    expect(res.data[1][0]).toBeNull()
    expect(res.changed).toBe(1)
  })

  it('粘贴到内容完全相同的区域 → data 为 null(不压栈),选区仍跟随', () => {
    const clip = { w: 2, h: 2, block: [[R, R], [R, null]] }
    const res = pasteBlock(grid(), clip, 0, 0)

    expect(res.data).toBeNull()
    expect(res.changed).toBe(0)
    expect(res.selection).toEqual({ x: 0, y: 0, w: 2, h: 2 })
  })

  it('空剪贴板粘贴 → data 为 null', () => {
    expect(pasteBlock(grid(), null, 0, 0).data).toBeNull()
    expect(pasteBlock(grid(), { w: 0, h: 0, block: null }, 0, 0).data).toBeNull()
  })

  it('不修改输入矩阵', () => {
    const source = grid()
    const snapshot = clone(source)
    pasteBlock(source, { w: 2, h: 2, block: [[G, G], [G, G]] }, 1, 0)
    expect(source).toEqual(snapshot)
  })
})
