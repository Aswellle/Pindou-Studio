import { render, fireEvent } from '@testing-library/react'
import Canvas from './Canvas'

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
function installCanvasMocks() {
  const calls = { fillRect: [], stroke: 0, moveTo: [], lineTo: [], clearRect: [], setLineDash: [] }
  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    fillRect: (x, y, w, h) => calls.fillRect.push({ x, y, w, h }),
    strokeRect: () => {},
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
  }
  const origGetContext = HTMLCanvasElement.prototype.getContext
  const origGetRect = HTMLCanvasElement.prototype.getBoundingClientRect
  HTMLCanvasElement.prototype.getContext = function () { return ctx }
  HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: 48, bottom: 48, width: 48, height: 48, x: 0, y: 0, toJSON: () => ({}) }
  }
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
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return {
        left: 0, top: 0,
        right: BASE_W * scale, bottom: BASE_H * scale,
        width: BASE_W * scale, height: BASE_H * scale,
        x: 0, y: 0, toJSON: () => ({}),
      }
    }
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
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
    }
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
      dx: 1, dy: 1, selection: { x: 0, y: 0, w: 2, h: 1 },
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
      dx: 1, dy: 2, selection: { x: 0, y: 0, w: 2, h: 1 },
    })
  })

  test('在选区外按下仍是重新拖选框', () => {
    const { container, onSelectionMove, onSelectionChange } = renderMove()
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
