import { describe, it, expect } from 'vitest'
import { analyzeImageContent, recommendGridSize, suggestMaxColorsForGrid } from './autoGrid'

/** 纯色图(绿色,避开肤色判据) */
function solid(w, h, rgb = [80, 160, 90]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { data, width: w, height: h }
}

/** 逐像素随机噪声图（高细节） */
function noise(w, h, seed = 42) {
  const data = new Uint8ClampedArray(w * h * 4)
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s / 0x7fffffff) * 255
  }
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = rand()
    data[i * 4 + 1] = rand()
    data[i * 4 + 2] = rand()
    data[i * 4 + 3] = 255
  }
  return { data, width: w, height: h }
}

describe('analyzeImageContent 内容特征', () => {
  it('纯色图：唯一色 1、边缘密度 0、平坦度 1', () => {
    const stats = analyzeImageContent(solid(80, 60))
    expect(stats.uniqueColors).toBe(1)
    expect(stats.edgeDensity).toBe(0)
    expect(stats.flatness).toBe(1)
  })

  it('噪声图：颜色丰富、边缘密度高', () => {
    const stats = analyzeImageContent(noise(120, 90))
    expect(stats.uniqueColors).toBeGreaterThan(200)
    expect(stats.edgeDensity).toBeGreaterThan(0.3)
  })
})

describe('recommendGridSize 尺寸自动匹配', () => {
  it('简单小图推荐最小档（29）并按源分辨率封顶', () => {
    const rec = recommendGridSize(solid(60, 60))
    expect(rec.gridWidth).toBe(rec.gridHeight)
    expect(rec.gridWidth).toBeGreaterThanOrEqual(29)
    expect(rec.gridWidth).toBeLessThanOrEqual(57)
  })

  it('高细节大图推荐大网格（114–140 档）', () => {
    const rec = recommendGridSize(noise(300, 200))
    expect(rec.gridWidth).toBeGreaterThanOrEqual(114)
    expect(rec.gridWidth).toBeLessThanOrEqual(140)
  })

  it('横图保持宽 > 高，竖图保持高 > 宽', () => {
    const wide = recommendGridSize(noise(300, 100))
    expect(wide.gridWidth).toBeGreaterThan(wide.gridHeight)

    const tall = recommendGridSize(noise(100, 300))
    expect(tall.gridHeight).toBeGreaterThan(tall.gridWidth)
  })

  it('小源图不会被推荐成超大网格（每豆 ≥2 源像素）', () => {
    const rec = recommendGridSize(noise(80, 80))
    expect(rec.gridWidth).toBeLessThanOrEqual(40) // round(80/2) 封顶
  })

  it('采样画布缩小后仍按原图尺寸封顶与保持宽高比', () => {
    // 组件侧把 320×210 缩到 96×63 采样 — 封顶应基于 320/2=160 而非 96/2=48
    const sampled = noise(96, 63, 7)
    const rec = recommendGridSize({ ...sampled, sourceWidth: 320, sourceHeight: 210 })
    expect(rec.gridWidth).toBeGreaterThanOrEqual(114)
    expect(rec.gridHeight).toBeGreaterThan(rec.gridWidth / 2)
    expect(rec.gridHeight).toBeLessThan(rec.gridWidth)
  })
})

describe('suggestMaxColorsForGrid 颜色数推荐表（§二十七）', () => {
  it.each([
    [32, 12], [40, 12],
    [64, 24], [70, 24],
    [87, 36], [100, 36],
    [140, 48], [150, 48],
    [170, 64], [200, 64],
  ])('长边 %i → %i 色', (long, expected) => {
    expect(suggestMaxColorsForGrid(long, long)).toBe(expected)
  })

  it('与 worker 侧 suggestColorsForGrid 同表（矩形按长边取档）', () => {
    expect(suggestMaxColorsForGrid(140, 105)).toBe(48)
    expect(suggestMaxColorsForGrid(57, 29)).toBe(24)
  })
})
