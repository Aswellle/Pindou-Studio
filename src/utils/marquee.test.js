import { describe, it, expect } from 'vitest'
import { drawMarquee, MARQUEE_DASH_PERIOD, MARQUEE_FILL, MARQUEE_STROKE, MARQUEE_SNAP } from './marquee'

/**
 * 选框绘制(实时跟随预览 + marching ants + 触屏把手)。
 *
 * 这里用记录型 2d context 直接断言「画了什么」,因为选框的正确性不在
 * React 树里 —— 拖动期间它绕过 React 直接画在 overlay canvas 上。
 */

function recordingCtx() {
  const calls = { fillRect: [], strokeRect: [], setLineDash: [], arc: [], rect: [], moveTo: [], lineTo: [], stroke: 0, fill: 0, save: 0, restore: 0, fillStyle: [], strokeStyle: [], lineWidth: [] }
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
    rect: (...a) => calls.rect.push(a),
    moveTo: (...a) => calls.moveTo.push(a),
    lineTo: (...a) => calls.lineTo.push(a),
    beginPath: () => {},
    fill: () => { calls.fill++ },
    stroke: () => { calls.stroke++ },
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

describe('drawMarquee · resize 手柄(A1)', () => {
  it('画八个方块:四角 + 四边中点', () => {
    const { ctx, calls } = recordingCtx()
    // 2×2 格、单元 16px → 矩形 0..32
    drawMarquee(ctx, { x: 0, y: 0, w: 2, h: 2 }, { resizeHandles: true })

    expect(calls.rect).toHaveLength(8)
    const centers = calls.rect.map(([x, y, w, h]) => [x + w / 2, y + h / 2])
    expect(centers).toEqual(expect.arrayContaining([
      [0, 0], [32, 0], [0, 32], [32, 32], // 四角
      [16, 0], [32, 16], [16, 32], [0, 16], // 四边中点
    ]))
  })

  it('方块屏幕尺寸按 1/scale 补偿:缩放后观感恒定', () => {
    const small = recordingCtx()
    drawMarquee(small.ctx, { x: 0, y: 0, w: 4, h: 4 }, { scale: 0.5, resizeHandles: true })
    const big = recordingCtx()
    drawMarquee(big.ctx, { x: 0, y: 0, w: 4, h: 4 }, { scale: 4, resizeHandles: true })

    // 边长 8px × 1/scale
    expect(small.calls.rect[0][2]).toBe(16)
    expect(big.calls.rect[0][2]).toBe(2)
  })

  it('不传 resizeHandles 时不画方块(既有观感不变)', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 2, h: 2 })
    expect(calls.rect).toHaveLength(0)
  })

  it('1×1 选区不画方块:八个手柄会把唯一一格糊满', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 3, y: 3, w: 1, h: 1 }, { resizeHandles: true })
    expect(calls.rect).toHaveLength(0)
  })

  it('细长选区(w=1,h>1)仍然画:只有宽高都为 1 才省略', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 1, h: 5 }, { resizeHandles: true })
    expect(calls.rect).toHaveLength(8)
  })
})

describe('drawMarquee · 吸附高亮(A3)', () => {
  it('x 轴吸附时画一条实线竖边', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 2, h: 2 }, {
      snapEdges: { x: true, y: false },
    })
    expect(calls.strokeStyle).toContain(MARQUEE_SNAP)
    expect(calls.moveTo).toContainEqual([32, 0])
    expect(calls.lineTo).toContainEqual([32, 32])
    // 高亮线是实线:最后一次 setLineDash 是空数组
    expect(calls.setLineDash.at(-1)).toEqual([])
  })

  it('y 轴吸附时画一条实线横边', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 2, h: 2 }, {
      snapEdges: { x: false, y: true },
    })
    expect(calls.moveTo).toContainEqual([0, 32])
    expect(calls.lineTo).toContainEqual([32, 32])
  })

  it('没有吸附时不画高亮线(行为与改造前一致)', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 2, h: 2 }, { snapEdges: { x: false, y: false } })
    expect(calls.strokeStyle).not.toContain(MARQUEE_SNAP)
    expect(calls.moveTo).toHaveLength(0)
  })

  it('不传 snapEdges 时也不画', () => {
    const { ctx, calls } = recordingCtx()
    drawMarquee(ctx, { x: 0, y: 0, w: 2, h: 2 })
    expect(calls.moveTo).toHaveLength(0)
  })
})
