import { useCallback, useMemo, useRef } from 'react'

/**
 * useCanvasPainter — direct <canvas> painting that bypasses React state for the
 * live (per-frame) stroke feedback.
 *
 * The previous approach ran a full O(rows×cols) grid redraw inside a useEffect
 * keyed on canvasData. During a fast drag, rAF-throttled canvasData updates
 * still queued up faster than the main thread could repaint, so the canvas
 * visibly lagged the cursor. Painting directly to the canvas element (which is
 * mutable DOM, not React state) avoids that bottleneck entirely.
 *
 * Two-layer model:
 *   base    — committed canvas state, repainted only when committedData or grid
 *             dimensions change (infrequent, amortized cheap).
 *   overlay — live stroke feedback during an active drag; cells are painted on
 *             entry and cleared on erase / stroke end (no full-grid scan).
 *
 * The hook attaches to the two <canvas> elements via a single ref callback that
 * dispatches by data-id, so the component stays declarative.
 */
export function useCanvasPainter({ canvasWidth, canvasHeight, cellSize }) {
  const baseRef = useRef(null)
  const overlayRef = useRef(null)

  // Ref callback: assign each <canvas> to the right internal ref by data-id.
  const canvasRefCallback = useCallback((node) => {
    if (!node) return
    if (node.dataset.id === 'base') baseRef.current = node
    else if (node.dataset.id === 'overlay') overlayRef.current = node
  }, [])

  // Repaint the entire base layer from committedData. Called only when committedData
  // or grid dimensions change (stroke commit / undo / redo / reset / resize).
  const repaintBase = useCallback((committedData, cols, rows) => {
    const canvas = baseRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    if (committedData) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const hex = committedData[y]?.[x]
          if (hex) {
            ctx.fillStyle = hex
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
          }
        }
      }
    }

    ctx.strokeStyle = '#d4d4d4'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cellSize, 0)
      ctx.lineTo(i * cellSize, canvasHeight)
      ctx.stroke()
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath()
      ctx.moveTo(0, i * cellSize)
      ctx.lineTo(canvasWidth, i * cellSize)
      ctx.stroke()
    }
  }, [canvasWidth, canvasHeight, cellSize])

  // Paint one cell on the overlay layer (live stroke feedback).
  const paintOverlayCell = useCallback((x, y, hex) => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = hex
    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
  }, [cellSize])

  // Clear a single overlay cell back to transparent (reveals the base layer).
  const clearOverlayCell = useCallback((x, y) => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(x * cellSize, y * cellSize, cellSize, cellSize)
  }, [cellSize])

  // Clear the entire overlay layer (on stroke end).
  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  }, [canvasWidth, canvasHeight])

  // Memoize the returned API object so callers can depend on a stable reference
  // (prevents churning their useCallback/useEffect dependency arrays every render).
  return useMemo(() => ({
    canvasRefCallback,
    // Exposed so callers can draw hover highlights / overlays that need strokeRect
    // (the hover effect) — keeps the painter as the single owner of both layers.
    baseRef,
    overlayRef,
    repaintBase,
    paintOverlayCell,
    clearOverlayCell,
    clearOverlay,
  }), [canvasRefCallback, repaintBase, paintOverlayCell, clearOverlayCell, clearOverlay])
}
