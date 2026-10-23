/**
 * lassoCommands — 自由套索选区的编辑命令(掩码版)。
 *
 * 与 selectionUtils 的关系:**平行实现,不是替换**。
 *   - 矩形选区继续走 selectionUtils,一个字节都不改(A5 要求零回归);
 *   - 套索选区走这里,函数名与返回形状刻意保持一致
 *     (`{ data, changed, selection }`),调用方可以用同一套分派逻辑。
 *
 * 语义规则(与矩形版本对齐,用户不需要学第二套):
 *   - 旋转/镜像**绕外接矩形**进行,结果按掩码裁剪 —— 套索形状本身不旋转;
 *   - 移动/复制保持形状,越界一律 clamp(不 clip),与 clampMove 一致;
 *   - 内容没变化时 `data` 为 null,调用方不压历史。
 */

import { cloneMatrix } from './selectionUtils'
import { forEachLassoCell } from './lassoSelection'

function gridSize(data) {
  if (!Array.isArray(data) || data.length === 0) return { rows: 0, cols: 0 }
  return { rows: data.length, cols: Array.isArray(data[0]) ? data[0].length : 0 }
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

/** 掩码选区的格子数 */
function maskCount(sel, cols, rows) {
  let n = 0
  forEachLassoCell(sel, cols, rows, () => { n++ })
  return n
}

/**
 * 填充套索选区。默认只改已有珠子(与矩形版一致)。
 */
export function fillLasso(data, sel, color, { includeEmpty = false } = {}) {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0, skippedEmpty: 0 }
  const next = cloneMatrix(data)
  let changed = 0
  let skippedEmpty = 0
  forEachLassoCell(sel, cols, rows, (x, y) => {
    const current = next[y][x]
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

/** 擦除套索选区 */
export function clearLasso(data, sel) {
  return fillLasso(data, sel, null)
}

/**
 * 镜像套索选区内容,绕**外接矩形**翻转,结果按掩码裁剪。
 *
 * 为什么绕外接矩形而不是绕形状自身的质心:形状自身不对称时,绕质心翻转
 * 会让「选中的格子」和「翻转后的格子」对不上,用户看到的是内容飞出去一半。
 * 绕外接矩形翻转保证翻转前后覆盖的是同一片区域。
 */
export function mirrorLasso(data, sel, axis = 'horizontal') {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0 }
  const b = sel.bounds
  if (!b) return { data: null, changed: 0 }

  const next = cloneMatrix(data)
  let changed = 0
  forEachLassoCell(sel, cols, rows, (x, y) => {
    const sx = axis === 'horizontal' ? b.x + (b.w - 1 - (x - b.x)) : x
    const sy = axis === 'vertical' ? b.y + (b.h - 1 - (y - b.y)) : y
    // 翻转后的源格必须**也在选区内**,否则会把选区外的内容吸进来。
    // 这是掩码版与矩形版唯一的语义差别:矩形里每个格都在选区内,
    // 套索里翻转后的位置可能落在形状外。
    if (sel.mask[sy * sel.cols + sx] !== 1) return
    const src = data[sy]?.[sx] ?? null
    if (next[y][x] !== src) {
      next[y][x] = src
      changed++
    }
  })
  return changed ? { data: next, changed } : { data: null, changed: 0 }
}

/**
 * 旋转套索选区内容 90°,绕外接矩形中心,结果按掩码裁剪。
 *
 * 返回新的 selection(外接矩形按旋转后的形状重算)——
 * 与矩形版一致,调用方必须采纳,否则选框会指向旧坐标。
 */
export function rotateLasso(data, sel, direction = 'cw') {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0, selection: sel }
  const b = sel.bounds
  if (!b) return { data: null, changed: 0, selection: sel }

  const next = cloneMatrix(data)
  // 先清空原选区
  forEachLassoCell(sel, cols, rows, (x, y) => { next[y][x] = null })

  // 绕外接矩形中心旋转:新坐标 = 中心 + 旋转矩阵 · (旧坐标 - 中心)
  const cx = b.x + (b.w - 1) / 2
  const cy = b.y + (b.h - 1) / 2

  // 旋转后的外接矩形尺寸互换
  const nw = b.h
  const nh = b.w
  const nx = Math.max(0, Math.min(b.x, cols - nw))
  const ny = Math.max(0, Math.min(b.y, rows - nh))

  // 逐格搬运:对每个被选中的源格,算它在旋转后落在哪
  forEachLassoCell(sel, cols, rows, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    // cw: (dx,dy) → (-dy,dx);ccw: (dx,dy) → (dy,-dx)
    const rx = direction === 'ccw' ? dy : -dy
    const ry = direction === 'ccw' ? -dx : dx
    // 新外接矩形以 (nx,ny) 为左上,中心随之平移
    const ncx = nx + (nw - 1) / 2
    const ncy = ny + (nh - 1) / 2
    const tx = Math.round(ncx + rx)
    const ty = Math.round(ncy + ry)
    if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return
    next[ty][tx] = data[y]?.[x] ?? null
  })

  const changed = diffCount(data, next, rows, cols)
  // 旋转后的掩码:对每个源格算出落点,重新点亮
  const mask = new Uint8Array(cols * rows)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  forEachLassoCell(sel, cols, rows, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const rx = direction === 'ccw' ? dy : -dy
    const ry = direction === 'ccw' ? -dx : dx
    const ncx = nx + (nw - 1) / 2
    const ncy = ny + (nh - 1) / 2
    const tx = Math.round(ncx + rx)
    const ty = Math.round(ncy + ry)
    if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return
    mask[ty * cols + tx] = 1
    if (tx < minX) minX = tx
    if (tx > maxX) maxX = tx
    if (ty < minY) minY = ty
    if (ty > maxY) maxY = ty
  })

  const selection = maxX >= minX
    ? {
      kind: 'lasso',
      mask,
      cols,
      rows,
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    }
    : null

  return changed ? { data: next, changed, selection } : { data: null, changed: 0, selection }
}

/**
 * 复制套索选区内容。
 *
 * 返回的 block 是**外接矩形**大小的矩阵,选区外的格子填 null ——
 * 这样粘贴时形状能被完整保留(形状信息在 mask 里,见下方)。
 */
export function copyLasso(data, sel) {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { w: 0, h: 0, block: null, mask: null }
  const b = sel.bounds
  if (!b) return { w: 0, h: 0, block: null, mask: null }

  const block = Array.from({ length: b.h }, () => Array(b.w).fill(null))
  const mask = new Uint8Array(b.w * b.h)
  let hasContent = false
  forEachLassoCell(sel, cols, rows, (x, y) => {
    const cell = data[y][x]
    block[y - b.y][x - b.x] = cell
    mask[(y - b.y) * b.w + (x - b.x)] = 1
    if (cell !== null) hasContent = true
  })
  if (!hasContent) return { w: b.w, h: b.h, block: null, mask: null }
  return { w: b.w, h: b.h, block, mask }
}

/** 剪切套索选区 */
export function cutLasso(data, sel) {
  const copied = copyLasso(data, sel)
  if (!copied.block) return { ...copied, data: null, changed: 0 }
  const cleared = clearLasso(data, sel)
  return { ...copied, data: cleared.data, changed: cleared.changed }
}

/**
 * 把套索选区的内容搬走(dx, dy),形状保持,越界 clamp。
 */
export function moveLasso(data, sel, dx, dy) {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0, selection: sel }
  if (!dx && !dy) return { data: null, changed: 0, selection: sel }
  const b = sel.bounds
  if (!b) return { data: null, changed: 0, selection: sel }

  // clamp:整个外接矩形留在画布内
  const cdx = Math.max(-b.x, Math.min(cols - b.x - b.w, dx))
  const cdy = Math.max(-b.y, Math.min(rows - b.y - b.h, dy))
  if (!cdx && !cdy) return { data: null, changed: 0, selection: sel }

  const copied = copyLasso(data, sel)
  if (!copied.block) return { data: null, changed: 0, selection: sel }

  const next = cloneMatrix(data)
  forEachLassoCell(sel, cols, rows, (x, y) => { next[y][x] = null })
  const tx = b.x + cdx
  const ty = b.y + cdy
  for (let r = 0; r < b.h; r++) {
    const py = ty + r
    if (py < 0 || py >= rows) continue
    for (let c = 0; c < b.w; c++) {
      if (copied.mask[r * b.w + c] !== 1) continue
      const px = tx + c
      if (px < 0 || px >= cols) continue
      next[py][px] = copied.block[r][c]
    }
  }

  const changed = diffCount(data, next, rows, cols)
  const mask = new Uint8Array(cols * rows)
  for (let r = 0; r < b.h; r++) {
    const py = ty + r
    if (py < 0 || py >= rows) continue
    for (let c = 0; c < b.w; c++) {
      if (copied.mask[r * b.w + c] !== 1) continue
      const px = tx + c
      if (px < 0 || px >= cols) continue
      mask[py * cols + px] = 1
    }
  }
  const selection = {
    kind: 'lasso',
    mask,
    cols,
    rows,
    bounds: { x: tx, y: ty, w: b.w, h: b.h },
  }
  return changed ? { data: next, changed, selection } : { data: null, changed: 0, selection }
}

/**
 * 复制移动(Alt 拖拽):留下原件,在偏移处再放一份。
 */
export function copyMoveLasso(data, sel, dx, dy) {
  const { rows, cols } = gridSize(data)
  if (!sel || rows === 0 || cols === 0) return { data: null, changed: 0, selection: sel }
  if (!dx && !dy) return { data: null, changed: 0, selection: sel }
  const b = sel.bounds
  if (!b) return { data: null, changed: 0, selection: sel }

  const cdx = Math.max(-b.x, Math.min(cols - b.x - b.w, dx))
  const cdy = Math.max(-b.y, Math.min(rows - b.y - b.h, dy))
  if (!cdx && !cdy) return { data: null, changed: 0, selection: sel }

  const copied = copyLasso(data, sel)
  if (!copied.block) return { data: null, changed: 0, selection: sel }

  const next = cloneMatrix(data)
  const tx = b.x + cdx
  const ty = b.y + cdy
  for (let r = 0; r < b.h; r++) {
    const py = ty + r
    if (py < 0 || py >= rows) continue
    for (let c = 0; c < b.w; c++) {
      if (copied.mask[r * b.w + c] !== 1) continue
      const px = tx + c
      if (px < 0 || px >= cols) continue
      next[py][px] = copied.block[r][c]
    }
  }

  const changed = diffCount(data, next, rows, cols)
  const mask = new Uint8Array(cols * rows)
  for (let r = 0; r < b.h; r++) {
    const py = ty + r
    if (py < 0 || py >= rows) continue
    for (let c = 0; c < b.w; c++) {
      if (copied.mask[r * b.w + c] !== 1) continue
      const px = tx + c
      if (px < 0 || px >= cols) continue
      mask[py * cols + px] = 1
    }
  }
  const selection = {
    kind: 'lasso',
    mask,
    cols,
    rows,
    bounds: { x: tx, y: ty, w: b.w, h: b.h },
  }
  return changed ? { data: next, changed, selection } : { data: null, changed: 0, selection }
}

/** 选中格子数(供 UI 显示选区大小) */
export function lassoCellCount(sel, cols, rows) {
  if (!sel || sel.kind !== 'lasso') return 0
  return maskCount(sel, cols, rows)
}

/**
 * 粘贴套索剪贴板到 (ox, oy)。
 *
 * 与 pasteBlock 的区别:pasteBlock 贴的是**整个矩形块**,套索剪贴板里
 * 选区外的格子是 null(只是占位),整块贴会把选区外的空位也写进去,
 * 抹掉落点处原有的珠子。这里按 mask 过滤,只写真正选中的格子。
 *
 * 剪贴板可能来自矩形选区(没有 mask),此时退化为整块粘贴,与 pasteBlock 一致。
 */
export function pasteLasso(data, clip, ox, oy) {
  const { rows, cols } = gridSize(data)
  const block = clip?.block
  if (!block || rows === 0 || cols === 0) {
    return { data: null, changed: 0, selection: null }
  }
  const mask = clip.mask
  const h = block.length
  const w = block[0]?.length || 0

  const next = cloneMatrix(data)
  for (let r = 0; r < h; r++) {
    const ty = oy + r
    if (ty < 0 || ty >= rows) continue
    for (let c = 0; c < w; c++) {
      // 有掩码时只贴选中的格子;没有掩码(矩形剪贴板)整块贴
      if (mask && mask[r * w + c] !== 1) continue
      const tx = ox + c
      if (tx < 0 || tx >= cols) continue
      next[ty][tx] = block[r][c]
    }
  }

  const changed = diffCount(data, next, rows, cols)
  // 贴出来的选区保留掩码形状,用户可以接着对副本做镜像/旋转
  const selection = mask
    ? {
      kind: 'lasso',
      mask: (() => {
        const m = new Uint8Array(cols * rows)
        for (let r = 0; r < h; r++) {
          const ty = oy + r
          if (ty < 0 || ty >= rows) continue
          for (let c = 0; c < w; c++) {
            if (mask[r * w + c] !== 1) continue
            const tx = ox + c
            if (tx < 0 || tx >= cols) continue
            m[ty * cols + tx] = 1
          }
        }
        return m
      })(),
      cols,
      rows,
      bounds: { x: ox, y: oy, w, h },
    }
    : { x: ox, y: oy, w, h }
  return changed ? { data: next, changed, selection } : { data: null, changed: 0, selection }
}
