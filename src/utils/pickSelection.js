/**
 * pickSelection — 「点选」工具的选区构建(纯函数)。
 *
 * 点选工具逐格 toggle 格子,产出的选区形状与套索完全一致
 * (`{kind:'lasso', mask, cols, rows, bounds}`):命令层(lassoCommands)、
 * 渲染层(drawLassoMarquee)、长按菜单与移动端操作条全部原样复用,
 * 不需要第二套命令实现。
 *
 * 约定与 selectionUtils/lassoCommands 一致:纯函数、不改入参;
 * 选区被清空时返回 null(调用方据此把 selection 置回空态)。
 */

/** 扫描掩码,重算外接矩形;空掩码返回 null */
function recomputeBounds(mask, cols, rows) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (mask[y * cols + x] !== 1) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * toggle 一格:在选区内则移出,不在则加入。
 *
 * @param {object|null} prev - 当前选区(矩形/掩码/null)
 * @param {number} x - 网格列
 * @param {number} y - 网格行
 * @param {number} cols
 * @param {number} rows
 * @returns {{kind:'lasso', mask:Uint8Array, cols:number, rows:number, bounds:object}|null}
 *   toggle 后选区为空时返回 null
 */
export function toggleCellInSelection(prev, x, y, cols, rows) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || cols <= 0 || rows <= 0) return null
  if (x < 0 || x >= cols || y < 0 || y >= rows) return prev ?? null

  // 只有同尺寸的掩码选区可以在其上继续 toggle;矩形选区(或画布尺寸变了)
  // 一律重新开始 —— 矩形没有掩码,语义混着 toggle 会让用户数不清选了哪些格。
  const prevMask = prev && prev.kind === 'lasso' && prev.cols === cols && prev.rows === rows && prev.mask
    ? prev.mask
    : null

  const mask = new Uint8Array(cols * rows)
  if (prevMask) mask.set(prevMask)
  const index = y * cols + x
  mask[index] = mask[index] === 1 ? 0 : 1

  const bounds = recomputeBounds(mask, cols, rows)
  if (!bounds) return null
  return { kind: 'lasso', mask, cols, rows, bounds }
}
