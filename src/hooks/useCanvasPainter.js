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
 * The base layer paints from BOTH the data effect (committedData/cols/rows
 * change) AND the base ref callback (node attach). The callback path guarantees
 * the grid is visible from the first frame regardless of effect ordering; the
 * effect path handles later data updates.
 */
export function useCanvasPainter({ canvasWidth, canvasHeight, cellSize }) {
  const baseRef = useRef(null)
  const overlayRef = useRef(null)
  // Always-latest paint state, written by repaintBase, read by the base ref
  // callback so it can repaint immediately on attach.
  // isolateColor:单色隔离的显示态(null = 正常)。它只影响绘制,不进画布数据。
  const paintStateRef = useRef({ committedData: null, cols: 0, rows: 0, isolateColor: null })

  const doRepaintBase = useCallback(
    (committedData, cols, rows, isolateColor = null) => {
      const canvas = baseRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      if (committedData) {
        // 脏数据防御:行数与声明不一致时告警而非静默画空(可选链会吞掉维度不匹配)
        if (committedData.length !== rows) {
          console.warn(
            `useCanvasPainter: committedData 行数 ${committedData.length} 与声明 rows=${rows} 不一致`
          )
        }
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const hex = committedData[y]?.[x]
            if (hex) {
              // 单色隔离:非目标色压到很低的透明度,保留图案轮廓但把注意力收在目标色上
              const dimmed = isolateColor && String(hex).toLowerCase() !== String(isolateColor).toLowerCase()
              if (dimmed) ctx.globalAlpha = 0.12
              ctx.fillStyle = hex
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
              if (dimmed) ctx.globalAlpha = 1
            }
          }
        }
      }

      // 纵线/横线各合并为一条路径(200×200 网格 stroke 调用 402 次 → 2 次)
      ctx.strokeStyle = '#d4d4d4'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let i = 0; i <= cols; i++) {
        ctx.moveTo(i * cellSize, 0)
        ctx.lineTo(i * cellSize, canvasHeight)
      }
      ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i <= rows; i++) {
        ctx.moveTo(0, i * cellSize)
        ctx.lineTo(canvasWidth, i * cellSize)
      }
      ctx.stroke()
    },
    [canvasWidth, canvasHeight, cellSize]
  )

  // Base-layer callback ref: store the node AND repaint immediately on attach so
  // the grid is visible from the first frame, independent of effect timing.
  const baseRefCallback = useCallback(
    node => {
      baseRef.current = node
      if (node) {
        const { committedData, cols, rows, isolateColor } = paintStateRef.current
        doRepaintBase(committedData, cols, rows, isolateColor)
      }
    },
    [doRepaintBase]
  )

  // Overlay-layer callback ref: just store the node.
  const overlayRefCallback = useCallback(node => {
    overlayRef.current = node
  }, [])

  // Public repaint entry for the data effect: record latest state, then paint.
  const repaintBase = useCallback(
    (committedData, cols, rows, isolateColor = null) => {
      paintStateRef.current = { committedData, cols, rows, isolateColor }
      doRepaintBase(committedData, cols, rows, isolateColor)
    },
    [doRepaintBase]
  )

  // Paint one cell on the overlay layer (live stroke feedback).
  const paintOverlayCell = useCallback(
    (x, y, hex) => {
      const canvas = overlayRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = hex
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
    },
    [cellSize]
  )

  // Clear a single overlay cell back to transparent (reveals the base layer).
  const clearOverlayCell = useCallback(
    (x, y) => {
      const canvas = overlayRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.clearRect(x * cellSize, y * cellSize, cellSize, cellSize)
    },
    [cellSize]
  )

  // Clear the entire overlay layer (on stroke end).
  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  }, [canvasWidth, canvasHeight])

  // Memoize the returned API object so callers can depend on a stable reference.
  return useMemo(
    () => ({
      baseRefCallback,
      overlayRefCallback,
      baseRef,
      overlayRef,
      repaintBase,
      paintOverlayCell,
      clearOverlayCell,
      clearOverlay,
    }),
    [baseRefCallback, overlayRefCallback, repaintBase, paintOverlayCell, clearOverlayCell, clearOverlay]
  )
}
