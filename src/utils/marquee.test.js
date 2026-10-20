import { describe, it, expect } from 'vitest'
import { drawMarquee, MARQUEE_DASH_PERIOD, MARQUEE_FILL, MARQUEE_STROKE } from './marquee'

/**
 * 选框绘制(实时跟随预览 + marching ants + 触屏把手)。
 *
 * 这里用记录型 2d context 直接断言「画了什么」,因为选框的正确性不在
 * React 树里 —— 拖动期间它绕过 React 直接画在 overlay canvas 上。
 */

function recordingCtx() {
  const calls = { fillRect: [], strokeRect: [], setLineDash: [], arc: [], fill: 0, save: 0, restore: 0, fillStyle: [], strokeStyle: [], lineWidth: [] }
  const ctx = {
    get fillStyle() { return this._f },
    set fillStyle(v) { this._f = v; calls.fillStyle.push(v) },
    get strokeStyle() { return this._s },
    set strokeStyle(v) { this._s = v; calls.strokeStyle.push(v) },
    get lineWidth() { return this._w },
    set lineWidth(v) { this._w = v; calls.lineWidth.push(v) },
    lineDashOffset: 0,
    fillRect: (...a) => calls.fillRect.push(a),
    strokeRect: (...a) => calls.strokeRect.push(a),
    setLineDash: (d) => calls.setLineDash.push(d),
    arc: (...a) => calls.arc.push(a),
    beginPath: () => {},
    fill: () => { calls.fill++ },
    save: () => { calls.save++ },
    restore: () => { calls.restore++ },
  }
  return { ctx, calls }
}

describe('drawMarquee', () => {
  it('按网格坐标画出填充与虚线描边', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 1, y: 2, w: 3, h: 4 }, { cellSize: 16 })

    expect(calls.fillRect).toEqual([[16, 32, 48, 64]])
    expect(calls.strokeRect).toHaveLength(1)
    expect(calls.setLineDash).toEqual([[6, 4]])
    expect(calls.fillStyle).toContain(MARQUEE_FILL)
    expect(calls.strokeStyle).toContain(MARQUEE_STROKE)
    // 每次绘制都成对 save/restore,不污染后续 hover 高亮的上下文状态
    expect(calls.save).toBe(calls.restore)
  })

  it('线宽与虚线按 1/scale 补偿:缩放后屏幕观感恒定', () => {
    const small = recordingCtx()
    drawMarquee(small.ctx, { x: 0, y: 0, w: 1, h: 1 }, { scale: 0.5 })
    const big = recordingCtx()
    drawMarquee(big.ctx, { x: 0, y: 0, w: 1, h: 1 }, { scale: 4 })

    expect(small.calls.lineWidth[0]).toBe(4)   // 2 / 0.5
    expect(big.calls.lineWidth[0]).toBe(0.5)   // 2 / 4
    expect(small.calls.setLineDash[0]).toEqual([12, 8]) // 6/0.5, 4/0.5
    expect(big.calls.setLineDash[0]).toEqual([1.5, 1])  // 6/4, 4/4
  })

  it('scale 为 0 或非法值时不产生 Infinity/NaN', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 1, h: 1 }, { scale: 0 })
    for (const n of calls.lineWidth) expect(Number.isFinite(n)).toBe(true)
    for (const d of calls.setLineDash.flat()) expect(Number.isFinite(d)).toBe(true)
  })

  it('dashOffset 随缩放折算,虚线流动速度视觉一致', () => {
    const a = recordingCtx()
    drawMarquee(a.ctx, { x: 0, y: 0, w: 1, h: 1 }, { scale: 1, dashOffset: 3 })
    expect(a.ctx.lineDashOffset).toBe(3)

    const b = recordingCtx()
    drawMarquee(b.ctx, { x: 0, y: 0, w: 1, h: 1 }, { scale: 2, dashOffset: 3 })
    expect(b.ctx.lineDashOffset).toBe(1.5)
  })

  it('触屏设备画四个角把手,桌面端不画', () => {
    const touch = recordingCtx()
    drawMarquee(touch.ctx, { x: 0, y: 0, w: 2, h: 2 }, { handles: true })
    expect(touch.calls.arc).toHaveLength(4)
    // 把手落在四角(0,0) (32,0) (0,32) (32,32)
    const centers = touch.calls.arc.map(([x, y]) => [x, y])
    expect(centers).toEqual(expect.arrayContaining([[0, 0], [32, 0], [0, 32], [32, 32]]))

    const desktop = recordingCtx()
    drawMarquee(desktop.ctx, { x: 0, y: 0, w: 2, h: 2 }, { handles: false })
    expect(desktop.calls.arc).toHaveLength(0)
  })

  it('空上下文或空选区时安全返回', () => {
    expect(() => drawMarquee(null, { x: 0, y: 0, w: 1, h: 1 })).not.toThrow()
    const { ctx, calls } = recordingCtx()
    expect(() => drawMarquee(ctx, null)).not.toThrow()
    expect(calls.fillRect).toHaveLength(0)
  })

  it('虚线周期常量与 setLineDash 段长一致(动画取模依赖它)', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 1, h: 1 }, { scale: 1 })
    const [dash, gap] = calls.setLineDash[0]
    expect(dash + gap).toBe(MARQUEE_DASH_PERIOD)
  })
})
