/**
 * Selection marquee rendering, shared by the PC and touch paths.
 *
 * The marquee lives on the overlay canvas and is redrawn:
 *   - on every pointer move while the user is dragging a new rectangle,
 *   - on every pointer move while the user drags the selection contents,
 *   - by a slow animation tick after the rectangle is committed (marching ants),
 *     so the finished selection reads as an active region rather than a static
 *     rectangle that looks like part of the artwork.
 *
 * Line width, dash lengths and handle radius are divided by the canvas zoom
 * (1 / scale) so the marquee keeps a constant on-screen weight: at 0.3× it is
 * still visible, at 5× it does not turn into a thick band. The dash offset is
 * scaled the same way so the ants crawl at the same visual speed at any zoom.
 *
 * Pure function (no React, no canvas element lookup) so it can be unit-tested
 * with a recording 2d context.
 */

export const MARQUEE_DASH_PERIOD = 10 // dash + gap in canvas units at scale 1
export const MARQUEE_STROKE = 'rgba(74, 155, 142, 0.95)'
export const MARQUEE_FILL = 'rgba(74, 155, 142, 0.10)'
const HANDLE_RADIUS = 5
// resize 手柄:方块边长(屏幕像素),按 1/scale 折算后画在格边界上
const RESIZE_HANDLE_SIZE = 8
// 吸附高亮线颜色:比虚线框更醒目,一眼能看出「这条边贴住了」
export const MARQUEE_SNAP = 'rgba(255, 152, 0, 0.95)'

/**
 * Draw a lasso (mask-based) selection.
 *
 * 套索的形状不在矩形里,不能复用 drawMarquee 的 fillRect/strokeRect ——
 * 那样会把形状画成一个外接矩形,用户看不出自己到底圈了哪几格。
 * 这里按掩码逐格画:填充块 + 沿掩码边界的虚线。
 *
 * 边界线的画法:**只画「选中格与未选中格之间」的那条边**。
 * 对每一格检查四邻,邻居没被选中就画这条边 —— 这样凹多边形、带洞的形状
 * 都能得到一条贴合形状的闭合轮廓,而不需要把掩码重新还原成多边形路径。
 * 内部相邻的格子之间不画线,所以内部是干净的填充色。
 */
export function drawLassoMarquee(ctx, sel, {
  cellSize = 16,
  scale = 1,
  dashOffset = 0,
} = {}) {
  if (!ctx || !sel || sel.kind !== 'lasso' || !sel.mask) return
  const zoom = scale > 0 ? scale : 1
  const inv = 1 / zoom
  const b = sel.bounds
  if (!b) return
  const { cols, rows, mask } = sel

  const inside = (x, y) => (
    x >= 0 && x < cols && y >= 0 && y < rows && mask[y * cols + x] === 1
  )

  // 填充:逐格画小块。外接矩形先整体铺一层淡色,再让未选中的格子
  // 「挖空」是不行的 —— 画布没有擦除语义(会连底下的珠子一起擦掉),
  // 所以只能正向画每个选中的格子。
  ctx.save()
  ctx.fillStyle = MARQUEE_FILL
  for (let y = b.y; y < b.y + b.h; y++) {
    // 同一行里连续的选中格合并成一段,减少 fillRect 调用次数:
    // 200×200 的套索逐格画会有上万次调用,合并后通常只剩几十次。
    let runStart = -1
    for (let x = b.x; x <= b.x + b.w; x++) {
      const on = x < b.x + b.w && inside(x, y)
      if (on && runStart < 0) runStart = x
      else if (!on && runStart >= 0) {
        ctx.fillRect(
          runStart * cellSize,
          y * cellSize,
          (x - runStart) * cellSize,
          cellSize,
        )
        runStart = -1
      }
    }
  }
  ctx.restore()

  // 轮廓:沿掩码边界逐段描边
  ctx.save()
  ctx.setLineDash([6 * inv, 4 * inv])
  ctx.lineDashOffset = dashOffset * inv
  ctx.lineWidth = 2 * inv
  ctx.strokeStyle = MARQUEE_STROKE
  ctx.beginPath()
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      if (!inside(x, y)) continue
      const px = x * cellSize
      const py = y * cellSize
      if (!inside(x, y - 1)) { ctx.moveTo(px, py); ctx.lineTo(px + cellSize, py) }
      if (!inside(x, y + 1)) { ctx.moveTo(px, py + cellSize); ctx.lineTo(px + cellSize, py + cellSize) }
      if (!inside(x - 1, y)) { ctx.moveTo(px, py); ctx.lineTo(px, py + cellSize) }
      if (!inside(x + 1, y)) { ctx.moveTo(px + cellSize, py); ctx.lineTo(px + cellSize, py + cellSize) }
    }
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * 选区绘制入口:按 kind 分派到矩形或套索。
 *
 * 调用方(Canvas)只需要这一个函数 —— 矩形路径仍然走原来的 drawMarquee,
 * 一个字节都没改,因此「矩形选区零回归」是结构上的保证而不是靠测试兜底。
 */
export function drawSelection(ctx, sel, options = {}) {
  if (!sel) return
  if (sel.kind === 'lasso') drawLassoMarquee(ctx, sel, options)
  else drawMarquee(ctx, sel, options)
}

/**
 * Draw a rectangular selection marquee.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} rect  selection in grid cells
 * @param {object} [opts]
 * @param {number} [opts.cellSize=16]   canvas px per grid cell
 * @param {number} [opts.scale=1]       current canvas zoom (CSS transform)
 * @param {number} [opts.dashOffset=0]  marching-ants phase
 * @param {boolean} [opts.handles=false] draw corner handles (touch devices)
 * @param {boolean} [opts.resizeHandles=false] draw the eight resize squares (A1)
 * @param {{x:boolean,y:boolean}} [opts.snapEdges] highlight the snapped edges (A3)
 */
export function drawMarquee(ctx, rect, {
  cellSize = 16,
  scale = 1,
  dashOffset = 0,
  handles = false,
  resizeHandles = false,
  snapEdges = null,
} = {}) {
  if (!ctx || !rect) return
  const zoom = scale > 0 ? scale : 1
  const inv = 1 / zoom

  const px = rect.x * cellSize
  const py = rect.y * cellSize
  const pw = rect.w * cellSize
  const ph = rect.h * cellSize

  ctx.save()
  ctx.fillStyle = MARQUEE_FILL
  ctx.fillRect(px, py, pw, ph)
  ctx.setLineDash([6 * inv, 4 * inv])
  ctx.lineDashOffset = dashOffset * inv
  ctx.lineWidth = 2 * inv
  ctx.strokeStyle = MARQUEE_STROKE
  // 向内缩进半条线宽,避免描边压在选区外的格子上
  ctx.strokeRect(px + inv, py + inv, pw - 2 * inv, ph - 2 * inv)
  ctx.restore()

  // A3:被吸住的那条边画一条实线高亮。
  //
  // 吸附本身没有视觉反馈时,用户会觉得选框「自己跳了一下」—— 尤其是
  // 只差一格的情况下,分不清是自己手抖还是程序在拽。实线明确告诉他:
  // 这条边现在贴住了珠子。
  if (snapEdges && (snapEdges.x || snapEdges.y)) {
    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = 3 * inv
    ctx.strokeStyle = MARQUEE_SNAP
    // x 方向吸附 → 被吸的是左或右边界,画竖线;y 同理画横线。
    // 具体是哪一边由 rect 与吸附后的焦点共同决定,这里只按两侧都画一条
    // 太吵 —— 用整条边(吸附轴对应的两条边)更简单且不会误报方向。
    if (snapEdges.x) {
      ctx.beginPath()
      ctx.moveTo(px + pw, py)
      ctx.lineTo(px + pw, py + ph)
      ctx.stroke()
    }
    if (snapEdges.y) {
      ctx.beginPath()
      ctx.moveTo(px, py + ph)
      ctx.lineTo(px + pw, py + ph)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 触摸设备没有 hover,用四角把手明确「这块区域可以按住拖动」。
  if (handles) {
    const r = HANDLE_RADIUS * inv
    ctx.save()
    ctx.fillStyle = MARQUEE_STROKE
    for (const [hx, hy] of [
      [px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph],
    ]) {
      ctx.beginPath()
      ctx.arc(hx, hy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // A1:八个 resize 手柄(四角 + 四边中点),画成实心方块。
  //
  // 与上面的圆形把手是两回事:圆形只提示「可拖动」,方块是真正可拖拽的
  // 尺寸控制点。尺寸按 1/scale 折算,因此 0.3× 与 5× 下屏幕大小恒定。
  // 1×1 选区不画 —— 八个方块会把唯一那一格糊满,反而看不出选了哪。
  if (resizeHandles && (rect.w > 1 || rect.h > 1)) {
    const half = (RESIZE_HANDLE_SIZE * inv) / 2
    const midX = px + pw / 2
    const midY = py + ph / 2
    ctx.save()
    ctx.fillStyle = MARQUEE_STROKE
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1 * inv
    for (const [hx, hy] of [
      [px, py], [midX, py], [px + pw, py],
      [px + pw, midY],
      [px + pw, py + ph], [midX, py + ph], [px, py + ph],
      [px, midY],
    ]) {
      ctx.beginPath()
      ctx.rect(hx - half, hy - half, half * 2, half * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }
}
