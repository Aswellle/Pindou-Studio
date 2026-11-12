import { describe, it, expect } from 'vitest'
import { toggleCellInSelection } from './pickSelection'

const maskSel = (cols, rows, cells) => {
  const mask = new Uint8Array(cols * rows)
  for (const [x, y] of cells) mask[y * cols + x] = 1
  const xs = cells.map(([x]) => x)
  const ys = cells.map(([, y]) => y)
  return {
    kind: 'lasso',
    mask,
    cols,
    rows,
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs) + 1,
      h: Math.max(...ys) - Math.min(...ys) + 1,
    },
  }
}

describe('toggleCellInSelection', () => {
  it('空选区上首点:生成单格掩码选区', () => {
    const sel = toggleCellInSelection(null, 2, 3, 5, 5)
    expect(sel.kind).toBe('lasso')
    expect(sel.cols).toBe(5)
    expect(sel.rows).toBe(5)
    expect(sel.mask[3 * 5 + 2]).toBe(1)
    expect(sel.bounds).toEqual({ x: 2, y: 3, w: 1, h: 1 })
  })

  it('再次 toggle 同一格:选区清空返回 null', () => {
    const first = toggleCellInSelection(null, 1, 1, 4, 4)
    expect(toggleCellInSelection(first, 1, 1, 4, 4)).toBeNull()
  })

  it('多个格子:bounds 取并集,移出中间格后 bounds 收缩', () => {
    let sel = toggleCellInSelection(null, 0, 0, 4, 4)
    sel = toggleCellInSelection(sel, 2, 0, 4, 4)
    sel = toggleCellInSelection(sel, 1, 3, 4, 4)
    expect(sel.bounds).toEqual({ x: 0, y: 0, w: 3, h: 4 })
    expect(sel.mask[0]).toBe(1)
    expect(sel.mask[2]).toBe(1)
    expect(sel.mask[3 * 4 + 1]).toBe(1)

    // 移出 (2,0) 后 x 方向仍到 2?不 —— 剩下 (0,0) 与 (1,3),bounds 收缩为 w=2
    sel = toggleCellInSelection(sel, 2, 0, 4, 4)
    expect(sel.bounds).toEqual({ x: 0, y: 0, w: 2, h: 4 })
    expect(sel.mask[2]).toBe(0)
  })

  it('既有套索选区可直接继续 toggle(形状复用)', () => {
    const lasso = maskSel(4, 4, [[0, 0], [1, 1]])
    const sel = toggleCellInSelection(lasso, 2, 2, 4, 4)
    expect(sel.mask[2 * 4 + 2]).toBe(1)
    expect(sel.mask[0]).toBe(1)
    expect(sel.bounds).toEqual({ x: 0, y: 0, w: 3, h: 3 })
  })

  it('矩形选区上首点:替换为新的掩码选区,不叠加矩形范围', () => {
    const rect = { x: 0, y: 0, w: 3, h: 3 }
    const sel = toggleCellInSelection(rect, 2, 2, 5, 5)
    expect(sel.kind).toBe('lasso')
    expect(sel.bounds).toEqual({ x: 2, y: 2, w: 1, h: 1 })
    // 矩形范围内其他格子未被选中
    expect(sel.mask[0]).toBe(0)
  })

  it('越界坐标保持原选区不变,非法坐标返回 null', () => {
    const sel = maskSel(4, 4, [[1, 1]])
    expect(toggleCellInSelection(sel, 4, 0, 4, 4)).toBe(sel)
    expect(toggleCellInSelection(null, -1, 0, 4, 4)).toBeNull()
    expect(toggleCellInSelection(null, 0.5, 0, 4, 4)).toBeNull()
  })

  it('不改入参(纯函数)', () => {
    const sel = maskSel(4, 4, [[1, 1]])
    const snapshot = Uint8Array.from(sel.mask)
    toggleCellInSelection(sel, 2, 2, 4, 4)
    expect(Uint8Array.from(sel.mask)).toEqual(snapshot)
    expect(sel.bounds).toEqual({ x: 1, y: 1, w: 1, h: 1 })
  })
})
