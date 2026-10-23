/**
 * perspective — 图纸透视校正(单应矩阵,纯函数,无 DOM)
 *
 * 为什么需要:手机斜拍图纸时,纸面在照片里是一个**梯形**而不是矩形。
 * 后续的网格检测与逐格采样都假设「行/列方向是图像坐标轴」,梯形输入会让
 * 行列线倾斜、格子间距沿一个方向渐变,识别率断崖式下跌。
 *
 * 做法:用户在预览上点四个角 → 求「梯形 → 矩形」的单应矩阵 → 把整张图
 * 重采样成矩形 → 再走原有的检测/采样管线。对下游来说只是一张更正的图,
 * 不需要知道透视的存在。
 *
 * 数学约定:
 *   - 单应矩阵 H 是 3×3,齐次坐标映射 `[x,y,1] → H·[x,y,1]`,再除以第三维。
 *   - `computeHomography(src, dst)` 求的是 **src → dst**;重采样需要反向查找
 *     (目标像素 ← 源像素),所以调用方要传 `computeHomography(dst, src)`。
 *   - 退化输入(三点共线、面积为零)返回 null,调用方据此拒绝应用,而不是
 *     拿一个会把整张图压成一条线的矩阵去重采样。
 */

/** 点是否是有限数值的 {x, y} */
export function isPoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
}

/**
 * 把四个点排成「左上 → 右上 → 右下 → 左下」。
 *
 * 用户点角顺序是不可控的(有人顺时针、有人逆时针、有人从右下开始),
 * 而单应矩阵要求源点与目标点一一对应 —— 顺序错了会把图翻面或扭转 90°。
 * 这里用「与质心的相对角度」排序,再用 x+y 最小的点定为左上。
 *
 * @param {Array<{x:number,y:number}>} points
 * @returns {Array<{x:number,y:number}>|null} 不足四点或含非法值时返回 null
 */
export function orderQuad(points) {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(isPoint)) return null
  const cx = points.reduce((s, p) => s + p.x, 0) / 4
  const cy = points.reduce((s, p) => s + p.y, 0) / 4
  // 按极角排序得到顺时针或逆时针环,起点不定
  const ring = points.slice().sort((a, b) => (
    Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  ))
  // 起点:左上角(在屏幕坐标系里 x+y 最小)
  let start = 0
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < 4; i++) {
    const sum = ring[i].x + ring[i].y
    if (sum < best) { best = sum; start = i }
  }
  const ordered = [0, 1, 2, 3].map((i) => ring[(start + i) % 4])
  // 极角排序在少数布局下会给出逆时针环;用叉积判定方向,统一成顺时针
  const cross = (ordered[1].x - ordered[0].x) * (ordered[2].y - ordered[1].y)
    - (ordered[1].y - ordered[0].y) * (ordered[2].x - ordered[1].x)
  return cross < 0 ? [ordered[0], ordered[3], ordered[2], ordered[1]] : ordered
}

/** 四边形面积(鞋带公式的绝对值) */
export function quadArea(points) {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(isPoint)) return 0
  let sum = 0
  for (let i = 0; i < 4; i++) {
    const a = points[i]
    const b = points[(i + 1) % 4]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/**
 * 四个点是否构成可用的四边形。
 *
 * 面积过小 = 用户把四个角点在了同一条线上(或误触),此时单应矩阵接近奇异,
 * 重采样结果是一团拉伸的噪声。阈值取「至少 100 平方像素」——
 * 一张图纸的四边形不可能比这更小。
 */
export function isQuadUsable(points, { minArea = 100 } = {}) {
  const ordered = orderQuad(points)
  if (!ordered) return false
  return quadArea(ordered) >= minArea
}

/**
 * 解 8×8 线性方程组,求把 src 四点映到 dst 四点的单应矩阵。
 *
 * 每个点对给出两行方程(见 Hartley & Zisserman, Multiple View Geometry §4.1):
 *   x' = (h0·x + h1·y + h2) / (h6·x + h7·y + 1)
 *   y' = (h3·x + h4·y + h5) / (h6·x + h7·y + 1)
 * 令 h8 = 1(归一化自由度),展开成 A·h = b。
 *
 * @param {Array<{x:number,y:number}>} src - 源四点
 * @param {Array<{x:number,y:number}>} dst - 目标四点(与 src 一一对应)
 * @returns {number[]|null} 长度 9 的矩阵(行优先);退化时返回 null
 */
export function computeHomography(src, dst) {
  if (!Array.isArray(src) || !Array.isArray(dst) || src.length !== 4 || dst.length !== 4) return null
  if (!src.every(isPoint) || !dst.every(isPoint)) return null

  // 8 个未知数,8 个方程
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }

  const h = solveLinearSystem(A, b)
  if (!h) return null
  return [...h, 1]
}

/**
 * 高斯消元(带部分主元)解 A·x = b。
 * 主元接近零说明矩阵奇异 —— 返回 null 而不是给出一个数值上爆炸的解。
 */
function solveLinearSystem(A, b) {
  const n = b.length
  // 构造增广矩阵,不改入参
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // 部分主元:选当前列绝对值最大的行,避免除以接近零的数。
    // 阈值 1e-12 是**第一层**防御:真实图纸的四角坐标量级在 10²–10³,
    // 正常矩阵的主元不会接近零;精确共线时主元恰好为 0,这里的比较即拦下。
    // 第二层是回代后的 Number.isFinite —— 数值上"接近奇异但非精确零"的
    // 输入会解出巨大或 NaN 的 h,那一层负责兜住。两层都在,单独移除任一层
    // 都仍能拒绝退化输入(因此测试无法单独区分),保留是因为它们防的是
    // 不同的失败模式:这一层避免除零,下一层避免产出不可用的矩阵。
    let pivot = col
    let maxAbs = Math.abs(M[col][col])
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col])
      if (v > maxAbs) { maxAbs = v; pivot = r }
    }
    if (maxAbs < 1e-12) return null
    if (pivot !== col) {
      const tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp
    }
    const p = M[col][col]
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / p
      if (factor === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c]
    }
  }

  // 回代
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n]
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c]
    x[r] = sum / M[r][r]
  }
  return x.every(Number.isFinite) ? x : null
}

/**
 * 用单应矩阵映射一个点。
 * 第三维接近零表示该点在无穷远(理论上的消失点),返回 null。
 */
export function applyHomography(h, p) {
  if (!Array.isArray(h) || h.length !== 9 || !isPoint(p)) return null
  const w = h[6] * p.x + h[7] * p.y + h[8]
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null
  const x = (h[0] * p.x + h[1] * p.y + h[2]) / w
  const y = (h[3] * p.x + h[4] * p.y + h[5]) / w
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

/**
 * 按四边形把图像重采样成矩形。
 *
 * 输出尺寸默认取四边形的**对边长度的较大者** —— 透视校正后的分辨率应当
 * 接近原始细节量,而不是随最窄的那条边缩水。用户可以显式覆盖。
 *
 * 采样用双线性插值:最近邻会在格子边界留下锯齿,而后续要按格子中心取中位数,
 * 锯齿会污染边缘格的颜色判定。
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 * @param {Array<{x:number,y:number}>} quad - 图像坐标下的四个角(顺序任意)
 * @param {{width?: number, height?: number}} [options]
 * @returns {{data: Uint8ClampedArray, width: number, height: number}|null}
 */
export function warpQuadToRect(imageData, quad, options = {}) {
  if (!imageData?.data || !imageData.width || !imageData.height) return null
  const ordered = orderQuad(quad)
  if (!ordered || !isQuadUsable(ordered)) return null

  const [tl, tr, br, bl] = ordered
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const width = Math.max(1, Math.round(options.width
    || Math.max(dist(tl, tr), dist(bl, br))))
  const height = Math.max(1, Math.round(options.height
    || Math.max(dist(tl, bl), dist(tr, br))))

  // 目标矩形 → 源四边形 的映射:重采样要「目标像素 ← 源像素」
  const dst = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const inverse = computeHomography(dst, ordered)
  if (!inverse) return null

  const out = new Uint8ClampedArray(width * height * 4)
  const src = imageData.data
  const sw = imageData.width
  const sh = imageData.height

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // +0.5:目标像素中心,避免整体偏移半个像素
      const p = applyHomography(inverse, { x: x + 0.5, y: y + 0.5 })
      const o = (y * width + x) * 4
      if (!p) continue // 落在无穷远:留透明
      sampleBilinear(src, sw, sh, p.x - 0.5, p.y - 0.5, out, o)
    }
  }
  return { data: out, width, height }
}

/** 双线性采样;越界部分按最近边缘像素取,避免边框出现黑边 */
function sampleBilinear(src, sw, sh, fx, fy, out, o) {
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const cx0 = Math.max(0, Math.min(sw - 1, x0))
  const cx1 = Math.max(0, Math.min(sw - 1, x0 + 1))
  const cy0 = Math.max(0, Math.min(sh - 1, y0))
  const cy1 = Math.max(0, Math.min(sh - 1, y0 + 1))

  const i00 = (cy0 * sw + cx0) * 4
  const i10 = (cy0 * sw + cx1) * 4
  const i01 = (cy1 * sw + cx0) * 4
  const i11 = (cy1 * sw + cx1) * 4

  for (let c = 0; c < 4; c++) {
    const top = src[i00 + c] * (1 - tx) + src[i10 + c] * tx
    const bottom = src[i01 + c] * (1 - tx) + src[i11 + c] * tx
    out[o + c] = top * (1 - ty) + bottom * ty
  }
}
