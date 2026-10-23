import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChartImport } from './useChartImport'

/**
 * 图纸识别的 PDF / HEIC 分支。
 *
 * 两条承诺,都用测试钉死:
 *   1. **原生格式零改动** —— PNG/JPEG/SVG 不经过任何转换,decode 拿到的是原文件;
 *   2. **非原生格式先转换再解码** —— PDF/HEIC 转换失败时给出**具体**错误码,
 *      不是笼统的「读取失败」。
 *
 * 转换函数本身依赖 libheif / pdfjs 与 DOM canvas,在这里 mock 掉,
 * 只验证「什么时候调用转换、拿到什么、错误怎么透传」这层编排。
 */

const heicSpy = vi.fn()
const pdfSpy = vi.fn()
const analyzeSpy = vi.fn()
const fingerprintSpy = vi.fn()
const loadSessionSpy = vi.fn()

vi.mock('../utils/imageFormats', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    heicToPngBlob: (...args) => heicSpy(...args),
    pdfToPngBlob: (...args) => pdfSpy(...args),
  }
})

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

/** jsdom 里没有真实 canvas / Image,给一个能"解码"的替身 */
function installDecodeMock() {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(16 * 16 * 4), width: 16, height: 16 }),
    }
  }
  class FakeImage {
    constructor() { this.width = 16; this.height = 16 }
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

/** 造一个带魔数的 File 替身:类型判定看 MIME/扩展名,嗅探看字节 */
function makeFile({ name, type, magic }) {
  const bytes = new Uint8Array(64)
  if (magic) bytes.set(magic, 0)
  const blob = new Blob([bytes], { type })
  return Object.defineProperty(blob, 'name', { value: name, configurable: true })
}

const ascii = (s) => [...s].map((c) => c.charCodeAt(0))

const pngFile = () => makeFile({
  name: 'chart.png',
  type: 'image/png',
  magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
})
const heicFile = () => makeFile({
  name: 'IMG_0001.HEIC',
  type: 'image/heic',
  magic: [0x00, 0x00, 0x00, 0x18, ...ascii('ftyp'), ...ascii('heic')],
})
const pdfFile = () => makeFile({
  name: 'chart.pdf',
  type: 'application/pdf',
  magic: ascii('%PDF-1.7'),
})

beforeEach(() => {
  heicSpy.mockReset()
  pdfSpy.mockReset()
  analyzeSpy.mockReset()
  fingerprintSpy.mockReset().mockResolvedValue('fp-1')
  loadSessionSpy.mockReset().mockResolvedValue(null)
  analyzeSpy.mockImplementation((img) => ({
    ok: true,
    status: 'detected',
    confidence: 0.9,
    bounds: { x0: 0, y0: 0, x1: img.width, y1: img.height },
  }))
})

describe('useChartImport · 原生格式不经过转换', () => {
  it('PNG 不调用任何转换函数', async () => {
    const restore = installDecodeMock()
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(pngFile()) })

      expect(heicSpy).not.toHaveBeenCalled()
      expect(pdfSpy).not.toHaveBeenCalled()
      expect(result.current.fileError).toBe('')
      expect(result.current.image).toBeTruthy()
    } finally {
      restore()
    }
  })
})

describe('useChartImport · HEIC', () => {
  it('先转成 PNG 再解码', async () => {
    const restore = installDecodeMock()
    const converted = new Blob([new Uint8Array(64)], { type: 'image/png' })
    heicSpy.mockResolvedValue(converted)
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(heicFile()) })

      expect(heicSpy).toHaveBeenCalledTimes(1)
      expect(result.current.fileError).toBe('')
      expect(result.current.image).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('转换失败时给出 heicDecodeFailed,而不是笼统的 decodeFailed', async () => {
    const restore = installDecodeMock()
    heicSpy.mockRejectedValue(new Error('heicDecodeFailed'))
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(heicFile()) })

      expect(result.current.fileError).toBe('heicDecodeFailed')
      expect(result.current.image).toBeNull()
    } finally {
      restore()
    }
  })

  it('缺少解码库时给出 heicUnsupported', async () => {
    const restore = installDecodeMock()
    heicSpy.mockRejectedValue(new Error('heicUnsupported'))
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(heicFile()) })

      expect(result.current.fileError).toBe('heicUnsupported')
    } finally {
      restore()
    }
  })

  it('转换抛未知错误时退回 decodeFailed(不把内部信息漏给用户)', async () => {
    const restore = installDecodeMock()
    heicSpy.mockRejectedValue(new Error('wasm exploded at 0x1234'))
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(heicFile()) })

      expect(result.current.fileError).toBe('decodeFailed')
    } finally {
      restore()
    }
  })

  it('解码后才发现的像素超限透传为 tooManyPixels,而不是 decodeFailed', async () => {
    // HEIC 的尺寸要解出图像句柄才知道,红线在转换函数内部触发;
    // 这里若把 tooManyPixels 归到「未知错误」,用户看到的是笼统的读取失败,
    // 而真实原因是「图太大」—— 两者的处置方式完全不同(缩图 vs 换格式)。
    const restore = installDecodeMock()
    heicSpy.mockRejectedValue(new Error('tooManyPixels'))
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(heicFile()) })

      expect(result.current.fileError).toBe('tooManyPixels')
      expect(result.current.image).toBeNull()
    } finally {
      restore()
    }
  })
})

describe('useChartImport · PDF', () => {
  it('先栅格化再解码,且带上长边上限', async () => {
    const restore = installDecodeMock()
    const converted = new Blob([new Uint8Array(64)], { type: 'image/png' })
    pdfSpy.mockResolvedValue(converted)
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(pdfFile()) })

      expect(pdfSpy).toHaveBeenCalledTimes(1)
      const [, opts] = pdfSpy.mock.calls[0]
      expect(opts.maxSide).toBeGreaterThan(0)
      expect(result.current.fileError).toBe('')
      expect(result.current.image).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('PDF 默认被其他入口拒绝,但这里放行(allowPdf)', async () => {
    const restore = installDecodeMock()
    pdfSpy.mockResolvedValue(new Blob([new Uint8Array(8)], { type: 'image/png' }))
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(pdfFile()) })
      // 走到转换说明已通过门控;若门控没放行会是 notImage
      expect(result.current.fileError).not.toBe('notImage')
      expect(pdfSpy).toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('解析失败时给出 pdfDecodeFailed', async () => {
    const restore = installDecodeMock()
    pdfSpy.mockRejectedValue(new Error('pdfDecodeFailed'))
    try {
      const { result } = renderHook(() => useChartImport())
      await act(async () => { await result.current.loadFile(pdfFile()) })

      expect(result.current.fileError).toBe('pdfDecodeFailed')
    } finally {
      restore()
    }
  })
})
