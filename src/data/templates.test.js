import { describe, test, expect } from 'vitest'
import {
  extractPatternColors,
  normalizeCustomTemplate,
  convertTemplateToBrand,
  patternDimensions,
  templateDimensions,
  TEMPLATES,
} from './templates'

describe('extractPatternColors', () => {
  test('extracts unique colors in order of first appearance', () => {
    const pattern = [
      [null, '#FF0000', '#00FF00'],
      ['#FF0000', null, '#0000FF'],
      ['#00FF00', '#FF0000', null],
    ]
    expect(extractPatternColors(pattern)).toEqual(['#FF0000', '#00FF00', '#0000FF'])
  })

  test('returns empty array for empty or null pattern', () => {
    expect(extractPatternColors(null)).toEqual([])
    expect(extractPatternColors([])).toEqual([])
    expect(extractPatternColors([[null, null]])).toEqual([])
  })
})

describe('normalizeCustomTemplate — unified protocol', () => {
  test('accepts a valid template and auto-derives size and colors', () => {
    const res = normalizeCustomTemplate({
      name: 'Duck',
      nameZh: '小鸭',
      category: 'animal',
      difficulty: 'medium',
      pattern: [
        [null, '#ffd700', '#FFD700'],
        ['#FF8C00', null, '#FFD700'],
      ],
    })
    expect(res.ok).toBe(true)
    const tpl = res.template
    expect(tpl.name).toBe('Duck')
    expect(tpl.nameZh).toBe('小鸭')
    expect(tpl.category).toBe('animal')
    expect(tpl.difficulty).toBe('medium')
    expect(tpl.size).toBe(3) // max(rows=2, cols=3)
    expect(tpl.colors).toEqual(['#FFD700', '#FF8C00']) // 自动识别 + 归一化为大写
    expect(tpl.pattern[0][1]).toBe('#FFD700')
  })

  test('defaults difficulty to easy for missing or invalid values', () => {
    const res = normalizeCustomTemplate({
      name: 'X',
      category: 'icon',
      pattern: [['#FF0000']],
    })
    expect(res.template.difficulty).toBe('easy')

    const res2 = normalizeCustomTemplate({
      name: 'X',
      category: 'icon',
      difficulty: 'nightmare',
      pattern: [['#FF0000']],
    })
    expect(res2.template.difficulty).toBe('easy')
  })

  test('rejects non-object input', () => {
    expect(normalizeCustomTemplate('nope').errors[0].code).toBe('notObject')
    expect(normalizeCustomTemplate(null).errors[0].code).toBe('notObject')
    expect(normalizeCustomTemplate([1, 2]).errors[0].code).toBe('notObject')
  })

  test('reports missing name and category', () => {
    const res = normalizeCustomTemplate({ pattern: [['#FF0000']] })
    const codes = res.errors.map(e => e.code)
    expect(codes).toContain('nameRequired')
    expect(codes).toContain('categoryRequired')
  })

  test('rejects missing/empty pattern', () => {
    const base = { name: 'X', category: 'icon' }
    expect(normalizeCustomTemplate({ ...base, pattern: null }).errors[0].code).toBe('patternRequired')
    expect(normalizeCustomTemplate({ ...base, pattern: [] }).errors[0].code).toBe('patternRequired')
  })

  test('rejects rows that are not arrays or empty', () => {
    const base = { name: 'X', category: 'icon' }
    const res1 = normalizeCustomTemplate({ ...base, pattern: [['#FF0000'], 'oops'] })
    expect(res1.errors.some(e => e.code === 'rowNotArray')).toBe(true)
    const res2 = normalizeCustomTemplate({ ...base, pattern: [['#FF0000'], []] })
    expect(res2.errors.some(e => e.code === 'emptyRow')).toBe(true)
  })

  test('rejects invalid color values with row/col detail', () => {
    const res = normalizeCustomTemplate({
      name: 'X',
      category: 'icon',
      pattern: [['#FF0000'], ['red', '#00FF00']],
    })
    const err = res.errors.find(e => e.code === 'invalidColor')
    expect(err).toBeTruthy()
    expect(err.detail).toContain('行 2')
  })

  test('rejects an all-empty pattern', () => {
    const res = normalizeCustomTemplate({
      name: 'X',
      category: 'icon',
      pattern: [[null, null], [null, null]],
    })
    expect(res.errors.some(e => e.code === 'emptyPattern')).toBe(true)
  })

  test('normalizes hex to uppercase and accepts empty cells as null', () => {
    const res = normalizeCustomTemplate({
      name: 'X',
      category: 'icon',
      pattern: [['#ff0000', '', null, undefined]],
    })
    expect(res.ok).toBe(true)
    expect(res.template.pattern[0]).toEqual(['#FF0000', null, null, null])
    expect(res.template.colors).toEqual(['#FF0000'])
  })

  test('supports rectangular patterns (size = max dimension)', () => {
    const rows = 4
    const cols = 10
    const pattern = Array(rows).fill(null).map(() => Array(cols).fill('#FF0000'))
    const res = normalizeCustomTemplate({ name: 'Rect', category: 'food', pattern })
    expect(res.template.size).toBe(10)
    expect(res.template.gridWidth).toBe(10)
    expect(res.template.gridHeight).toBe(4)
  })

  test('M2: 矩形模板输出真实 gridWidth/gridHeight,不再丢宽高', () => {
    const res = normalizeCustomTemplate({
      name: 'Wide',
      category: 'icon',
      pattern: [
        ['#FF0000', '#FF0000', '#FF0000', '#FF0000'],
        [null, '#00FF00', '#00FF00', null],
      ],
    })
    expect(res.ok).toBe(true)
    expect(res.template.gridWidth).toBe(4)
    expect(res.template.gridHeight).toBe(2)
    expect(res.template.size).toBe(4) // 兼容字段仍是 max
  })

  test('M2: 不等长行补齐为 null,而不是拒绝或留下参差行', () => {
    const res = normalizeCustomTemplate({
      name: 'Ragged',
      category: 'icon',
      pattern: [
        ['#FF0000', '#FF0000', '#FF0000'],
        ['#00FF00'],
      ],
    })
    expect(res.ok).toBe(true)
    expect(res.template.gridWidth).toBe(3)
    expect(res.template.gridHeight).toBe(2)
    expect(res.template.pattern[1]).toEqual(['#00FF00', null, null])
    // 每行等长,可直接交给 canvasData
    expect(new Set(res.template.pattern.map(r => r.length))).toEqual(new Set([3]))
  })

  test('carries paletteId through (defaults to perler when absent)', () => {
    const withBrand = normalizeCustomTemplate({ name: 'B', category: 'icon', paletteId: 'mard', pattern: [['#FF0000']] })
    expect(withBrand.template.paletteId).toBe('mard')
    const noBrand = normalizeCustomTemplate({ name: 'N', category: 'icon', pattern: [['#FF0000']] })
    expect(noBrand.template.paletteId).toBe('perler')
  })
})

describe('patternDimensions / templateDimensions', () => {
  test('由 pattern 推导宽高(矩形取最大行长)', () => {
    expect(patternDimensions([[null, null, null], [null, null]])).toEqual({ width: 3, height: 2 })
    expect(patternDimensions([])).toEqual({ width: 0, height: 0 })
    expect(patternDimensions(null)).toEqual({ width: 0, height: 0 })
  })

  test('优先使用显式 gridWidth/gridHeight', () => {
    expect(templateDimensions({ pattern: [['#000000']], gridWidth: 5, gridHeight: 3 }))
      .toEqual({ width: 5, height: 3 })
  })

  test('内置模板无显式宽高时由 pattern 推导(全部 29×29)', () => {
    for (const tpl of TEMPLATES) {
      const { width, height } = templateDimensions(tpl)
      expect(width).toBe(29)
      expect(height).toBe(29)
    }
  })

  test('缺少 pattern 时回退 0,不抛异常', () => {
    expect(templateDimensions(null)).toEqual({ width: 0, height: 0 })
    expect(templateDimensions({})).toEqual({ width: 0, height: 0 })
  })
})

describe('convertTemplateToBrand', () => {
  test('remaps every color to the target brand palette via nearest match', () => {
    const pattern = [
      ['#FF0000', null],
      ['#FF0000', '#00FF00'],
    ]
    const converted = convertTemplateToBrand(pattern, 'perler')
    // 红/绿都应在 Perler 色卡内找到最近的官方色号 hex
    expect(converted[0][0]).toMatch(/^#[0-9A-F]{6}$/)
    expect(converted[0][1]).toBeNull()
    expect(converted[1][0]).toBe(converted[0][0]) // 同色共享缓存,转换一致
    expect(converted[1][1]).toMatch(/^#[0-9A-F]{6}$/)
  })

  test('keeps colors already in the target brand unchanged', () => {
    const pattern = [['#F2F2F2']] // Perler P01 White
    const converted = convertTemplateToBrand(pattern, 'perler')
    expect(converted[0][0]).toBe('#F2F2F2')
  })
})
