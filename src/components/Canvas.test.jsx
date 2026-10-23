import { render, fireEvent } from '@testing-library/react'
import Canvas from './Canvas'
import { createLassoSelection } from '../utils/lassoSelection'

// Canvas only needs t() from react-i18next; no need to load the real i18n instance.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

/**
 * Regression tests for the two-layer canvas wiring (base + overlay refs).
 *
 * Context: commit 14cbdd4 renamed the painter's ref callbacks
 * (`canvasRefCallback` → `baseRefCallback` / `overlayRefCallback`) inside
 * useCanvasPainter.js but did NOT update Canvas.jsx, which still passed
 * `ref={painter.canvasRefCallback}` (undefined). The refs never attached, so
 * the base layer never painted (no grid) and getGridPos/isOverCanvas read
 * `painter.baseRef.current` as null, rejecting every click (no bead fill).
 * The hook's own tests passed because they test the hook in isolation — only a
 * component-level test can pin the wiring contract.
 */

// jsdom does not implement canvas 2d context, and reports 0×0 rects (no
// layout). Install a recording mock for both so a rendered <Canvas> behaves
// like a real 48×48 px canvas (3×3 grid, scale 1): a click at (24,24) maps to
// cell (1,1).
function installCanvasMocks(hooks = {}) {
  const calls = { fillRect: [], stroke: 0, moveTo: [], lineTo: [], clearRect: [], setLineDash: [], arc: [], strokeRect: [], rect: [], strokeStyle: [] }
  // strokeStyle 必须走 setter 记录:吸附高亮线靠换色来区分,
  // 只存最后一次赋值看不出「画过高亮」。
  let strokeStyleValue = '#000000'
  const ctx = {
    fillStyle: '#000000',
    get strokeStyle() { return strokeStyleValue },
    set strokeStyle(v) { strokeStyleValue = v; calls.strokeStyle.push(v) },
    lineWidth: 1,
    lineDashOffset: 0,
    fillRect: (x, y, w, h) => calls.fillRect.push({ x, y, w, h }),
    strokeRect: (x, y, w, h) => calls.strokeRect.push({ x, y, w, h }),
    // resize 手柄画成方块(A1)
    rect: (x, y, w, h) => calls.rect.push({ x, y, w, h }),
    beginPath: () => {},
    closePath: () => {},
    moveTo: (x, y) => calls.moveTo.push({ x, y }),
    lineTo: (x, y) => calls.lineTo.push({ x, y }),
    stroke: () => { calls.stroke++ },
    clearRect: (x, y, w, h) => calls.clearRect.push({ x, y, w, h }),
    // 选区选框绘制用到:虚线状态与图层保存/恢复
    save: () => {},
    restore: () => {},
    setLineDash: (segments) => calls.setLineDash.push(segments),
    // 触屏选区四角把手(pointer: coarse 时才调用)
    arc: (x, y, r) => { calls.arc.push({ x, y, r }); hooks.arc?.(x, y, r) },
    fill: () => { hooks.fill?.() },
  }
  const origGetContext = HTMLCanvasElement.prototype.getContext
  const origGetRect = HTMLCanvasElement.prototype.getBoundingClientRect
  HTMLCanvasElement.prototype.getContext = () => ctx
  HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 48, bottom: 48, width: 48, height: 48, x: 0, y: 0, toJSON: () => ({}) })
  return {
    calls,
    restore() {
      HTMLCanvasElement.prototype.getContext = origGetContext
      HTMLCanvasElement.prototype.getBoundingClientRect = origGetRect
    },
  }
}

function blankGrid(size) {
  return Array(size).fill(null).map(() => Array(size).fill(null))
}

describe('Canvas grid rendering + click-to-fill wiring', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderCanvas(overrides = {}) {
    const onCanvasChange = vi.fn()
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'pencil',
      committedData: blankGrid(3),
      onCanvasChange,
      ...overrides,
    }
    const view = render(<Canvas {...props} />)
    return { ...view, onCanvasChange }
  }

  test('mounts and paints the grid on the base canvas layer (base ref attached)', () => {
    renderCanvas()

    // 网格线合并为纵/横两条路径:attach + 数据 effect 各 2 次 stroke,共 ≥4
    // (线条数量不变,moveTo/lineTo 仍为每条线一对;回归曾因 baseRef 未 attach 为 0)
    expect(mock.calls.stroke).toBeGreaterThanOrEqual(4)
    // The white background fill covers the whole base canvas.
    expect(mock.calls.fillRect[0]).toEqual({ x: 0, y: 0, w: 48, h: 48 })
    // Line coordinates must be real multiples of the cell size (0/16/32/48),
    // not NaN — this catches the caller passing `CELL_SIZE` as the property
    // name while the hook destructures `cellSize` (undefined → NaN coords).
    const xs = mock.calls.moveTo.map(({ x }) => x)
    const ys = mock.calls.moveTo.map(({ y }) => y)
    expect(xs.concat(ys).filter(Number.isFinite)).toHaveLength(mock.calls.moveTo.length * 2)
    expect(xs).toEqual(expect.arrayContaining([0, 16, 32, 48]))
    expect(ys).toEqual(expect.arrayContaining([0, 16, 32, 48]))
  })

  test('clicking a cell paints the overlay cell and commits the stroke', () => {
    const { container, onCanvasChange } = renderCanvas()
    const canvasContainer = container.querySelector('.canvas-container')

    fireEvent.mouseDown(canvasContainer, { clientX: 24, clientY: 24 })
    // Cell (1,1) painted on the overlay immediately on mousedown.
    expect(mock.calls.fillRect).toContainEqual({ x: 16, y: 16, w: 16, h: 16 })

    fireEvent.mouseUp(canvasContainer, { clientX: 24, clientY: 24 })
    // Commit: overlay cleared, stroke handed to App via onCanvasChange.
    expect(mock.calls.clearRect.length).toBeGreaterThan(0)
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    const committed = onCanvasChange.mock.calls[0][0]
    expect(committed[1][1]).toBe('#ff0000')
  })

  // 触控:pinch 缩放时有一根手指抬起后,剩余手指的抬起不得被当作点按填色。
  // 回归背景:2→1 切换时 touchEnd 会把剩余手指重登记为单指起点,
  // 最后一指抬起时命中"单指点击"分支而填色(真实业务只允许单指起落填色)。
  test('pinch zoom does not fill a cell when one finger lifts and the last one lifts', () => {
    const { container, onCanvasChange } = renderCanvas()
    const canvasContainer = container.querySelector('.canvas-container')

    // 双指落下 → 开始 pinch
    fireEvent.touchStart(canvasContainer, {
      touches: [
        { clientX: 16, clientY: 24, identifier: 0 },
        { clientX: 32, clientY: 24, identifier: 1 },
      ],
    })
    // 双指张开 → 缩放
    fireEvent.touchMove(canvasContainer, {
      touches: [
        { clientX: 8, clientY: 24, identifier: 0 },
        { clientX: 40, clientY: 24, identifier: 1 },
      ],
    })
    // 一根手指抬起(剩余一根落在格子上)
    fireEvent.touchEnd(canvasContainer, {
      touches: [{ clientX: 24, clientY: 24, identifier: 1 }],
    })
    // 最后一根手指抬起
    fireEvent.touchEnd(canvasContainer, { touches: [] })

    // pinch 后的手指抬起不得触发填色/提交
    expect(onCanvasChange).not.toHaveBeenCalled()
    const cellFills = mock.calls.fillRect.filter(r => r.x === 16 && r.y === 16 && r.w === 16 && r.h === 16)
    expect(cellFills).toHaveLength(0)
  })

  // 正向对照:普通单指点按仍要填色(防误伤)
  test('single-finger tap on a cell still fills', () => {
    const { container, onCanvasChange } = renderCanvas()
    const canvasContainer = container.querySelector('.canvas-container')

    fireEvent.touchStart(canvasContainer, {
      touches: [{ clientX: 24, clientY: 24, identifier: 0 }],
    })
    fireEvent.touchEnd(canvasContainer, { touches: [] })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0][1][1]).toBe('#ff0000')
  })
})

/**
 * M5:矩形选区与取色器。
 * 3×3 网格、单元格 16px、scale 1 → clientX 0..48 映射到 0..2 列。
 */
describe('Canvas 选区与取色(M5)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderWith(overrides = {}) {
    const onCanvasChange = vi.fn()
    const onSelectionChange = vi.fn()
    const onPickColor = vi.fn()
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'select',
      committedData: blankGrid(3),
      onCanvasChange,
      onSelectionChange,
      onPickColor,
      // 这组测的是选区几何与取色,不是吸附(A3 有独立用例)
      snapToEdges: false,
      ...overrides,
    }
    const view = render(<Canvas {...props} />)
    return { ...view, onCanvasChange, onSelectionChange, onPickColor }
  }

  test('拖选生成规范矩形(反向拖动也得到左上角 + 宽高)', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    // (2,2) → (0,1):从右下往左上拖
    fireEvent.mouseDown(c, { clientX: 40, clientY: 40 })
    fireEvent.mouseMove(c, { clientX: 8, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 8, clientY: 24 })

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last).toEqual({ x: 0, y: 1, w: 3, h: 2 })
    // 选区工具不得写入画布
    expect(mock.calls.fillRect.filter(r => r.x === 8 && r.y === 24)).toHaveLength(0)
  })

  test('单击(未拖动)取消选区', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionChange).toHaveBeenLastCalledWith(null)
  })

  test('选区工具按下时先清空旧选区,再随拖动更新', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    expect(onSelectionChange).toHaveBeenNthCalledWith(1, null)
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })
    fireEvent.mouseUp(c, { clientX: 40, clientY: 40 })

    expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 3, h: 3 })
  })

  test('取色器读取该格颜色,不写入画布', () => {
    const data = blankGrid(3)
    data[1][2] = '#123456'
    const { container, onPickColor, onCanvasChange } = renderWith({
      tool: 'eyedropper',
      committedData: data,
    })
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 40, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 40, clientY: 24 })

    expect(onPickColor).toHaveBeenCalledWith('#123456')
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('取色器点到空白格不改变当前颜色', () => {
    const { container, onPickColor } = renderWith({ tool: 'eyedropper' })
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onPickColor).not.toHaveBeenCalled()
  })

  test('触屏拖选同样生成矩形,且不触发填色', () => {
    const { container, onSelectionChange, onCanvasChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 8, clientY: 8, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 40, clientY: 24, identifier: 0 }] })
    fireEvent.touchEnd(c, { touches: [] })

    expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 3, h: 2 })
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('传入的选区在画布 HUD 上显示宽高', () => {
    const { container } = renderWith({ selection: { x: 1, y: 1, w: 2, h: 1 } })
    expect(container.querySelector('[data-testid="selection-size"]').textContent).toBe('2 × 1')
    // 选框以虚线绘制,而不是实线
    expect(mock.calls.setLineDash.length).toBeGreaterThan(0)
  })
})

/**
 * A5:自由套索。
 *
 * 验收要点之一是「矩形选区行为零回归」—— 套索走的是独立工具(lasso),
 * 下面第一组用例专门盯住 select 的行为没有被动过。
 */
describe('Canvas 自由套索(A5)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderWith(overrides = {}) {
    const onCanvasChange = vi.fn()
    const onSelectionChange = vi.fn()
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'lasso',
      committedData: blankGrid(3),
      onCanvasChange,
      onSelectionChange,
      snapToEdges: false,
      ...overrides,
    }
    const view = render(<Canvas {...props} />)
    return { ...view, onCanvasChange, onSelectionChange }
  }

  /** 绕一圈回到起点,形成闭合轨迹 */
  function drawLoop(c, points) {
    fireEvent.mouseDown(c, { clientX: points[0][0], clientY: points[0][1] })
    for (let i = 1; i < points.length; i++) {
      fireEvent.mouseMove(c, { clientX: points[i][0], clientY: points[i][1] })
    }
    const last = points[points.length - 1]
    fireEvent.mouseUp(c, { clientX: last[0], clientY: last[1] })
  }

  test('拖出闭合轨迹后得到掩码选区(kind=lasso)', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    // 覆盖 (0,0)-(1,1) 这一小块
    drawLoop(c, [[2, 2], [30, 2], [30, 30], [2, 30], [2, 2]])

    const sel = onSelectionChange.mock.calls.at(-1)[0]
    expect(sel).not.toBeNull()
    expect(sel.kind).toBe('lasso')
    expect(sel.mask).toBeInstanceOf(Uint8Array)
    expect(sel.cols).toBe(3)
    expect(sel.rows).toBe(3)
    // (0,0) 在圈内
    expect(sel.mask[0]).toBe(1)
  })

  test('轨迹不足三点(单击)不产生选区', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionChange).toHaveBeenLastCalledWith(null)
  })

  test('套索不写入画布(它只是选区工具)', () => {
    const { container, onCanvasChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    drawLoop(c, [[2, 2], [30, 2], [30, 30], [2, 30], [2, 2]])
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('套索按下时清空旧选区', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 2, clientY: 2 })
    expect(onSelectionChange).toHaveBeenNthCalledWith(1, null)
  })

  test('触屏拖出轨迹同样生成掩码选区', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 2, clientY: 2, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 30, clientY: 2, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 30, clientY: 30, identifier: 0 }] })
    fireEvent.touchEnd(c, { touches: [] })

    const sel = onSelectionChange.mock.calls.at(-1)[0]
    expect(sel?.kind).toBe('lasso')
  })

  test('套索选区在 HUD 上显示格子数而不是外接矩形宽高', () => {
    const sel = createLassoSelection(
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }],
      3, 3,
    )
    const { container } = renderWith({ selection: sel })
    const hud = container.querySelector('[data-testid="lasso-size"]')
    expect(hud).not.toBeNull()
    // 2×2 = 4 格
    expect(hud.textContent).toContain('4')
    // 矩形尺寸的 HUD 不出现
    expect(container.querySelector('[data-testid="selection-size"]')).toBeNull()
  })
})

describe('Canvas 矩形选区零回归(A5 前置保证)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderWith(overrides = {}) {
    const onSelectionChange = vi.fn()
    const onCanvasChange = vi.fn()
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'select',
      committedData: blankGrid(3),
      onCanvasChange,
      onSelectionChange,
      snapToEdges: false,
      ...overrides,
    }
    const view = render(<Canvas {...props} />)
    return { ...view, onSelectionChange, onCanvasChange }
  }

  test('select 工具产出的仍是纯矩形(没有 kind 字段)', () => {
    const { container, onSelectionChange } = renderWith()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })
    fireEvent.mouseUp(c, { clientX: 40, clientY: 40 })

    const sel = onSelectionChange.mock.calls.at(-1)[0]
    // 套索的 kind 标记绝不能漏到矩形路径上 —— 否则 App 会按 lasso 分派,
    // 把矩形选区当成掩码处理
    expect(sel).not.toHaveProperty('kind')
    expect(sel).not.toHaveProperty('mask')
    expect(sel).toEqual({ x: 0, y: 0, w: 3, h: 3 })
  })

  test('select 工具仍以矩形描边绘制选框(不是逐格轮廓)', () => {
    const { container } = renderWith({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    // 矩形路径用 strokeRect 一次画完;套索是逐段 moveTo/lineTo
    expect(mock.calls.strokeRect.length).toBeGreaterThan(0)
    expect(container.querySelector('[data-testid="lasso-size"]')).toBeNull()
  })
})

/**
 * 规格 04 §8:缩放 0.3× / 1× / 5× 下,点击与拖选必须落在同一网格单元。
 *
 * 浏览器的 getBoundingClientRect 已经把 CSS transform 的 scale 折算进
 * 显示尺寸,所以「屏幕坐标 → 网格坐标」只需用 rect 宽高比换算。这里用
 * 按 scale 缩放的 rect 模拟三种缩放级别,断言同一相对落点映射到同一格。
 */
describe('Canvas 缩放下的坐标正确性(规格 04 §8)', () => {
  let mock
  const CELL = 16
  const COLS = 4
  const ROWS = 3
  const BASE_W = COLS * CELL // 64
  const BASE_H = ROWS * CELL // 48

  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  /** 把 base canvas 的显示矩形设为「按 scale 缩放后的尺寸」 */
  function installScaledRect(scale) {
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
        left: 0, top: 0,
        right: BASE_W * scale, bottom: BASE_H * scale,
        width: BASE_W * scale, height: BASE_H * scale,
        x: 0, y: 0, toJSON: () => ({}),
      })
  }

  function renderAt(scale, overrides = {}) {
    const onCanvasChange = vi.fn()
    const onSelectionChange = vi.fn()
    const onPickColor = vi.fn()
    const view = render(
      <Canvas
        gridSize={COLS}
        gridWidth={COLS}
        gridHeight={ROWS}
        selectedColor="#ff0000"
        tool="pencil"
        committedData={blankGrid(ROWS).map(() => Array(COLS).fill(null))}
        onCanvasChange={onCanvasChange}
        onSelectionChange={onSelectionChange}
        onPickColor={onPickColor}
        // 空白画布本来就没有边界可吸,显式关掉以免日后加数据时意外被吸附影响
        snapToEdges={false}
        {...overrides}
      />
    )
    return { ...view, onCanvasChange, onSelectionChange, onPickColor, scale }
  }

  /** 某格中心在屏幕上的坐标(按当前 scale 折算) */
  const cellCenter = (x, y, scale) => ({
    clientX: (x + 0.5) * CELL * scale,
    clientY: (y + 0.5) * CELL * scale,
  })

  for (const scale of [0.3, 1, 5]) {
    test(`${scale}× 下点击命中同一格`, () => {
      installScaledRect(scale)
      const { container, onCanvasChange } = renderAt(scale)
      const c = container.querySelector('.canvas-container')

      const { clientX, clientY } = cellCenter(2, 1, scale)
      fireEvent.mouseDown(c, { clientX, clientY })
      fireEvent.mouseUp(c, { clientX, clientY })

      expect(onCanvasChange).toHaveBeenCalledTimes(1)
      const committed = onCanvasChange.mock.calls[0][0]
      expect(committed[1][2]).toBe('#ff0000')
      // 只有目标格被改动
      const painted = committed.flat().filter(Boolean)
      expect(painted).toEqual(['#ff0000'])
    })

    test(`${scale}× 下拖选生成同一矩形`, () => {
      installScaledRect(scale)
      const { container, onSelectionChange } = renderAt(scale, { tool: 'select' })
      const c = container.querySelector('.canvas-container')

      // (3,2) → (1,0):反向拖动,结果应是 {x:1,y:0,w:3,h:3}
      const from = cellCenter(3, 2, scale)
      const to = cellCenter(1, 0, scale)
      fireEvent.mouseDown(c, { clientX: from.clientX, clientY: from.clientY })
      fireEvent.mouseMove(c, { clientX: to.clientX, clientY: to.clientY })
      fireEvent.mouseUp(c, { clientX: to.clientX, clientY: to.clientY })

      expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 1, y: 0, w: 3, h: 3 })
    })

    test(`${scale}× 下取色器命中同一格`, () => {
      installScaledRect(scale)
      const data = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
      data[2][3] = '#123456'
      const { container, onPickColor } = renderAt(scale, { tool: 'eyedropper', committedData: data })
      const c = container.querySelector('.canvas-container')

      const { clientX, clientY } = cellCenter(3, 2, scale)
      fireEvent.mouseDown(c, { clientX, clientY })

      expect(onPickColor).toHaveBeenCalledWith('#123456')
    })
  }

  test('显示矩形尺寸为 0 时不会产生 NaN 坐标', () => {
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) })
    const { container, onCanvasChange, onPickColor } = renderAt(1, { tool: 'eyedropper' })
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 0, clientY: 0 })
    fireEvent.mouseUp(c, { clientX: 0, clientY: 0 })

    expect(onPickColor).not.toHaveBeenCalled()
    expect(onCanvasChange).not.toHaveBeenCalled()
  })
})

/**
 * 规格 04 §3:网格尺寸切换时必须丢弃进行中的笔画。
 *
 * 回归背景:笔画累加器在 mouseDown 时按旧尺寸快照,若切换网格后仍保留,
 * 下一次 mouseUp 的 commitStroke 会把旧矩阵提交回新画布,覆盖用户刚载入的内容。
 */
describe('Canvas 切换网格时丢弃活动笔画(规格 04 §3)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  test('拖到一半切换网格尺寸,松手不再提交旧矩阵', () => {
    const onCanvasChange = vi.fn()
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'pencil',
      committedData: blankGrid(3),
      onCanvasChange,
    }
    const view = render(<Canvas {...props} />)
    const c = view.container.querySelector('.canvas-container')

    // 按下并拖动 → 笔画进行中(累加器已按 3×3 快照)
    fireEvent.mouseDown(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })
    expect(onCanvasChange).not.toHaveBeenCalled()

    // 切换到 4×4(真实场景:用户换模板 / 载入作品 / 改画布尺寸)
    const bigger = blankGrid(4)
    view.rerender(
      <Canvas
        {...props}
        gridSize={4}
        committedData={bigger}
      />
    )

    // 松手:旧笔画必须已被丢弃,不得把 3×3 矩阵提交回 4×4 画布
    fireEvent.mouseUp(c, { clientX: 40, clientY: 40 })
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('拖选进行中切换网格,松手不再产出旧坐标选区', () => {
    const onSelectionChange = vi.fn()
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'select',
      committedData: blankGrid(3),
      onCanvasChange: vi.fn(),
      onSelectionChange,
    }
    const view = render(<Canvas {...props} />)
    const c = view.container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })

    const callsBefore = onSelectionChange.mock.calls.length
    view.rerender(<Canvas {...props} gridSize={5} committedData={blankGrid(5)} />)
    fireEvent.mouseUp(c, { clientX: 40, clientY: 40 })

    // 切换后不得再产生任何选区回调(旧锚点已失效)
    expect(onSelectionChange.mock.calls.length).toBe(callsBefore)
  })
})

/**
 * M5.2:拖拽移动选区内容(规格 04 §2)。
 *
 * 在已有选区内按下并拖动 = 移动内容,松手才提交;在选区外按下仍然是
 * 重新拖选框。3×3 网格 / 16px 单元 / scale 1。
 */
describe('Canvas 拖拽移动选区(M5.2)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderMove(overrides = {}) {
    const onCanvasChange = vi.fn()
    const onSelectionChange = vi.fn()
    const onSelectionMove = vi.fn()
    const data = blankGrid(3)
    data[0][0] = '#E53935'
    data[0][1] = '#43A047'
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'select',
      committedData: data,
      selection: { x: 0, y: 0, w: 2, h: 1 },
      onCanvasChange,
      onSelectionChange,
      onSelectionMove,
      ...overrides,
    }
    const view = render(<Canvas {...props} />)
    return { ...view, onCanvasChange, onSelectionChange, onSelectionMove }
  }

  test('在选区内拖动 → 松手提交一次偏移', () => {
    const { container, onSelectionMove, onSelectionChange, onCanvasChange } = renderMove()
    const c = container.querySelector('.canvas-container')

    // 从 (0,0) 拖到 (1,1):dx=1, dy=1
    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })
    // 拖动期间不提交
    expect(onSelectionMove).not.toHaveBeenCalled()
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionMove).toHaveBeenCalledTimes(1)
    expect(onSelectionMove.mock.calls[0][0]).toEqual({
      dx: 1, dy: 1, selection: { x: 0, y: 0, w: 2, h: 1 }, copy: false,
    })
    // 移动不经过「拖新选框」路径,也不直接写画布(App 负责提交)
    expect(onSelectionChange).not.toHaveBeenCalled()
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('拖动期间在 overlay 上画预览', () => {
    const { container } = renderMove()
    const c = container.querySelector('.canvas-container')
    const before = mock.calls.fillRect.length

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })

    // 预览:两个珠子按偏移画在 (1,1) 与 (2,1)
    const preview = mock.calls.fillRect.slice(before)
    expect(preview).toContainEqual({ x: 16, y: 16, w: 16, h: 16 })
    expect(preview).toContainEqual({ x: 32, y: 16, w: 16, h: 16 })
  })

  test('原地点击(偏移 0)不提交历史', () => {
    const { container, onSelectionMove } = renderMove()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseUp(c, { clientX: 8, clientY: 8 })

    expect(onSelectionMove).not.toHaveBeenCalled()
  })

  test('越界拖动被钳制,预览与提交都不出画布', () => {
    const { container, onSelectionMove } = renderMove()
    const c = container.querySelector('.canvas-container')

    // 选区 2×1 在 (0,0),向右最多 1 格、向下最多 2 格
    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 47, clientY: 47 })
    fireEvent.mouseUp(c, { clientX: 47, clientY: 47 })

    expect(onSelectionMove.mock.calls[0][0]).toEqual({
      dx: 1, dy: 2, selection: { x: 0, y: 0, w: 2, h: 1 }, copy: false,
    })
  })

  test('在选区外按下仍是重新拖选框', () => {
    // 关掉吸附:这条测的是手势判定,不是吸附(吸附会改变最终矩形)
    const { container, onSelectionMove, onSelectionChange } = renderMove({ snapToEdges: false })
    const c = container.querySelector('.canvas-container')

    // (2,2) 在选区 (0,0,2×1) 之外
    fireEvent.mouseDown(c, { clientX: 40, clientY: 40 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionMove).not.toHaveBeenCalled()
    expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 1, y: 1, w: 2, h: 2 })
  })

  test('触屏在选区内拖动同样提交偏移,不触发填色', () => {
    const { container, onSelectionMove, onCanvasChange } = renderMove()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 8, clientY: 8, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    fireEvent.touchEnd(c, { touches: [] })

    expect(onSelectionMove).toHaveBeenCalledTimes(1)
    expect(onSelectionMove.mock.calls[0][0]).toMatchObject({ dx: 1, dy: 1 })
    expect(onCanvasChange).not.toHaveBeenCalled()
  })
})

/**
 * A2:复制拖动。
 *
 * 桌面用 Alt/Option,触屏用操作条上的开关 —— 触屏没有修饰键,隐藏手势
 * 在触屏上等于不存在,所以必须有可见入口。
 */
describe('Canvas 复制拖动(A2)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderCopy(overrides = {}) {
    const onSelectionMove = vi.fn()
    const data = blankGrid(3)
    data[0][0] = '#E53935'
    data[0][1] = '#43A047'
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={data}
        selection={{ x: 0, y: 0, w: 2, h: 1 }}
        onCanvasChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onSelectionMove={onSelectionMove}
        {...overrides}
      />
    )
    return { ...view, onSelectionMove }
  }

  test('Alt + 拖动上报 copy: true', () => {
    const { container, onSelectionMove } = renderCopy()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8, altKey: true })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionMove).toHaveBeenCalledTimes(1)
    expect(onSelectionMove.mock.calls[0][0]).toMatchObject({ dx: 1, dy: 1, copy: true })
  })

  test('不按 Alt 时仍是剪切移动', () => {
    const { container, onSelectionMove } = renderCopy()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionMove.mock.calls[0][0]).toMatchObject({ copy: false })
  })

  test('操作条开关打开后,普通拖动也是复制', () => {
    // 触屏没有修饰键,这个开关是唯一入口
    const { container, onSelectionMove } = renderCopy({ copyDrag: true })
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionMove.mock.calls[0][0]).toMatchObject({ copy: true })
  })

  test('触屏拖动同样受开关控制', () => {
    const { container, onSelectionMove } = renderCopy({ copyDrag: true })
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 8, clientY: 8, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    fireEvent.touchEnd(c, { touches: [] })

    expect(onSelectionMove.mock.calls[0][0]).toMatchObject({ copy: true })
  })

  test('按下时决定复制/剪切,拖动中松开 Alt 不改变本次语义', () => {
    // 拖到一半改主意会让预览和落地对不上:用户看到的是复制预览,
    // 松手却把原件搬走了。
    const { container, onSelectionMove } = renderCopy()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8, altKey: true })
    // 后续 move/up 不带 altKey
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    expect(onSelectionMove.mock.calls[0][0]).toMatchObject({ copy: true })
  })

  test('复制拖动同样被钳制在网格内', () => {
    const { container, onSelectionMove } = renderCopy()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8, altKey: true })
    fireEvent.mouseMove(c, { clientX: 47, clientY: 47 })
    fireEvent.mouseUp(c, { clientX: 47, clientY: 47 })

    // 选区 2×1 在 (0,0):向右最多 1 格、向下最多 2 格
    expect(onSelectionMove.mock.calls[0][0]).toMatchObject({ dx: 1, dy: 2, copy: true })
  })
})

/**
 * A3:框选吸附到已有珠子的边缘。
 *
 * 3×3 网格,第 0 行有珠子、其余为空。拖选时右/下边界靠近珠块边缘会被吸过去。
 */
describe('Canvas 框选吸附(A3)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderSnap(overrides = {}) {
    const onSelectionChange = vi.fn()
    // 3×3:第 0 行整行有珠,其余为空
    const data = blankGrid(3)
    data[0] = ['#E53935', '#E53935', '#E53935']
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={data}
        onCanvasChange={vi.fn()}
        onSelectionChange={onSelectionChange}
        {...overrides}
      />
    )
    return { ...view, onSelectionChange }
  }

  test('默认开启:下边界靠近珠块底边时吸过去', () => {
    // 第 0、1 行有珠,珠块底边在 y=2。
    // 从 (0,0) 拖到 (0,2) 时下边界是 3,与底边差一格 → 吸到 2,高度 3 → 2。
    const data = blankGrid(3)
    data[0] = ['#E53935', '#E53935', '#E53935']
    data[1] = ['#E53935', '#E53935', '#E53935']
    const { container, onSelectionChange } = renderSnap({ committedData: data })
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 8, clientY: 40 })
    fireEvent.mouseUp(c, { clientX: 8, clientY: 40 })

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last).toEqual({ x: 0, y: 0, w: 1, h: 2 })
  })

  test('关闭吸附后,同样的手势得到未吸附的矩形', () => {
    const { container, onSelectionChange } = renderSnap({ snapToEdges: false })
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 8, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 8, clientY: 24 })

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last.h).toBe(2)
  })

  test('吸附时画出高亮实线', () => {
    // 第 0、1 行有珠,珠块底边在 y=2;拖到第 2 行时下边界差一格被吸过去。
    const data = blankGrid(3)
    data[0] = ['#E53935', '#E53935', '#E53935']
    data[1] = ['#E53935', '#E53935', '#E53935']
    const { container } = renderSnap({ committedData: data })
    const c = container.querySelector('.canvas-container')
    const before = mock.calls.strokeStyle.length

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 8, clientY: 40 })

    // 吸附高亮线用独立颜色(MARQUEE_SNAP),不是虚线框的颜色
    const added = mock.calls.strokeStyle.slice(before)
    expect(added.some(s => String(s).includes('255, 152, 0'))).toBe(true)
  })

  test('吸附把焦点拽回锚点时丢弃吸附,不把选区塌成单击', () => {
    // 第 0 行 = [空, 珠, 珠]。从 (0,0) 拖到 (1,0):右边界 2 两侧都有珠子
    // 不是边界,而边界 1(珠子在右、左边空)在阈值 1 内 → 焦点会被吸回 0,
    // 与锚点重合。若照单全收,endSelection 会把这次拖动当成单击并取消选区。
    const data = blankGrid(3)
    data[0] = [null, '#E53935', '#E53935']
    const { container, onSelectionChange } = renderSnap({ committedData: data })
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 8 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 8 })

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last).toEqual({ x: 0, y: 0, w: 2, h: 1 })
  })

  test('远离所有边缘时不吸附,也不画高亮线', () => {
    const { container } = renderSnap()
    const c = container.querySelector('.canvas-container')
    const before = mock.calls.strokeStyle.length

    // 从 (1,1) 拖到 (2,2):离第 0 行的珠子很远
    fireEvent.mouseDown(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })

    const added = mock.calls.strokeStyle.slice(before)
    expect(added.some(s => String(s).includes('255, 152, 0'))).toBe(false)
  })
})

describe('Canvas 拖拽移动 · 手势互斥(M5.2)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  test('移动过程中第二根手指按下 → 丢弃预览,松手不提交', () => {
    const onSelectionMove = vi.fn()
    const data = blankGrid(3)
    data[0][0] = '#E53935'
    const props = {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      selectedColor: '#ff0000',
      tool: 'select',
      committedData: data,
      selection: { x: 0, y: 0, w: 2, h: 1 },
      onCanvasChange: vi.fn(),
      onSelectionChange: vi.fn(),
      onSelectionMove,
    }
    const view = render(<Canvas {...props} />)
    const c = view.container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 8, clientY: 8, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    // 第二根手指按下 → 进入 pinch,移动被丢弃
    fireEvent.touchStart(c, {
      touches: [
        { clientX: 24, clientY: 24, identifier: 0 },
        { clientX: 40, clientY: 40, identifier: 1 },
      ],
    })
    fireEvent.touchEnd(c, { touches: [] })

    expect(onSelectionMove).not.toHaveBeenCalled()
  })
})

/**
 * 规格 04 §8 测试矩阵:铅笔/橡皮/填充的手势与事务语义。
 *
 * 这些路径此前只有人工探测,没有自动化覆盖 —— 而它们正是「一次手势 = 一条历史」
 * 契约的核心:拖动中每帧只画 overlay,松手才提交一次。
 */
describe('Canvas 基础工具事务语义(规格 04 §2 / §8)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderTool(tool, data = blankGrid(3), overrides = {}) {
    const onCanvasChange = vi.fn()
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool={tool}
        committedData={data}
        onCanvasChange={onCanvasChange}
        onSelectionChange={vi.fn()}
        {...overrides}
      />
    )
    return { ...view, onCanvasChange }
  }

  test('铅笔拖动连续上色,整段只提交一条历史', () => {
    const { container, onCanvasChange } = renderTool('pencil')
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 8 })
    // 拖动期间不提交
    expect(onCanvasChange).not.toHaveBeenCalled()
    fireEvent.mouseUp(c, { clientX: 40, clientY: 8 })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0][0]).toEqual(['#ff0000', '#ff0000', '#ff0000'])
  })

  test('橡皮拖动连续擦除,整段只提交一条历史', () => {
    const data = blankGrid(3)
    data[0] = ['#E53935', '#E53935', '#E53935']
    const { container, onCanvasChange } = renderTool('eraser', data)
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 8 })
    fireEvent.mouseUp(c, { clientX: 40, clientY: 8 })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0][0]).toEqual([null, null, null])
  })

  test('填充桶只填连通同色区域,不是整张画布', () => {
    const data = blankGrid(3)
    data[0][0] = '#111111'
    data[0][1] = '#111111'
    // 右下角同色但不连通
    data[2][2] = '#111111'
    const { container, onCanvasChange } = renderTool('fill', data)
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseUp(c, { clientX: 8, clientY: 8 })

    const next = onCanvasChange.mock.calls[0][0]
    expect(next[0]).toEqual(['#ff0000', '#ff0000', null])
    // 不连通的同色格保持原样
    expect(next[2][2]).toBe('#111111')
  })

  test('指针离开画布时提交一次,不丢笔画', () => {
    const { container, onCanvasChange } = renderTool('pencil')
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 8 })
    fireEvent.mouseLeave(c)

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0][0][0]).toBe('#ff0000')
  })

  test('触屏取消手势丢弃半成品选区,不提交任何画布变更', () => {
    const onCanvasChange = vi.fn()
    const onSelectionChange = vi.fn()
    const { container } = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={blankGrid(3)}
        onCanvasChange={onCanvasChange}
        onSelectionChange={onSelectionChange}
      />
    )
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 8, clientY: 8, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    const callsBeforeCancel = onSelectionChange.mock.calls.length

    fireEvent.touchCancel(c, { touches: [] })

    // 取消后不再产出选区,也不写画布
    expect(onSelectionChange.mock.calls.length).toBe(callsBeforeCancel)
    expect(onCanvasChange).not.toHaveBeenCalled()

    // 随后到达的 touchEnd 不得把半成品选区补提交
    fireEvent.touchEnd(c, { touches: [] })
    expect(onSelectionChange.mock.calls.length).toBe(callsBeforeCancel)
  })
})

/**
 * 选框实时跟随预览:拖动期间虚线框必须逐帧跟手,而不是松手才出现。
 * 这是「选不到预期范围」的主要来源 —— 用户看不到自己正在框哪里。
 */
describe('Canvas 选框实时跟随预览', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderSelect() {
    const onSelectionChange = vi.fn()
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={blankGrid(3)}
        onCanvasChange={vi.fn()}
        onSelectionChange={onSelectionChange}
        // 这组测的是选框绘制,不是吸附
        snapToEdges={false}
      />
    )
    return { ...view, onSelectionChange }
  }

  test('按下即画出 1×1 选框,不用等第一次移动', () => {
    const { container } = renderSelect()
    const c = container.querySelector('.canvas-container')
    const before = mock.calls.strokeRect.length

    fireEvent.mouseDown(c, { clientX: 24, clientY: 24 })

    const drawn = mock.calls.strokeRect.slice(before)
    // 单元 16px、1×1、线宽 2(scale 1)→ 内缩 1px 描边
    expect(drawn).toContainEqual({ x: 17, y: 17, w: 14, h: 14 })
  })

  test('拖动过程中每一步都重画选框,范围与指针同步', () => {
    const { container } = renderSelect()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    const afterDown = mock.calls.strokeRect.length

    fireEvent.mouseMove(c, { clientX: 24, clientY: 8 })
    const afterFirst = mock.calls.strokeRect.length
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })
    const afterSecond = mock.calls.strokeRect.length

    // 每次移动都产生新的选框描边
    expect(afterFirst).toBeGreaterThan(afterDown)
    expect(afterSecond).toBeGreaterThan(afterFirst)

    // 最后一次选框 = (0,0) 到 (2,2) 的 3×3 区域
    const last = mock.calls.strokeRect.at(-1)
    expect(last).toEqual({ x: 1, y: 1, w: 46, h: 46 })
  })

  test('反向拖动时选框同样实时跟随(左上角随之翻转)', () => {
    const { container } = renderSelect()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 40, clientY: 40 })
    fireEvent.mouseMove(c, { clientX: 8, clientY: 24 })

    const last = mock.calls.strokeRect.at(-1)
    // (0,1) → (2,2):x=0,y=16,w=48,h=32,内缩 1px
    expect(last).toEqual({ x: 1, y: 17, w: 46, h: 30 })
  })

  test('触屏拖动同样逐帧重画选框', () => {
    const { container } = renderSelect()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 8, clientY: 8, identifier: 0 }] })
    const afterDown = mock.calls.strokeRect.length
    fireEvent.touchMove(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 40, clientY: 40, identifier: 0 }] })

    expect(mock.calls.strokeRect.length).toBeGreaterThan(afterDown)
    expect(mock.calls.strokeRect.at(-1)).toEqual({ x: 1, y: 1, w: 46, h: 46 })
  })

  test('拖拽移动选区时,选框跟随内容一起移动', () => {
    const data = blankGrid(3)
    data[0][0] = '#E53935'
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={data}
        selection={{ x: 0, y: 0, w: 2, h: 1 }}
        onCanvasChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onSelectionMove={vi.fn()}
      />
    )
    const c = view.container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })

    // 偏移 (1,1):选框移到 x=16,y=16
    expect(mock.calls.strokeRect.at(-1)).toEqual({ x: 17, y: 17, w: 30, h: 14 })
  })
})

/**
 * 触摸设备没有 hover:选区四角画把手,明确「可按住拖动移动」。
 * 桌面端(pointer: fine)不画,保持既有观感。
 */
describe('Canvas 选区把手(触屏可发现性)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  function renderWith(pointerCoarse) {
    const orig = window.matchMedia
    window.matchMedia = (q) => ({
      matches: q === '(pointer: coarse)' ? pointerCoarse : false,
      media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    })
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={blankGrid(3)}
        selection={{ x: 0, y: 0, w: 2, h: 2 }}
        onCanvasChange={vi.fn()}
        onSelectionChange={vi.fn()}
      />
    )
    window.matchMedia = orig
    return view
  }

  test('触屏设备绘制四角把手', () => {
    // installCanvasMocks 已把 arc 调用记录在 mock.calls.arc
    renderWith(true)
    expect(mock.calls.arc.length).toBeGreaterThanOrEqual(4)
  })

  test('桌面指针设备不绘制把手', () => {
    renderWith(false)
    expect(mock.calls.arc.length).toBe(0)
  })
})

/**
 * A1:选区 resize 手柄。
 *
 * 3×3 网格 / 16px 单元 / scale 1 → 屏幕坐标 0..48 对应格 0..2。
 * 手势优先级:**手柄 > 选区内部移动 > 外部新框**,三者的边界必须钉死,
 * 否则边缘那几格要么拖不动 resize,要么一按就变成移动内容。
 */
describe('Canvas 选区 resize 手柄(A1)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => mock.restore())

  /** 3×3 画布,选区 (0,0) 2×2(覆盖 x/y 0..1,右/下边界在 32) */
  function renderResize(overrides = {}) {
    const onSelectionChange = vi.fn()
    const onSelectionMove = vi.fn()
    const onCanvasChange = vi.fn()
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={blankGrid(3)}
        selection={{ x: 0, y: 0, w: 2, h: 2 }}
        onCanvasChange={onCanvasChange}
        onSelectionChange={onSelectionChange}
        onSelectionMove={onSelectionMove}
        {...overrides}
      />
    )
    return { ...view, onSelectionChange, onSelectionMove, onCanvasChange }
  }

  test('拖动右下角手柄改尺寸,左上角不动', () => {
    const { container, onSelectionChange, onSelectionMove, onCanvasChange } = renderResize()
    const c = container.querySelector('.canvas-container')

    // 手柄在格边界 (32,32);拖到格 (2,2) 中心 → 覆盖到 2,右/下边界 = 3
    fireEvent.mouseDown(c, { clientX: 32, clientY: 32 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })
    fireEvent.mouseUp(c, { clientX: 40, clientY: 40 })

    expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 3, h: 3 })
    // resize 只改矩形:不移动内容、不写画布、不产生历史
    expect(onSelectionMove).not.toHaveBeenCalled()
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('拖左上角手柄时右下角不动', () => {
    const { container, onSelectionChange } = renderResize({
      selection: { x: 1, y: 1, w: 2, h: 2 },
    })
    const c = container.querySelector('.canvas-container')

    // 左上角手柄在格边界 (16,16);拖到 (0,0)
    fireEvent.mouseDown(c, { clientX: 16, clientY: 16 })
    fireEvent.mouseMove(c, { clientX: 4, clientY: 4 })
    fireEvent.mouseUp(c, { clientX: 4, clientY: 4 })

    expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 3, h: 3 })
  })

  test('拖右边手柄只改宽度', () => {
    const { container, onSelectionChange } = renderResize()
    const c = container.querySelector('.canvas-container')

    // 右边中点在 (32,16)
    fireEvent.mouseDown(c, { clientX: 32, clientY: 16 })
    fireEvent.mouseMove(c, { clientX: 8, clientY: 40 })
    fireEvent.mouseUp(c, { clientX: 8, clientY: 40 })

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last.y).toBe(0)
    expect(last.h).toBe(2)
    expect(last.x).toBe(0)
  })

  test('手柄命中优先于选区内部移动', () => {
    // 选区右下角的手柄压在格子 (1,1) 的边界上 —— 若先判 pointInSelection,
    // 这一按会变成「移动内容」,手柄永远拖不动。
    const { container, onSelectionMove, onSelectionChange } = renderResize()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 32, clientY: 32 })
    fireEvent.mouseMove(c, { clientX: 40, clientY: 40 })
    fireEvent.mouseUp(c, { clientX: 40, clientY: 40 })

    expect(onSelectionMove).not.toHaveBeenCalled()
    expect(onSelectionChange).toHaveBeenCalled()
  })

  test('选区中心仍然是移动内容,不是 resize', () => {
    const { container, onSelectionMove, onSelectionChange } = renderResize()
    const c = container.querySelector('.canvas-container')

    // (0.5,0.5) 格的中心,离八个手柄都远
    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 8 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 8 })

    expect(onSelectionMove).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  test('越界拖动被钳制在网格内', () => {
    const { container, onSelectionChange } = renderResize()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseDown(c, { clientX: 32, clientY: 32 })
    fireEvent.mouseMove(c, { clientX: 200, clientY: 200 })
    fireEvent.mouseUp(c, { clientX: 200, clientY: 200 })

    const last = onSelectionChange.mock.calls.at(-1)[0]
    expect(last.x + last.w).toBe(3)
    expect(last.y + last.h).toBe(3)
  })

  test('悬停到手柄时光标变成对应方向的 resize 光标', () => {
    const { container } = renderResize()
    const c = container.querySelector('.canvas-container')

    fireEvent.mouseMove(c, { clientX: 32, clientY: 32 })
    expect(c.style.cursor).toBe('nwse-resize')

    // 移开后回到十字
    fireEvent.mouseMove(c, { clientX: 8, clientY: 8 })
    expect(c.style.cursor).toBe('crosshair')
  })

  test('触屏拖手柄同样改尺寸,不触发填色', () => {
    const { container, onSelectionChange, onCanvasChange } = renderResize()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 32, clientY: 32, identifier: 0 }] })
    fireEvent.touchMove(c, { touches: [{ clientX: 40, clientY: 40, identifier: 0 }] })
    fireEvent.touchEnd(c, { touches: [] })

    expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 3, h: 3 })
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('没有选区时按下不会误判为手柄', () => {
    const { container, onSelectionChange } = renderResize({ selection: null })
    const c = container.querySelector('.canvas-container')

    // 从 (0,0) 拖到 (1,1)
    fireEvent.mouseDown(c, { clientX: 8, clientY: 8 })
    fireEvent.mouseMove(c, { clientX: 24, clientY: 24 })
    fireEvent.mouseUp(c, { clientX: 24, clientY: 24 })

    // 走的是「拖新选框」路径
    expect(onSelectionChange).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 2, h: 2 })
  })
})

describe('Canvas 长按上下文菜单(A4)', () => {
  let mock
  beforeEach(() => { mock = installCanvasMocks() })
  afterEach(() => {
    mock.restore()
    vi.useRealTimers()
  })

  function renderLongPress(overrides = {}) {
    const onSelectionLongPress = vi.fn()
    const onSelectionMove = vi.fn()
    const view = render(
      <Canvas
        gridSize={3}
        gridWidth={null}
        gridHeight={null}
        selectedColor="#ff0000"
        tool="select"
        committedData={blankGrid(3)}
        selection={{ x: 0, y: 0, w: 2, h: 2 }}
        onCanvasChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onSelectionMove={onSelectionMove}
        onSelectionLongPress={onSelectionLongPress}
        {...overrides}
      />
    )
    return { ...view, onSelectionLongPress, onSelectionMove }
  }

  test('按住选区内部 500ms 后弹出菜单,并上报触点坐标', () => {
    vi.useFakeTimers()
    const { container, onSelectionLongPress } = renderLongPress()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    // 还没到点:不能提前弹
    vi.advanceTimersByTime(400)
    expect(onSelectionLongPress).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    expect(onSelectionLongPress).toHaveBeenCalledWith({ x: 24, y: 24 })
  })

  test('长按后松手不提交移动(不产生空历史)', () => {
    vi.useFakeTimers()
    const { container, onSelectionLongPress, onSelectionMove } = renderLongPress()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    vi.advanceTimersByTime(600)
    fireEvent.touchEnd(c, { touches: [] })

    expect(onSelectionLongPress).toHaveBeenCalledTimes(1)
    // 长按成立时已经取消了移动拖动,松手不该再报一次 0 偏移的移动
    expect(onSelectionMove).not.toHaveBeenCalled()
  })

  test('长按成立后,阈值内的余下移动也不再提交', () => {
    // 这条用例专门覆盖「长按到点 → 取消移动」的必要性:
    // 阈值是 10px,但从格中线附近按下时,9px 就足以跨进下一格。
    // 若长按成立后不取消 moveDragging,松手会提交一次 dx=1 的移动 ——
    // 用户只想长按弹菜单,内容却被挪走了一格。
    vi.useFakeTimers()
    const { container, onSelectionMove } = renderLongPress()
    const c = container.querySelector('.canvas-container')

    // (24,24) 落在格 (1,1) 的中线上;+9px → 33,仍在格 (1,1)?不:
    // 33/16 = 2.06 → 格 (2,2)。跨格了,但 9px < 10px 阈值,长按不会被取消。
    fireEvent.touchStart(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    vi.advanceTimersByTime(600)
    fireEvent.touchMove(c, { touches: [{ clientX: 33, clientY: 24, identifier: 0 }] })
    fireEvent.touchEnd(c, { touches: [] })

    expect(onSelectionMove).not.toHaveBeenCalled()
  })

  test('移动超过阈值后取消长按(拖动优先)', () => {
    vi.useFakeTimers()
    const { container, onSelectionLongPress } = renderLongPress()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    // 拖出 20px(> 10px 阈值)
    fireEvent.touchMove(c, { touches: [{ clientX: 44, clientY: 24, identifier: 0 }] })
    vi.advanceTimersByTime(800)

    expect(onSelectionLongPress).not.toHaveBeenCalled()
  })

  test('按住时的轻微抖动不取消长按', () => {
    vi.useFakeTimers()
    const { container, onSelectionLongPress } = renderLongPress()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    // 抖动 4px,仍在 10px 阈值内
    fireEvent.touchMove(c, { touches: [{ clientX: 28, clientY: 24, identifier: 0 }] })
    vi.advanceTimersByTime(600)

    expect(onSelectionLongPress).toHaveBeenCalled()
  })

  test('按在选区外部不会触发长按(那是拖新选框)', () => {
    vi.useFakeTimers()
    const { container, onSelectionLongPress } = renderLongPress()
    const c = container.querySelector('.canvas-container')

    // (2,2) 在选区 (0,0,2,2) 之外
    fireEvent.touchStart(c, { touches: [{ clientX: 40, clientY: 40, identifier: 0 }] })
    vi.advanceTimersByTime(800)

    expect(onSelectionLongPress).not.toHaveBeenCalled()
  })

  test('未传 onSelectionLongPress 时不启动长按(桌面端无此需求)', () => {
    vi.useFakeTimers()
    const { container } = renderLongPress({ onSelectionLongPress: undefined })
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    // 长按没有回调就什么也不做;顺带确认不会抛错(计时器里访问 undefined)
    expect(() => vi.advanceTimersByTime(800)).not.toThrow()
  })

  test('手势被系统取消时收掉计时器', () => {
    vi.useFakeTimers()
    const { container, onSelectionLongPress } = renderLongPress()
    const c = container.querySelector('.canvas-container')

    fireEvent.touchStart(c, { touches: [{ clientX: 24, clientY: 24, identifier: 0 }] })
    fireEvent.touchCancel(c, { touches: [] })
    vi.advanceTimersByTime(800)

    expect(onSelectionLongPress).not.toHaveBeenCalled()
  })
})
