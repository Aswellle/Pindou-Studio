/**
 * 拼豆爱宠「豆豆」— 柯基像素精灵。
 * 纯数据/绘制逻辑,无 React 依赖,便于离线渲染验证与单测。
 * 以「豆子」网格表示:每格为颜色字符串或 null,外层用 canvas 逐格上色(拼豆感)。
 * 构型:chibi 大头小身 — 巨圆头(约 70%)+ 大立耳 + 白川字纹 + 粉脸颊,下方窄小胖身 + 短腿。
 */
export const CELL = 6
export const GAP = 1
export const GRID_W = 30
export const GRID_H = 24
export const PET_W = GRID_W * CELL
export const PET_H = GRID_H * CELL

export const C = {
  body: '#F0A93E',
  bodyDark: '#E08A2B',
  cream: '#FBF1E0',
  outline: '#4A3527',
  innerEar: '#F7C79A',
  paw: '#F7C79A',
  nose: '#3A2A1E',
  tongue: '#F08A8A',
  blush: '#E9A7A0',
}

function makeGrid() {
  return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null))
}
function set(grid, x, y, c) {
  x = Math.round(x); y = Math.round(y)
  if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && c) grid[y][x] = c
}
function fillRect(grid, x0, y0, w, h, c) {
  for (let y = Math.round(y0); y < Math.round(y0) + h; y++)
    for (let x = Math.round(x0); x < Math.round(x0) + w; x++) set(grid, x, y, c)
}
function fillEllipse(grid, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) set(grid, x, y, c)
    }
  }
}
function fillTri(grid, cx, apexY, baseY, baseHalfW, c) {
  const h = baseY - apexY
  if (h <= 0) return
  const top = Math.ceil(apexY)
  const bot = Math.floor(baseY)
  for (let y = top; y <= bot; y++) {
    const t = (y - apexY) / h
    const half = Math.max(0.6, baseHalfW * (1 - t))
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) set(grid, x, y, c)
  }
}
function ellO(grid, cx, cy, rx, ry, fill) {
  fillEllipse(grid, cx, cy, rx + 0.7, ry + 0.7, C.outline)
  fillEllipse(grid, cx, cy, rx, ry, fill)
}

// 大头 + 立耳 + 五官(共用)
function head(grid, cx, cy, opts = {}) {
  const tilt = opts.tilt || 0
  const hy = cy - tilt
  const closed = opts.closed || false
  ellO(grid, cx, hy, 6.8, 6.0, C.body)
  // 白川字纹(额头)+ 口鼻
  fillRect(grid, cx - 1, hy - 5.0, 2, 5.0, C.cream)
  fillEllipse(grid, cx, hy + 2.8, 3.5, 2.5, C.cream)
  // 大立耳
  fillTri(grid, cx - 4.6, hy - 7.6, hy + 1.0, 2.7, C.body)
  fillTri(grid, cx + 4.6, hy - 7.6, hy + 1.0, 2.7, C.body)
  fillTri(grid, cx - 4.6, hy - 6.2, hy - 0.2, 1.3, C.innerEar)
  fillTri(grid, cx + 4.6, hy - 6.2, hy - 0.2, 1.3, C.innerEar)
  // 眼睛
  if (closed) {
    fillRect(grid, cx - 3.6, hy + 0.2, 2, 1, C.outline)
    fillRect(grid, cx + 1.4, hy + 0.2, 2, 1, C.outline)
  } else {
    set(grid, cx - 3.4, hy + 0.6, C.outline)
    set(grid, cx + 3.4, hy + 0.6, C.outline)
  }
  // 脸颊腮红
  set(grid, cx - 4.4, hy + 2.6, C.blush)
  set(grid, cx + 4.4, hy + 2.6, C.blush)
  // 鼻 + 嘴
  set(grid, cx, hy + 2.0, C.nose)
  if (opts.open) {
    set(grid, cx - 1, hy + 3.4, C.outline); set(grid, cx, hy + 3.4, C.outline)
    fillRect(grid, cx - 1, hy + 4.0, 2, 1, C.tongue)
  } else {
    set(grid, cx - 1, hy + 4.2, C.outline); set(grid, cx, hy + 4.4, C.outline); set(grid, cx + 1, hy + 4.2, C.outline)
  }
}

// 短腿(前方一对靠近观者,行走时前后错位)
function legs(grid, cx, move) {
  const f = move === 1 ? 2 : move === -1 ? -1 : 0
  frontLeg(grid, cx - 2.6 + f)
  frontLeg(grid, cx + 0.4 + f)
  backLeg(grid, cx - 4 + (move === 1 ? -1 : move === -1 ? 2 : 0))
  backLeg(grid, cx - 1.4 + (move === 1 ? -1 : move === -1 ? 2 : 0))
}
function frontLeg(grid, x) {
  fillRect(grid, x, 20.2, 2, 2.6, C.body)
  set(grid, x + 1, 22.6, C.paw)
}
function backLeg(grid, x) {
  fillRect(grid, x, 20.4, 2, 2.4, C.body)
  set(grid, x + 1, 22.6, C.paw)
}

function tailPuff(grid, cx, ty) {
  fillEllipse(grid, cx, ty, 2.0, 1.5, C.body)
  fillEllipse(grid, cx + 0.5, ty - 1.2, 1.2, 0.9, C.cream)
  set(grid, cx + 1.4, ty - 2.2, C.bodyDark)
}

/* ── 姿态 → 网格 ─────────────────────────────────────── */
export function poseGrid(pose, frame = 0, breath = false) {
  const g = makeGrid()
  const cx = 15

  if (pose === 'sleep') {
    // 蜷缩:大头趴靠前爪,闭眼,尾巴裹前
    ellO(g, 15, 16, 6.2, 4.6, C.body)                 // 蜷起的身体
    head(g, 16, 11.5, { closed: true })               // 头略靠前
    // 前爪收拢
    frontLeg(g, 12); frontLeg(g, 15)
    // 尾巴裹到前方
    fillEllipse(g, 9.5, 15, 1.4, 2.4, C.body)
    set(g, 8.8, 14, C.bodyDark)
    fillEllipse(g, 14, 11, 2.6, 1.8, C.cream)          // 奶油气垫感
    if (breath) fillEllipse(g, 14, 11, 2.6, 1.8, C.cream)
    return g
  }

  let tilt = 0
  let move = 0
  let openMouth = false
  if (pose === 'bark') { tilt = 3.0; openMouth = true }
  if (pose === 'walk') move = frame % 2 === 0 ? 1 : -1
  if (pose === 'walk' && frame % 2 === 0) tilt = 0.5

  if (pose === 'shake') {
    // 醒后抖擞:整体左右摆 + 眯眼
    const off = frame % 2 === 0 ? 1 : -1
    ellO(g, cx, 16, 5.4, 3.6, C.body)
    fillEllipse(g, cx, 17, 3.6, 2.0, C.cream)
    // 头(eye closed)
    const hx = cx + off
    head(g, hx, 8.2, { closed: true, tilt: 0 })
    // 四腿
    legs(g, cx + off, 0)
    return g
  }

  // 窄小胖身(藏在头下方) + 奶油腹
  ellO(g, cx, 16.5, 5.2, 3.2, C.body)
  fillEllipse(g, cx, 17.2, 3.4, 1.9, C.cream)

  // 巨圆头(占大部分)
  head(g, cx, 7.6 - tilt, { open: openMouth })
  tailPuff(g, cx + 6.2, 16.2)
  legs(g, cx, move)
  return g
}
