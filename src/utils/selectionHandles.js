/**
 * Resize handles for the rectangular selection (A1).
 *
 * 八个手柄:四角 + 四边中点。位置取**格边界**而不是格中心 —— 拖右边手柄
 * 到第 4 列,选区应当覆盖到第 4 列末尾(右边界 = 5),与像素编辑器一致。
 *
 * 全部是纯函数:命中判定与几何计算不碰 React、不碰 canvas,因此可以脱离
 * 组件单独测「哪个手柄被按住」「松手后选区是什么形状」。
 */

export const HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** 手柄 → CSS cursor。对角线两个方向互不相同,拖错方向时手感会立刻不对。 */
export const HANDLE_CURSORS = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

/**
 * 手柄命中半径(屏幕像素)。
 *
 * 触屏要 ≥24px 才好按;鼠标指针精确得多,用 10px 避免手柄把选区内部
 * 大块区域吃掉 —— 那里要留给「按住拖动内容」。
 */
export const HANDLE_HIT_PX = { coarse: 24, fine: 10 }

/**
 * 手柄锚点(连续网格坐标,单位 = 格)。
 *
 * 注意是浮点:边中点在 w 为奇数时落在某格中心,偶数时落在格边界上,
 * 两种都正确 —— 命中判定本来就在连续坐标里做,不需要对齐到格。
 */
export function handlePoints(sel) {
  if (!sel) return []
  const l = sel.x
  const r = sel.x + sel.w
  const t = sel.y
  const b = sel.y + sel.h
  const mx = sel.x + sel.w / 2
  const my = sel.y + sel.h / 2
  return [
    { id: 'nw', x: l, y: t },
    { id: 'n', x: mx, y: t },
    { id: 'ne', x: r, y: t },
    { id: 'e', x: r, y: my },
    { id: 'se', x: r, y: b },
    { id: 's', x: mx, y: b },
    { id: 'sw', x: l, y: b },
    { id: 'w', x: l, y: my },
  ]
}

/**
 * 命中哪个手柄(没有则 null)。
 *
 * `radius` 是网格单位(调用方按 CELL_SIZE × scale 从屏幕像素折算)。
 * 命中区是**方形**而不是圆形:边缘附近斜向移动时更容易按住,也符合
 * 「手柄命中区 ≥24px」是按边长量的直觉。
 *
 * 半径会被「最短边的 1/3」收窄。否则 1×1 的选区会被八个手柄完全覆盖,
 * 用户再也拖不动里面的珠子 —— 只能 resize,不能 move,这是明显更糟的
 * 失败方式。收窄后中心永远留得下一块拖动区。
 */
export function hitTestHandle(sel, point, { radius = 0 } = {}) {
  if (!sel || !point || !(radius > 0)) return null
  const r = Math.min(radius, Math.min(sel.w, sel.h) / 3)
  if (!(r > 0)) return null

  let best = null
  let bestDist = Infinity
  for (const p of handlePoints(sel)) {
    const dx = point.x - p.x
    const dy = point.y - p.y
    if (Math.abs(dx) > r || Math.abs(dy) > r) continue
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = p.id
    }
  }
  return best
}

/**
 * 按手柄与当前指针位置算出新选区。
 *
 * 规则:
 *   - **对角锚点不动**:拖 nw 时右边界与下边界保持不变;
 *   - 指针所在的格子算作被覆盖(拖右边到第 4 列 → 右边界 5),所以用
 *     floor 而不是 round —— round 会在格子中段就抢跳一格,手感发飘;
 *   - 越界**钳制**到网格内,不会让选框跑到画布外;
 *   - 最小 1×1:继续往里拖不会翻转成负宽高,而是停在 1 格。
 *
 * 只改矩形,不改矩阵 —— 因此 resize 不产生历史记录(选区不在撤销栈里)。
 */
export function resizeSelection(sel, handleId, point, cols, rows) {
  if (!sel || !handleId || !point || cols <= 0 || rows <= 0) return sel

  let left = sel.x
  let right = sel.x + sel.w
  let top = sel.y
  let bottom = sel.y + sel.h

  const cx = Math.floor(point.x)
  const cy = Math.floor(point.y)

  // handleId 的字母互斥(nw 只有 n/w,se 只有 s/e),所以可以逐轴独立判断
  if (handleId.includes('w')) left = Math.min(Math.max(0, cx), right - 1)
  if (handleId.includes('e')) right = Math.max(Math.min(cols, cx + 1), left + 1)
  if (handleId.includes('n')) top = Math.min(Math.max(0, cy), bottom - 1)
  if (handleId.includes('s')) bottom = Math.max(Math.min(rows, cy + 1), top + 1)

  return { x: left, y: top, w: right - left, h: bottom - top }
}
