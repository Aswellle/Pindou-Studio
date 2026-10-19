import { describe, it, expect } from 'vitest'
import {
  normalizeHex,
  normalizePaletteInput,
  normalizeColorInput,
  buildPaletteFromBuiltin,
  paletteKeyForBuiltin,
  paletteKeyForUser,
  parsePaletteKey,
  PALETTE_ERRORS,
  MAX_PALETTE_NAME,
  MAX_COLOR_CODE,
} from './personalPalette'

const codes = (res) => res.errors.map((e) => e.code)

describe('personalPalette · normalizeHex', () => {
  it('统一成大写 #RRGGBB', () => {
    expect(normalizeHex('#ff0000')).toBe('#FF0000')
    expect(normalizeHex('ff0000')).toBe('#FF0000')
    expect(normalizeHex('  #AbCdEf  ')).toBe('#ABCDEF')
  })

  it('拒绝缩写、颜色名、空值与非法字符', () => {
    expect(normalizeHex('#f00')).toBeNull()
    expect(normalizeHex('red')).toBeNull()
    expect(normalizeHex('')).toBeNull()
    expect(normalizeHex(null)).toBeNull()
    expect(normalizeHex('#GGGGGG')).toBeNull()
  })
})

describe('personalPalette · normalizePaletteInput', () => {
  it('接受完整输入并裁剪空白', () => {
    const res = normalizePaletteInput({
      name: '  我的色卡  ',
      brandName: ' 自制 ',
      seriesName: ' 春日 ',
      beadSizeMm: 2.6,
      notes: '  备注 ',
    })
    expect(res.ok).toBe(true)
    expect(res.palette).toEqual({
      name: '我的色卡',
      brandName: '自制',
      seriesName: '春日',
      beadSizeMm: 2.6,
      notes: '备注',
    })
  })

  it('缺少名称 / 名称过长被拒绝', () => {
    expect(codes(normalizePaletteInput({ name: '   ' }))).toContain(PALETTE_ERRORS.NAME_REQUIRED)
    expect(codes(normalizePaletteInput({ name: 'x'.repeat(MAX_PALETTE_NAME + 1) })))
      .toContain(PALETTE_ERRORS.NAME_TOO_LONG)
  })

  it('豆子直径:空值合法,负数/超大/非数字拒绝', () => {
    expect(normalizePaletteInput({ name: 'A', beadSizeMm: '' }).palette.beadSizeMm).toBeNull()
    expect(normalizePaletteInput({ name: 'A', beadSizeMm: null }).palette.beadSizeMm).toBeNull()
    expect(codes(normalizePaletteInput({ name: 'A', beadSizeMm: -1 })))
      .toContain(PALETTE_ERRORS.INVALID_BEAD_SIZE)
    expect(codes(normalizePaletteInput({ name: 'A', beadSizeMm: 99 })))
      .toContain(PALETTE_ERRORS.INVALID_BEAD_SIZE)
    expect(codes(normalizePaletteInput({ name: 'A', beadSizeMm: 'abc' })))
      .toContain(PALETTE_ERRORS.INVALID_BEAD_SIZE)
  })

  it('非对象输入返回 notObject', () => {
    expect(codes(normalizePaletteInput(null))).toEqual([PALETTE_ERRORS.NOT_OBJECT])
    expect(codes(normalizePaletteInput([]))).toEqual([PALETTE_ERRORS.NOT_OBJECT])
  })
})

describe('personalPalette · normalizeColorInput', () => {
  const base = { code: 'A1', hex: '#ff0000' }

  it('接受并规范化 HEX', () => {
    const res = normalizeColorInput(base)
    expect(res.ok).toBe(true)
    expect(res.color).toMatchObject({ code: 'A1', hex: '#FF0000', sortOrder: 0 })
  })

  it('非法 HEX 被明确拒绝(不静默改成 #000000)', () => {
    expect(codes(normalizeColorInput({ code: 'A1', hex: '#f00' })))
      .toContain(PALETTE_ERRORS.INVALID_HEX)
    expect(codes(normalizeColorInput({ code: 'A1', hex: 'red' })))
      .toContain(PALETTE_ERRORS.INVALID_HEX)
    expect(codes(normalizeColorInput({ code: 'A1' })))
      .toContain(PALETTE_ERRORS.INVALID_HEX)
  })

  it('色号必填且有长度上限', () => {
    expect(codes(normalizeColorInput({ code: '  ', hex: '#FFFFFF' })))
      .toContain(PALETTE_ERRORS.CODE_REQUIRED)
    expect(codes(normalizeColorInput({ code: 'X'.repeat(MAX_COLOR_CODE + 1), hex: '#FFFFFF' })))
      .toContain(PALETTE_ERRORS.CODE_TOO_LONG)
  })

  it('重复色号被拒绝(大小写不敏感)', () => {
    const existing = [{ id: 'c1', code: 'A1' }]
    expect(codes(normalizeColorInput({ code: 'a1', hex: '#FFFFFF' }, { existingColors: existing })))
      .toContain(PALETTE_ERRORS.DUPLICATE_CODE)
  })

  it('编辑自身时忽略自己的色号', () => {
    const existing = [{ id: 'c1', code: 'A1' }, { id: 'c2', code: 'A2' }]
    const res = normalizeColorInput(
      { code: 'A1', hex: '#FFFFFF' },
      { existingColors: existing, ignoreId: 'c1' },
    )
    expect(res.ok).toBe(true)
  })
})

describe('personalPalette · 内置色卡复制与库存键', () => {
  const builtin = {
    id: 'perler',
    name: 'Perler Beads',
    nameZh: 'Perler 拼豆',
    beadSize: 5,
    colors: [
      { id: 'P01', name: 'White', nameZh: '白色', hex: '#F2F2F2' },
      { id: 'P02', name: 'Creme', nameZh: '奶油白', hex: '#F4E2A8' },
    ],
  }

  it('复制得到独立 ID 与个人所有权,颜色继承内置色值', () => {
    const { palette, colors } = buildPaletteFromBuiltin(builtin, { name: 'Perler 副本' })
    expect(palette.name).toBe('Perler 副本')
    expect(palette.beadSizeMm).toBe(5)
    expect(palette.id).toMatch(/^pal-/)
    expect(colors).toHaveLength(2)
    expect(colors[0]).toMatchObject({ paletteId: palette.id, code: 'P01', hex: '#F2F2F2' })
    expect(colors[1].sortOrder).toBe(1)
    // 每个颜色有自己的稳定 ID
    expect(colors[0].id).not.toBe(colors[1].id)
  })

  it('内置色卡与个人色卡的库存键互不混淆', () => {
    expect(paletteKeyForBuiltin('perler', 'P01')).toBe('builtin:perler:P01')
    expect(paletteKeyForUser('pal-1', 'col-1')).toBe('user:pal-1:col-1')
    expect(parsePaletteKey('builtin:perler:P01')).toEqual({ kind: 'builtin', paletteId: 'perler', colorId: 'P01' })
    expect(parsePaletteKey('user:pal-1:col-1')).toEqual({ kind: 'user', paletteId: 'pal-1', colorId: 'col-1' })
    expect(parsePaletteKey('bogus')).toBeNull()
    expect(parsePaletteKey('builtin:perler')).toBeNull()
  })
})
