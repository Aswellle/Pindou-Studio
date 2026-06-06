import { describe, it, expect } from 'vitest'
import { resolveToHex, hexToRgb, rgbToHex, getTextColor } from './colorUtils'

const mockPalette = {
  colors: [
    { id: 'P01', name: 'White',  hex: '#F2F2F2', rgb: { r: 242, g: 242, b: 242 } },
    { id: 'P18', name: 'Orange', hex: '#F0B08A', rgb: { r: 240, g: 176, b: 138 } },
    { id: 'P77', name: 'Black',  hex: '#1A1A1A', rgb: { r: 26,  g: 26,  b: 26  } },
  ]
}

describe('resolveToHex', () => {
  it('passes through a valid hex string unchanged', () => {
    expect(resolveToHex('#F2F2F2', mockPalette)).toBe('#F2F2F2')
  })

  it('resolves a brand ID to its hex value', () => {
    expect(resolveToHex('P18', mockPalette)).toBe('#F0B08A')
  })

  it('resolves first and last palette entries', () => {
    expect(resolveToHex('P01', mockPalette)).toBe('#F2F2F2')
    expect(resolveToHex('P77', mockPalette)).toBe('#1A1A1A')
  })

  it('returns null for null input', () => {
    expect(resolveToHex(null, mockPalette)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(resolveToHex(undefined, mockPalette)).toBeNull()
  })

  it('returns null for an unknown brand ID', () => {
    expect(resolveToHex('P99', mockPalette)).toBeNull()
  })

  it('returns null when palette is null', () => {
    expect(resolveToHex('P01', null)).toBeNull()
  })

  it('handles lowercase hex strings', () => {
    expect(resolveToHex('#f2f2f2', mockPalette)).toBe('#f2f2f2')
  })
})

describe('hexToRgb', () => {
  it('converts white correctly', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('converts black correctly', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('converts mixed color correctly', () => {
    expect(hexToRgb('#F0B08A')).toEqual({ r: 240, g: 176, b: 138 })
  })

  it('works without leading #', () => {
    expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('rgbToHex', () => {
  it('converts white correctly', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff')
  })

  it('converts black correctly', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000')
  })

  it('pads single-digit hex values', () => {
    expect(rgbToHex(1, 2, 3)).toBe('#010203')
  })

  it('round-trips with hexToRgb', () => {
    const original = '#4a90d9'
    const { r, g, b } = hexToRgb(original)
    expect(rgbToHex(r, g, b)).toBe(original)
  })
})

describe('getTextColor', () => {
  it('returns dark text for light backgrounds', () => {
    expect(getTextColor('#ffffff')).toBe('#000000')
  })

  it('returns light text for dark backgrounds', () => {
    expect(getTextColor('#000000')).toBe('#FFFFFF')
  })

  it('returns dark text for yellow (high luminance)', () => {
    expect(getTextColor('#ffff00')).toBe('#000000')
  })
})
