import { renderHook, act } from '@testing-library/react'
import { useCanvasPainter } from './useCanvasPainter'

/**
 * jsdom does not implement canvas 2d context (getContext('2d') returns null), so
 * we install a recording mock on HTMLCanvasElement.prototype before requiring the
 * hook. The mock captures every 2d draw call so we can assert on what was painted.
 */
function installMock2dContext() {
  const calls = { fillRect: [], stroke: 0, moveTo: [], lineTo: [] }
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
    clearRect: () => {},
  }
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function () { return ctx }
  return { calls, restore: () => { HTMLCanvasElement.prototype.getContext = orig } }
}

// Real jsdom <canvas> elements. getContext is satisfied by the prototype mock
// installed in installMock2dContext (jsdom's own getContext returns null).
function makeNode() {
  return document.createElement('canvas')
}

describe('useCanvasPainter grid painting', () => {
  let mock
  beforeEach(() => { mock = installMock2dContext() })
  afterEach(() => mock.restore())

  function renderPainter() {
    const { result } = renderHook(() => useCanvasPainter({ canvasWidth: 29 * 16, canvasHeight: 29 * 16, cellSize: 16 }))
    return result
  }

  function attachCanvases(result) {
    const base = makeNode()
    const overlay = makeNode()
    act(() => { result.current.baseRefCallback(base) })
    act(() => { result.current.overlayRefCallback(overlay) })
    return { base, overlay }
  }

  test('paints the grid lines on the base layer when repaintBase is called', () => {
    const result = renderPainter()
    // Attach first — mirrors reality where ref callbacks fire during commit,
    // before the data effect runs. The callback paints using the initial empty
    // state (0×0 grid = 2 strokes), proving the attach-time paint path works.
    attachCanvases(result)
    const strokesAfterAttach = mock.calls.stroke
    expect(strokesAfterAttach).toBe(2)

    // committedData = blank 3x3 grid → 4 vertical + 4 horizontal lines, each a
    // beginPath/moveTo/lineTo/stroke sequence.
    const blank = Array(3).fill(null).map(() => Array(3).fill(null))
    act(() => { result.current.repaintBase(blank, 3, 3) })

    // Grid lines: attach (2) + data effect (8) = 10 stroke segments.
    expect(mock.calls.stroke).toBe(10)
    // Each line is a distinct moveTo + lineTo pair.
    expect(mock.calls.moveTo).toHaveLength(10)
    expect(mock.calls.lineTo).toHaveLength(10)
    // Background fill (full canvas) was drawn.
    expect(mock.calls.fillRect.length).toBeGreaterThanOrEqual(1)
    // First fillRect is the white background covering the whole canvas.
    expect(mock.calls.fillRect[0]).toEqual({ x: 0, y: 0, w: 29 * 16, h: 29 * 16 })
  })

  test('paints the grid even when committedData is null (initial mount state)', () => {
    const result = renderPainter()
    attachCanvases(result)

    act(() => { result.current.repaintBase(null, 3, 3) })

    // attach (2) + data effect (8) = 10 — grid draws even with null data.
    expect(mock.calls.stroke).toBe(10)
  })

  test('base ref callback repaints on attach so the grid is visible from frame one', () => {
    const result = renderPainter()
    // Simulate the data effect recording paint state BEFORE the canvas node exists
    // (e.g. SSR-hydration edge case, or effect ordering). baseRef is still null, so
    // this records state but paints nothing.
    const blank = Array(3).fill(null).map(() => Array(3).fill(null))
    act(() => { result.current.repaintBase(blank, 3, 3) })
    expect(mock.calls.stroke).toBe(0) // nothing painted: no node yet

    // Now the base node attaches — the callback must paint using the state that
    // was recorded above, so the grid appears without waiting for another effect.
    const base = makeNode()
    act(() => { result.current.baseRefCallback(base) })
    expect(mock.calls.stroke).toBe(8)
  })

  test('paints and clears overlay cells without touching the base grid', () => {
    const result = renderPainter()
    attachCanvases(result)
    act(() => { result.current.repaintBase(null, 3, 3) })
    const gridStrokes = mock.calls.stroke

    act(() => { result.current.paintOverlayCell(1, 1, '#ff0000') })
    // Overlay paint adds a fillRect but no stroke.
    const lastFill = mock.calls.fillRect[mock.calls.fillRect.length - 1]
    expect(lastFill).toEqual({ x: 16, y: 16, w: 16, h: 16 })
    expect(mock.calls.stroke).toBe(gridStrokes)

    act(() => { result.current.clearOverlayCell(1, 1) })
    act(() => { result.current.clearOverlay() })
    // Grid strokes untouched by overlay operations.
    expect(mock.calls.stroke).toBe(gridStrokes)
  })
})
