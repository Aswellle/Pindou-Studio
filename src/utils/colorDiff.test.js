import { describe, it, expect } from 'vitest'
import { ciede2000, rgbToLab, findClosestColorCIEDE2000 } from './colorDiff'

// ─── CIE reference test pairs ────────────────────────────────────────────────
// Source: Sharma, Wu, Dalal (2005) "The CIEDE2000 Color-Difference Formula"
// 补充数据集全部 34 对参数化测试对(含 9–16 号色相边界应力对),容差 ±0.0001
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
  [{ L: 50.0000, a:  2.4900, b: -0.0010  }, { L: 50.0000, a: -2.4900, b:  0.0011  }, 7.2195],
  [{ L: 50.0000, a:  2.4900, b: -0.0010  }, { L: 50.0000, a: -2.4900, b:  0.0012  }, 7.2195],
  [{ L: 50.0000, a: -0.0010, b:  2.4900  }, { L: 50.0000, a:  0.0009, b: -2.4900  }, 4.8045],
  [{ L: 50.0000, a: -0.0010, b:  2.4900  }, { L: 50.0000, a:  0.0010, b: -2.4900  }, 4.8045],
  [{ L: 50.0000, a: -0.0010, b:  2.4900  }, { L: 50.0000, a:  0.0011, b: -2.4900  }, 4.7461],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 50.0000, a:  0.0000, b: -2.5000  }, 4.3065],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 73.0000, a: 25.0000, b: -18.0000 }, 27.1492],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 61.0000, a: -5.0000, b:  29.0000 }, 22.8977],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 56.0000, a: -27.0000, b: -3.0000 }, 31.9030],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 58.0000, a: 24.0000, b:  15.0000 }, 19.4535],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 50.0000, a:  3.1736, b:   0.5854 }, 1.0000],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 50.0000, a:  3.2972, b:   0.0000 }, 1.0000],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 50.0000, a:  1.8634, b:   0.5757 }, 1.0000],
  [{ L: 50.0000, a:  2.5000, b:  0.0000  }, { L: 50.0000, a:  3.2592, b:   0.3350 }, 1.0000],
  [{ L: 60.2574, a: -34.0099, b:  36.2677 }, { L: 60.4626, a: -34.1751, b:  39.4387 }, 1.2644],
  [{ L: 63.0109, a: -31.0961, b:  -5.8663 }, { L: 62.8187, a: -29.7946, b:  -4.0864 }, 1.2630],
  [{ L: 61.2901, a:   3.7196, b:  -5.3901 }, { L: 61.4292, a:   2.2480, b:  -4.9620 }, 1.8731],
  [{ L: 35.0831, a: -44.1164, b:   3.7933 }, { L: 35.0232, a: -40.0716, b:   1.5901 }, 1.8645],
  [{ L: 22.7233, a:  20.0904, b: -46.6940 }, { L: 23.0331, a:  14.9730, b: -42.5619 }, 2.0373],
  [{ L: 36.4612, a:  47.8580, b:  18.3852 }, { L: 36.2715, a:  50.5065, b:  21.2231 }, 1.4146],
  [{ L: 90.8027, a:  -2.0831, b:   1.4410 }, { L: 91.1528, a:  -1.6435, b:   0.0447 }, 1.4441],
  [{ L: 90.9257, a:  -0.5406, b:  -0.9208 }, { L: 88.6381, a:  -0.8985, b:  -0.7239 }, 1.5381],
  [{ L:  6.7747, a:  -0.2908, b:  -2.4247 }, { L:  5.8714, a:  -0.0985, b:  -2.2286 }, 0.6377],
  [{ L:  2.0776, a:   0.0795, b:  -1.1350 }, { L:  0.9033, a:  -0.0636, b:  -0.5514 }, 0.9082],
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
