import { describe, it, expect } from 'vitest'
import { removeCanvasColor, reduceCanvasColors, cropCanvas, cropCanvasToContent } from './editorCleanup'

const R = '#E53935'
const R2 = '#E53A36'
const G = '#43A047'
const B = '#1E88E5'

function grid() {
  return [
    [R, R, R, null],
    [R, G, R2, null],
    [G, G, B, null],
    [null, B, null, null],
  ]
}

function beadCount(data) {
  return data.flat().filter(Boolean).length
}

describe('removeCanvasColor', () => {
  it('删除一种颜色:该色清成空白,其余颜色原样保留', () => {
    const result = removeCanvasColor(grid(), R)
    expect(result.removed).toBe(4)
    expect(result.data.flat().filter(c => c === R)).toHaveLength(0)
    expect(result.data[1][1]).toBe(G)
    expect(result.data[2][2]).toBe(B)
  })

  it('大小写不敏感;没有命中返回 null', () => {
    expect(removeCanvasColor(grid(), R.toLowerCase()).removed).toBe(4)
    expect(removeCanvasColor(grid(), '#000000')).toBeNull()
    expect(removeCanvasColor(grid(), 'not-a-color')).toBeNull()
  })
})

describe('reduceCanvasColors', () => {
  it('保留用量最多的颜色,其余按最近色归并,颗数不变', () => {
    const before = beadCount(grid())
    const result = reduceCanvasColors(grid(), { keepCount: 2 })
    expect(result.before).toBe(4)
    expect(result.after).toBe(2)
    expect(beadCount(result.data)).toBe(before)

    const used = new Set(result.data.flat().filter(Boolean))
    expect([...used].every(hex => hex === R || hex === G)).toBe(true)
    // 相近的红色归并到主红,而不是跨色系乱并
    expect(result.mapping.get(R2.toLowerCase())).toBe(R)
  })

  it('颜色数已不超过目标时不做任何事', () => {
    expect(reduceCanvasColors(grid(), { keepCount: 4 })).toBeNull()
    expect(reduceCanvasColors(grid(), { keepCount: 10 })).toBeNull()
    expect(reduceCanvasColors(grid(), {})).toBeNull()
  })
})

describe('cropCanvas / cropCanvasToContent', () => {
  it('裁到内容边界并返回偏移', () => {
    const result = cropCanvasToContent(grid())
    expect(result.offsetX).toBe(0)
    expect(result.offsetY).toBe(0)
    // 末行 (1,3) 还有一颗蓝珠,所以高度是 4 而不是 3
    expect(result.width).toBe(3)
    expect(result.height).toBe(4)
    expect(result.data).toHaveLength(4)
  })

  it('padding 保留额外空白并在画布内钳制', () => {
    const result = cropCanvasToContent(grid(), { padding: 1 })
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
  })

  it('按外接框裁切时越界自动钳制', () => {
    const result = cropCanvas(grid(), { x: 2, y: 2, w: 99, h: 99 })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.data).toEqual([
      [B, null],
      [null, null],
    ])
  })

  it('全空画布没有可裁内容', () => {
    const empty = Array.from({ length: 3 }, () => Array(3).fill(null))
    expect(cropCanvasToContent(empty)).toBeNull()
    // 显式外接框允许裁出空白区域(用户自己圈的范围),只做越界钳制
    expect(cropCanvas(empty, { x: 0, y: 0, w: 1, h: 1 }).width).toBe(1)
  })
})
