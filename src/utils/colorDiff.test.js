import { describe, it, expect } from 'vitest'
import { ciede2000, rgbToLab, findClosestColorCIEDE2000 } from './colorDiff'

// ─── CIE reference test pairs ────────────────────────────────────────────────
// Source: Sharma, Wu, Dalal (2005) "The CIEDE2000 Color-Difference Formula"
// Table 1 — 30 parametric test pairs with known ΔE values (tolerance ±0.0001)
const CIE_PAIRS = [
  [{ L: 50.0000, a:  2.6772, b: -79.7751 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 2.0425],
  [{ L: 50.0000, a:  3.1571, b: -77.2803 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 2.8615],
  [{ L: 50.0000, a:  2.8361, b: -74.0200 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 3.4412],
  [{ L: 50.0000, a: -1.3802, b: -84.2814 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 1.0000],
  [{ L: 50.0000, a: -1.1848, b: -84.8006 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 1.0000],
  [{ L: 50.0000, a: -0.9009, b: -85.5211 }, { L: 50.0000, a:  0.0000, b: -82.7485 }, 1.0000],
  [{ L: 50.0000, a:  0.0000, b:   0.0000 }, { L: 50.0000, a: -1.0000, b:  2.0000  }, 2.3669],
  [{ L: 50.0000, a: -1.0000, b:   2.0000 }, { L: 50.0000, a:  0.0000, b:  0.0000  }, 2.3669],
  [{ L: 50.0000, a:  2.4900, b: -0.0010  }, { L: 50.0000, a: -2.4900, b:  0.0009  }, 7.1792],
  [{ L: 50.0000, a:  2.4900, b: -0.0010  }, { L: 50.0000, a: -2.4900, b:  0.0010  }, 7.1792],
]

describe('ciede2000', () => {
  it('returns 0 for identical colors', () => {
    const lab = { L: 50, a: 10, b: -20 }
    expect(ciede2000(lab, lab)).toBeCloseTo(0, 4)
  })

  it('is symmetric', () => {
    const lab1 = { L: 50, a: 25, b: -30 }
    const lab2 = { L: 60, a: -10, b: 20 }
    expect(ciede2000(lab1, lab2)).toBeCloseTo(ciede2000(lab2, lab1), 4)
  })

  it.each(CIE_PAIRS.map(([l1, l2, expected], i) => [i + 1, l1, l2, expected]))(
    'CIE reference pair %i → ΔE ≈ %f',
    (_i, lab1, lab2, expected) => {
      expect(ciede2000(lab1, lab2)).toBeCloseTo(expected, 3)
    }
  )

  it('returns large ΔE for perceptually very different colors', () => {
    const white = { L: 100, a: 0, b: 0 }
    const black = { L: 0, a: 0, b: 0 }
    expect(ciede2000(white, black)).toBeGreaterThan(20)
  })
})

describe('rgbToLab', () => {
  it('converts pure white correctly', () => {
    const lab = rgbToLab(255, 255, 255)
    expect(lab.L).toBeCloseTo(100, 0)
    expect(lab.a).toBeCloseTo(0, 0)
    expect(lab.b).toBeCloseTo(0, 0)
  })

  it('converts pure black correctly', () => {
    const lab = rgbToLab(0, 0, 0)
    expect(lab.L).toBeCloseTo(0, 0)
    expect(lab.a).toBeCloseTo(0, 0)
    expect(lab.b).toBeCloseTo(0, 0)
  })

  it('converts pure red to positive a axis', () => {
    const lab = rgbToLab(255, 0, 0)
    expect(lab.a).toBeGreaterThan(0) // red = positive a
  })

  it('converts pure blue to negative b axis', () => {
    const lab = rgbToLab(0, 0, 255)
    expect(lab.b).toBeLessThan(0) // blue = negative b
  })
})

describe('findClosestColorCIEDE2000', () => {
  const palette = [
    { id: 'W', name: 'White', rgb: { r: 255, g: 255, b: 255 } },
    { id: 'B', name: 'Black', rgb: { r: 0,   g: 0,   b: 0   } },
    { id: 'R', name: 'Red',   rgb: { r: 255, g: 0,   b: 0   } },
  ]

  it('returns exact match when target equals a palette color', () => {
    const result = findClosestColorCIEDE2000({ r: 0, g: 0, b: 0 }, palette)
    expect(result.id).toBe('B')
  })

  it('returns nearest color for an off-white input', () => {
    const result = findClosestColorCIEDE2000({ r: 240, g: 240, b: 240 }, palette)
    expect(result.id).toBe('W')
  })

  it('returns nearest color for a dark red input', () => {
    const result = findClosestColorCIEDE2000({ r: 200, g: 20, b: 20 }, palette)
    expect(result.id).toBe('R')
  })
})
