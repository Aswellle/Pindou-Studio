/**
 * Pure helpers for rectangular selection editing (M5).
 *
 * Design rules:
 *   - Never mutate the input matrix. Every command returns a fresh matrix so
 *     App can push exactly one undo entry per user command.
 *   - "Nothing changed" is expressed as `{ data: null, changed: 0 }`. Callers
 *     must not push history for a null result — this is what keeps repeated
 *     clicks (or a move that ends where it started) from filling the undo stack.
 *   - Cells outside the grid are always clipped, never wrapped. A selection
 *     that hangs off the edge still edits exactly the visible part.
 *   - `null` means "empty cell" and is a first-class value: color replacement
 *     must never treat blank cells as a color, and rotation must move blanks
 *     along with beads.
 */

/** Shallow-clone every row (cells are primitives: hex strings or null). */
export function cloneMatrix(data) {
  return data.map(row => row.map(cell => cell))
}

function gridSize(data) {
  if (!Array.isArray(data) || data.length === 0) return { rows: 0, cols: 0 }
  return { rows: data.length, cols: Array.isArray(data[0]) ? data[0].length : 0 }
}

/**
 * Build a normalized rectangle from two grid cells (anchor + current focus).
 * The result is clamped to the grid, so it is always safe to iterate.
 */
export function normalizeSelection(anchor, focus, cols, rows) {
  if (!anchor || !focus || cols <= 0 || rows <= 0) return null
  const clampX = (v) => Math.max(0, Math.min(cols - 1, v))
  const clampY = (v) => Math.max(0, Math.min(rows - 1, v))
  const x1 = clampX(Math.min(anchor.x, focus.x))
  const x2 = clampX(Math.max(anchor.x, focus.x))
  const y1 = clampY(Math.min(anchor.y, focus.y))
  const y2 = clampY(Math.max(anchor.y, focus.y))
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }
}

/** True when a grid cell lies inside the selection rectangle. */
export function pointInSelection(sel, pos) {
  return !!sel && !!pos
    && pos.x >= sel.x && pos.x < sel.x + sel.w
    && pos.y >= sel.y && pos.y < sel.y + sel.h
}

/** Iterate the in-grid cells of a selection (clipped). */
function forEachSelected(sel, cols, rows, fn) {
  const x0 = Math.max(0, sel.x)
  const y0 = Math.max(0, sel.y)
  const x1 = Math.min(cols, sel.x + sel.w)
  const y1 = Math.min(rows, sel.y + sel.h)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) fn(x, y)
  }
}

function diffCount(a, b, rows, cols) {
  let changed = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (a[y]?.[x] !== b[y]?.[x]) changed++
    }
  }
  return changed
}

/**
 * Fill the selection with `color` (null = erase).
 *
 * 规格 04 §2:默认**只改已有珠子**,空白格保持空白 —— 框选一片区域点「填充」
 * 不应该无提示地把整片空白铺满。需要连空白一起填时,调用方显式传
 * `{ includeEmpty: true }`(UI 上是一个常驻开关,状态会记住)。
 *
 * 返回值里的 `skippedEmpty` 让调用方能区分「本来就没有可填的珠子」和
 * 「已经是目标色」两种无变化情形,前者需要给用户一句提示,否则按钮像坏了。
 */
export function fillSelection(data, sel, color, { includeEmpty = false } = {}) {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0, skippedEmpty: 0 }
  const next = cloneMatrix(data)
  let changed = 0
  let skippedEmpty = 0
  forEachSelected(sel, cols, rows, (x, y) => {
    const current = next[y][x]
    // 空白格(null/undefined)默认跳过:填色不该凭空多出珠子
    if (!includeEmpty && (current === null || current === undefined)) {
      skippedEmpty++
      return
    }
    if (current !== color) {
      next[y][x] = color
      changed++
    }
  })
  return { data: changed ? next : null, changed, skippedEmpty }
}

/** Erase the selection (same as filling with null, named for readability). */
export function clearSelection(data, sel) {
  return fillSelection(data, sel, null)
}

/**
 * Mirror the selection contents in place.
 * axis 'horizontal' flips left↔right; 'vertical' flips top↔bottom.
 */
export function mirrorSelection(data, sel, axis = 'horizontal') {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0 }
  const next = cloneMatrix(data)
  let changed = 0
  forEachSelected(sel, cols, rows, (x, y) => {
    const sx = axis === 'horizontal' ? sel.x + (sel.w - 1 - (x - sel.x)) : x
    const sy = axis === 'vertical' ? sel.y + (sel.h - 1 - (y - sel.y)) : y
    const src = data[sy]?.[sx] ?? null
    if (next[y][x] !== src) {
      next[y][x] = src
      changed++
    }
  })
  return changed ? { data: next, changed } : { data: null, changed: 0 }
}

/**
 * Rotate the selection contents by 90° around the selection center.
 *
 * A W×H block becomes H×W, so the returned `selection` describes the new
 * rectangle — the caller must adopt it or the marquee would point at stale
 * coordinates. The rotated block is centered on the old rect and shifted back
 * inside the grid when possible; only when it is larger than the grid does it
 * get clipped (portrait/landscape grids where H > cols).
 */
export function rotateSelection(data, sel, direction = 'cw') {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0, selection: sel }

  const { x, y, w, h } = sel
  // Read the block, treating out-of-grid cells as empty.
  const block = []
  for (let r = 0; r < h; r++) {
    const row = []
    for (let c = 0; c < w; c++) row.push(data[y + r]?.[x + c] ?? null)
    block.push(row)
  }

  const nw = h
  const nh = w
  const rotated = Array.from({ length: nh }, () => Array(nw).fill(null))
  for (let r = 0; r < nh; r++) {
    for (let c = 0; c < nw; c++) {
      rotated[r][c] = direction === 'ccw' ? block[c][w - 1 - r] : block[h - 1 - c][r]
    }
  }

  // Anchor the rotated block at the selection's top-left (pixel-editor
  // convention: rotate in place). Only pull it back inside the grid when the
  // new block would overflow — that keeps repeated cw/ccw round-trips stable.
  const nx = Math.max(0, Math.min(x, cols - nw))
  const ny = Math.max(0, Math.min(y, rows - nh))

  const next = cloneMatrix(data)
  forEachSelected({ x, y, w, h }, cols, rows, (cx, cy) => { next[cy][cx] = null })
  for (let r = 0; r < nh; r++) {
    const ty = ny + r
    if (ty < 0 || ty >= rows) continue
    for (let c = 0; c < nw; c++) {
      const tx = nx + c
      if (tx < 0 || tx >= cols) continue
      next[ty][tx] = rotated[r][c]
    }
  }

  const changed = diffCount(data, next, rows, cols)
  const selection = { x: nx, y: ny, w: nw, h: nh }
  // 即使内容无变化(全空或对称图案),旋转后的选框形状仍然变了(W×H → H×W),
  // 所以始终返回新 selection;data 为 null 表示不需要压栈。
  return changed ? { data: next, changed, selection } : { data: null, changed: 0, selection }
}

/**
 * Count occurrences of a color across the canvas. `null` (blank) is not a
 * color and is never counted.
 */
export function countColor(data, color) {
  const { rows, cols } = gridSize(data)
  if (!color || rows === 0) return 0
  let n = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (data[y][x] === color) n++
    }
  }
  return n
}

/**
 * Colors actually present on the canvas, most used first.
 * Only valid #RRGGBB values are reported — legacy brand IDs would render as
 * black swatches in the picker and are not offered as replace sources.
 */
export function collectColorStats(data) {
  const { rows, cols } = gridSize(data)
  if (rows === 0) return []
  const counts = new Map()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = data[y][x]
      if (typeof cell !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(cell)) continue
      counts.set(cell, (counts.get(cell) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Replace every occurrence of `from` with `to` in one transaction.
 * Blank cells are never touched (a replace command must not silently fill the
 * canvas), and `to` may be null when the caller explicitly wants an erase.
 */
export function replaceColor(data, from, to) {
  const { rows, cols } = gridSize(data)
  if (!from || from === to || rows === 0) return { data: null, changed: 0 }
  const next = cloneMatrix(data)
  let changed = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (next[y][x] === from) {
        next[y][x] = to
        changed++
      }
    }
  }
  return changed ? { data: next, changed } : { data: null, changed: 0 }
}

/**
 * Cut the selection contents out of the matrix.
 * Returns the matrix with the region emptied plus the extracted block, which
 * the caller can stamp elsewhere (drag-to-move).
 */
export function liftSelection(data, sel) {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, block: null }
  const next = cloneMatrix(data)
  const block = Array.from({ length: sel.h }, () => Array(sel.w).fill(null))
  forEachSelected(sel, cols, rows, (x, y) => {
    block[y - sel.y][x - sel.x] = data[y][x]
    next[y][x] = null
  })
  return { data: next, block }
}

/** Write a block at (x, y), clipping anything outside the grid. */
export function stampBlock(data, block, x, y) {
  const { rows, cols } = gridSize(data)
  if (!block || rows === 0 || cols === 0) return { data: null, changed: 0 }
  const next = cloneMatrix(data)
  for (let r = 0; r < block.length; r++) {
    const ty = y + r
    if (ty < 0 || ty >= rows) continue
    for (let c = 0; c < block[r].length; c++) {
      const tx = x + c
      if (tx < 0 || tx >= cols) continue
      next[ty][tx] = block[r][c]
    }
  }
  const changed = diffCount(data, next, rows, cols)
  return changed ? { data: next, changed } : { data: null, changed: 0 }
}

/**
 * Clamp a move offset so the whole block stays inside the grid.
 *
 * Out-of-bounds rule for drag-to-move (规格 04 §2 requires an explicit rule):
 * **clamp, never clip** — the block slides along the edge instead of losing
 * beads off-canvas. Shared by the preview and the committed move so what the
 * user sees during the drag is exactly what lands on mouseup.
 */
export function clampMove(sel, dx, dy, cols, rows) {
  if (!sel || cols <= 0 || rows <= 0) return { dx: 0, dy: 0 }
  const minDx = -sel.x
  const maxDx = cols - sel.x - sel.w
  const minDy = -sel.y
  const maxDy = rows - sel.y - sel.h
  return {
    dx: Math.max(minDx, Math.min(maxDx, dx)),
    dy: Math.max(minDy, Math.min(maxDy, dy)),
  }
}

/**
 * Move the selection contents by (dx, dy) in one transaction.
 *
 * The offset is clamped by `clampMove` so the block always stays inside the
 * grid — moving never silently clips beads away. The clamped rectangle is
 * returned as `selection`, so the marquee always ends up exactly where the
 * content landed.
 *
 * `data` is null when nothing actually changed (empty region moved, or a block
 * moved onto identical content) — callers must not push history then, but the
 * new `selection` is still returned so the marquee follows the drag.
 */
export function moveSelection(data, sel, dx, dy) {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0, selection: sel }
  if (!dx && !dy) return { data: null, changed: 0, selection: sel }

  const offset = clampMove(sel, dx, dy, cols, rows)
  const nx = sel.x + offset.dx
  const ny = sel.y + offset.dy
  const selection = { x: nx, y: ny, w: sel.w, h: sel.h }
  if (nx === sel.x && ny === sel.y) return { data: null, changed: 0, selection: sel }

  const lifted = liftSelection(data, sel)
  if (!lifted.block) return { data: null, changed: 0, selection: sel }
  const stamped = stampBlock(lifted.data, lifted.block, nx, ny)
  const next = stamped.data || lifted.data
  const changed = diffCount(data, next, rows, cols)
  return changed ? { data: next, changed, selection } : { data: null, changed: 0, selection }
}
