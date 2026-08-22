/**
 * 拼豆爱宠「豆豆」— 柯基像素精灵(侧视 2D 游戏精灵风)。
 * 纯数据/绘制逻辑,无 React 依赖,便于离线渲染验证与单测。
 * 以「豆子」网格表示:每格颜色字符串或 null,外层 canvas 逐格上色(拼豆感)。
 * 构型:向左侧身、粗黑描边、蓝色项圈、大开口笑、翘尾、橙白配色、四短腿。
 */
export const CELL = 6
export const GAP = 1
export const GRID_W = 32
export const GRID_H = 24
export const PET_W = GRID_W * CELL      // 192
export const PET_H = GRID_H * CELL      // 144

export const C = {
  body: '#ED9B3F',     // 暖橙背毛
  bodyDark: '#D8862E', // 橙暗部
  cream: '#FFF3E2',    // 奶白胸/腹/吻
  outline: '#2A2118',  // 粗黑描边
  innerEar: '#F2C9A6', // 粉内耳
  paw: '#FFF3E2',      // 爪垫奶白
  nose: '#1C1614',
  tongue: '#F2726B',
  collar: '#2E8BD6',   // 蓝色项圈
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
// 粗描边椭圆:先画大一圈的黑,再画填充色 → 厚黑外框
function ellO(grid, cx, cy, rx, ry, fill, th = 1.2) {
  fillEllipse(grid, cx, cy, rx + th, ry + th, C.outline)
  fillEllipse(grid, cx, cy, rx, ry, fill)
}
function rectO(grid, x, y, w, h, fill) {
  fillRect(grid, x - 1, y - 1, w + 2, h + 2, C.outline)
  fillRect(grid, x, y, w, h, fill)
}
function triO(grid, cx, apexY, baseY, baseHalfW, fill) {
  fillTri(grid, cx, apexY - 1, baseY + 1, baseHalfW + 1, C.outline)
  fillTri(grid, cx, apexY, baseY, baseHalfW, fill)
}

/* ── 侧视柯基姿态 ───────────────────────────────────── */
// pose: 'sleep' | 'idle' | 'walk' | 'shake' | 'bark'
export function poseGrid(pose, frame = 0, breath = false) {
  const g = makeGrid()

  if (pose === 'sleep') {
    // 蜷缩:圆胖身体 + 头埋进前爪,闭眼,尾巴裹前
    ellO(g, 17, 15.5, 7.4, 5.4, C.body)
    ellO(g, 12, 14.5, 4.4, 3.8, C.body)               // 头
    fillEllipse(g, 9.5, 15.5, 2.6, 2.2, C.cream)       // 吻
    fillEllipse(g, 12, 8.5, 2.2, 1.5, C.body)          // 折耳前
    fillEllipse(g, 16.5, 8.8, 2.2, 1.5, C.body)        // 折耳后
    // 闭眼横线
    fillRect(g, 10.5, 12.5, 3, 1, C.nose)
    fillEllipse(g, 8.2, 16, 1.6, 2.4, C.body)          // 尾裹前
    set(g, 7, 15, C.bodyDark)
    if (breath) fillEllipse(g, 12, 14.6, 4.4, 3.8, C.body)
    return g
  }

  let tilt = 0
  let move = 0
  let openMouth = false
  if (pose === 'bark') { tilt = 2.0; openMouth = true }
  if (pose === 'walk') move = frame % 2 === 0 ? 1 : -1
  if (pose === 'walk' && frame % 2 === 0) tilt = 0.4
  const hx = 10.5
  const hy = 10.5 - tilt
  const bx = 20

  if (pose === 'shake') {
    // 醒后抖擞:整体左右摆 + 眯眼
    const off = frame % 2 === 0 ? 1 : -1
    sideBody(g, bx + off, 4.5)
    drawTail(g)
    drawHead(g, hx + off, hy - 2, true, false)
    sideLegs(g, bx + off, 0)
    return g
  }

  // 后腿 → 尾巴 → 身体 → 腹/胸 → 头 → 面部 → 项圈 → 前腿
  sideLegs(g, bx, move, true)          // 后腿(先画,在身体后)
  drawTail(g)
  sideBody(g, bx, 4.5)
  drawHead(g, hx, hy, openMouth, false)
  drawCollar(g, hx, hy)
  sideLegs(g, bx, move, false)         // 前腿(后画,在身体前)
  return g
}

// 身体(侧视长椭圆)+ 奶白腹 + 奶白前胸
function sideBody(g, cx, ry) {
  ellO(g, cx, 15, 7.4, ry, C.body)
  fillEllipse(g, cx, 17, 5.2, 2.0, C.cream)    // 腹
  fillEllipse(g, cx - 6.0, 16.4, 3.0, 2.6, C.cream) // 前胸
}

// 头(左向)+ 大开口笑 + 眼睛 + 耳朵
function drawHead(g, cx, cy, open, shake) {
  ellO(g, cx, cy, 5.4, 5.6, C.body)
  // 耳朵(前+后)
  triO(g, cx - 1.5, cy - 7.2, cy - 0.6, 2.4, C.body)
  fillTri(g, cx - 1.5, cy - 6.0, cy - 1.4, 1.2, C.innerEar)
  triO(g, cx - 5.0, cy - 6.0, cy - 0.6, 2.0, C.body)
  fillTri(g, cx - 5.0, cy - 5.0, cy - 1.4, 1.0, C.innerEar)
  // 白吻(左尖)
  fillEllipse(g, cx - 4.2, cy + 1.2, 3.0, 2.6, C.cream)
  // 鼻(黑)
  fillRect(g, cx - 7.2, cy - 0.4, 2.0, 1.4, C.nose)
  // 眼
  if (shake) {
    fillRect(g, cx - 2.6, cy - 1.2, 2, 1, C.nose)
  } else {
    set(g, cx - 2.8, cy - 0.6, C.nose)
    set(g, cx - 2.2, cy - 1.2, '#FFF3E2') // 高光
  }
  // 嘴(开口微笑)
  if (open) {
    fillRect(g, cx - 6.6, cy + 3.2, 3.4, 1.2, C.nose)
    fillRect(g, cx - 6.0, cy + 4.4, 1.6, 0.9, C.tongue)
  } else {
    fillRect(g, cx - 6.2, cy + 3.4, 2.6, 1.0, C.nose)   // 上唇黑
    fillRect(g, cx - 6.0, cy + 4.2, 1.4, 0.9, C.tongue) // 小舌
  }
}

// 蓝色项圈(脖颈处)
function drawCollar(g, hx, hy) {
  fillRect(g, hx + 4.2, hy - 1.2, 2.0, 5.4, C.collar)
  // 小吊牌
  set(g, hx + 5.0, hy + 4.6, '#F6C85F')
}

// 翘尾(右后方,向上卷)
function drawTail(g) {
  ellO(g, 27.6, 10.6, 2.2, 1.8, C.body)
  fillEllipse(g, 28.4, 9.4, 1.2, 1.0, C.cream)
  set(g, 28.2, 8.0, C.bodyDark)
}

// 四短腿(前 vs 后),行走错位
function sideLegs(g, cx, move, back) {
  if (back) {
    const o = move === 1 ? -1 : move === -1 ? 2 : 0
    rectO(g, cx + 3.4 + o, 18.4, 2.2, 4.3, C.body)
    rectO(g, cx + 6.0 + o, 18.6, 2.2, 4.1, C.body)
    fillRect(g, cx + 4.4 + o, 22.4, 1.4, 0.9, C.paw)
    fillRect(g, cx + 7.0 + o, 22.4, 1.4, 0.9, C.paw)
  } else {
    const o = move === 1 ? 2 : move === -1 ? -1 : 0
    rectO(g, cx - 6.8 + o, 18.4, 2.2, 4.4, C.body)
    rectO(g, cx - 4.2 + o, 18.6, 2.2, 4.2, C.body)
    fillRect(g, cx - 5.8 + o, 22.4, 1.4, 0.9, C.paw)
    fillRect(g, cx - 3.2 + o, 22.4, 1.4, 0.9, C.paw)
  }
}
