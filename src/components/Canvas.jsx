import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCanvasPainter } from '../hooks/useCanvasPainter'
import { normalizeSelection, pointInSelection, clampMove } from '../utils/selectionUtils'
import { drawMarquee, MARQUEE_DASH_PERIOD } from '../utils/marquee'

const CELL_SIZE = 16
const MIN_SCALE = 0.3
const MAX_SCALE = 5
const MOMENTUM_FRICTION = 0.88
const MOMENTUM_THRESHOLD = 0.5
const BOUNDS_BOOST = 200 // Extra space beyond visible area before bounce-back kicks in

// 触屏判定:设备能力,不是视口宽度 —— 半屏桌面窗口不应被误判成触屏。
function isCoarsePointer() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
}

// 选框虚线的流动相位:落定后由 rAF 缓慢推进(marching ants),
// 让选框始终「活着」,一眼能看出这是可操作区域而不是图案的一部分。
const MARQUEE_TICK_MS = 60

const Canvas = forwardRef(function Canvas({
  gridSize,
  gridWidth,
  gridHeight,
  selectedColor,
  tool,
  committedData,
  onCanvasChange,
  onTransformChange,
  // M5: 取色器把画布上的颜色交回父组件;选区变化时同步矩形给工具条
  onPickColor,
  selection,
  onSelectionChange,
  // M5.2: 在选区内按下并拖动 = 移动选区内容(拖到哪就贴到哪)
  onSelectionMove,
}, ref) {
  const { t } = useTranslation()
  const containerRef = useRef(null)

  const [hoverCell, setHoverCell] = useState(null)
  const [panActive, setPanActive] = useState(false)

  // 变换状态：scale + canvas画布中心在container中的位置
  const [transform, setTransform] = useState({ scale: 1, cx: 0, cy: 0 })

  // 选区拖动状态(矩形选区工具专用,与笔画状态互斥):
  //   anchor — 按下时的格子;focus — 当前指针所在格子(实时更新选框)
  // 选区本身由父组件持有,画布只负责「拖出矩形」和「绘制选框」。
  // 拖动中的选框直接画在 overlay 上(见 updateSelection),所以焦点只需 ref,
  // 不需要 state —— 每帧重渲染反而会拖慢跟手速度。
  const selAnchorRef = useRef(null)
  const selDraggingRef = useRef(false)
  const selFocusRef = useRef(null)

  // 拖拽移动选区内容(M5.2):在选区内按下 → 拖动 → 松手提交。
  //   startPos — 按下时的格子(用于算偏移量)
  //   baseSel  — 按下时的选区(拖动期间保持不变,提交时才换新位置)
  //   offset   — 最近一次预览的钳制后偏移,松手时直接用它提交
  const moveDraggingRef = useRef(false)
  const moveStartRef = useRef(null)
  const moveBaseSelRef = useRef(null)
  const moveOffsetRef = useRef({ dx: 0, dy: 0 })
  // 拖拽移动结束后强制重画 overlay 选框:若本次移动没有实际变化(比如在边缘被钳住),
  // selection prop 不会变,effect 不会重跑,选框会停留在被预览清空的状态。
  const [overlayTick, setOverlayTick] = useState(0)

  // 选框虚线的流动相位(marching ants)。用 ref 而非 state:动画每 60ms 推进一次,
  // 直接重画 overlay 即可,不应触发 React 重渲染。
  const dashOffsetRef = useRef(0)
  // 触屏能力在挂载时判定一次并缓存:动画 tick 发生在 render 之外,
  // 若每帧重新 matchMedia,测试里 mock 被还原后把手会突然消失。
  const coarsePointerRef = useRef(isCoarsePointer())

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
  // Effect 2: hover highlight + selection marquee on the overlay layer.
  // Skipped while a stroke is in progress: the overlay is then owned by the
  // stroke-painting path (paintToStroke / applyFill), not the hover effect.
  // When not drawing, the overlay contains ONLY the hover cell and the
  // marquee, so clearing it fully on each change is safe and leaves no trail.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDrawingRef.current || selDraggingRef.current || moveDraggingRef.current) return
    painter.clearOverlay()
    if (tool === 'pencil' && hoverCell) {
      const ctx = painter.overlayRef.current?.getContext('2d')
      if (ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.fillRect(hoverCell.x * CELL_SIZE, hoverCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
        ctx.lineWidth = 2
        ctx.strokeRect(hoverCell.x * CELL_SIZE, hoverCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
      }
    }
    // 选区框画在 overlay 上:虚线描边 + 内部淡色遮罩 + (触屏)四角把手。
    // 线宽/虚线按 1/scale 补偿,缩放到 0.3× 或 5× 都保持同样的屏幕观感。
    if (tool === 'select' && selection) {
      drawMarquee(painter.overlayRef.current?.getContext('2d'), selection, {
        cellSize: CELL_SIZE,
        scale: transform.scale,
        dashOffset: dashOffsetRef.current,
        handles: coarsePointerRef.current,
      })
    }
  }, [hoverCell, tool, painter, selection, overlayTick, transform.scale])

  // ─────────────────────────────────────────────────────────────────
  // Effect 2b: marching ants —— 选框落定后虚线缓慢流动。
  // 只在「选区工具 + 有选区 + 没有进行中的拖动」时运行,60ms 推进一格相位;
  // 直接重画 overlay,不进入 React state,因此不会引起重渲染或历史变化。
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tool !== 'select' || !selection) return undefined
    let raf = 0
    let last = 0
    const step = (now) => {
      if (selDraggingRef.current || moveDraggingRef.current) {
        // 拖动中由各自的预览路径独占 overlay,这里让位,避免互相清屏闪烁
        raf = requestAnimationFrame(step)
        return
      }
      if (now - last >= MARQUEE_TICK_MS) {
        last = now
        dashOffsetRef.current = (dashOffsetRef.current + 1) % MARQUEE_DASH_PERIOD
        painter.clearOverlay()
        drawMarquee(painter.overlayRef.current?.getContext('2d'), selection, {
          cellSize: CELL_SIZE,
          scale: transform.scale,
          dashOffset: dashOffsetRef.current,
          handles: coarsePointerRef.current,
        })
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [tool, selection, painter, transform.scale])

  // ─────────────────────────────────────────────────────────────────
  // 坐标转换
  // ─────────────────────────────────────────────────────────────────
  const getGridPos = useCallback((clientX, clientY) => {
    const canvas = painter.baseRef.current
    if (!canvas) return null
    // getBoundingClientRect 已经包含 CSS transform(scale)后的实际显示尺寸,
    // 因此这里算出的比例把缩放折算掉了 —— 0.3× 与 5× 下同一屏坐标都落到同一格。
    // (规格 04 §8:缩放后点击/拖选不得偏移;此函数是唯一坐标入口。)
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
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
    // 拖拽移动的预览同样属于「未提交的临时状态」,一并丢弃
    moveDraggingRef.current = false
    moveStartRef.current = null
    moveBaseSelRef.current = null
    moveOffsetRef.current = { dx: 0, dy: 0 }
    painter.clearOverlay()
  }, [painter])

  // 网格尺寸变化 / 换项目:丢弃进行中的笔画与拖选(规格 04 §3)。
  // 若不做,旧尺寸的累加器会在下一次 pointerup 时被 commitStroke 提交,
  // 把刚载入的新画布覆盖回旧矩阵;拖选锚点也还停在旧坐标系里。
  // 只依赖 cols/rows —— committedData 每次提交/撤销都会换引用,不能作为切换信号。
  useEffect(() => {
    cancelStroke()
    isDrawingRef.current = false
    isPanningRef.current = false
    panHasStartedRef.current = false
    selDraggingRef.current = false
    selAnchorRef.current = null
    selFocusRef.current = null
  }, [cols, rows, cancelStroke])

  // ─────────────────────────────────────────────────────────────────
  // 选区 / 取色 命令
  // ─────────────────────────────────────────────────────────────────
  // 取色器:读该格颜色交回父组件(空网格不取色,避免把 null 设成当前色)。
  const pickColorAt = useCallback((x, y) => {
    const hex = committedData?.[y]?.[x]
    if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) {
      onPickColor?.(hex)
    }
  }, [committedData, onPickColor])

  // 开始拖选:记录锚点并清掉旧选区(新选区随拖动实时生成)。
  // 立即画出 1×1 的选框:按下即有反馈,不用等第一次移动。
  const startSelection = useCallback((x, y) => {
    selAnchorRef.current = { x, y }
    selFocusRef.current = { x, y }
    selDraggingRef.current = true
    onSelectionChange?.(null)
    painter.clearOverlay()
    drawMarquee(painter.overlayRef.current?.getContext('2d'), { x, y, w: 1, h: 1 }, {
      cellSize: CELL_SIZE,
      scale: transform.scale,
      dashOffset: dashOffsetRef.current,
      handles: coarsePointerRef.current,
    })
  }, [onSelectionChange, painter, transform.scale])

  // 拖动中:把锚点与当前格规范成矩形,**直接画在 overlay 上**。
  // 不依赖 React 渲染 —— 每一帧移动都立即跟手,虚线框随手指/光标实时变形,
  // 松手前就能看清将要选中的范围(这是「实时跟随预览」的核心)。
  const updateSelection = useCallback((x, y) => {
    if (!selDraggingRef.current || !selAnchorRef.current) return
    selFocusRef.current = { x, y }
    const rect = normalizeSelection(selAnchorRef.current, { x, y }, cols, rows)
    painter.clearOverlay()
    drawMarquee(painter.overlayRef.current?.getContext('2d'), rect, {
      cellSize: CELL_SIZE,
      scale: transform.scale,
      dashOffset: dashOffsetRef.current,
      handles: coarsePointerRef.current,
    })
    onSelectionChange?.(rect)
  }, [onSelectionChange, cols, rows, painter, transform.scale])

  // 松开:确认选区。单击(锚点=焦点)视为「取消选区」,避免 1×1 选框常驻。
  const endSelection = useCallback(() => {
    if (!selDraggingRef.current) return
    selDraggingRef.current = false
    const anchor = selAnchorRef.current
    selAnchorRef.current = null
    if (!anchor) return
    const focus = selFocusRef.current || anchor
    if (anchor.x === focus.x && anchor.y === focus.y) {
      painter.clearOverlay()
      onSelectionChange?.(null)
      return
    }
    // 提交后的选框交给 Effect 2 / marching-ants 动画接管;
    // 这里先按最终矩形补画一次,避免松手瞬间闪空。
    const rect = normalizeSelection(anchor, focus, cols, rows)
    painter.clearOverlay()
    drawMarquee(painter.overlayRef.current?.getContext('2d'), rect, {
      cellSize: CELL_SIZE,
      scale: transform.scale,
      dashOffset: dashOffsetRef.current,
      handles: coarsePointerRef.current,
    })
    onSelectionChange?.(rect)
  }, [onSelectionChange, cols, rows, painter, transform.scale])

  // ─────────────────────────────────────────────────────────────────
  // 拖拽移动选区内容(M5.2,规格 04 §2)
  // ─────────────────────────────────────────────────────────────────
  // 在已选中的区域内部按下并拖动 = 移动内容,而不是重新拖一个新选框。
  // 拖动期间只画预览(overlay 上画半透明块),松手才提交一条历史。
  // 越界规则:偏移量被 clampMove 钳制,内容始终整体留在画布内,绝不悄悄裁掉珠子。
  const startMove = useCallback((x, y) => {
    moveDraggingRef.current = true
    moveStartRef.current = { x, y }
    moveBaseSelRef.current = { ...selection }
    moveOffsetRef.current = { dx: 0, dy: 0 }
  }, [selection])

  const updateMove = useCallback((x, y) => {
    if (!moveDraggingRef.current || !moveStartRef.current || !moveBaseSelRef.current) return
    const rawDx = x - moveStartRef.current.x
    const rawDy = y - moveStartRef.current.y
    const { dx, dy } = clampMove(moveBaseSelRef.current, rawDx, rawDy, cols, rows)
    moveOffsetRef.current = { dx, dy }
    // 预览:清空 overlay 后把块按偏移画在半透明层上,原位置保持可见(移动意图更直观);
    // 选框同时跟到新位置 —— 虚线框与珠子一起走,松手前就能确认落点。
    const base = moveBaseSelRef.current
    painter.clearOverlay()
    for (let r = 0; r < base.h; r++) {
      for (let c = 0; c < base.w; c++) {
        const hex = committedData?.[base.y + r]?.[base.x + c]
        if (typeof hex !== 'string' || !hex) continue
        const tx = base.x + c + dx
        const ty = base.y + r + dy
        if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) continue
        painter.paintOverlayCell(tx, ty, hex)
      }
    }
    drawMarquee(painter.overlayRef.current?.getContext('2d'), {
      x: base.x + dx, y: base.y + dy, w: base.w, h: base.h,
    }, {
      cellSize: CELL_SIZE,
      scale: transform.scale,
      dashOffset: dashOffsetRef.current,
      handles: coarsePointerRef.current,
    })
  }, [cols, rows, painter, committedData, transform.scale])

  const endMove = useCallback(() => {
    if (!moveDraggingRef.current) return
    moveDraggingRef.current = false
    moveStartRef.current = null
    const base = moveBaseSelRef.current
    moveBaseSelRef.current = null
    const { dx, dy } = moveOffsetRef.current
    moveOffsetRef.current = { dx: 0, dy: 0 }
    painter.clearOverlay()
    // 无论是否提交,都让选框重画一次(预览期间 overlay 被清空过)
    setOverlayTick(n => n + 1)
    if (!base || (!dx && !dy)) return
    onSelectionMove?.({ dx, dy, selection: base })
  }, [painter, onSelectionMove])

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
        // 取色器 / 矩形选区:一次性操作,不进入笔画状态机(不创建 stroke 累加器)
        if (tool === 'eyedropper') {
          e.preventDefault()
          pickColorAt(pos.x, pos.y)
          return
        }
        if (tool === 'select') {
          e.preventDefault()
          // 在已有选区内按下 = 拖拽移动内容;在选区外按下 = 重新拖选框
          if (pointInSelection(selection, pos)) startMove(pos.x, pos.y)
          else startSelection(pos.x, pos.y)
          return
        }
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
  }, [isOverCanvas, getGridPos, startStroke, paintToStroke, applyFill, transform, tool, pickColorAt, startSelection, startMove, selection])

  const handleContainerMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cursorX = e.clientX - rect.left - rect.width / 2
    const cursorY = e.clientY - rect.top - rect.height / 2

    // 拖拽移动:只更新预览,不平移、不填色
    if (moveDraggingRef.current) {
      const pos = getGridPos(e.clientX, e.clientY)
      if (pos) updateMove(pos.x, pos.y)
      return
    }

    // 选区拖动:更新矩形,不参与笔画/平移判定
    if (selDraggingRef.current) {
      const pos = getGridPos(e.clientX, e.clientY)
      if (pos) updateSelection(pos.x, pos.y)
      return
    }

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
  }, [getGridPos, paintToStroke, applyFill, commitStroke, softClamp, tool, updateSelection, updateMove])

  const handleContainerMouseUp = useCallback(() => {
    if (moveDraggingRef.current) endMove()
    if (selDraggingRef.current) endSelection()
    if (isDrawingRef.current) commitStroke()
    isDrawingRef.current = false
    isPanningRef.current = false
    panHasStartedRef.current = false
    setPanActive(false)
  }, [commitStroke, endSelection, endMove])

  const handleContainerMouseLeave = useCallback(() => {
    if (moveDraggingRef.current) endMove()
    if (selDraggingRef.current) endSelection()
    if (isDrawingRef.current) commitStroke()
    isDrawingRef.current = false
    isPanningRef.current = false
    setPanActive(false)
    setHoverCell(null)
  }, [commitStroke, endSelection, endMove])

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
      // 若此时正在拖拽移动,第二根手指意味着用户要缩放,丢弃移动预览而不是在松手时误提交
      if (moveDraggingRef.current) {
        moveDraggingRef.current = false
        moveStartRef.current = null
        moveBaseSelRef.current = null
        moveOffsetRef.current = { dx: 0, dy: 0 }
        painter.clearOverlay()
        setOverlayTick(n => n + 1)
      }
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

      // 矩形选区:在格子上按下即开始拖选(不用等 10px 阈值,选框需要即时反馈)
      if (tool === 'select' && gridPos) {
        // 在已有选区内按下 = 拖拽移动内容;在选区外按下 = 重新拖选框
        if (pointInSelection(selection, gridPos)) startMove(gridPos.x, gridPos.y)
        else startSelection(gridPos.x, gridPos.y)
        return
      }

      // 抓手工具或不在grid上 → 开始单指平移
      if (!gridPos) {
        touchPanCursorStartRef.current = { x: cursorX, y: cursorY }
        touchPanCanvasStartRef.current = { x: transform.cx, y: transform.cy }
      }
    }
  }, [stopMomentum, getGridPos, transform, tool, startSelection, startMove, selection, painter])

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

      // 拖拽移动:只更新预览,不平移、不填色
      if (moveDraggingRef.current) {
        const pos = getGridPos(t.clientX, t.clientY)
        if (pos) updateMove(pos.x, pos.y)
        return
      }

      // 选区拖动:只更新选框,不平移、不填色
      if (selDraggingRef.current) {
        const pos = getGridPos(t.clientX, t.clientY)
        if (pos) updateSelection(pos.x, pos.y)
        return
      }

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
  }, [getGridPos, transform, softClamp, updateSelection, updateMove])

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault()

    if (e.touches.length === 0) {
      pinchRef.current = null

      // 拖拽移动结束:提交偏移(单指点按 = 原地不动,不产生历史)
      if (moveDraggingRef.current) {
        endMove()
        touchStartRef.current = null
        touchMovedRef.current = false
        wasPinchingRef.current = false
        setHoverCell(null)
        return
      }

      // 选区拖动结束:确认矩形(单指点按 = 取消选区)
      if (selDraggingRef.current) {
        endSelection()
        touchStartRef.current = null
        touchMovedRef.current = false
        wasPinchingRef.current = false
        setHoverCell(null)
        return
      }

      // 单指点击(未移动)且在grid上 → 填色（抓手工具不绘制;
      // pinch 结束后的剩余手指抬起不算点按,不得填色）
      if (tool !== 'hand' && !wasPinchingRef.current && touchStartRef.current?.gridPos && !touchMovedRef.current) {
        const { x, y } = touchStartRef.current.gridPos
        if (tool === 'eyedropper') {
          pickColorAt(x, y)
        } else if (tool === 'select') {
          // 选区工具单击空点 = 取消选区(由 endSelection 语义覆盖)
          onSelectionChange?.(null)
        } else {
          startStroke()
          if (tool === 'pencil' || tool === 'eraser') paintToStroke(x, y)
          else if (tool === 'fill') applyFill(x, y)
          commitStroke()
        }
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
  }, [startStroke, paintToStroke, applyFill, commitStroke, getGridPos, transform, startMomentum, tool, pickColorAt, endSelection, endMove, onSelectionChange])

  const handleTouchCancel = useCallback(() => {
    stopMomentum()
    if (moveDraggingRef.current) {
      // 取消手势:丢弃移动预览,保留原选区与原矩阵
      moveDraggingRef.current = false
      moveStartRef.current = null
      moveBaseSelRef.current = null
      moveOffsetRef.current = { dx: 0, dy: 0 }
      painter.clearOverlay()
    }
    if (selDraggingRef.current) {
      // 取消手势:丢弃半成品选区,保留父组件已有的选区
      selDraggingRef.current = false
      selAnchorRef.current = null
      selFocusRef.current = null
      painter.clearOverlay()
    }
    touchStartRef.current = null
    touchMovedRef.current = false
    pinchRef.current = null
    wasPinchingRef.current = false
    setHoverCell(null)
  }, [stopMomentum, painter])

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

  // 选区工具与取色器沿用 crosshair(与画笔一致),抓手工具用抓取光标
  const canvasCursor = tool === 'hand'
    ? (panActive ? 'grabbing' : 'grab')
    : (panActive ? 'grabbing' : 'crosshair')

  return (
    <div className="canvas-wrapper">
<div className="canvas-info">
        <span>{cols} × {rows}</span>
        <span className="info-divider">|</span>
        <span>{Math.round(transform.scale * 100)}%</span>
        {tool === 'select' && selection && (
          <span className="info-selection" data-testid="selection-size">
            {selection.w} × {selection.h}
          </span>
        )}
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
        style={{ cursor: canvasCursor }}
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
                cursor: canvasCursor,
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
        .canvas-info .info-selection {
          font-variant-numeric: tabular-nums;
          color: var(--secondary-accent);
          font-weight: var(--font-weight-semibold);
        }
        /* 手机(<640px)：隐藏画布悬浮胶囊，由顶部 MobileCanvasInfoBar 横幅替代。
           平板(≥640px)沿用与 PC 相同的悬浮胶囊样式(半透明 0.65、hover 变清晰),
           不做额外放大，保持与移动端/PC 一致的观感 */
        @media (max-width: 639px) {
          .canvas-info {
            display: none !important;
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
