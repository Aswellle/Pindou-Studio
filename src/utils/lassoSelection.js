/**
 * lassoSelection — 自由套索(非矩形选区)的纯几何逻辑。
 *
 * 设计原则(与 A5 规格一致):
 *   1. **矩形选区零回归** —— 本模块不修改任何既有函数,只提供平行实现。
 *      调用方按 `selection.kind` 分派:没有 kind 或 kind==='rect' 时走原来的
 *      selectionUtils,kind==='lasso' 时才进来。
 *   2. **掩码是唯一事实来源** —— 套索选区用 `{ kind:'lasso', mask, bounds }`
 *      表示,mask 是 rows×cols 的 Uint8Array(1 = 选中)。bounds 只是缓存,
 *      用于绘制与快速裁剪,永远可以由 mask 重新算出来。
 *   3. **所有命令都在外接矩形内操作** —— 旋转/镜像绕外接矩形进行并裁剪,
 *      与矩形选区的语义保持一致,用户不需要学第二套规则。
 *
 * 为什么用掩码而不是多边形点集:填充/擦除/移动/复制都要回答「这一格选没选中」,
 * 点集需要每次都做点在多边形内测试(O(n)),掩码是 O(1)。而逐格修正与历史
 * 快照的粒度本来就是格子,掩码与数据模型同构。
 */

/**
 * 从套索轨迹生成掩码选区。
 *
 * 用**扫描线**填充:对每一行像素中心,求轨迹与该行的所有交点,按 x 排序后
 * 两两配对填充。这是标准的多边形光栅化,能正确处理凹多边形与自交(奇偶规则)。
 *
 * @param {Array<{x:number,y:number}>} points - 套索轨迹(网格坐标,可以是浮点)
 * @param {number} cols
 * @param {number} rows
 * @returns {{kind:'lasso', mask:Uint8Array, bounds:{x,y,w,h}}|null}
 *   轨迹不足三点、或覆盖不到任何格子时返回 null
 */
export function createLassoSelection(points, cols, rows) {
  if (!Array.isArray(points) || points.length < 3 || cols <= 0 || rows <= 0) return null
  const valid = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  if (valid.length < 3) return null

  const mask = new Uint8Array(cols * rows)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (let y = 0; y < rows; y++) {
    // 取格子中心(与采样一致):y + 0.5
    const cy = y + 0.5
    const xs = []
    for (let i = 0, j = valid.length - 1; i < valid.length; j = i++) {
      const a = valid[j]
      const b = valid[i]
      // 半开区间判断,避免顶点被算两次
      if ((a.y > cy) !== (b.y > cy)) {
        const t = (cy - a.y) / (b.y - a.y)
        xs.push(a.x + t * (b.x - a.x))
      }
    }
    if (xs.length < 2) continue
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // 交点区间 [xs[k], xs[k+1]) 内的格子中心被选中
      const startCol = Math.max(0, Math.ceil(xs[k] - 0.5))
      const endCol = Math.min(cols - 1, Math.floor(xs[k + 1] - 0.5))
      for (let x = startCol; x <= endCol; x++) {
        mask[y * cols + x] = 1
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX) return null // 一个格子都没覆盖到
  return {
    kind: 'lasso',
    mask,
    // 掩码的坐标系尺寸。掩码是一维数组,索引 = y * cols + x,
    // 不知道 cols 就没法反解坐标 —— 必须随选区一起存。
    cols,
    rows,
    bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  }
}

/** 这一格是否在选区内。矩形与套索都能用 */
export function pointInLassoSelection(sel, pos) {
  if (!sel || !pos) return false
  if (sel.kind !== 'lasso') return false
  const { mask, bounds, cols } = sel
  if (!mask || !bounds || !cols) return false
  if (pos.x < bounds.x || pos.x >= bounds.x + bounds.w) return false
  if (pos.y < bounds.y || pos.y >= bounds.y + bounds.h) return false
  return mask[pos.y * cols + pos.x] === 1
}

/**
 * 遍历选区内被选中的格子。
 * 只访问 bounds 内的格子,不会扫全图 —— 套索通常只占画布一小块。
 */
export function forEachLassoCell(sel, cols, rows, fn) {
  if (!sel || sel.kind !== 'lasso' || !sel.mask) return
  const b = sel.bounds
  if (!b) return
  const x0 = Math.max(0, b.x)
  const y0 = Math.max(0, b.y)
  const x1 = Math.min(cols, b.x + b.w)
  const y1 = Math.min(rows, b.y + b.h)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (sel.mask[y * cols + x] === 1) fn(x, y)
    }
  }
}

/** 选中格子数(用于 UI 显示与「是否为空」判断) */
export function countLassoCells(sel, cols, rows) {
  if (!sel || sel.kind !== 'lasso' || !sel.mask) return 0
  let n = 0
  forEachLassoCell(sel, cols, rows, () => { n++ })
  return n
}

/**
 * 把任意选区归一成外接矩形 `{ x, y, w, h }`。
 *
 * 矩形选区本身就是这个形状;套索的形状信息在掩码里,对外只能暴露外接矩形。
 * 拖动预览、越界钳制、命中判定都要问「这块选区占多大地方」—— 有了这个
 * 访问器,那些代码就不必到处写 `sel.kind === 'lasso' ? sel.bounds : sel`,
 * 也就不会像早期版本那样直接读 `sel.x` 拿到 undefined。
 */
export function selectionBounds(sel) {
  if (!sel) return null
  if (sel.kind === 'lasso') return sel.bounds || null
  if (typeof sel.x === 'number' && typeof sel.w === 'number') {
    return { x: sel.x, y: sel.y, w: sel.w, h: sel.h }
  }
  return null
}

/** 这一格是否落在选区内 —— 矩形与套索统一入口 */
export function selectionContains(sel, pos) {
  if (!sel || !pos) return false
  if (sel.kind === 'lasso') return pointInLassoSelection(sel, pos)
  const b = selectionBounds(sel)
  if (!b) return false
  return pos.x >= b.x && pos.x < b.x + b.w && pos.y >= b.y && pos.y < b.y + b.h
}
