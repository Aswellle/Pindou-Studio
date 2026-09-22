/**
 * 量化 worker 端到端测试 —— 真实加载 worker 模块并驱动 onmessage 主流程。
 *
 * 回归背景:Phase A 把色差读取契约从「Lab 数组」改成「{ labs, oklabs } 双空间对象」,
 * 但 kmeansSelectPalette 仍返回数组,nearestColor 里 paletteLabs.labs 拿到 undefined,
 * 于是所有走 K-means 子集路径的量化都抛 TypeError(线上「图片转拼豆」直接失败)。
 * 该缺陷逃过测试的原因是质量测试里复制了一份算法实现,只测副本。
 * 这里用假 self 加载真实 worker,保证同类形状/崩溃缺陷必然被拦住。
 */

import { describe, it, expect, afterEach, vi } from 'vitest'

const BLANK = 0xffff

/** 小尺寸渐变图:足以覆盖 K-means 选色、边缘采样、抖动、ICM、清理全流程 */
function makeGradientImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      data[i] = Math.round((x / Math.max(1, w - 1)) * 255)
      data[i + 1] = Math.round((y / Math.max(1, h - 1)) * 255)
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }
  return data
}

const PALETTE = [
  { id: 'P01', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
  { id: 'P02', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
  { id: 'P03', hex: '#FF0000', rgb: { r: 255, g: 0, b: 0 } },
  { id: 'P04', hex: '#00FF00', rgb: { r: 0, g: 255, b: 0 } },
  { id: 'P05', hex: '#0000FF', rgb: { r: 0, g: 0, b: 255 } },
  { id: 'P06', hex: '#808080', rgb: { r: 128, g: 128, b: 128 } },
  { id: 'P07', hex: '#FFFF00', rgb: { r: 255, g: 255, b: 0 } },
  { id: 'P08', hex: '#00FFFF', rgb: { r: 0, g: 255, b: 255 } },
  { id: 'P09', hex: '#FF00FF', rgb: { r: 255, g: 0, b: 255 } },
  { id: 'P10', hex: '#123456', rgb: { r: 18, g: 52, b: 86 } },
]

async function runQuantizer(overrides = {}) {
  const payload = {
    imageData: { width: 32, height: 32, data: makeGradientImage(32, 32) },
    gridSize: 16,
    gridWidth: 16,
    gridHeight: 16,
    maxColors: 10,
    paletteColors: PALETTE,
    dithering: 'none',
    brightness: 0,
    contrast: 0,
    highQuality: false,
    removeBackground: false,
    colorSpace: 'lab',
    ...overrides,
  }

  const messages = []
  const selfStub = { onmessage: null, postMessage: (m) => messages.push(m) }
  vi.stubGlobal('self', selfStub)
  vi.resetModules()
  await import('./imageQuantizer.worker.js')
  selfStub.onmessage({ data: { type: 'QUANTIZE', payload } })
  return messages
}

function expectComplete(messages) {
  const error = messages.find((m) => m.type === 'ERROR')
  expect(error, error ? `worker 抛错: ${error.error}` : '').toBeUndefined()
  const complete = messages.find((m) => m.type === 'COMPLETE')
  expect(complete, 'worker 未返回 COMPLETE').toBeTruthy()
  return complete.payload
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('quantizer worker pipeline', () => {
  it('K-means 子集路径产出合法索引(回归:调色板子集必须是 { labs, oklabs } 形状)', async () => {
    const result = expectComplete(await runQuantizer({ maxColors: 4 }))
    const indices = new Uint16Array(result.indexBuffer)

    expect(result.quantizedColors.length).toBeGreaterThan(0)
    expect(result.quantizedColors.length).toBeLessThanOrEqual(4)
    expect(indices.length).toBe(result.width * result.height)

    for (const value of indices) {
      expect(value === BLANK || value < result.quantizedColors.length).toBe(true)
    }
    // 渐变图不该量化成整块空白,也不该只剩单一颜色
    const filled = [...indices].filter((value) => value !== BLANK)
    expect(filled.length).toBe(indices.length)
    expect(new Set(filled).size).toBeGreaterThan(1)
  })

  it.each([
    ['lab', 'none'],
    ['lab', 'floyd-steinberg'],
    ['lab', 'ordered'],
    ['oklab', 'none'],
    ['oklab', 'floyd-steinberg'],
    ['oklab', 'ordered'],
  ])('色彩空间 %s + 抖动 %s 都产出合法结果', async (colorSpace, dithering) => {
    const result = expectComplete(await runQuantizer({ colorSpace, dithering, maxColors: 6 }))
    const indices = new Uint16Array(result.indexBuffer)
    expect(indices.length).toBe(result.width * result.height)
    for (const value of indices) {
      expect(value === BLANK || value < result.quantizedColors.length).toBe(true)
    }
  })

  it('colorStats 只统计实际输出的颜色', async () => {
    const result = expectComplete(await runQuantizer({}))
    const ids = new Set(result.quantizedColors.map((color) => color.id))
    const keys = Object.keys(result.colorStats)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(ids.has(key)).toBe(true)
      expect(result.colorStats[key]).toBeGreaterThan(0)
    }
  })

  it('透明像素保持空白格(不与背景色混淆)', async () => {
    const size = 32
    const data = makeGradientImage(size, size)
    for (let y = 0; y < size; y += 1) {
      for (let x = size / 2; x < size; x += 1) {
        data[(y * size + x) * 4 + 3] = 0
      }
    }
    const result = expectComplete(await runQuantizer({
      imageData: { width: size, height: size, data },
      maxColors: 5,
    }))
    const indices = [...new Uint16Array(result.indexBuffer)]
    const half = result.width / 2
    const rightHalf = indices.filter((_, i) => (i % result.width) >= half)
    const leftHalf = indices.filter((_, i) => (i % result.width) < half)
    expect(rightHalf.every((value) => value === BLANK)).toBe(true)
    expect(leftHalf.some((value) => value !== BLANK)).toBe(true)
  })

  it('矩形网格按 gridWidth × gridHeight 输出', async () => {
    const result = expectComplete(await runQuantizer({ gridWidth: 24, gridHeight: 12, maxColors: 5 }))
    expect(result.width).toBe(24)
    expect(result.height).toBe(12)
    expect(new Uint16Array(result.indexBuffer).length).toBe(24 * 12)
  })
})
