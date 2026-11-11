import { describe, it, expect } from 'vitest'
import {
  PATTERN_IMAGE_MAX,
  patternImageMetrics,
  patternImagePath,
  patternImageAlt,
  patternImageFor,
} from './patternImage'

const filled = (w, h, color = '#3366CC') =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => color))

describe('patternImageMetrics', () => {
  it('按内容包围盒裁掉四周空白(与缩略图同一构图)', () => {
    const pattern = [
      [null, null, null],
      [null, '#a', '#b'],
      [null, '#c', null],
    ]
    const m = patternImageMetrics(pattern)
    expect(m.box).toEqual({ x0: 1, y0: 1, width: 2, height: 2 })
    expect(m).toMatchObject({ cell: 360, width: 720, height: 720 })
  })

  it('长边不小于目标尺寸,且每格是整数像素', () => {
    const m = patternImageMetrics(filled(29, 29))
    expect(m.cell).toBe(Math.ceil(PATTERN_IMAGE_MAX / 29))
    expect(m.width).toBe(m.cell * 29)
    expect(m.height).toBe(m.cell * 29)
    expect(m.width).toBeGreaterThanOrEqual(PATTERN_IMAGE_MAX)
    // 整数格宽:非整数会让 PNG 里出现 1px 接缝
    expect(Number.isInteger(m.cell)).toBe(true)
  })

  it('矩形图案保持宽高比', () => {
    const m = patternImageMetrics(filled(10, 4))
    expect(m.width).toBe(m.cell * 10)
    expect(m.height).toBe(m.cell * 4)
  })

  it('单格图案长边等于目标尺寸', () => {
    const m = patternImageMetrics([['#fff']])
    expect(m).toMatchObject({ cell: PATTERN_IMAGE_MAX, width: PATTERN_IMAGE_MAX, height: PATTERN_IMAGE_MAX })
  })

  it('空图案返回 null(调用方退回 canvas)', () => {
    expect(patternImageMetrics(null)).toBe(null)
    expect(patternImageMetrics([])).toBe(null)
    expect(patternImageMetrics([[null, null]])).toBe(null)
  })
})

describe('patternImagePath', () => {
  it('目录 + id + 指纹,扩展名 png', () => {
    expect(patternImagePath('abc', 'h123456')).toBe('/pattern-img/abc-h123456.png')
  })

  it('id 里的特殊字符被编码(不产生额外路径段)', () => {
    expect(patternImagePath('a/b', 'h')).toBe('/pattern-img/a%2Fb-h.png')
  })
})

describe('patternImageAlt', () => {
  it('描述图案名、尺寸与豆子数,而不是泛称', () => {
    expect(patternImageAlt('小鸭', 29, 29, 539)).toBe('小鸭拼豆图纸 · 29×29 · 共 539 颗豆子')
  })

  it('缺尺寸/颗数时省略对应片段', () => {
    expect(patternImageAlt('小猫')).toBe('小猫拼豆图纸')
  })
})

describe('patternImageFor', () => {
  const template = {
    id: 'tpl-1',
    name: 'Duck',
    nameZh: '小鸭',
    paletteId: 'perler',
    pattern: [['#FFD700', '#FFD700'], ['#000000', null]],
  }

  it('输出 src / 尺寸 / 指纹', () => {
    const out = patternImageFor(template)
    expect(out.src).toMatch(/^\/pattern-img\/tpl-1-[a-z0-9]+\.png$/)
    expect(out.width).toBeGreaterThan(0)
    expect(out.height).toBeGreaterThan(0)
  })

  it('同一内容路径稳定(构建期与运行期能对上)', () => {
    const a = patternImageFor(template)
    const b = patternImageFor({ ...template })
    expect(a.src).toBe(b.src)
  })

  it('图案改动后路径变化(缓存不会停在旧图)', () => {
    const a = patternImageFor(template)
    const b = patternImageFor({ ...template, pattern: [['#FFFFFF']] })
    expect(a.src).not.toBe(b.src)
  })

  it('没有图案或 id 时返回 null', () => {
    expect(patternImageFor(null)).toBe(null)
    expect(patternImageFor({ ...template, pattern: [] })).toBe(null)
    expect(patternImageFor({ ...template, id: null })).toBe(null)
  })
})
