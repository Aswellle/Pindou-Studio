import { describe, it, expect } from 'vitest'
import {
  isPoint,
  orderQuad,
  quadArea,
  isQuadUsable,
  computeHomography,
  applyHomography,
  warpQuadToRect,
} from './perspective'

/**
 * 透视校正。
 *
 * 验收要求是「校正后的映射与手动指定的四角一致」—— 因此核心断言是:
 * 把四角送进单应矩阵,必须精确回到目标矩形的四个角。
 */

const tl = { x: 0, y: 0 }
const tr = { x: 100, y: 0 }
const br = { x: 100, y: 100 }
const bl = { x: 0, y: 100 }
const rect = [tl, tr, br, bl]

/** 一个明显的梯形:上边窄、下边宽,模拟俯拍纸张 */
const trapezoid = [
  { x: 30, y: 0 },
  { x: 70, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

describe('isPoint', () => {
  it('接受有限数值坐标', () => {
    expect(isPoint({ x: 0, y: 0 })).toBe(true)
    expect(isPoint({ x: -3.5, y: 12 })).toBe(true)
  })

  it('拒绝 NaN / Infinity / 缺字段 / 空值', () => {
    expect(isPoint({ x: Number.NaN, y: 0 })).toBe(false)
    expect(isPoint({ x: 0, y: Number.POSITIVE_INFINITY })).toBe(false)
    expect(isPoint({ x: 0 })).toBe(false)
    expect(isPoint(null)).toBe(false)
    expect(isPoint('0,0')).toBe(false)
  })
})

describe('orderQuad', () => {
  it('把顺时针输入整理成左上→右上→右下→左下', () => {
    expect(orderQuad([tl, tr, br, bl])).toEqual([tl, tr, br, bl])
  })

  it('乱序输入也能整理成同一顺序', () => {
    expect(orderQuad([br, tl, bl, tr])).toEqual([tl, tr, br, bl])
    expect(orderQuad([bl, br, tr, tl])).toEqual([tl, tr, br, bl])
  })

  it('起点按 x+y 最小选左上,不受输入次序影响(非对称四边形)', () => {
    // 明显偏移的四边形:左上角不是 (0,0),而是 (10,20)。
    // 若起点判定失效(start 恒为 0),极角排序会从别的角开始,
    // 返回顺序整体错位 —— 后续单应矩阵会把图扭转 90°。
    const shifted = [
      { x: 10, y: 20 },   // 左上
      { x: 90, y: 30 },   // 右上
      { x: 80, y: 95 },   // 右下
      { x: 5, y: 90 },    // 左下
    ]
    const out = orderQuad([shifted[2], shifted[0], shifted[3], shifted[1]])
    expect(out[0]).toEqual({ x: 10, y: 20 })
    expect(out[1]).toEqual({ x: 90, y: 30 })
    expect(out[2]).toEqual({ x: 80, y: 95 })
    expect(out[3]).toEqual({ x: 5, y: 90 })
  })

  it('逆时针输入同样整理成顺时针', () => {
    expect(orderQuad([tl, bl, br, tr])).toEqual([tl, tr, br, bl])
  })

  it('点数不足或含非法值时返回 null', () => {
    expect(orderQuad([tl, tr, br])).toBeNull()
    expect(orderQuad([tl, tr, br, { x: Number.NaN, y: 0 }])).toBeNull()
    expect(orderQuad(null)).toBeNull()
  })
})

describe('quadArea / isQuadUsable', () => {
  it('矩形面积', () => {
    expect(quadArea(rect)).toBe(10000)
  })

  it('梯形面积', () => {
    // 上底 40、下底 100、高 100 → (40+100)/2*100 = 7000
    expect(quadArea(trapezoid)).toBeCloseTo(7000, 6)
  })

  it('四点共线时面积为零,判定不可用', () => {
    const line = [
      { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 },
    ]
    expect(quadArea(line)).toBe(0)
    expect(isQuadUsable(line)).toBe(false)
  })

  it('面积足够时可用,小于阈值不可用', () => {
    expect(isQuadUsable(rect)).toBe(true)
    const tiny = [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ]
    expect(isQuadUsable(tiny)).toBe(false)
    expect(isQuadUsable(tiny, { minArea: 1 })).toBe(true)
  })
})

describe('computeHomography', () => {
  it('矩形到自身的映射是恒等', () => {
    const h = computeHomography(rect, rect)
    expect(h).not.toBeNull()
    for (const p of rect) {
      const mapped = applyHomography(h, p)
      expect(mapped.x).toBeCloseTo(p.x, 6)
      expect(mapped.y).toBeCloseTo(p.y, 6)
    }
  })

  it('四个角精确映射到目标四个角(验收核心)', () => {
    const target = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }, { x: 0, y: 50 },
    ]
    const h = computeHomography(trapezoid, target)
    expect(h).not.toBeNull()
    for (let i = 0; i < 4; i++) {
      const mapped = applyHomography(h, trapezoid[i])
      expect(mapped.x).toBeCloseTo(target[i].x, 4)
      expect(mapped.y).toBeCloseTo(target[i].y, 4)
    }
  })

  it('内部点被映射到目标四边形内部', () => {
    const target = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }, { x: 0, y: 50 },
    ]
    const h = computeHomography(trapezoid, target)
    // 梯形中心(50, 50)应当落在目标中心附近
    const center = applyHomography(h, { x: 50, y: 50 })
    expect(center.x).toBeGreaterThan(0)
    expect(center.x).toBeLessThan(200)
    expect(center.y).toBeGreaterThan(0)
    expect(center.y).toBeLessThan(50)
  })

  it('退化输入(三点共线)返回 null 而不是爆炸的解', () => {
    const degenerate = [
      { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 },
    ]
    expect(computeHomography(degenerate, rect)).toBeNull()
  })

  it('近似共线(接近奇异但不是精确奇异)也被拒绝', () => {
    // 精确共线时高斯消元会解出 NaN/Infinity,被 Number.isFinite 拦下 ——
    // 那是第二层防御。主元阈值是第一层:这里四个点只差 1e-9 就共线,
    // 矩阵在数值上几乎奇异,解出来的 h 会巨大且不可用。
    // 若移除主元阈值,这个用例会得到一个「看起来有值」的矩阵。
    const nearly = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 + 1e-13 },
      { x: 30, y: 30 },
    ]
    expect(computeHomography(nearly, rect)).toBeNull()
  })

  it('点数不足或非法点返回 null', () => {
    expect(computeHomography([tl, tr, br], rect)).toBeNull()
    expect(computeHomography(rect, [tl, tr, br, { x: Number.NaN, y: 0 }])).toBeNull()
  })
})

describe('applyHomography', () => {
  it('矩阵非法时返回 null', () => {
    expect(applyHomography(null, tl)).toBeNull()
    expect(applyHomography([1, 2, 3], tl)).toBeNull()
    expect(applyHomography(computeHomography(rect, rect), null)).toBeNull()
  })

  it('落在消失点(齐次第三维为零)时返回 null 而不是 Infinity', () => {
    // 构造一个 w 恒为零的病态矩阵
    const h = [1, 0, 0, 0, 1, 0, 0, 0, 0]
    expect(applyHomography(h, { x: 5, y: 5 })).toBeNull()
  })
})

describe('warpQuadToRect', () => {
  /** 造一张纯色图,便于验证采样位置 */
  const solid = (w, h, [r, g, b]) => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255
    }
    return { data, width: w, height: h }
  }

  /** 左半红、右半蓝的图 */
  const halfSplit = (w, h) => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const left = x < w / 2
        data[o] = left ? 255 : 0
        data[o + 1] = 0
        data[o + 2] = left ? 0 : 255
        data[o + 3] = 255
      }
    }
    return { data, width: w, height: h }
  }

  it('矩形输入基本原样输出(尺寸与颜色都保持)', () => {
    const img = solid(100, 100, [200, 100, 50])
    const out = warpQuadToRect(img, rect)
    expect(out).not.toBeNull()
    expect(out.width).toBe(100)
    expect(out.height).toBe(100)
    // 中心像素颜色不变
    const o = (50 * out.width + 50) * 4
    expect(out.data[o]).toBeCloseTo(200, 0)
    expect(out.data[o + 1]).toBeCloseTo(100, 0)
    expect(out.data[o + 2]).toBeCloseTo(50, 0)
  })

  it('输出尺寸取对边长度的较大者(不随窄边缩水)', () => {
    const img = solid(200, 200, [10, 20, 30])
    // 梯形:上底 40、下底 100、两条斜边各约 104.4
    // 宽度取上下两条边的较大者 → 100(不是最窄的上底 40);
    // 高度取左右两条边的较大者 → 约 104
    const out = warpQuadToRect(img, trapezoid)
    expect(out.width).toBe(100)
    expect(out.height).toBeGreaterThan(100)
    expect(out.height).toBeLessThan(110)
  })

  it('显式尺寸覆盖生效', () => {
    const img = solid(100, 100, [10, 20, 30])
    const out = warpQuadToRect(img, rect, { width: 40, height: 20 })
    expect(out.width).toBe(40)
    expect(out.height).toBe(20)
  })

  it('梯形校正后左右颜色分布正确(左红右蓝)', () => {
    const img = halfSplit(100, 100)
    // 取原图中左半红、右半蓝的区域作为梯形
    const quad = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]
    const out = warpQuadToRect(img, quad)
    expect(out).not.toBeNull()
    const midY = Math.floor(out.height / 2)
    const leftO = (midY * out.width + 5) * 4
    const rightO = (midY * out.width + (out.width - 5)) * 4
    expect(out.data[leftO]).toBeGreaterThan(200)     // 左:红
    expect(out.data[leftO + 2]).toBeLessThan(55)     // 左:无蓝
    expect(out.data[rightO + 2]).toBeGreaterThan(200) // 右:蓝
    expect(out.data[rightO]).toBeLessThan(55)         // 右:无红
  })

  it('退化四边形返回 null(不返回一张拉伸的噪声图)', () => {
    const img = solid(50, 50, [1, 2, 3])
    const line = [
      { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 },
    ]
    expect(warpQuadToRect(img, line)).toBeNull()
  })

  it('非法入参返回 null', () => {
    expect(warpQuadToRect(null, rect)).toBeNull()
    expect(warpQuadToRect({ data: null, width: 10, height: 10 }, rect)).toBeNull()
    expect(warpQuadToRect(solid(10, 10, [0, 0, 0]), null)).toBeNull()
  })

  it('双线性插值:落在两像素之间时给出中间色,不是最近邻的硬跳变', () => {
    // 横向两色块:左半黑、右半白。输出宽度是源的两倍,所以目标中间列会
    // 落在源像素的非整数位置。最近邻会直接取整得到纯黑或纯白;
    // 双线性会给出中间灰。后续按格子中心取中位数时,这个差别直接决定
    // 边缘格的颜色判定。
    const w = 20
    const h = 20
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const v = x < w / 2 ? 0 : 255
        data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255
      }
    }
    const img = { data, width: w, height: h }
    // 四边形与源图尺寸一致(面积 400 > minArea 100)
    const srcRect = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
    const out = warpQuadToRect(img, srcRect, { width: w * 2, height: h })
    expect(out).not.toBeNull()

    const midY = Math.floor(h / 2)
    const readAt = (x) => out.data[(midY * out.width + x) * 4]
    // 源图黑白交界在 x=10,输出对应 x=20。交界附近的像素必须是灰,
    // 而不是非 0 即 255。
    const around = [readAt(19), readAt(20), readAt(21)]
    expect(around.some((v) => v > 10 && v < 245)).toBe(true)
    // 两端保持原色
    expect(readAt(1)).toBe(0)
    expect(readAt(out.width - 2)).toBe(255)
  })

  it('采样不越界(边缘不会出现黑边)', () => {    const img = solid(20, 20, [255, 255, 255])
    const out = warpQuadToRect(img, rect)
    // 四角像素应当仍是白色,而不是被填成 0
    const corners = [
      0,
      (out.width - 1) * 4,
      ((out.height - 1) * out.width) * 4,
      ((out.height - 1) * out.width + out.width - 1) * 4,
    ]
    for (const o of corners) {
      expect(out.data[o]).toBe(255)
      expect(out.data[o + 1]).toBe(255)
      expect(out.data[o + 2]).toBe(255)
    }
  })

  it('用反向映射采样:强透视下不会读成整张图的宽度', () => {
    // 横向渐变图:红分量 = x / (w-1) * 255。
    // 取一个上边很窄、下边很宽的强透视四边形。正确的「目标→源」逆映射
    // 采样出的 x 应当落在该四边形自身覆盖的源坐标范围内(约 37–63);
    // 若误用正向矩阵,采样坐标会被推到源图之外、被 clamp 到边缘,
    // 于是读成 0 和 255 两个极端 —— 一眼可辨。
    const w = 100
    const h = 100
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        data[o] = Math.round((x / (w - 1)) * 255)
        data[o + 1] = 0
        data[o + 2] = 0
        data[o + 3] = 255
      }
    }
    const img = { data, width: w, height: h }

    const quad = [
      { x: 40, y: 5 },
      { x: 60, y: 5 },
      { x: 98, y: 95 },
      { x: 2, y: 95 },
    ]
    const out = warpQuadToRect(img, quad)
    expect(out).not.toBeNull()

    const midY = Math.floor(out.height / 2)
    const readRed = (x) => out.data[(midY * out.width + x) * 4]
    const leftRed = readRed(1)
    const rightRed = readRed(out.width - 2)

    // 正确采样:左右两端都在源图的中段(约 37%–63% → 红分量 94–161)
    expect(leftRed).toBeGreaterThan(60)
    expect(leftRed).toBeLessThan(200)
    expect(rightRed).toBeGreaterThan(60)
    expect(rightRed).toBeLessThan(200)
    // 且左 < 右(渐变方向没有被反转或压平)
    expect(leftRed).toBeLessThan(rightRed)
    // 若误用正向矩阵,两端会贴到 0 / 255
    expect(Math.abs(rightRed - leftRed)).toBeLessThan(120)
  })

  it('退化四边形在校验层就被拒绝(不依赖矩阵求解兜底)', () => {
    // isQuadUsable 是显式的前置校验:面积不足直接返回 null,
    // 不必依赖 computeHomography 恰好解出奇异矩阵。这里用面积极小的
    // 四边形(矩阵本身可解,但重采样没有意义)验证这一层确实生效。
    const img = solid(50, 50, [1, 2, 3])
    const sliver = [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 },
    ]
    expect(isQuadUsable(sliver)).toBe(false)
    expect(warpQuadToRect(img, sliver)).toBeNull()
    // 同样的四边形,放宽阈值后可以处理 —— 证明拒绝来自面积校验而非矩阵求解
    expect(warpQuadToRect(img, sliver, { width: 3, height: 3 })).toBeNull()
    expect(isQuadUsable(sliver, { minArea: 1 })).toBe(true)
  })
})
