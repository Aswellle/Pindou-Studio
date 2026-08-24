import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCanvasPainter } from '../hooks/useCanvasPainter'

const CELL_SIZE = 16
const MIN_SCALE = 0.3
const MAX_SCALE = 5
const MOMENTUM_FRICTION = 0.88
const MOMENTUM_THRESHOLD = 0.5
const BOUNDS_BOOST = 200 // Extra space beyond visible area before bounce-back kicks in

const Canvas = forwardRef(function Canvas({
  gridSize,
  gridWidth,
  gridHeight,
  selectedColor,
  tool,
  committedData,
  onCanvasChange,
  onTransformChange,
}, ref) {
  const { t } = useTranslation()
  const containerRef = useRef(null)
  // overlayRef still needed by the hover effect's direct strokeRect calls.
  const overlayRef = useRef(null)

  const [hoverCell, setHoverCell] = useState(null)
  const [panActive, setPanActive] = useState(false)

  // 变换状态：scale + canvas画布中心在container中的位置
  const [transform, setTransform] = useState({ scale: 1, cx: 0, cy: 0 })

  // 缩放比例变化时通知父组件
  useEffect(() => {
    onTransformChange?.(transform.scale)
  }, [transform.scale, onTransformChange])

  // PC 拖拽平移
  const isPanningRef = useRef(false)
  const panHasStartedRef = useRef(false) // 用户是否已经开始拖拽（超过阈值）
  const panCursorStartRef = useRef({ x: 0, y: 0 }) // 拖拽开始时，光标相对container中心的坐标
  const panStartRef = useRef({ x: 0, y: 0 }) // 拖拽开始时的canvas中心cx,cy

  // PC 绘制
  const isDrawingRef = useRef(false)
  const drawStartRef = useRef({ x: 0, y: 0 }) // 点击开始时的cell位置（用于判断点击 vs 拖拽）
  const DRAW_THRESHOLD = 5

  // 触控状态
  const touchStartRef = useRef(null) // { x, y, gridPos, touchId }
  const touchMovedRef = useRef(false)
  const touchPanCursorStartRef = useRef({ x: 0, y: 0 })
  const touchPanCanvasStartRef = useRef({ x: 0, y: 0 })
  const velocityRef = useRef({ x: 0, y: 0 })
  const lastTouchTimeRef = useRef(0)
  const lastTouchPosRef = useRef({ x: 0, y: 0 })
  const momentumRef = useRef(null)

  // 双指触控状态
  const pinchRef = useRef(null) // { startDist, startScale, startCX, startCY }
  // 本次手势是否发生过双指(≥2指)。pinch 期间抬起一根手指后,touchEnd 会把
  // 剩余手指重新登记为单指起点,若不加标记,最后一指抬起时会被误判为
  // "单指点按"而填色。真实业务里只有"单指起、单指落"的手势才允许填色。
  const wasPinchingRef = useRef(false)
  const strokeAccumRef = useRef(null) // accumulated canvas state during a drag stroke
  const lastTouchRef = useRef(0) // 最近一次触控时间戳,用于区分触屏双击与鼠标双击

  const cols = gridWidth || gridSize
  const rows = gridHeight || gridSize
  const canvasWidth = cols * CELL_SIZE
  const canvasHeight = rows * CELL_SIZE

  // Direct painter: bypasses React state for per-frame stroke feedback. Committed
  // state paints to the base canvas; in-progress strokes paint to an overlay layer.
  const painter = useCanvasPainter({ canvasWidth, canvasHeight, cellSize: CELL_SIZE })

  // ─────────────────────────────────────────────────────────────────
  // _bounds: Allow free panning with soft bounce-back at extremes.
  // Grid can be dragged to any position; bounds only provide resistance
  // near the edges to prevent it from disappearing off-screen entirely.
  // ─────────────────────────────────────────────────────────────────
  const getBounds = useCallback((scale) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { minX: -BOUNDS_BOOST, maxX: BOUNDS_BOOST, minY: -BOUNDS_BOOST, maxY: BOUNDS_BOOST }
    const { width: cW, height: cH } = rect
    const scaledW = canvasWidth * scale
    const scaledH = canvasHeight * scale
    // Allow dragging well beyond the grid edges — user can pan freely.
    // Bounce-back resistance only kicks in when grid would go off-screen.
    // With transform-origin:50% 50%, canvas center = (cx, cy) from container center.
    // To see either edge, center must reach ±(containerHalf + scaledHalf).
    const extraX = (scaledW + cW) / 2 + BOUNDS_BOOST
    const extraY = (scaledH + cH) / 2 + BOUNDS_BOOST
    return {
      minX: -extraX,
      maxX: extraX,
      minY: -extraY,
      maxY: extraY,
    }
  }, [canvasWidth, canvasHeight])

  // Inline clamp: avoids separate useCallback that captures stale getBounds
  const softClamp = useCallback((cx, cy, scale) => {
    const { minX, maxX, minY, maxY } = getBounds(scale)
    return {
      x: cx < minX ? minX : cx > maxX ? maxX : cx,
      y: cy < minY ? minY : cy > maxY ? maxY : cy,
    }
  }, [getBounds])

  // ─────────────────────────────────────────────────────────────────
  // Effect 1: repaint the BASE canvas — only when committedData or grid
  // dimensions change (infrequent: commit / undo / redo / reset / resize).
  // The live stroke feedback is painted on the overlay layer by the painter,
  // so this expensive full-grid scan no longer runs on every mousemove tick.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    painter.repaintBase(committedData, cols, rows)
  }, [committedData, cols, rows, painter])

  // ─────────────────────────────────────────────────────────────────
  // Effect 2: hover highlight on the overlay layer (cheap — 1 cell).
  // Skipped while a stroke is in progress: the overlay is then owned by the
  // stroke-painting path (paintToStroke / applyFill), not the hover effect.
  // When not drawing, the overlay contains ONLY the hover cell, so clearing
  // it fully on each change is safe and avoids a trail.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDrawingRef.current) return
    painter.clearOverlay()
    if (hoverCell && tool === 'pencil') {
      const ctx = painter.overlayRef.current?.getContext('2d')
      if (ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.fillRect(hoverCell.x * CELL_SIZE, hoverCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
        ctx.lineWidth = 2
        ctx.strokeRect(hoverCell.x * CELL_SIZE, hoverCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
      }
    }
  }, [hoverCell, tool, painter])

  // ─────────────────────────────────────────────────────────────────
  // 坐标转换
  // ─────────────────────────────────────────────────────────────────
  const getGridPos = useCallback((clientX, clientY) => {
    const canvas = painter.baseRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor((clientX - rect.left) * scaleX / CELL_SIZE)
    const y = Math.floor((clientY - rect.top) * scaleY / CELL_SIZE)
    if (x >= 0 && x < cols && y >= 0 && y < rows) return { x, y }
    return null
  }, [cols, rows, painter])

  // 检测鼠标/触控是否在canvas区域内（考虑缩放和变换）
  const isOverCanvas = useCallback((clientX, clientY) => {
    const canvas = painter.baseRef.current
    if (!canvas || !containerRef.current) return false
    const rect = canvas.getBoundingClientRect()
    return (
      clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom
    )
  }, [painter])

  // ─────────────────────────────────────────────────────────────────
  // 填色逻辑
  // ─────────────────────────────────────────────────────────────────
  // Snapshot committedData into the stroke accumulator at the start of each stroke.
  // The base canvas already mirrors committedData, so the accumulator starts from
  // the same authoritative state the user sees before the stroke.
  const startStroke = useCallback(() => {
    if (!committedData) return
    strokeAccumRef.current = committedData.map(row => [...row])
  }, [committedData])

  // Apply pencil/eraser to the accumulator AND paint the result directly onto the
  // overlay layer. No React state dispatch, no rAF throttle — the cell appears under
  // the cursor on the same event tick, so a fast drag can never queue up a backlog
  // of redraws. strokeAccumRef is still mutated synchronously so commitStroke reads
  // the final, up-to-date stroke.
  const paintToStroke = useCallback((x, y) => {
    if (!strokeAccumRef.current) return
    if (tool === 'pencil') {
      strokeAccumRef.current[y][x] = selectedColor
      painter.paintOverlayCell(x, y, selectedColor)
    } else if (tool === 'eraser') {
      strokeAccumRef.current[y][x] = null
      painter.clearOverlayCell(x, y)
    }
  }, [tool, selectedColor, painter])

  // Flood-fill into the accumulator and paint the filled region onto the overlay.
  // The fill result is shown immediately (no per-cell drag, so no backlog risk).
  const applyFill = useCallback((x, y) => {
    const source = strokeAccumRef.current
    if (!source) return
    const targetColor = source[y][x]
    if (targetColor === selectedColor) return
    const newData = source.map(row => [...row])
    const stack = [[x, y]]
    const visited = new Set()
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()
      const key = `${cx},${cy}`
      if (visited.has(key)) continue
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue
      if (source[cy][cx] !== targetColor) continue
      visited.add(key)
      newData[cy][cx] = selectedColor
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
    }
    strokeAccumRef.current = newData
    // Paint only the changed cells onto the overlay (the filled region).
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        if (newData[ry][rx] !== source[ry][rx]) {
          painter.paintOverlayCell(rx, ry, newData[ry][rx])
        }
      }
    }
  }, [selectedColor, cols, rows, painter])

  // Commit the accumulated stroke to history (PUSH) — called on mouseUp/mouseLeave.
  // The overlay preview is cleared; committedData updates via onCanvasChange and
  // Effect 1 repaints the base layer from the new committed state.
  const commitStroke = useCallback(() => {
    painter.clearOverlay()
    if (strokeAccumRef.current) {
      const acc = strokeAccumRef.current
      strokeAccumRef.current = null
      // 空操作(笔画前后无实际变化,如重复点击同色格)不 PUSH,防重复快照占满 undo 栈
      const noChange = acc.length === committedData.length
        && acc.every((row, y) => row.length === committedData[y].length
          && row.every((cell, x) => cell === committedData[y][x]))
      if (noChange) return
      onCanvasChange(acc)
    }
  }, [onCanvasChange, painter, committedData])

  // 丢弃进行中的笔画(undo/redo 竞态防护:避免 commitStroke 重推笔画前快照回滚 undo)
  const cancelStroke = useCallback(() => {
    strokeAccumRef.current = null
    painter.clearOverlay()
  }, [painter])

  // ─────────────────────────────────────────────────────────────────
  // 适应屏幕
  // ─────────────────────────────────────────────────────────────────
  const fitToScreen = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const availableW = rect.width - 24
    const availableH = rect.height - 24
    const scaleX = availableW / canvasWidth
    const scaleY = availableH / canvasHeight
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)))
    setTransform({ scale: newScale, cx: 0, cy: 0 })
  }, [canvasWidth, canvasHeight])

  // 大网格自动适应屏幕
  useEffect(() => {
    if (cols > 50 || rows > 50) {
      fitToScreen()
    }
  }, [cols, rows])

  // ─────────────────────────────────────────────────────────────────
  // 重置
  // ─────────────────────────────────────────────────────────────────
  const resetTransform = useCallback(() => {
    if (momentumRef.current) {
      cancelAnimationFrame(momentumRef.current)
      momentumRef.current = null
    }
    velocityRef.current = { x: 0, y: 0 }
    isPanningRef.current = false
    panHasStartedRef.current = false
    isDrawingRef.current = false
    setPanActive(false)
    setTransform({ scale: 1, cx: 0, cy: 0 })
  }, [])

  // 暴露 reset/fit 方法给父组件（必须在 resetTransform/fitToScreen 之后）
  useImperativeHandle(ref, () => ({
    resetTransform,
    fitToScreen,
    cancelStroke,
  }), [resetTransform, fitToScreen, cancelStroke])

  // ─────────────────────────────────────────────────────────────────
  // PC: 鼠标滚轮缩放（以光标为中心）
  // ─────────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const cursorX = e.clientX - rect.left - rect.width / 2
    const cursorY = e.clientY - rect.top - rect.height / 2

    const oldScale = transform.scale
    const delta = e.deltaY > 0 ? 0.93 : 1.07
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * delta))

    if (Math.abs(newScale - oldScale) < 0.001) return

    // Keep the canvas point under the cursor fixed.
    // With transform-origin:50% 50%, canvas center = (cx, cy).
    // Correct formula: new_center = cursor + (old_center - cursor) * (newScale/oldScale)
    const ratio = newScale / oldScale
    const rawCX = cursorX + (transform.cx - cursorX) * ratio
    const rawCY = cursorY + (transform.cy - cursorY) * ratio
    const clamped = softClamp(rawCX, rawCY, newScale)

    setTransform({ scale: newScale, cx: clamped.x, cy: clamped.y })
  }, [transform, softClamp])

  // React attaches onWheel as a passive listener by default, so preventDefault()
  // inside a JSX-bound handler silently fails — trackpad pinch (wheel + ctrlKey)
  // then falls through to the browser's own page zoom. Bind natively with
  // { passive: false } so preventDefault actually blocks page zoom.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ─────────────────────────────────────────────────────────────────
  // PC: 鼠标拖拽平移（canvas内外均可）
  // ─────────────────────────────────────────────────────────────────
  const handleContainerMouseDown = useCallback((e) => {
    if (e.button !== 0) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cursorX = e.clientX - rect.left - rect.width / 2
    const cursorY = e.clientY - rect.top - rect.height / 2

    if (tool === 'hand') {
      e.preventDefault()
      isPanningRef.current = true
      panHasStartedRef.current = false  // Wait for movement threshold (3px)
      isDrawingRef.current = false
      setPanActive(true)
      panCursorStartRef.current = { x: cursorX, y: cursorY }
      panStartRef.current = { x: transform.cx, y: transform.cy }
      return
    }

    if (isOverCanvas(e.clientX, e.clientY)) {
      // 在canvas内 → 记录起始位置，等移动超过阈值后切换为平移
      const pos = getGridPos(e.clientX, e.clientY)
      if (pos) {
        isDrawingRef.current = true
        drawStartRef.current = { x: e.clientX, y: e.clientY }
        startStroke()
        if (tool === 'pencil' || tool === 'eraser') paintToStroke(pos.x, pos.y)
        else if (tool === 'fill') applyFill(pos.x, pos.y)
      }
      panHasStartedRef.current = false
      isPanningRef.current = false
      panCursorStartRef.current = { x: cursorX, y: cursorY }
      panStartRef.current = { x: transform.cx, y: transform.cy }
      return
    }

    // 在canvas外 → 直接开始平移
    e.preventDefault()
    isPanningRef.current = true
    panHasStartedRef.current = true
    isDrawingRef.current = false
    panCursorStartRef.current = { x: cursorX, y: cursorY }
    panStartRef.current = { x: transform.cx, y: transform.cy }
  }, [isOverCanvas, getGridPos, startStroke, paintToStroke, applyFill, transform, tool])

  const handleContainerMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cursorX = e.clientX - rect.left - rect.width / 2
    const cursorY = e.clientY - rect.top - rect.height / 2

    // Drawing mode: only draw if actually on a cell AND haven't exceeded pan threshold
    if (isDrawingRef.current && !panHasStartedRef.current) {
      const dx = e.clientX - drawStartRef.current.x
      const dy = e.clientY - drawStartRef.current.y
      const distMoved = Math.hypot(dx, dy)

      // Pencil/eraser: drag continues drawing strokes — only pan if on whitespace
      if (tool === 'pencil' || tool === 'eraser') {
        const pos = getGridPos(e.clientX, e.clientY)
        setHoverCell(pos)
        if (pos) {
          paintToStroke(pos.x, pos.y)
        } else if (distMoved > DRAW_THRESHOLD) {
          // Dragged off canvas → commit stroke and switch to pan
          commitStroke()
          panHasStartedRef.current = true
          isPanningRef.current = true
          isDrawingRef.current = false
          panCursorStartRef.current = { x: cursorX, y: cursorY }
          panStartRef.current = { x: transform.cx, y: transform.cy }
        }
        return
      }

      if (distMoved > DRAW_THRESHOLD) {
        // Exceeded threshold → commit stroke and switch to pan mode
        commitStroke()
        panHasStartedRef.current = true
        isPanningRef.current = true
        isDrawingRef.current = false
        panCursorStartRef.current = { x: cursorX, y: cursorY }
        panStartRef.current = { x: transform.cx, y: transform.cy }
        // Don't return — let the pan logic below run this same event
      } else {
        // Within threshold → draw (only if actually on a cell)
        const pos = getGridPos(e.clientX, e.clientY)
        setHoverCell(pos)
        if (pos) applyFill(pos.x, pos.y)
        return
      }
    }

    // Pan mode
    if (!isPanningRef.current) return

    const deltaX = cursorX - panCursorStartRef.current.x
    const deltaY = cursorY - panCursorStartRef.current.y

    const rawCX = panStartRef.current.x + deltaX
    const rawCY = panStartRef.current.y + deltaY

    setTransform(prev => {
      const clamped = softClamp(rawCX, rawCY, prev.scale)
      return { ...prev, cx: clamped.x, cy: clamped.y }
    })
  }, [getGridPos, paintToStroke, applyFill, commitStroke, softClamp, tool])

  const handleContainerMouseUp = useCallback(() => {
    if (isDrawingRef.current) commitStroke()
    isDrawingRef.current = false
    isPanningRef.current = false
    panHasStartedRef.current = false
    setPanActive(false)
  }, [commitStroke])

  const handleContainerMouseLeave = useCallback(() => {
    if (isDrawingRef.current) commitStroke()
    isDrawingRef.current = false
    isPanningRef.current = false
    setPanActive(false)
    setHoverCell(null)
  }, [commitStroke])

  // PC hover
  const handleMouseMove = useCallback((e) => {
    const pos = getGridPos(e.clientX, e.clientY)
    setHoverCell(pos)
  }, [getGridPos])

  const handleMouseLeave = useCallback(() => {
    setHoverCell(null)
  }, [])

  // ─────────────────────────────────────────────────────────────────
  // 移动端触控
  // ─────────────────────────────────────────────────────────────────
  const stopMomentum = useCallback(() => {
    if (momentumRef.current) {
      cancelAnimationFrame(momentumRef.current)
      momentumRef.current = null
    }
    velocityRef.current = { x: 0, y: 0 }
  }, [])

  const startMomentum = useCallback(() => {
    stopMomentum()
    const applyMomentum = () => {
      const { x: vx, y: vy } = velocityRef.current
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed < MOMENTUM_THRESHOLD) {
        velocityRef.current = { x: 0, y: 0 }
        return
      }
      setTransform(prev => {
        const rawCX = prev.cx + vx
        const rawCY = prev.cy + vy
        const clamped = softClamp(rawCX, rawCY, prev.scale)
        return { ...prev, cx: clamped.x, cy: clamped.y }
      })
      velocityRef.current = {
        x: vx * MOMENTUM_FRICTION,
        y: vy * MOMENTUM_FRICTION,
      }
      momentumRef.current = requestAnimationFrame(applyMomentum)
    }
    momentumRef.current = requestAnimationFrame(applyMomentum)
  }, [stopMomentum, softClamp])

  const handleTouchStart = useCallback((e) => {
    e.preventDefault()
    lastTouchRef.current = Date.now()
    stopMomentum()

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    if (e.touches.length >= 2) {
      // 双指及以上 → 开始pinch,同时清除单指点击状态
      pinchRef.current = {
        startDist: Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        ),
        startScale: transform.scale,
        startCX: transform.cx,
        startCY: transform.cy,
      }
      touchStartRef.current = null
      touchMovedRef.current = false
      wasPinchingRef.current = true
      return
    }

    if (e.touches.length === 1) {
      const t = e.touches[0]
      const cursorX = t.clientX - rect.left - rect.width / 2
      const cursorY = t.clientY - rect.top - rect.height / 2
      const gridPos = tool === 'hand' ? null : getGridPos(t.clientX, t.clientY)

      // 单指手势在此开始(必然是全新手势,不可能是 pinch 的延续),允许点按填色
      wasPinchingRef.current = false
      touchStartRef.current = { x: t.clientX, y: t.clientY, gridPos }
      touchMovedRef.current = false
      velocityRef.current = { x: 0, y: 0 }
      lastTouchTimeRef.current = Date.now()
      lastTouchPosRef.current = { x: t.clientX, y: t.clientY }

      // 抓手工具或不在grid上 → 开始单指平移
      if (!gridPos) {
        touchPanCursorStartRef.current = { x: cursorX, y: cursorY }
        touchPanCanvasStartRef.current = { x: transform.cx, y: transform.cy }
      }
    }
  }, [stopMomentum, getGridPos, transform, tool])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    if (e.touches.length === 2 && pinchRef.current) {
      // 双指 → pinch缩放
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const { startDist, startScale, startCX, startCY } = pinchRef.current
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        startScale * (dist / startDist)
      ))

      // pinch中心
      const pcx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left - rect.width / 2
      const pcy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top - rect.height / 2

      // Same formula as wheel zoom: keep pinch-center point fixed on canvas.
      const pinchRatio = newScale / startScale
      const rawCX = pcx + (startCX - pcx) * pinchRatio
      const rawCY = pcy + (startCY - pcy) * pinchRatio
      const clamped = softClamp(rawCX, rawCY, newScale)

      setTransform({ scale: newScale, cx: clamped.x, cy: clamped.y })
      return
    }

    if (e.touches.length === 1) {
      const t = e.touches[0]
      const now = Date.now()
      const dt = now - lastTouchTimeRef.current
      const dx = t.clientX - lastTouchPosRef.current.x
      const dy = t.clientY - lastTouchPosRef.current.y

      if (dt > 0) {
        velocityRef.current = {
          x: dx / dt * 16,
          y: dy / dt * 16,
        }
      }
      lastTouchTimeRef.current = now
      lastTouchPosRef.current = { x: t.clientX, y: t.clientY }

      const cursorX = t.clientX - rect.left - rect.width / 2
      const cursorY = t.clientY - rect.top - rect.height / 2

      // 不在grid上 → 单指平移
      if (!touchStartRef.current?.gridPos && touchStartRef.current) {
        touchMovedRef.current = true
        const rawCX = touchPanCanvasStartRef.current.x + cursorX - touchPanCursorStartRef.current.x
        const rawCY = touchPanCanvasStartRef.current.y + cursorY - touchPanCursorStartRef.current.y
        setTransform(prev => {
          const clamped = softClamp(rawCX, rawCY, prev.scale)
          return { ...prev, cx: clamped.x, cy: clamped.y }
        })
        return
      }

      // 在grid上但有移动
      if (touchStartRef.current?.gridPos) {
        const gridPos = getGridPos(t.clientX, t.clientY)
        setHoverCell(gridPos)

        const startX = touchStartRef.current.x
        const startY = touchStartRef.current.y
        const moved = Math.hypot(t.clientX - startX, t.clientY - startY)

        if (moved > 10 && !touchMovedRef.current) {
          touchMovedRef.current = true
          touchPanCanvasStartRef.current = { x: transform.cx, y: transform.cy }
          touchPanCursorStartRef.current = { x: cursorX, y: cursorY }
        }

        if (touchMovedRef.current) {
          const rawCX = touchPanCanvasStartRef.current.x + cursorX - touchPanCursorStartRef.current.x
          const rawCY = touchPanCanvasStartRef.current.y + cursorY - touchPanCursorStartRef.current.y
          setTransform(prev => {
            const clamped = softClamp(rawCX, rawCY, prev.scale)
            return { ...prev, cx: clamped.x, cy: clamped.y }
          })
        }
      }
    }
  }, [getGridPos, transform, softClamp])

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault()

    if (e.touches.length === 0) {
      pinchRef.current = null

      // 单指点击(未移动)且在grid上 → 填色（抓手工具不绘制;
      // pinch 结束后的剩余手指抬起不算点按,不得填色）
      if (tool !== 'hand' && !wasPinchingRef.current && touchStartRef.current?.gridPos && !touchMovedRef.current) {
        const { x, y } = touchStartRef.current.gridPos
        startStroke()
        if (tool === 'pencil' || tool === 'eraser') paintToStroke(x, y)
        else if (tool === 'fill') applyFill(x, y)
        commitStroke()
      }

      // 惯性
      const { x: vx, y: vy } = velocityRef.current
      if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
        startMomentum()
      }

      touchStartRef.current = null
      touchMovedRef.current = false
      wasPinchingRef.current = false
      setHoverCell(null)
    } else if (e.touches.length === 1) {
      // 从双指切回单指:剩余手指只是 pinch 的延续,抬起时不得触发点按填色
      pinchRef.current = null
      wasPinchingRef.current = true
      const t = e.touches[0]
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const gridPos = getGridPos(t.clientX, t.clientY)
        touchStartRef.current = { x: t.clientX, y: t.clientY, gridPos }
        touchMovedRef.current = false
        lastTouchTimeRef.current = Date.now()
        lastTouchPosRef.current = { x: t.clientX, y: t.clientY }

        if (!gridPos) {
          const cursorX = t.clientX - rect.left - rect.width / 2
          const cursorY = t.clientY - rect.top - rect.height / 2
          touchPanCanvasStartRef.current = { x: transform.cx, y: transform.cy }
          touchPanCursorStartRef.current = { x: cursorX, y: cursorY }
        }
      }
    }
  }, [startStroke, paintToStroke, applyFill, commitStroke, getGridPos, transform, startMomentum, tool])

  const handleTouchCancel = useCallback(() => {
    stopMomentum()
    touchStartRef.current = null
    touchMovedRef.current = false
    pinchRef.current = null
    wasPinchingRef.current = false
    setHoverCell(null)
  }, [stopMomentum])

  // 双击重置(仅鼠标语义):触屏快速连点(移动端连续填珠)会由浏览器合成 dblclick,不触发重置
  const handleDoubleClick = useCallback(() => {
    if (Date.now() - lastTouchRef.current < 600) return
    resetTransform()
  }, [resetTransform])

  // ─────────────────────────────────────────────────────────────────
  // Transform style: left:50%/top:50% center canvas-inner on canvas-container,
  // transformTranslate applies the pan offset (cx/cy) + centering (-50%) + scale
  // ─────────────────────────────────────────────────────────────────
  const transformStyle = {
    transform: `translate(calc(-50% + ${transform.cx}px), calc(-50% + ${transform.cy}px)) scale(${transform.scale})`,
    willChange: 'transform',
  }

  return (
    <div className="canvas-wrapper">
<div className="canvas-info">
        <span>{cols} × {rows}</span>
        <span className="info-divider">|</span>
        <span>{Math.round(transform.scale * 100)}%</span>
        <button className="reset-btn" onClick={resetTransform} title={t('canvas.resetTitle')}>
          {t('canvas.reset')}
        </button>
        <button className="fit-btn" onClick={fitToScreen} title={t('canvas.fitTitle')}>
          {t('canvas.fit')}
        </button>
      </div>

      <div
        className="canvas-container"
        ref={containerRef}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseLeave={handleContainerMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: tool === 'hand' ? (panActive ? 'grabbing' : 'grab') : (panActive ? 'grabbing' : 'default') }}
      >
        <div className="canvas-inner" style={transformStyle}>
          <div style={{ position: 'relative', lineHeight: 0 }}>
            <canvas
              ref={painter.baseRefCallback}
              width={canvasWidth}
              height={canvasHeight}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{
                imageRendering: 'pixelated',
                touchAction: 'none',
                display: 'block',
                cursor: tool === 'hand' ? (panActive ? 'grabbing' : 'grab') : (panActive ? 'grabbing' : 'crosshair'),
              }}
            />
            <canvas
              ref={painter.overlayRefCallback}
              width={canvasWidth}
              height={canvasHeight}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                imageRendering: 'pixelated',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        .canvas-wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          flex: 1;
          width: 100%;
          height: 100%;
          min-height: 0;
        }
        .canvas-info {
          /* 悬浮于画布左上角的半透明紧凑 HUD:画布延伸到顶,不再预留整条工具条;
             控件浮在空白角、平时微淡(0.65)不抢画布,hover 变清晰。
             保留 尺寸读数 + 缩放比 + 重置/适应 按钮 */
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 20;
          display: flex;
          gap: 8px;
          align-items: center;
          font-size: var(--text-sm);
          color: var(--text-secondary);
          background: rgba(255, 253, 248, 0.82);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          box-shadow: 0 2px 10px rgba(43, 36, 32, 0.12);
          opacity: 0.65;
          transition: opacity 0.2s;
        }
        .canvas-info:hover { opacity: 1; }
        .canvas-info .info-divider { opacity: 0.5; }
        /* 手机(<640px)：隐藏画布悬浮胶囊，由顶部 MobileCanvasInfoBar 横幅替代 */
        @media (max-width: 639px) {
          .canvas-info {
            display: none !important;
          }
        }
        /* 平板(640–1023px)：悬浮胶囊作为主要控件常驻——触屏无 hover 态，
           取消半透明、放大按钮，避免与手机横幅重复 */
        @media (min-width: 640px) and (max-width: 1023px) {
          .canvas-info {
            opacity: 1;
            padding: 8px 16px;
            font-size: var(--text-base);
          }
          .canvas-info .reset-btn,
          .canvas-info .fit-btn {
            padding: 6px 14px;
            font-size: var(--text-sm);
          }
        }
        .reset-btn {
          background: var(--secondary-accent);
          color: white;
          border: none;
          padding: 3px 10px;
          border-radius: 10px;
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all 0.2s;
        }
.reset-btn:hover {
          background: var(--secondary-accent-hover);
          transform: scale(1.05);
        }
        .fit-btn {
          background: var(--accent);
          color: white;
          border: none;
          padding: 3px 10px;
          border-radius: 10px;
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all 0.2s;
        }
        .fit-btn:hover {
          background: var(--accent-hover);
          transform: scale(1.05);
        }
        .canvas-container {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: hidden;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
        }
        .canvas-inner {
          position: absolute;
          left: 50%;
          top: 50%;
          transform-origin: 50% 50%;
          background: var(--bg-primary);
          border-radius: var(--radius-card);
          padding: 12px;
          box-shadow:
            0 4px 6px -1px rgba(43, 36, 32, 0.08),
            0 2px 4px -2px rgba(43, 36, 32, 0.08),
            0 0 0 1px var(--border-color);
        }
      `}</style>
    </div>
  )
})

export default Canvas
