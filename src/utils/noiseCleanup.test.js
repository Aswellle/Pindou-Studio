import { describe, it, expect } from 'vitest'
import { removeNoiseBeads } from './noiseCleanup'

const R = '#FF0000'
const B = '#0000FF'
const G = '#00FF00'

/** 3×3 矩阵快写:'.'=空,其他字符查 map */
function grid(rows, map = { R, B, G }) {
  return rows.map(row => [...row].map(ch => (ch === '.' ? null : map[ch])))
}

describe('removeNoiseBeads · 孤立点', () => {
  it('八邻全空的豆被清除', () => {
    const data = grid([
      '...',
      '.R.',
      '...',
    ])
    const { data: next, changed } = removeNoiseBeads(data)
    expect(changed).toBe(1)
    expect(next[1][1]).toBeNull()
  })

  it('对角线尾巴保留:四邻空但八邻有珠不是孤立点', () => {
    // (0,0) 的四邻全空,但对角 (1,1) 有珠 —— 斜线的过渡像素不能误删
    const data = grid([
      'R.',
      '.R',
    ])
    const { changed } = removeNoiseBeads(data)
    expect(changed).toBe(0)
    expect(data[0][0]).toBe(R)
  })

  it('有同色四邻的珠不受影响', () => {
    const data = grid([
      '.R.',
      'RRR',
      '.R.',
    ])
    const { changed } = removeNoiseBeads(data)
    expect(changed).toBe(0)
  })
})

describe('removeNoiseBeads · 杂色点', () => {
  it('四邻全有珠且无同色 → 改为邻居主色', () => {
    // 中心一颗蓝豆被 3 红 1 绿包围 → 改为红
    const data = grid([
      '.R.',
      'RBR',
      '.G.',
    ])
    const { data: next, changed } = removeNoiseBeads(data)
    expect(changed).toBe(1)
    expect(next[1][1]).toBe(R)
  })

  it('四邻有空格的边缘珠不动(可能是图案真实的镂空)', () => {
    const data = grid([
      'B..',
      'BR.',
      'B..',
    ])
    const { changed } = removeNoiseBeads(data)
    expect(changed).toBe(0)
    expect(data[1][1]).toBe(R)
  })
})

describe('removeNoiseBeads · 作用范围', () => {
  it('矩形选区:只清理选区内,选区外的孤立点保留', () => {
    const data = grid([
      'R..',
      '...',
      '..R',
    ])
    const { data: next, changed } = removeNoiseBeads(data, { area: { x: 0, y: 0, w: 1, h: 1 } })
    expect(changed).toBe(1)
    expect(next[0][0]).toBeNull()
    expect(next[2][2]).toBe(R)
  })

  it('掩码选区(点选/套索):按格判定', () => {
    const data = grid([
      'R.R',
      '...',
      '...',
    ])
    const mask = new Uint8Array(9)
    mask[0] = 1 // 只选 (0,0),不选 (2,0)
    const area = { kind: 'lasso', mask, cols: 3, rows: 3, bounds: { x: 0, y: 0, w: 3, h: 1 } }
    const { data: next, changed } = removeNoiseBeads(data, { area })
    expect(changed).toBe(1)
    expect(next[0][0]).toBeNull()
    expect(next[0][2]).toBe(R)
  })

  it('掩码尺寸与矩阵不符时退化为全图(防御)', () => {
    const data = grid(['R', '.'])
    const mask = new Uint8Array(4) // 2×2,与 1×2 不符
    const area = { kind: 'lasso', mask, cols: 2, rows: 2, bounds: { x: 0, y: 0, w: 2, h: 2 } }
    const { changed } = removeNoiseBeads(data, { area })
    expect(changed).toBe(1) // 全图清理:唯一的孤立豆被清除
  })
})

describe('removeNoiseBeads · 语义', () => {
  it('无变化时 data 为 null(调用方不压撤销栈)', () => {
    const data = grid(['..', 'RR'])
    expect(removeNoiseBeads(data)).toEqual({ data: null, changed: 0 })
  })

  it('一次生效不级联:清掉 A 不会连锁清掉 B', () => {
    // 两颗相邻的孤立豆:本轮各看原矩阵,八邻彼此有珠 → 都保留
    const data = grid([
      'RR.',
      '...',
      '...',
    ])
    const { changed } = removeNoiseBeads(data)
    expect(changed).toBe(0)
  })

  it('入参不变(纯函数)', () => {
    const data = grid([
      '.R.',
      'RBR',
      '.G.',
    ])
    const snapshot = data.map(r => [...r])
    removeNoiseBeads(data)
    expect(data).toEqual(snapshot)
  })

  it('空矩阵与坏输入安全返回', () => {
    expect(removeNoiseBeads([])).toEqual({ data: null, changed: 0 })
    expect(removeNoiseBeads([[]])).toEqual({ data: null, changed: 0 })
    expect(removeNoiseBeads(null)).toEqual({ data: null, changed: 0 })
  })
})
