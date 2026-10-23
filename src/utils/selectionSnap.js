/**
 * Selection edge snapping (A3).
 *
 * 框选精度完全靠手指/光标时,靠近已有图案边缘总会差一格。吸附把候选边界
 * 拉到最近的一条「珠子边界」上(珠块与空白的分界),让框选一次到位。
 *
 * 三条约束,都来自「不能抢手感」这个前提:
 *   1. **只在阈值内生效** —— 超出就是完全自由拖动,行为与没有吸附时一模一样;
 *   2. **只吸活动边** —— 锚点那条边是用户按下时定的,不该在拖动中被拽走;
 *   3. **可关闭** —— 开关关掉后 `snapSelection` 直接原样返回,调用方无需分支。
 *
 * 纯函数:不碰 React、不碰 canvas,吸附结果与高亮线位置都能单独断言。
 */

import { normalizeSelection } from './selectionUtils'

/**
 * 吸附阈值(格)。
 *
 * 触屏比鼠标宽:手指的落点误差本来就大于光标,用同样的阈值会让触屏几乎
 * 吸不上。2 格 ≈ 32px(默认单元尺寸),正好是「手指差一点」的量级。
 */
export const SNAP_THRESHOLD = { fine: 1, coarse: 2 }

function hasBead(data, x, y) {
  const cell = data?.[y]?.[x]
  return cell !== null && cell !== undefined
}

/** 某列在 [top, bottom) 行范围内是否有珠子 */
function columnHasBead(data, col, top, bottom) {
  for (let y = top; y < bottom; y++) {
    if (hasBead(data, col, y)) return true
  }
  return false
}

/** 某行在 [left, right) 列范围内是否有珠子 */
function rowHasBead(data, row, left, right) {
  for (let x = left; x < right; x++) {
    if (hasBead(data, x, row)) return true
  }
  return false
}

/**
 * x 处的垂直边界是否是一条「珠子边界」。
 *
 * 只看 x 两侧那一列在 [top, bottom) 内有没有珠子。`wantBeadRight` 表示
 * 珠子在边界的**右侧**(x 这一列有珠子、x-1 没有)—— 这正是拖右边界时
 * 想贴上去的位置:框到珠子左边为止。反之要贴「珠子在左侧」的边界。
 */
function isVerticalEdge(data, x, top, bottom, cols, wantBeadRight) {
  const left = x - 1 >= 0 ? columnHasBead(data, x - 1, top, bottom) : false
  const right = x < cols ? columnHasBead(data, x, top, bottom) : false
  return wantBeadRight ? (right && !left) : (left && !right)
}

/**
 * y 处的水平边界是否是一条「珠子边界」。
 *
 * 判据是**边界内外各一行**在该列范围内有没有珠子:
 *   - 拖下边界(wantBeadAbove):边界上方那行有珠子、下方那行没有 → 正好框到珠块底;
 *   - 拖上边界(wantBeadBelow):反过来。
 *
 * 不能只拿「边界是否夹在珠子中间」判断 —— 一整列同色时每一行都夹在珠子中间,
 * 永远吸不上,而那正是最常见的框选场景。
 */
function isHorizontalEdge(data, y, left, right, rows, wantBeadAbove) {
  const above = y - 1 >= 0 ? rowHasBead(data, y - 1, left, right) : false
  const below = y < rows ? rowHasBead(data, y, left, right) : false
  return wantBeadAbove ? (above && !below) : (below && !above)
}

/**
 * 在 `edge ± threshold` 内找最近的边界位置,没有则 null。
 *
 * 距离相同时取**远离选区内部**的那一侧?不 —— 取先遇到的(从小到大遍历
 * 距离,同距离时向外优先)。同距离内吸会让框变小,外吸会让框变大,
 * 两者都合理;选向外是因为「宁可多框一颗,不要漏掉一颗」更符合拼豆的
 * 使用习惯(多框了只是多几颗珠子,漏了则要重框)。
 */
function findNearestEdgeX(data, edge, top, bottom, cols, threshold, wantBeadRight) {
  for (let d = 0; d <= threshold; d++) {
    const candidates = d === 0 ? [edge] : [edge - d, edge + d]
    for (const c of candidates) {
      if (c < 0 || c > cols) continue
      if (isVerticalEdge(data, c, top, bottom, cols, wantBeadRight)) return c
    }
  }
  return null
}

function findNearestEdgeY(data, edge, left, right, rows, threshold, wantBeadAbove) {
  for (let d = 0; d <= threshold; d++) {
    const candidates = d === 0 ? [edge] : [edge - d, edge + d]
    for (const c of candidates) {
      if (c < 0 || c > rows) continue
      if (isHorizontalEdge(data, c, left, right, rows, wantBeadAbove)) return c
    }
  }
  return null
}

/**
 * 把拖动的焦点格吸附到最近的珠子边界。
 *
 * 返回 `{ point, snapped: { x, y } }`:
 *   - `point` 是吸附后的焦点,调用方直接拿它去算矩形;
 *   - `snapped.x/y` 为 true 表示该轴发生了吸附,用来画对齐高亮线。
 *
 * 只在「焦点与锚点在该轴上不同」时吸附 —— 两者相等意味着这一轴还没拖开,
 * 没有活动边可吸。
 */
export function snapSelection(data, anchor, focus, cols, rows, threshold) {
  const unchanged = { point: focus, snapped: { x: false, y: false } }
  if (!anchor || !focus || !(threshold > 0) || cols <= 0 || rows <= 0) return unchanged

  const rect = normalizeSelection(anchor, focus, cols, rows)
  if (!rect) return unchanged

  let fx = focus.x
  let fy = focus.y
  let snappedX = false
  let snappedY = false

  // X 轴:焦点在锚点右侧 → 拖的是右边界,要贴「珠子在右」的边界
  if (fx !== anchor.x) {
    const movingRight = fx > anchor.x
    const edge = movingRight ? rect.x + rect.w : rect.x
    const hit = findNearestEdgeX(data, edge, rect.y, rect.y + rect.h, cols, threshold, movingRight)
    if (hit !== null) {
      // 右边界位置 = 格索引 + 1,所以吸附到边界 b 时焦点是 b-1
      fx = movingRight ? hit - 1 : hit
      snappedX = true
    }
  }

  // Y 轴同理。用**已吸附的 fx** 重算列范围,两轴才不会互相打架。
  if (fy !== anchor.y) {
    const nextRect = normalizeSelection({ x: anchor.x, y: anchor.y }, { x: fx, y: fy }, cols, rows)
    const movingDown = fy > anchor.y
    const edge = movingDown ? nextRect.y + nextRect.h : nextRect.y
    // 拖下边界 → 要贴「上方有珠、下方空」的边界;拖上边界反过来。
    const hit = findNearestEdgeY(
      data, edge, nextRect.x, nextRect.x + nextRect.w, rows, threshold, movingDown,
    )
    if (hit !== null) {
      fy = movingDown ? hit - 1 : hit
      snappedY = true
    }
  }

  return { point: { x: fx, y: fy }, snapped: { x: snappedX, y: snappedY } }
}
