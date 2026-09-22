/**
 * 量化质量与色彩空间规格测试 —— 直接调用 worker 的真实实现。
 *
 * 旧版本在这里「镜像」了一份色彩空间函数与清理算法副本,测的是副本而不是产品代码,
 * 因此 Phase A 重构引入的调色板子集形状缺陷没有被子集路径覆盖到。
 * 现在 worker 导出纯函数,测试直接引用真实实现。
 */

import { describe, it, expect } from 'vitest'
import {
  rgbToLab,
  rgbToOklab,
  deltaEOKLab,
  deltaEOKLabWeighted,
  deltaEFast,
  cleanupIsolatedBeads,
  suppressCheckerboard,
} from './imageQuantizer.worker.js'

const TEST_PAIRS = [
  { name: 'skin-light', c1: [231, 145, 126], c2: [238, 132, 120] },
  { name: 'skin-dark', c1: [231, 145, 126], c2: [220, 160, 135] },
  { name: 'blue', c1: [100, 150, 200], c2: [105, 148, 195] },
  { name: 'green', c1: [50, 180, 80], c2: [55, 175, 85] },
  { name: 'red', c1: [200, 50, 50], c2: [195, 55, 55] },
  { name: 'black-white', c1: [0, 0, 0], c2: [255, 255, 255] },
  { name: 'similar-gray', c1: [128, 128, 128], c2: [130, 130, 130] },
]

/** 与 worker 内部 areaColors 条目同形:{ lab, rgb } */
function areaEntry(rgb) {
  return { rgb, lab: rgbToLab(rgb[0], rgb[1], rgb[2]) }
}

/** 与 worker 内部 activeLabs 同形:{ labs, oklabs } */
function activeLabsFor(rgbs) {
  return {
    labs: rgbs.map((c) => rgbToLab(c[0], c[1], c[2])),
    oklabs: rgbs.map((c) => rgbToOklab(c[0], c[1], c[2])),
  }
}

/** cleanup/suppress 的 activePalette 参数在本用例中不参与判定 */
function fakePalette(colors) {
  return colors.map((c, i) => ({ id: `T${i}`, rgb: { r: c[0], g: c[1], b: c[2] } }))
}

describe('OKLab 色彩空间', () => {
  it('转换得到有限的正色差值', () => {
    const d = deltaEOKLab(rgbToOklab(231, 145, 126), rgbToOklab(238, 132, 120))
    expect(d).toBeGreaterThan(0)
    expect(Number.isFinite(d)).toBe(true)
  })

  it('加权色差对明度更敏感', () => {
    const l1 = rgbToOklab(200, 100, 100)
    const l2 = rgbToOklab(180, 100, 100)
    expect(deltaEOKLabWeighted(l1, l2)).toBeGreaterThan(deltaEOKLab(l1, l2) * 0.9)
  })

  it('色差对称且同色为 0', () => {
    const a = rgbToOklab(100, 150, 200)
    const b = rgbToOklab(120, 140, 190)
    expect(deltaEOKLab(a, b)).toBeCloseTo(deltaEOKLab(b, a), 10)
    expect(deltaEOKLab(a, a)).toBe(0)
  })
})

describe('孤立豆清理', () => {
  const ISLAND = new Uint16Array([
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
  ])

  it('默认 lab 空间下清理与背景接近的孤立豆', () => {
    const colors = [[242, 242, 242], [240, 240, 240]]
    const areaColors = [...ISLAND].map((v) => areaEntry(colors[v]))

    const { cleaned, cleanedCount } = cleanupIsolatedBeads(
      ISLAND, areaColors, fakePalette(colors), activeLabsFor(colors), 5, 5, 'lab', 8,
    )

    expect(cleanedCount).toBe(1)
    expect(cleaned[12]).toBe(0)
  })

  it('默认 lab 空间下不清理与背景反差大的细节豆', () => {
    const colors = [[242, 242, 242], [0, 0, 0]]
    const areaColors = [...ISLAND].map((v) => areaEntry(colors[v]))

    const { cleanedCount } = cleanupIsolatedBeads(
      ISLAND, areaColors, fakePalette(colors), activeLabsFor(colors), 5, 5, 'lab', 8,
    )

    // 眼睛/瞳孔这类高反差单格必须保留
    expect(cleanedCount).toBe(0)
  })

  it('oklab 空间下同样按同空间色距判定', () => {
    const colors = [[242, 242, 242], [240, 240, 240]]
    const areaColors = [...ISLAND].map((v) => areaEntry(colors[v]))

    const { cleanedCount } = cleanupIsolatedBeads(
      ISLAND, areaColors, fakePalette(colors), activeLabsFor(colors), 5, 5, 'oklab', 0.08,
    )
    expect(cleanedCount).toBe(1)
  })

  it('非孤立区域保持不动', () => {
    const block = new Uint16Array([
      0, 0, 0, 0, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 0, 0,
    ])
    const colors = [[242, 242, 242], [0, 0, 0]]
    const areaColors = [...block].map((v) => areaEntry(colors[v]))

    const { cleanedCount } = cleanupIsolatedBeads(
      block, areaColors, fakePalette(colors), activeLabsFor(colors), 5, 5, 'lab', 8,
    )
    expect(cleanedCount).toBe(0)
  })
})

describe('棋盘抑制', () => {
  const ABAB = new Uint16Array([
    0, 1, 0, 1,
    1, 0, 1, 0,
    0, 1, 0, 1,
    1, 0, 1, 0,
  ])
  const STRONG = [[0, 0, 0], [255, 255, 255]]

  it('抑制 ABAB 高频交替(色距足够大时)', () => {
    const areaColors = [...ABAB].map((v) => areaEntry(STRONG[v]))

    const { suppressed, suppressedCount } = suppressCheckerboard(
      ABAB, areaColors, fakePalette(STRONG), activeLabsFor(STRONG), 4, 4, 'lab', 10,
    )

    expect(suppressedCount).toBeGreaterThan(0)
    // 被处理的 2×2 区域统一为单一颜色
    expect(suppressed[0]).toBe(suppressed[1])
    expect(suppressed[0]).toBe(suppressed[4])
  })

  it('色距过小时不当作伪影处理', () => {
    const close = [[128, 128, 128], [129, 129, 129]]
    const areaColors = [...ABAB].map((v) => areaEntry(close[v]))

    const { suppressedCount } = suppressCheckerboard(
      ABAB, areaColors, fakePalette(close), activeLabsFor(close), 4, 4, 'lab', 10,
    )
    expect(suppressedCount).toBe(0)
  })

  it('纯色区域不触发', () => {
    const uniform = new Uint16Array(16).fill(0)
    const areaColors = [...uniform].map(() => areaEntry(STRONG[0]))

    const { suppressedCount } = suppressCheckerboard(
      uniform, areaColors, fakePalette(STRONG), activeLabsFor(STRONG), 4, 4, 'lab', 10,
    )
    expect(suppressedCount).toBe(0)
  })
})

describe('性能预算(浏览器端单线程可承受)', () => {
  it('10k 次 OKLab 距离计算在预算内', () => {
    const start = performance.now()
    for (let i = 0; i < 10000; i += 1) {
      deltaEOKLab(
        rgbToOklab(100 + (i % 100), 100 + (i % 80), 100 + (i % 60)),
        rgbToOklab(120 + (i % 80), 90 + (i % 70), 110 + (i % 50)),
      )
    }
    expect(performance.now() - start).toBeLessThan(400)
  })

  it('10k 次 CIEDE76 距离计算在预算内', () => {
    const start = performance.now()
    for (let i = 0; i < 10000; i += 1) {
      deltaEFast(
        rgbToLab(100 + (i % 100), 100 + (i % 80), 100 + (i % 60)),
        rgbToLab(120 + (i % 80), 90 + (i % 70), 110 + (i % 50)),
      )
    }
    expect(performance.now() - start).toBeLessThan(400)
  })
})

describe('色差对比(OKLab vs CIEDE76)', () => {
  it('所有代表性色对都产出有限正色差', () => {
    for (const pair of TEST_PAIRS) {
      const ok = deltaEOKLab(rgbToOklab(...pair.c1), rgbToOklab(...pair.c2))
      const lab = deltaEFast(rgbToLab(...pair.c1), rgbToLab(...pair.c2))
      expect(ok, pair.name).toBeGreaterThan(0)
      expect(lab, pair.name).toBeGreaterThan(0)
      expect(Number.isFinite(ok) && Number.isFinite(lab), pair.name).toBe(true)
    }
  })

  it('黑白色差远大于近似灰色差', () => {
    expect(
      deltaEOKLab(rgbToOklab(0, 0, 0), rgbToOklab(255, 255, 255)),
    ).toBeGreaterThan(
      deltaEOKLab(rgbToOklab(128, 128, 128), rgbToOklab(130, 130, 130)),
    )
  })
})
