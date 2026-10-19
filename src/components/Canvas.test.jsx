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
