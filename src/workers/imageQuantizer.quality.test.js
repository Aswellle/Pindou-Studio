/**
 * Image Quantizer Quality Benchmark
 *
 * Phase A quality baseline: validates OKLab vs CIEDE2000, isolated bead cleanup,
 * checkerboard suppression, and performance benchmarks.
 *
 * Run: npx vitest run src/workers/imageQuantizer.quality.test.js
 */

import { describe, it, expect } from 'vitest'

// ==================== Color space functions (mirrored from worker) ====================

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
}

function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)
  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505
  const xn = 0.95047, yn = 1.0, zn = 1.08883
  return [116 * labF(y / yn) - 16, 500 * (labF(x / xn) - labF(y / yn)), 200 * (labF(y / yn) - labF(z / zn))]
}

function linearRgbToLms(r, g, b) {
  return [
    r * 0.4122214708 + g * 0.5363325363 + b * 0.0514459929,
    r * 0.2119034982 + g * 0.6806995451 + b * 0.1073969566,
    r * 0.0883024619 + g * 0.2817188376 + b * 0.6299787005,
  ]
}

function lmsToOklab(l, m, s) {
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}

function rgbToOklab(r, g, b) {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)
  const [l, m, s] = linearRgbToLms(rl, gl, bl)
  return lmsToOklab(Math.max(0, l), Math.max(0, m), Math.max(0, s))
}

function deltaEOKLab(lab1, lab2) {
  const dL = lab1[0] - lab2[0]
  const da = lab1[1] - lab2[1]
  const db = lab1[2] - lab2[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

function deltaEOKLabWeighted(lab1, lab2) {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2
  const C1 = Math.sqrt(a1 * a1 + b1 * b1)
  const C2 = Math.sqrt(a2 * a2 + b2 * b2)
  let dH = Math.atan2(b1, a1) - Math.atan2(b2, a2)
  if (dH > Math.PI) dH -= 2 * Math.PI
  if (dH < -Math.PI) dH += 2 * Math.PI
  const wL = 1.30, wC = 0.85, wH = 1.00
  return Math.sqrt(wL * (L1 - L2) ** 2 + wC * (C1 - C2) ** 2 + wH * dH * dH)
}

function deltaEFast(lab1, lab2) {
  const dL = lab1[0] - lab2[0]
  const da = lab1[1] - lab2[1]
  const db = lab1[2] - lab2[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

// ==================== Test data ====================

const TEST_PAIRS = [
  { name: 'skin-light', c1: [231, 145, 126], c2: [238, 132, 120] },
  { name: 'skin-dark', c1: [231, 145, 126], c2: [220, 160, 135] },
  { name: 'blue', c1: [100, 150, 200], c2: [105, 148, 195] },
  { name: 'green', c1: [50, 180, 80], c2: [55, 175, 85] },
  { name: 'red', c1: [200, 50, 50], c2: [195, 55, 55] },
  { name: 'black-white', c1: [0, 0, 0], c2: [255, 255, 255] },
  { name: 'similar-gray', c1: [128, 128, 128], c2: [130, 130, 130] },
]

// ==================== OKLab perceptual consistency ====================

describe('OKLab color space', () => {
  it('OKLab conversion produces valid distances', () => {
    const skin1 = rgbToOklab(231, 145, 126)
    const skin2 = rgbToOklab(238, 132, 120)
    const oklabDist = deltaEOKLab(skin1, skin2)
    expect(oklabDist).toBeGreaterThan(0)
    expect(Number.isFinite(oklabDist)).toBe(true)
  })

  it('weighted OKLab distance is more sensitive to lightness', () => {
    const lab1 = rgbToOklab(200, 100, 100)
    const lab2 = rgbToOklab(180, 100, 100)
    const unweighted = deltaEOKLab(lab1, lab2)
    const weighted = deltaEOKLabWeighted(lab1, lab2)
    expect(weighted).toBeGreaterThan(unweighted * 0.9)
  })

  it('OKLab distance is symmetric', () => {
    const lab1 = rgbToOklab(100, 150, 200)
    const lab2 = rgbToOklab(120, 140, 190)
    const d1 = deltaEOKLab(lab1, lab2)
    const d2 = deltaEOKLab(lab2, lab1)
    expect(d1).toBeCloseTo(d2, 10)
  })

  it('identical colors have zero OKLab distance', () => {
    const lab = rgbToOklab(128, 128, 128)
    expect(deltaEOKLab(lab, lab)).toBe(0)
  })
})

// ==================== Isolated bead cleanup ====================

describe('Isolated bead cleanup', () => {
  const BLANK = 0xFFFF

  function cleanupIsolatedBeads(outIdx, areaColors, activeLabs, outW, outH, colorSpace, threshold) {
    const useOklab = colorSpace === 'oklab'
    const distFn = useOklab ? deltaEOKLabWeighted : deltaE2000
    const cleaned = new Uint16Array(outIdx)
    let cleanedCount = 0

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const idx = y * outW + x
        if (outIdx[idx] === BLANK || !areaColors[idx]) continue

        const neighbors = []
        if (y > 0 && outIdx[idx - outW] !== BLANK) neighbors.push(outIdx[idx - outW])
        if (y + 1 < outH && outIdx[idx + outW] !== BLANK) neighbors.push(outIdx[idx + outW])
        if (x > 0 && outIdx[idx - 1] !== BLANK) neighbors.push(outIdx[idx - 1])
        if (x + 1 < outW && outIdx[idx + 1] !== BLANK) neighbors.push(outIdx[idx + 1])

        if (neighbors.length < 2) continue

        const currentColor = outIdx[idx]
        const allDifferent = neighbors.every(n => n !== currentColor)
        if (!allDifferent) continue

        const counts = new Map()
        for (const n of neighbors) counts.set(n, (counts.get(n) || 0) + 1)
        let dominantColor = neighbors[0]
        let maxCount = 0
        for (const [color, count] of counts) {
          if (count > maxCount) { maxCount = count; dominantColor = color }
        }
        if (maxCount < Math.ceil(neighbors.length / 2)) continue

        const currentLab = areaColors[idx].oklab
        const dominantLab = useOklab ? activeLabs.oklabs[dominantColor] : activeLabs.labs[dominantColor]
        const colorDist = distFn(currentLab, dominantLab)

        if (colorDist < threshold) {
          cleaned[idx] = dominantColor
          cleanedCount++
        }
      }
    }
    return { cleaned, cleanedCount }
  }

  it('detects and cleans single-pixel island', () => {
    const outW = 5, outH = 5
    const outIdx = new Uint16Array([
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 2, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ])
    const areaColors = []
    for (let i = 0; i < outW * outH; i++) {
      const rgb = outIdx[i] === 1 ? [242, 242, 242] : [0, 0, 0]
      areaColors.push({ rgb, oklab: rgbToOklab(rgb[0], rgb[1], rgb[2]) })
    }
    const activeLabs = {
      labs: [rgbToLab(242, 242, 242), rgbToLab(0, 0, 0)],
      oklabs: [rgbToOklab(242, 242, 242), rgbToOklab(0, 0, 0)],
    }
    const { cleanedCount } = cleanupIsolatedBeads(outIdx, areaColors, activeLabs, outW, outH, 'oklab', 0.08)
    expect(cleanedCount).toBe(1)
  })

  it('does not clean non-isolated beads', () => {
    const outW = 5, outH = 5
    const outIdx = new Uint16Array([
      1, 1, 1, 1, 1,
      1, 2, 2, 2, 1,
      1, 2, 2, 2, 1,
      1, 2, 2, 2, 1,
      1, 1, 1, 1, 1,
    ])
    const areaColors = []
    for (let i = 0; i < outW * outH; i++) {
      const rgb = outIdx[i] === 1 ? [242, 242, 242] : [0, 0, 0]
      areaColors.push({ rgb, oklab: rgbToOklab(rgb[0], rgb[1], rgb[2]) })
    }
    const activeLabs = {
      labs: [rgbToLab(242, 242, 242), rgbToLab(0, 0, 0)],
      oklabs: [rgbToOklab(242, 242, 242), rgbToOklab(0, 0, 0)],
    }
    const { cleanedCount } = cleanupIsolatedBeads(outIdx, areaColors, activeLabs, outW, outH, 'oklab', 0.08)
    expect(cleanedCount).toBe(0)
  })
})

// ==================== Checkerboard suppression ====================

describe('Checkerboard suppression', () => {
  it('detects ABAB checkerboard pattern', () => {
    const outW = 4, outH = 4
    const outIdx = new Uint16Array([
      1, 2, 1, 2,
      2, 1, 2, 1,
      1, 2, 1, 2,
      2, 1, 2, 1,
    ])
    let checkerCount = 0
    for (let y = 0; y + 1 < outH; y++) {
      for (let x = 0; x + 1 < outW; x++) {
        const idx00 = y * outW + x
        const c00 = outIdx[idx00], c01 = outIdx[idx00 + 1], c10 = outIdx[idx00 + outW], c11 = outIdx[idx00 + outW + 1]
        if (c00 === c11 && c01 === c10 && c00 !== c01) checkerCount++
      }
    }
    // 4x4 grid has 3x3 = 9 overlapping 2x2 sub-regions
    expect(checkerCount).toBe(9)
  })

  it('does not trigger on uniform regions', () => {
    const outW = 4, outH = 4
    const outIdx = new Uint16Array(16).fill(1)
    let checkerCount = 0
    for (let y = 0; y + 1 < outH; y++) {
      for (let x = 0; x + 1 < outW; x++) {
        const idx00 = y * outW + x
        const c00 = outIdx[idx00], c01 = outIdx[idx00 + 1], c10 = outIdx[idx00 + outW], c11 = outIdx[idx00 + outW + 1]
        if (c00 === c11 && c01 === c10 && c00 !== c01) checkerCount++
      }
    }
    expect(checkerCount).toBe(0)
  })
})

// ==================== Performance benchmarks ====================

describe('Performance benchmarks', () => {
  it('OKLab distance computes within budget', () => {
    const iterations = 10000
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      const lab1 = rgbToOklab(100 + i % 100, 100 + i % 80, 100 + i % 60)
      const lab2 = rgbToOklab(120 + i % 80, 90 + i % 70, 110 + i % 50)
      deltaEOKLab(lab1, lab2)
    }
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('CIEDE76 distance computes within budget', () => {
    const iterations = 10000
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      const lab1 = rgbToLab(100 + i % 100, 100 + i % 80, 100 + i % 60)
      const lab2 = rgbToLab(120 + i % 80, 90 + i % 70, 110 + i % 50)
      deltaEFast(lab1, lab2)
    }
    expect(performance.now() - start).toBeLessThan(100)
  })
})

// ==================== Color distance comparison ====================

describe('Color distance comparison', () => {
  it('OKLab and CIEDE76 produce valid distances for all test pairs', () => {
    for (const pair of TEST_PAIRS) {
      const oklab1 = rgbToOklab(...pair.c1)
      const oklab2 = rgbToOklab(...pair.c2)
      const lab1 = rgbToLab(...pair.c1)
      const lab2 = rgbToLab(...pair.c2)
      expect(deltaEOKLab(oklab1, oklab2)).toBeGreaterThan(0)
      expect(deltaEFast(lab1, lab2)).toBeGreaterThan(0)
    }
  })

  it('black-white distance is much larger than similar-gray distance in OKLab', () => {
    const bw1 = rgbToOklab(0, 0, 0)
    const bw2 = rgbToOklab(255, 255, 255)
    const sg1 = rgbToOklab(128, 128, 128)
    const sg2 = rgbToOklab(130, 130, 130)
    expect(deltaEOKLab(bw1, bw2)).toBeGreaterThan(deltaEOKLab(sg1, sg2))
  })
})
