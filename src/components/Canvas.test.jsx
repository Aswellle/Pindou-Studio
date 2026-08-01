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
  const calls = { fillRect: [], stroke: 0, moveTo: [], lineTo: [], clearRect: [] }
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

    // repaintBase draws 4 vertical + 4 horizontal grid lines for a 3×3 grid
    // (the attach-time repaint with the initial empty state adds 2 more).
    // The regression left this at 0 because baseRef never attached.
    expect(mock.calls.stroke).toBeGreaterThanOrEqual(8)
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
})
