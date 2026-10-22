import { describe, it, expect } from 'vitest'
import { buildMappingPreview, acceptedEntries } from './mappingPreview'

/**
 * 匹配预览隔离(重构规格 §6.6):预览只读、只对被接受的映射生效,
 * 真实画布必须原样不动。
 */

const CANVAS = [
  ['#FF0000', null, '#0000FF'],
  ['#FF0000', '#00FF00', null],
]

const ITEMS = [
  { sourceHex: '#FF0000', targetColor: { id: 'c1', code: 'R1', hex: '#FF0001' } },
  { sourceHex: '#0000FF', targetColor: { id: 'c2', code: 'B1', hex: '#0000FE' } },
  { sourceHex: '#00FF00', targetColor: { id: 'c3', code: 'G1', hex: '#00FF00' } },
]

describe('acceptedEntries', () => {
  it('只收已接受且有目标色的项', () => {
    expect(acceptedEntries(ITEMS, { '#FF0000': true })).toEqual([
      { from: '#FF0000', to: '#FF0001' },
    ])
  })

  it('没有接受任何项时为空', () => {
    expect(acceptedEntries(ITEMS, {})).toEqual([])
  })

  it('目标色缺失的项被跳过(无可用色)', () => {
    const items = [{ sourceHex: '#123456', targetColor: null }]
    expect(acceptedEntries(items, { '#123456': true })).toEqual([])
  })
})

describe('buildMappingPreview', () => {
  it('只替换已接受的颜色', () => {
    const preview = buildMappingPreview(CANVAS, ITEMS, { '#FF0000': true })
    expect(preview.pattern[0][0]).toBe('#FF0001')
    expect(preview.pattern[1][0]).toBe('#FF0001')
    // 蓝色没接受,保持原值
    expect(preview.pattern[0][2]).toBe('#0000FF')
    expect(preview.changedCells).toBe(2)
    expect(preview.selectedColors).toBe(1)
    expect(preview.changedColors).toBe(1)
  })

  it('空白格不被填充', () => {
    const preview = buildMappingPreview(CANVAS, ITEMS, { '#FF0000': true, '#0000FF': true })
    expect(preview.pattern.flat().filter((c) => c === null)).toHaveLength(2)
  })

  it('目标色与源色相同 → 计入已选但不计入改动', () => {
    const preview = buildMappingPreview(CANVAS, ITEMS, { '#00FF00': true })
    expect(preview.selectedColors).toBe(1)
    expect(preview.changedColors).toBe(0)
    expect(preview.changedCells).toBe(0)
  })

  it('不修改传入的真实画布', () => {
    const snapshot = JSON.stringify(CANVAS)
    buildMappingPreview(CANVAS, ITEMS, { '#FF0000': true, '#0000FF': true })
    expect(JSON.stringify(CANVAS)).toBe(snapshot)
  })

  it('没有接受项时返回原图引用且改动为 0', () => {
    const preview = buildMappingPreview(CANVAS, ITEMS, {})
    expect(preview.changedCells).toBe(0)
    expect(preview.selectedColors).toBe(0)
    expect(preview.pattern).toBe(CANVAS)
  })

  it('同轮 A→B 与 B→C 不发生链式吞并', () => {
    const canvas = [['#111111', '#222222']]
    const items = [
      { sourceHex: '#111111', targetColor: { id: 'a', code: 'A', hex: '#222222' } },
      { sourceHex: '#222222', targetColor: { id: 'b', code: 'B', hex: '#333333' } },
    ]
    const preview = buildMappingPreview(canvas, items, { '#111111': true, '#222222': true })
    expect(preview.pattern[0]).toEqual(['#222222', '#333333'])
  })
})
