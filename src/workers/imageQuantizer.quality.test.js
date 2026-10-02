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
  deltaE2000,
  cleanupIsolatedBeads,
  suppressCheckerboard,
  cleanupTinyIslands,
  computeEdgeStrength,
  computeSaliencyMap,
  classifyImageType,
  suggestColorsForGrid,
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

describe('OKLab 加权色差精度(感知弧长色相项)', () => {
  it('色相项是感知弧长而非原始弧度:Hue 相差 180° 的等明度等彩度对 → dE = 0.2', () => {
    // dL=0、dC=0,dH = 2·√(0.1·0.1)·sin(90°) = 0.2 → sqrt(wH·0.04) = 0.2
    // 旧实现(原始弧度色相项)在同场景给出 dH = π → dE ≈ π,虚大 15 倍
    const c1 = [0.7, 0.1, 0]
    const c2 = [0.7, -0.1, 0]
    expect(deltaEOKLabWeighted(c1, c2)).toBeCloseTo(0.2, 10)
  })

  it('色相主控色对(红 vs 蓝)的加权距离有界且对称', () => {
    const red = rgbToOklab(220, 50, 60)
    const blue = rgbToOklab(50, 80, 220)
    const d1 = deltaEOKLabWeighted(red, blue)
    const d2 = deltaEOKLabWeighted(blue, red)
    expect(d1).toBeCloseTo(d2, 10)
    // 感知弧长上界 2√(C1·C2) 在常规彩度下 < 0.5;原始弧度版本会 > 2
    expect(d1).toBeLessThan(1.0)
  })

  it('明度差异在加权后保持放大(wL=1.30)', () => {
    const l1 = [0.7, 0.02, 0.01]
    const l2 = [0.6, 0.02, 0.01]
    // dL=0.1,dC=0、dH=0(a/b 相同)→ 加权 = √(1.3·0.01) = 0.1√1.3
    expect(deltaEOKLabWeighted(l1, l2)).toBeCloseTo(0.1 * Math.sqrt(1.3), 10)
  })
})

// ─── CIEDE2000(worker 实现)Sharma 补充数据集 ─────────────────────────────
// 与 src/utils/colorDiff.test.js 的 34 对基准保持同源,锁定两份实现的精度一致
const SHARMA_PAIRS = [
  [[50.0000, 2.6772, -79.7751], [50.0000, 0.0000, -82.7485], 2.0425],
  [[50.0000, 3.1571, -77.2803], [50.0000, 0.0000, -82.7485], 2.8615],
  [[50.0000, 2.8361, -74.0200], [50.0000, 0.0000, -82.7485], 3.4412],
  [[50.0000, -1.3802, -84.2814], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, -1.1848, -84.8006], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, -0.9009, -85.5211], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, 0.0000, 0.0000], [50.0000, -1.0000, 2.0000], 2.3669],
  [[50.0000, -1.0000, 2.0000], [50.0000, 0.0000, 0.0000], 2.3669],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0009], 7.1792],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0010], 7.1792],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0011], 7.2195],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0012], 7.2195],
  [[50.0000, -0.0010, 2.4900], [50.0000, 0.0009, -2.4900], 4.8045],
  [[50.0000, -0.0010, 2.4900], [50.0000, 0.0010, -2.4900], 4.8045],
  [[50.0000, -0.0010, 2.4900], [50.0000, 0.0011, -2.4900], 4.7461],
  [[50.0000, 2.5000, 0.0000], [50.0000, 0.0000, -2.5000], 4.3065],
  [[50.0000, 2.5000, 0.0000], [73.0000, 25.0000, -18.0000], 27.1492],
  [[50.0000, 2.5000, 0.0000], [61.0000, -5.0000, 29.0000], 22.8977],
  [[50.0000, 2.5000, 0.0000], [56.0000, -27.0000, -3.0000], 31.9030],
  [[50.0000, 2.5000, 0.0000], [58.0000, 24.0000, 15.0000], 19.4535],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.1736, 0.5854], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.2972, 0.0000], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 1.8634, 0.5757], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.2592, 0.3350], 1.0000],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.2480, -4.9620], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
]

describe('CIEDE2000(worker 实现,Sharma 34 对基准)', () => {
  it.each(SHARMA_PAIRS.map(([l1, l2, expected], i) => [i + 1, l1, l2, expected]))(
    'Sharma 对 %i → ΔE ≈ %f',
    (_i, lab1, lab2, expected) => {
      expect(deltaE2000(lab1, lab2)).toBeCloseTo(expected, 3)
    },
  )
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

describe('小型连通域清理', () => {
  it('清理颜色接近且未受保护的 2×2 小岛', () => {
    const output = new Uint16Array([
      0, 0, 0, 0, 0,
      0, 1, 1, 0, 0,
      0, 1, 1, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ])
    const colors = [[242, 242, 242], [240, 240, 240]]
    const areaColors = [...output].map((v) => areaEntry(colors[v]))
    const { cleaned, cleanedCount } = cleanupTinyIslands(
      output, areaColors, fakePalette(colors), activeLabsFor(colors), 5, 5, 'lab', 8,
    )
    expect(cleanedCount).toBe(4)
    expect([...cleaned]).toEqual(new Array(25).fill(0))
  })

  it('保护边缘小岛，避免清除真实细节', () => {
    const output = new Uint16Array([
      0, 0, 0, 0, 0,
      0, 1, 1, 0, 0,
      0, 1, 1, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ])
    const colors = [[242, 242, 242], [240, 240, 240]]
    const areaColors = [...output].map((v) => areaEntry(colors[v]))
    const protection = new Float32Array(25)
    protection[6] = 1
    const { cleanedCount } = cleanupTinyIslands(
      output, areaColors, fakePalette(colors), activeLabsFor(colors), 5, 5, 'lab', 8, protection,
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

describe('图片类型识别（自动适配 §二十五~二十六）', () => {
  it('极少纯色 → logo', () => {
    expect(classifyImageType({
      uniqueColors: 6, uniqueRatio: 0.004, flatness: 0.97, meanSaturation: 0.3,
      skinRatio: 0, bgCoverage: 0.2, edgeDensity: 0.08,
    })).toBe('logo')
  })

  it('平面色块 + 高饱和 → illustration', () => {
    expect(classifyImageType({
      uniqueColors: 120, uniqueRatio: 0.02, flatness: 0.75, meanSaturation: 0.6,
      skinRatio: 0.02, bgCoverage: 0, edgeDensity: 0.1,
    })).toBe('illustration')
  })

  it('肤色占比高 → portrait（即使颜色偏多）', () => {
    expect(classifyImageType({
      uniqueColors: 800, uniqueRatio: 0.08, flatness: 0.3, meanSaturation: 0.35,
      skinRatio: 0.2, bgCoverage: 0, edgeDensity: 0.15,
    })).toBe('portrait')
  })

  it('其余 → landscape（照片/风景兜底）', () => {
    expect(classifyImageType({
      uniqueColors: 2000, uniqueRatio: 0.2, flatness: 0.1, meanSaturation: 0.4,
      skinRatio: 0.01, bgCoverage: 0, edgeDensity: 0.3,
    })).toBe('landscape')
  })
})

describe('网格尺寸 → 建议颜色数（§二十七）', () => {
  it.each([
    [32, 12], [40, 12],
    [64, 24], [70, 24],
    [87, 36], [100, 36],
    [140, 48], [150, 48],
    [170, 64], [200, 64],
  ])('长边 %i → %i 色', (long, expected) => {
    expect(suggestColorsForGrid(long, long)).toBe(expected)
  })

  it('矩形网格按长边取档', () => {
    expect(suggestColorsForGrid(140, 105)).toBe(48)
    expect(suggestColorsForGrid(57, 29)).toBe(24)
  })
})

describe('OKLab 聚类距离', () => {
  it('使用无权 ΔE_OK，避免加权色差改变最终匹配语义', () => {
    const neutral = rgbToOklab(128, 128, 128)
    const chromatic = rgbToOklab(128, 80, 80)
    const neutralDistance = deltaEOKLab(neutral, chromatic)
    const weightedDistance = deltaEOKLabWeighted(neutral, chromatic)

    expect(neutralDistance).toBeGreaterThan(0)
    expect(weightedDistance).not.toBeCloseTo(neutralDistance, 6)
  })
})

describe('能量函数权重（§九~十五）', () => {
  it('边缘强度按 95 分位归一化到 [0,1]', () => {
    const edgeMap = new Float32Array(100)
    for (let i = 0; i < 100; i += 1) edgeMap[i] = i + 1 // 1..100，95 分位 ≈ 95
    const s = computeEdgeStrength(edgeMap)
    expect(s[99]).toBe(1) // clamp(100/95) → 1
    expect(s[0]).toBeCloseTo(1 / 95, 5)
    expect(Math.max(...s)).toBeLessThanOrEqual(1)
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0)
  })

  it('全平坦图边缘强度全 0', () => {
    const s = computeEdgeStrength(new Float32Array(50))
    expect([...s].every((v) => v === 0)).toBe(true)
  })

  it('显著性：与背景差异大的格子显著更高，空白格为 0', () => {
    const outW = 4
    const outH = 1
    const areaColors = new Array(outW * outH)
    areaColors[0] = areaEntry([255, 255, 255]) // = 背景参照
    areaColors[1] = areaEntry([200, 30, 30])   // 与背景差异大
    areaColors[2] = areaEntry([250, 245, 255]) // 接近背景
    areaColors[3] = areaEntry([30, 30, 200])   // 与背景差异大
    const edge = new Float32Array(outW * outH)
    const bgLab = rgbToLab(255, 255, 255)
    const sal = computeSaliencyMap(areaColors, edge, outW, outH, bgLab)
    expect(sal[1]).toBeGreaterThan(sal[0])
    expect(sal[1]).toBeGreaterThan(sal[2])
    expect(sal[1]).toBeLessThanOrEqual(1)
    expect(sal[1]).toBeGreaterThan(0.5)
  })
})
