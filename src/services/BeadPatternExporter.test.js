import { describe, it, expect, afterEach, vi } from 'vitest'
import { createScaledCanvas, createDPICanvas } from './BeadPatternExporter'

/**
 * 画布分配的超采样倍率与降级语义(规格 09 §4.2–4.3)。
 *
 * 这两条是导出清晰度的地基:
 *   - 默认 3×(现状不能变);
 *   - DPI 预设(高分辨率 / 打印)必须真的请求更高倍率 —— 曾经
 *     createDPICanvas 算出 targetScale 后丢弃、直接调 createScaledCanvas,
 *     导致三个质量预设产出完全相同的像素尺寸(死代码)。
 *   - 面积预算与分配失败都必须逐级降级,且把真实倍率回报给调用方。
 *
 * 预算常量(见 BeadPatternExporter):桌面 2.68e8 物理像素,移动端 8e7。
 * jsdom 的 navigator.userAgent 不含移动端标记,因此这里走桌面预算。
 */

const DESKTOP_MAX_AREA = 268_000_000

// jsdom 无 canvas 实现:用可分配 backing store 的假 canvas 模拟真实设备行为。
// width/height 超过 maxDimension 时按浏览器行为静默截断(触发 tryCreate 的回读校验)。
function installFakeCanvas({ maxDimension = Infinity } = {}) {
  const proto = HTMLCanvasElement.prototype
  const origWidth = Object.getOwnPropertyDescriptor(proto, 'width')
  const origHeight = Object.getOwnPropertyDescriptor(proto, 'height')
  let w = 300
  let h = 150
  const clamp = (v) => (v > maxDimension ? Math.floor(maxDimension / 2) : v)
  Object.defineProperty(proto, 'width', {
    configurable: true,
    get: () => w,
    set: (v) => { w = clamp(Math.round(v)) },
  })
  Object.defineProperty(proto, 'height', {
    configurable: true,
    get: () => h,
    set: (v) => { h = clamp(Math.round(v)) },
  })
  const ctxSpy = vi.spyOn(proto, 'getContext').mockImplementation(() => ({
    fillRect: () => {}, scale: () => {},
  }))
  return {
    restore() {
      ctxSpy.mockRestore()
      Object.defineProperty(proto, 'width', origWidth)
      Object.defineProperty(proto, 'height', origHeight)
    },
  }
}

let fake
afterEach(() => { fake?.restore(); fake = null })

describe('createScaledCanvas 请求倍率', () => {
  it('默认仍为 3×(向后兼容,不改变现有导出质量)', () => {
    fake = installFakeCanvas()
    expect(createScaledCanvas(100, 100).scale).toBe(3)
  })

  it('接受更高的请求倍率(打印预设)', () => {
    fake = installFakeCanvas()
    expect(createScaledCanvas(100, 100, 8).scale).toBe(8)
    expect(createScaledCanvas(100, 100, 6).scale).toBe(6)
  })

  it('超面积预算时逐级降级', () => {
    fake = installFakeCanvas()
    // 6000×6000:3×(3.24e8)超桌面预算 → 2×(1.44e8)可行
    expect(createScaledCanvas(6000, 6000).scale).toBe(2)
    // 9000×9000:3×(7.29e8)、2×(3.24e8)超 → 1×(8.1e7)可行
    expect(createScaledCanvas(9000, 9000).scale).toBe(1)
  })

  it('高倍率请求同样受预算约束(8× 逐步降到可行倍率)', () => {
    fake = installFakeCanvas()
    // 3000×3000:8×=5.76e8、7×=4.41e8、6×=3.24e8 超;5×=2.25e8 可行
    expect(createScaledCanvas(3000, 3000, 8).scale).toBe(5)
  })

  it('所有倍率都超预算时抛错(调用方据此提示「画布过大」)', () => {
    fake = installFakeCanvas()
    // 20000×20000:即使 1× 也是 4e8 > 2.68e8
    expect(() => createScaledCanvas(20000, 20000)).toThrow()
  })

  it('分配失败时降级而非直接抛错', () => {
    // 设备上限 250px:3×(300)被截断 → 2×(200)可行
    fake = installFakeCanvas({ maxDimension: 250 })
    expect(createScaledCanvas(100, 100, 3).scale).toBe(2)
  })

  it('非法请求倍率退化为 1× 而不是崩溃', () => {
    fake = installFakeCanvas()
    expect(createScaledCanvas(100, 100, 0).scale).toBe(1)
    expect(createScaledCanvas(100, 100, -5).scale).toBe(1)
    expect(createScaledCanvas(100, 100, NaN).scale).toBe(1)
  })
})

describe('createDPICanvas 质量预设', () => {
  it('DPI 真正驱动倍率(72 DPI = 1×,四舍五入取整)', () => {
    fake = installFakeCanvas()
    expect(createDPICanvas(200, 200, 300).scale).toBe(4)
    expect(createDPICanvas(200, 200, 432).scale).toBe(6)
    expect(createDPICanvas(200, 200, 576).scale).toBe(8)
  })

  it('三个预设产出递增的像素尺寸(预设不是死代码)', () => {
    fake = installFakeCanvas()
    const areas = [300, 432, 576].map((dpi) => {
      const { canvas } = createDPICanvas(200, 200, dpi)
      return canvas.width * canvas.height
    })
    expect(areas[0]).toBeLessThan(areas[1])
    expect(areas[1]).toBeLessThan(areas[2])
  })

  it('回传的 dpi 与实际倍率一致(不谎报)', () => {
    fake = installFakeCanvas()
    const { scale, dpi } = createDPICanvas(200, 200, 432)
    expect(dpi).toBe(Math.round(scale * 72))
  })

  it('超预算时降级并回传真实 dpi,而不是继续报请求值', () => {
    fake = installFakeCanvas()
    // 3000×3000 请求 8× → 预算内最高 5×(2.25e8)
    const { scale, dpi, canvas } = createDPICanvas(3000, 3000, 576)
    expect(scale).toBe(5)
    expect(dpi).toBe(360)
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(DESKTOP_MAX_AREA)
  })
})
