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
