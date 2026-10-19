import { describe, it, expect } from 'vitest'
import { containRect, clientToCanvasPoint } from './pointerMapping'

const rect = (left, top, width, height) => ({ left, top, width, height })

describe('containRect', () => {
  it('宽高比一致时内容铺满元素框', () => {
    const box = containRect(rect(10, 20, 400, 200), 400, 200)
    expect(box).toEqual({ x: 10, y: 20, width: 400, height: 200 })
  })

  it('竖版内容左右居中留白', () => {
    // 348×684 竖版塞进 424×420:高度受限,内容宽 = 420 * 348/684 ≈ 213.7
    const box = containRect(rect(100, 50, 424, 420), 348, 684)
    expect(box.height).toBeCloseTo(420, 5)
    expect(box.width).toBeCloseTo(213.68, 1)
    expect(box.x).toBeCloseTo(100 + (424 - box.width) / 2, 5)
    expect(box.y).toBeCloseTo(50, 5)
  })

  it('横版内容上下居中留白', () => {
    // 684×348 横版塞进 424×420:宽度受限
    const box = containRect(rect(0, 0, 424, 420), 684, 348)
    expect(box.width).toBeCloseTo(424, 5)
    expect(box.height).toBeCloseTo(424 * 348 / 684, 1)
    expect(box.x).toBeCloseTo(0, 5)
    expect(box.y).toBeCloseTo((420 - box.height) / 2, 5)
  })

  it('位图尺寸非法时返回零尺寸', () => {
    expect(containRect(rect(0, 0, 100, 100), 0, 100).width).toBe(0)
    expect(containRect(rect(0, 0, 100, 100), 100, 0).height).toBe(0)
  })
})

describe('clientToCanvasPoint', () => {
  const box = rect(100, 50, 424, 420) // 竖版 348×684 的预览元素

  it('内容中心映射到位图中心', () => {
    const p = clientToCanvasPoint(100 + 212, 50 + 210, box, 348, 684)
    expect(p.x).toBeCloseTo(174, 0)
    expect(p.y).toBeCloseTo(342, 0)
  })

  it('左右留白区返回 null,不会误落到首列/末列', () => {
    // 内容区从 x≈205 开始(左右各留 ~105px),取明显落在留白里的点
    expect(clientToCanvasPoint(100 + 20, 50 + 210, box, 348, 684)).toBeNull()
    expect(clientToCanvasPoint(100 + 404, 50 + 210, box, 348, 684)).toBeNull()
  })

  it('内容左边界内的点落在首列附近', () => {
    const left = 100 + (424 - 213.68) / 2
    const p = clientToCanvasPoint(left + 2, 50 + 210, box, 348, 684)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThan(348 * 0.05)
  })

  it('横版上下留白区返回 null', () => {
    const wide = rect(0, 0, 424, 420) // 684×348
    expect(clientToCanvasPoint(212, 5, wide, 684, 348)).toBeNull()
    const p = clientToCanvasPoint(212, 210, wide, 684, 348)
    expect(p.y).toBeCloseTo(174, 0)
  })

  it('几何退化(元素宽为 0)返回 null', () => {
    expect(clientToCanvasPoint(10, 10, rect(0, 0, 0, 100), 348, 684)).toBeNull()
  })

  it('clamp 模式把留白区/越界点夹到最近边缘(拖框起点用)', () => {
    // 左留白 → x=0;超出右侧 → x=canvasWidth
    expect(clientToCanvasPoint(100 + 20, 50 + 210, box, 348, 684, { clamp: true }).x).toBe(0)
    expect(clientToCanvasPoint(100 + 404, 50 + 210, box, 348, 684, { clamp: true }).x).toBe(348)
    // 上下越界同理
    const p = clientToCanvasPoint(100 + 212, 50 - 30, box, 348, 684, { clamp: true })
    expect(p.y).toBe(0)
    expect(p.x).toBeCloseTo(174, 0)
  })
})
