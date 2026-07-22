import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

const CELL_SIZE = 16
const MIN_SCALE = 0.3
const MAX_SCALE = 5
const MOMENTUM_FRICTION = 0.88
const MOMENTUM_THRESHOLD = 0.5
const BOUNDS_BOOST = 200 // Extra space beyond visible area before bounce-back kicks in

export default function Canvas({
  gridSize,
  gridWidth,
  gridHeight,
  selectedColor,
  tool,
  canvasData,
  onDraw,
  onCanvasChange,
}) {
  const { t } = useTranslation()
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const containerRef = useRef(null)

  const [hoverCell, setHoverCell] = useState(null)
  const [panActive, setPanActive] = useState(false)

  // 变换状态：scale + canvas画布中心在container中的位置
  const [transform, setTransform] = useState({ scale: 1, cx: 0, cy: 0 })

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
  const strokeAccumRef = useRef(null) // accumulated canvas state during a drag stroke

  const cols = gridWidth || gridSize
  const rows = gridHeight || gridSize
  const canvasWidth = cols * CELL_SIZE
  const canvasHeight = rows * CELL_SIZE

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
  // Effect 1: full grid redraw — only when cell data changes (expensive)
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    if (canvasData) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (canvasData[y]?.[x]) {
            ctx.fillStyle = canvasData[y][x]
            ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          }
        }
      }
    }

    ctx.strokeStyle = '#d4d4d4'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL_SIZE, 0)
      ctx.lineTo(i * CELL_SIZE, canvasHeight)
      ctx.stroke()
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath()
      ctx.moveTo(0, i * CELL_SIZE)
      ctx.lineTo(canvasWidth, i * CELL_SIZE)
      ctx.stroke()
    }
  }, [canvasData, cols, rows, canvasWidth, canvasHeight])

  // ─────────────────────────────────────────────────────────────────
  // Effect 2: hover highlight on transparent overlay (cheap — 1 cell)
  // Runs on every mousemove but never touches the base canvas.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    if (hoverCell && tool === 'pencil') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
      ctx.fillRect(hoverCell.x * CELL_SIZE, hoverCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = 2
      ctx.strokeRect(hoverCell.x * CELL_SIZE, hoverCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
    }
  }, [hoverCell, tool, canvasWidth, canvasHeight])

  // ─────────────────────────────────────────────────────────────────
  // 坐标转换
  // ─────────────────────────────────────────────────────────────────
  const getGridPos = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor((clientX - rect.left) * scaleX / CELL_SIZE)
    const y = Math.floor((clientY - rect.top) * scaleY / CELL_SIZE)
    if (x >= 0 && x < cols && y >= 0 && y < rows) return { x, y }
    return null
  }, [cols, rows])

  // 检测鼠标/触控是否在canvas区域内（考虑缩放和变换）
  const isOverCanvas = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current
    if (!canvas || !containerRef.current) return false
    const rect = canvas.getBoundingClientRect()
    return (
      clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom
    )
  }, [])

  // ─────────────────────────────────────────────────────────────────
  // 填色逻辑
  // ─────────────────────────────────────────────────────────────────
  // Snapshot canvasData into the stroke accumulator at the start of each stroke
  const startStroke = useCallback(() => {
    if (!canvasData) return
    strokeAccumRef.current = canvasData.map(row => [...row])
  }, [canvasData])

  // Apply pencil/eraser to the accumulator and emit via onDraw (no history entry)
  const paintToStroke = useCallback((x, y) => {
    if (!strokeAccumRef.current) return
    if (tool === 'pencil') strokeAccumRef.current[y][x] = selectedColor
    else if (tool === 'eraser') strokeAccumRef.current[y][x] = null
    onDraw(strokeAccumRef.current)
  }, [tool, selectedColor, onDraw])

  // Flood-fill into the accumulator and emit via onDraw (no history entry)
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
    onDraw(newData)
  }, [selectedColor, cols, rows, onDraw])

  // Commit the accumulated stroke to history (PUSH) — called on mouseUp/mouseLeave
  const commitStroke = useCallback(() => {
    if (strokeAccumRef.current) {
      onCanvasChange(strokeAccumRef.current)
      strokeAccumRef.current = null
    }
  }, [onCanvasChange])

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
    stopMomentum()

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    if (e.touches.length === 2) {
      // 双指 → 开始pinch
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
      return
    }

    if (e.touches.length === 1) {
      const t = e.touches[0]
      const cursorX = t.clientX - rect.left - rect.width / 2
      const cursorY = t.clientY - rect.top - rect.height / 2
      const gridPos = tool === 'hand' ? null : getGridPos(t.clientX, t.clientY)

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

      // 单指点击(未移动)且在grid上 → 填色（抓手工具不绘制）
      if (tool !== 'hand' && touchStartRef.current?.gridPos && !touchMovedRef.current) {
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
      setHoverCell(null)
    } else if (e.touches.length === 1) {
      // 从双指切回单指
      pinchRef.current = null
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
    setHoverCell(null)
  }, [stopMomentum])

  // 双击重置
  const handleDoubleClick = useCallback(() => {
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
        <span>|</span>
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
              ref={canvasRef}
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
              ref={overlayRef}
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
          display: flex;
          gap: 12px;
          font-size: 13px;
          color: var(--text-secondary);
          justify-content: center;
          align-items: center;
          background: var(--bg-primary);
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid var(--border-color);
          flex-shrink: 0;
        }
        .reset-btn {
          background: var(--secondary-accent);
          color: white;
          border: none;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
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
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
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
}
