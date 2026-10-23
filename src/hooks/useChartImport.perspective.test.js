import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChartImport } from './useChartImport'

/**
 * 图纸识别的透视校正分支。
 *
 * 验收要求「不校正时行为完全不变」—— 因此最关键的一条是:
 * 未调用 applyPerspective 时,image 必须与解码结果**同一个对象**,
 * 检测结果也走原来那条路径。下面的用例把这一点钉死。
 *
 * 图片解码依赖 <img>/canvas,jsdom 里跑不了真实解码,
 * 所以这里 mock 掉 decodeToImageData 的上游(fingerprintImage)与
 * analyzeChart,只验证状态编排。
 */

const R = '#E53935'

/** 造一张 w×h 的 RGBA 图,左半红右半蓝 */
function makeImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const left = x < w / 2
      data[o] = left ? 229 : 30
      data[o + 1] = 57
      data[o + 2] = left ? 53 : 200
      data[o + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

const analyzeSpy = vi.fn()
const fingerprintSpy = vi.fn()
const loadSessionSpy = vi.fn()

vi.mock('../services/chart/chartImport', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    analyzeChart: (imageData) => analyzeSpy(imageData),
  }
})

vi.mock('../services/project/chartImportStore', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fingerprintImage: (...args) => fingerprintSpy(...args),
    loadSession: (...args) => loadSessionSpy(...args),
  }
})

/** 让 <img> + canvas 在 jsdom 里能"解码"出我们造的像素 */
function installDecodeMock(width, height) {
  const img = makeImage(width, height)
  // jsdom 没有真实 canvas:直接替换 HTMLCanvasElement.prototype.getContext,
  // 不用 spy document.createElement —— 那样会在 spy 内部再次触发自己,
  // 造成无限递归。
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      drawImage: () => {},
      putImageData: () => {},
      getImageData: () => ({ data: img.data, width: img.width, height: img.height }),
    }
  }
  // Image 解码:onload 时给出尺寸
  class FakeImage {
    constructor() { this.width = width; this.height = height }
    set src(_v) { setTimeout(() => this.onload?.(), 0) }
  }
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: () => {},
  })
  return () => { HTMLCanvasElement.prototype.getContext = originalGetContext }
}

const makeFile = (name = 'chart.png') => {
  const blob = new Blob([new Uint8Array(64)], { type: 'image/png' })
  return Object.defineProperty(blob, 'name', { value: name, configurable: true })
}

beforeEach(() => {
  analyzeSpy.mockReset()
  fingerprintSpy.mockReset().mockResolvedValue('fp-1')
  loadSessionSpy.mockReset().mockResolvedValue(null)
  // 默认检测成功:边界取整张图
  analyzeSpy.mockImplementation((img) => ({
    ok: true,
    status: 'detected',
    confidence: 0.9,
    bounds: { x0: 0, y0: 0, x1: img.width, y1: img.height },
  }))
})

describe('useChartImport · 不校正时行为不变', () => {
  it('loadFile 后 image 就是解码结果,quad 为空', async () => {
    installDecodeMock(40, 40)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile())
    })

    expect(result.current.image).not.toBeNull()
    expect(result.current.quad).toBeNull()
    expect(result.current.originalImage).toBe(result.current.image)
    // 检测被调用一次,参数就是解码出的像素
    expect(analyzeSpy).toHaveBeenCalledTimes(1)
    expect(analyzeSpy.mock.calls[0][0]).toBe(result.current.image.imageData)
  })

  it('未校正时 clearPerspective 是空操作,不重跑检测', async () => {
    installDecodeMock(40, 40)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile())
    })
    expect(analyzeSpy).toHaveBeenCalledTimes(1)

    let changed
    await act(async () => {
      changed = result.current.clearPerspective()
    })
    expect(changed).toBe(false)
    // 关键:没有多跑一次检测
    expect(analyzeSpy).toHaveBeenCalledTimes(1)
    expect(result.current.image).toBe(result.current.originalImage)
  })
})

describe('useChartImport · 透视校正', () => {
  it('应用校正后 image 换成校正结果,并重新检测', async () => {
    installDecodeMock(100, 100)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile())
    })
    const original = result.current.originalImage
    expect(analyzeSpy).toHaveBeenCalledTimes(1)

    // 取中间 60×60 的区域做校正
    const corners = [
      { x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 },
    ]
    let ok
    await act(async () => {
      ok = result.current.applyPerspective(corners)
    })

    expect(ok).toBe(true)
    // 校正后的图是新的对象,尺寸等于四边形
    expect(result.current.image).not.toBe(original)
    expect(result.current.image.width).toBe(60)
    expect(result.current.image.height).toBe(60)
    // quad 被记录(规范化后的顺序)
    expect(result.current.quad).not.toBeNull()
    expect(result.current.quad[0]).toEqual({ x: 20, y: 20 })
    // 原图仍然保留,用于撤销
    expect(result.current.originalImage).toBe(original)
    // 检测重跑了一次
    expect(analyzeSpy).toHaveBeenCalledTimes(2)
    expect(analyzeSpy.mock.calls[1][0]).toBe(result.current.image.imageData)
  })

  it('校正后的映射与手动指定的四角一致(验收核心)', async () => {
    installDecodeMock(100, 100)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile())
    })

    // 只取左上角的 40×40
    const corners = [
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 },
    ]
    await act(async () => {
      result.current.applyPerspective(corners)
    })

    expect(result.current.image.width).toBe(40)
    expect(result.current.image.height).toBe(40)

    // 原图左半红、右半蓝;取左上 40×40 全是红
    const { data, width } = result.current.image.imageData
    const midO = (20 * width + 20) * 4
    expect(data[midO]).toBeCloseTo(229, -1)   // 红
    expect(data[midO + 2]).toBeCloseTo(53, -1) // 蓝分量低
  })

  it('撤销校正回到原图并重新检测', async () => {
    installDecodeMock(100, 100)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile())
    })
    const original = result.current.originalImage

    await act(async () => {
      result.current.applyPerspective([
        { x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 },
      ])
    })
    expect(result.current.quad).not.toBeNull()
    expect(analyzeSpy).toHaveBeenCalledTimes(2)

    let ok
    await act(async () => {
      ok = result.current.clearPerspective()
    })
    expect(ok).toBe(true)
    expect(result.current.image).toBe(original)
    expect(result.current.quad).toBeNull()
    expect(analyzeSpy).toHaveBeenCalledTimes(3)
    expect(analyzeSpy.mock.calls[2][0]).toBe(original.imageData)
  })

  it('四点共线等退化输入被拒绝,状态不变', async () => {
    installDecodeMock(100, 100)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile())
    })
    const before = result.current.image

    let ok
    await act(async () => {
      ok = result.current.applyPerspective([
        { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 },
      ])
    })
    expect(ok).toBe(false)
    expect(result.current.image).toBe(before)
    expect(result.current.quad).toBeNull()
    expect(analyzeSpy).toHaveBeenCalledTimes(1) // 没有多跑检测
  })

  it('没有原图时拒绝校正(不崩)', async () => {
    const { result } = renderHook(() => useChartImport())
    let ok
    await act(async () => {
      ok = result.current.applyPerspective([
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ])
    })
    expect(ok).toBe(false)
  })

  it('重新选择图片会清掉上一次的校正状态', async () => {
    installDecodeMock(100, 100)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile('a.png'))
    })
    await act(async () => {
      result.current.applyPerspective([
        { x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 },
      ])
    })
    expect(result.current.quad).not.toBeNull()

    await act(async () => {
      await result.current.loadFile(makeFile('b.png'))
    })
    expect(result.current.quad).toBeNull()
    expect(result.current.image).toBe(result.current.originalImage)
  })

  it('reset 会同时清掉校正状态与原图', async () => {
    installDecodeMock(100, 100)
    const { result } = renderHook(() => useChartImport())

    await act(async () => {
      await result.current.loadFile(makeFile())
    })
    await act(async () => {
      result.current.applyPerspective([
        { x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 },
      ])
    })
    expect(result.current.quad).not.toBeNull()
    expect(result.current.originalImage).not.toBeNull()

    await act(async () => {
      result.current.reset()
    })
    // 全部归零:否则下次打开向导会带着上一张图的校正四边形
    expect(result.current.image).toBeNull()
    expect(result.current.originalImage).toBeNull()
    expect(result.current.quad).toBeNull()
    expect(result.current.detection).toBeNull()
  })
})
