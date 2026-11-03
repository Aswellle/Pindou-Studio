import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * IroningEffectRenderer 契约测试(07 文档 §4)。
 *
 * jsdom 没有 canvas 实现,这里用「录制式 mock」:拦截 document.createElement('canvas')
 * 与全局 Path2D,把 2D 上下文的全部调用按序记录进 ops 数组 ——
 * 确定性测试对比两次渲染的调用序列哈希,而不是截图像素(像素级验证由
 * scripts/verify-ironing.mjs 在 Node + @napi-rs/canvas 下完成)。
 */

vi.mock('../BeadPatternExporter', () => ({
  createScaledCanvas: vi.fn(),
}))

import {
  renderIroningEffect,
  computeIroningGeometry,
  __resetIroningTileCacheForTests,
} from './IroningEffectRenderer'
import { createScaledCanvas } from '../BeadPatternExporter'
import { getIroningEffectPreset } from './ironingEffectPresets'

// ── 录制基础设施 ────────────────────────────────────────────

const ops = []
// 纹理 tile 画布上的绘制序列(与主画布分开录制,用于跨倍率一致性断言)
const tileOps = []

const CTX_METHODS = [
  'scale',
  'fillRect',
  'save',
  'restore',
  'clip',
  'stroke',
  'fill',
  'beginPath',
  'moveTo',
  'lineTo',
  'arc',
  'arcTo',
  'closePath',
  'drawImage',
]
const CTX_PROPS = [
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'globalAlpha',
  'shadowColor',
  'shadowBlur',
  'shadowOffsetY',
  'lineCap',
]

/** 对象参数(canvas/Path2D)序列化为 [width, height] 形状,保证可比较 */
function normalizeArg(a) {
  if (a && typeof a === 'object') return [a.width ?? null, a.height ?? null]
  return a
}

function makeCtx(sink = ops) {
  const ctx = {}
  for (const m of CTX_METHODS) {
    ctx[m] = vi.fn((...args) => sink.push([m, ...args.map(normalizeArg)]))
  }
  ctx.createLinearGradient = vi.fn((...args) => {
    sink.push(['createLinearGradient', ...args])
    return {
      addColorStop: vi.fn((...a) => sink.push(['addColorStop', ...a])),
    }
  })
  for (const p of CTX_PROPS) {
    let v
    Object.defineProperty(ctx, p, {
      get: () => v,
      set: nv => {
        v = nv
        sink.push([`set:${p}`, nv])
      },
    })
  }
  return ctx
}

function makeBlob() {
  return new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' })
}

function makeCanvas(width = 0, height = 0, sink = ops) {
  return {
    width,
    height,
    getContext: vi.fn(() => makeCtx(sink)),
    toBlob: vi.fn(cb => cb(makeBlob())),
  }
}

class FakePath2D {
  moveTo(...a) {
    ops.push(['path.moveTo', ...a])
  }
  lineTo(...a) {
    ops.push(['path.lineTo', ...a])
  }
  arcTo(...a) {
    ops.push(['path.arcTo', ...a])
  }
  arc(...a) {
    ops.push(['path.arc', ...a])
  }
  closePath() {
    ops.push(['path.closePath'])
  }
}

let createElementSpy
const originalCreateElement = document.createElement.bind(document)

// ── 文档夹具 ────────────────────────────────────────────────

function makeDoc(width, height, fillFn = null) {
  const cells = []
  for (let y = 0; y < height; y++) {
    const row = []
    for (let x = 0; x < width; x++) row.push(fillFn ? fillFn(x, y) : null)
    cells.push(row)
  }
  return {
    version: 2,
    metadata: { name: '测试作品' },
    grid: { width, height, cells },
    palette: { colors: [] },
    stats: {},
    style: { beadStyle: 'cute' },
    layout: null,
  }
}

const solid = hex => () => hex

beforeEach(() => {
  __resetIroningTileCacheForTests()
  ops.length = 0
  tileOps.length = 0
  createScaledCanvas.mockReset().mockImplementation((w, h, s) => ({
    canvas: makeCanvas(Math.round(w * s), Math.round(h * s)),
    scale: s,
  }))
  createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(tag => {
    // 主画布走 createScaledCanvas mock;document.createElement 只用于纹理 tile
    if (tag === 'canvas') return makeCanvas(0, 0, tileOps)
    return originalCreateElement(tag)
  })
  vi.stubGlobal('Path2D', FakePath2D)
})

afterEach(() => {
  createElementSpy.mockRestore()
  vi.unstubAllGlobals()
})

async function render(doc, presetId = 'linen', extra = {}) {
  return renderIroningEffect(doc, { presetId, mode: 'preview', ...extra })
}

// ── 几何 ────────────────────────────────────────────────────

describe('computeIroningGeometry · 样片几何', () => {
  it('export 模式:cellSize 固定 20,质量预设映射 3×/6×/8× 请求倍率', () => {
    const grid = { width: 29, height: 20 }
    expect(computeIroningGeometry(grid, { mode: 'export', quality: 'screen' })).toMatchObject({
      cellSize: 20,
      requestedScale: 3,
      width: 29 * 20 + 80,
      height: 20 * 20 + 80,
    })
    expect(computeIroningGeometry(grid, { mode: 'export', quality: 'high' }).requestedScale).toBe(6)
    expect(computeIroningGeometry(grid, { mode: 'export', quality: 'print' }).requestedScale).toBe(8)
  })

  it('未知质量回退 screen 档', () => {
    const grid = { width: 10, height: 10 }
    expect(computeIroningGeometry(grid, { mode: 'export', quality: 'ultra' }).requestedScale).toBe(3)
  })

  it('preview 模式:固定 1×,cellSize clamp 在 3–12', () => {
    // 29 格 → fit = 960/33 = 29 → clamp 到 12
    expect(computeIroningGeometry({ width: 29, height: 29 }, { mode: 'preview' })).toMatchObject({
      cellSize: 12,
      requestedScale: 1,
    })
    // 140 格 → fit = floor(960/144) = 6
    expect(computeIroningGeometry({ width: 140, height: 140 }, { mode: 'preview' }).cellSize).toBe(6)
    // 400 格 → fit = 2 → 下限 3
    expect(computeIroningGeometry({ width: 400, height: 400 }, { mode: 'preview' }).cellSize).toBe(3)
    // 小图纸 → 上限 12
    expect(computeIroningGeometry({ width: 5, height: 5 }, { mode: 'preview' }).cellSize).toBe(12)
  })

  it('宽高比始终与图纸一致(四周等宽留白)', () => {
    const grid = { width: 2, height: 4 }
    const geo = computeIroningGeometry(grid, { mode: 'export' })
    expect(geo.boardW / geo.boardH).toBeCloseTo(0.5, 10)
    expect(geo.pad).toBe(40)
    expect(geo.width).toBe(geo.boardW + geo.pad * 2)
    expect(geo.height).toBe(geo.boardH + geo.pad * 2)
  })
})

// ── 输入校验与只读性 ────────────────────────────────────────

describe('renderIroningEffect · 输入校验', () => {
  it('拒绝非 v2 文档与非法网格,不创建画布', async () => {
    await expect(renderIroningEffect(null)).rejects.toThrow(/version/i)
    await expect(renderIroningEffect({ version: 1 })).rejects.toThrow(/version/i)
    await expect(
      renderIroningEffect({ version: 2, grid: { width: 0, height: 3, cells: [] } })
    ).rejects.toThrow(/grid/i)
    await expect(renderIroningEffect({ version: 2, grid: { width: 3, height: 3 } })).rejects.toThrow(/grid/i)
    expect(createScaledCanvas).not.toHaveBeenCalled()
  })

  it('渲染过程不修改输入文档(只读契约)', async () => {
    const doc = makeDoc(2, 2, solid('#FF0000'))
    const snapshot = JSON.stringify(doc)
    await render(doc)
    expect(JSON.stringify(doc)).toBe(snapshot)
    expect(doc.grid.cells).toHaveLength(2)
    expect(doc.grid.cells[0][0]).toBe('#FF0000')
  })

  it('完全不读取 style.beadStyle —— professional 与 cute 产出逐字节一致的调用序列', async () => {
    const cute = makeDoc(3, 3, solid('#3366CC'))
    const pro = makeDoc(3, 3, solid('#3366CC'))
    pro.style.beadStyle = 'professional'
    await render(cute)
    const cuteLog = JSON.stringify(ops)
    ops.length = 0
    __resetIroningTileCacheForTests() // 两次都重建 tile,对比才公平
    await render(pro)
    expect(JSON.stringify(ops)).toBe(cuteLog)
  })
})

// ── 确定性与材质区分 ────────────────────────────────────────

describe('renderIroningEffect · 确定性', () => {
  it('同图纸 + 同预设两次渲染,调用序列完全一致', async () => {
    const doc = makeDoc(6, 4, (x, y) =>
      (x + y) % 3 === 0 ? '#E53935' : (x * y) % 5 === 0 ? '#1E88E5' : null
    )
    const { width: w1, height: h1 } = await render(doc)
    const firstLog = JSON.stringify(ops)
    ops.length = 0
    __resetIroningTileCacheForTests() // 排除缓存命中带来的调用差异
    const second = await render(doc)
    expect(JSON.stringify(ops)).toBe(firstLog)
    expect(second.width).toBe(w1)
    expect(second.height).toBe(h1)
  })

  it('六种预设的调用序列两两不同(不允许只换底色)', async () => {
    const doc = makeDoc(8, 8, (x, y) => (x % 2 === y % 2 ? '#FFFFFF' : '#333333'))
    const logs = new Set()
    for (const presetId of ['no-hole', 'linen', 'towel', 'bath-mesh', 'fine-glitter', 'coarse-glitter']) {
      ops.length = 0
      await render(doc, presetId)
      logs.add(JSON.stringify(ops))
    }
    expect(logs.size).toBe(6)
  })

  it('纹理按逻辑像素生成:preview 与 export 的 tile 绘制序列一致(与倍率无关)', async () => {
    const doc = makeDoc(4, 4, solid('#3366CC'))
    await render(doc) // preview 1×
    const previewTileOps = JSON.stringify(tileOps.filter(([op]) => op !== 'scale'))
    tileOps.length = 0
    __resetIroningTileCacheForTests()
    await renderIroningEffect(doc, { presetId: 'linen', mode: 'export', quality: 'screen' })
    // 生成器内部坐标不随倍率变化,唯一差异是 tile 上下文自身的 scale
    expect(tileOps[0]).toEqual(['scale', 3, 3])
    expect(JSON.stringify(tileOps.filter(([op]) => op !== 'scale'))).toBe(previewTileOps)
  })

  it('未知 presetId 确定性回退 linen', async () => {
    const doc = makeDoc(4, 4, solid('#00AA88'))
    await render(doc, 'does-not-exist')
    const fallbackLog = JSON.stringify(ops)
    ops.length = 0
    __resetIroningTileCacheForTests()
    await render(doc, 'linen')
    expect(JSON.stringify(ops)).toBe(fallbackLog)
  })
})

// ── 绘制行为 ────────────────────────────────────────────────

describe('renderIroningEffect · 绘制行为', () => {
  it('只绘制合法 HEX 色块;null 与脏值视为空(露出底纹)', async () => {
    const doc = makeDoc(2, 2)
    doc.grid.cells = [
      ['#FF0000', 'nope'],
      [null, '#00FF00'],
    ]
    await render(doc)
    const fillCalls = ops.filter(([op]) => op === 'fill')
    // 底板 1 次 + 两个合法色块
    expect(fillCalls).toHaveLength(3)
  })

  it('edgeRadius 参与方块圆角计算(预设参数不再无消费)', async () => {
    const doc = makeDoc(1, 1, solid('#3366CC'))
    await render(doc, 'linen')
    const radii = ops.filter(([op]) => op === 'path.arcTo').map(entry => entry[5])
    expect(radii).toHaveLength(4) // 圆角矩形的四个角
    // 1×1 预览 cellSize 为 12;圆角半径由 edgeRadius 推导
    const expected = Math.max(0.5, 12 * (0.05 + getIroningEffectPreset('linen').edgeRadius * 0.2))
    for (const r of radii) expect(r).toBeCloseTo(expected, 5)
  })

  it('全空图纸也能渲染(只有底板,无色块)', async () => {
    const doc = makeDoc(3, 2)
    const result = await render(doc)
    expect(result.blob).toBeInstanceOf(Blob)
    expect(ops.filter(([op]) => op === 'fill')).toHaveLength(1)
  })

  it('回报实际分辨率与倍率,返回 Blob 与尺寸', async () => {
    const doc = makeDoc(4, 3, solid('#3366CC'))
    const onResolution = vi.fn()
    const onScale = vi.fn()
    const onProgress = vi.fn()
    const result = await render(doc, 'linen', { onResolution, onScale, onProgress })
    // 4×3 预览:cellSize 12、pad 24 → 画布 96×84,固定 1×
    expect(onResolution).toHaveBeenCalledWith(96, 84)
    expect(onScale).toHaveBeenCalledWith(1, 1)
    expect(result).toMatchObject({ width: 96, height: 84, actualScale: 1, requestedScale: 1 })
    expect(result.blob.type).toBe('image/png')
    expect(onProgress.mock.calls.length).toBeGreaterThan(0)
    expect(onProgress.mock.calls[0][0]).toBeLessThanOrEqual(onProgress.mock.calls.at(-1)[0])
  })

  it('export 模式把质量映射为请求倍率传给 createScaledCanvas', async () => {
    const doc = makeDoc(10, 8, solid('#3366CC'))
    await renderIroningEffect(doc, { presetId: 'linen', mode: 'export', quality: 'high' })
    expect(createScaledCanvas).toHaveBeenCalledWith(10 * 20 + 80, 8 * 20 + 80, 6)
  })

  it('tile 缓存生效:同一图纸连续渲染两次,第二次不再新建纹理画布', async () => {
    const doc = makeDoc(4, 4, solid('#3366CC'))
    await render(doc)
    const firstTileCanvases = createElementSpy.mock.calls.filter(([tag]) => tag === 'canvas').length
    expect(firstTileCanvases).toBe(2)
    await render(doc)
    const totalTileCanvases = createElementSpy.mock.calls.filter(([tag]) => tag === 'canvas').length
    expect(totalTileCanvases).toBe(2)
  })
})

// ── 取消语义 ────────────────────────────────────────────────

describe('renderIroningEffect · AbortSignal', () => {
  it('启动前已取消:立即以 AbortError 拒绝,不创建画布', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      renderIroningEffect(makeDoc(3, 3, solid('#3366CC')), { mode: 'preview', signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(createScaledCanvas).not.toHaveBeenCalled()
  })

  it('绘制中途取消(通过 onProgress 钩子触发):以 AbortError 拒绝', async () => {
    const controller = new AbortController()
    const onProgress = vi.fn(p => {
      if (p >= 0.5) controller.abort()
    })
    const doc = makeDoc(50, 50, solid('#3366CC')) // 2500 格,触发分帧
    await expect(
      renderIroningEffect(doc, { mode: 'preview', signal: controller.signal, onProgress })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('PNG 编码期间取消:编码完成后仍以 AbortError 拒绝,不返回 blob', async () => {
    const controller = new AbortController()
    let pendingCallback = null
    createScaledCanvas.mockImplementationOnce((w, h, s) => {
      const canvas = makeCanvas(Math.round(w * s), Math.round(h * s))
      canvas.toBlob = vi.fn(cb => {
        pendingCallback = cb // 挂起编码,模拟大画布 toBlob 耗时
      })
      return { canvas, scale: s }
    })
    const promise = renderIroningEffect(makeDoc(4, 4, solid('#3366CC')), {
      mode: 'preview',
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(pendingCallback).toBeTruthy())
    controller.abort()
    pendingCallback(makeBlob()) // 编码在取消之后才完成
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
