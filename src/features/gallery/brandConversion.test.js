import { describe, it, expect } from 'vitest'
import {
  resolveTemplateBrand,
  isBrandOverridden,
  convertedPattern,
  templateLoadOptions,
  templateExportArgs,
} from './brandConversion'

const square = { id: 1, paletteId: 'mard', size: 2, pattern: [['#FF0000', null], [null, '#00FF00']] }
const rect = { id: 2, size: 4, pattern: [['#FF0000', '#FF0000', '#FF0000', '#FF0000'], [null, '#FF0000', '#FF0000', null]] }

describe('resolveTemplateBrand / isBrandOverridden', () => {
  it('覆盖优先,其次模板品牌,最后 perler', () => {
    expect(resolveTemplateBrand(square, 'hama')).toBe('hama')
    expect(resolveTemplateBrand(square, null)).toBe('mard')
    expect(resolveTemplateBrand({ id: 3 }, null)).toBe('perler')
  })

  it('覆盖品牌与原始品牌相同不算覆盖', () => {
    expect(isBrandOverridden(square, 'mard')).toBe(false)
    expect(isBrandOverridden(square, 'hama')).toBe(true)
    expect(isBrandOverridden(square, null)).toBe(false)
  })
})

describe('convertedPattern', () => {
  it('无覆盖时返回原 pattern(同一引用,不复制)', () => {
    expect(convertedPattern(square, null)).toBe(square.pattern)
  })

  it('覆盖时返回重映射后的新矩阵,源模板不被修改', () => {
    const before = JSON.stringify(square.pattern)
    const out = convertedPattern(square, 'hama')
    expect(out).not.toBe(square.pattern)
    expect(out).toHaveLength(2)
    expect(JSON.stringify(square.pattern)).toBe(before)
  })

  it('空模板返回空数组', () => {
    expect(convertedPattern(null, 'hama')).toEqual([])
  })
})

describe('templateLoadOptions', () => {
  it('方形模板不传 gridWidth/gridHeight,但有品牌时带 palette', () => {
    const { options, width, height } = templateLoadOptions(square, null)
    expect(options).toEqual({ palette: 'mard' })
    expect(width).toBe(2)
    expect(height).toBe(2)
  })

  it('矩形模板附带真实宽高', () => {
    const { options, width, height } = templateLoadOptions(rect, 'perler')
    expect(options).toEqual({ palette: 'perler', gridWidth: 4, gridHeight: 2 })
    expect(width).toBe(4)
    expect(height).toBe(2)
  })

  it('无品牌的内置模板不打扰当前色卡(不产生 palette 键)', () => {
    const plain = { id: 9, size: 1, pattern: [[null]] }
    const { options } = templateLoadOptions(plain, null)
    // 缺省品牌 perler 仍会写入 palette —— 与旧行为一致:paletteId 缺省即 perler
    expect(options.palette).toBe('perler')
    expect(options.gridWidth).toBeUndefined()
  })
})

describe('templateExportArgs', () => {
  it('导出始终带真实宽高,size 为 max', () => {
    const args = templateExportArgs(rect, null)
    expect(args.size).toBe(4)
    expect(args.width).toBe(4)
    expect(args.height).toBe(2)
    expect(args.brand).toBe('perler')
  })

  it('导出使用覆盖后的图案', () => {
    const args = templateExportArgs(square, 'hama')
    expect(args.brand).toBe('hama')
    expect(args.pattern).not.toBe(square.pattern)
  })
})
