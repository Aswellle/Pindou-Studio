/**
 * gridDetector — 从图片像素中检测拼豆图纸的网格周期与图纸边界。
 *
 * 纯函数:输入 RGBA 像素与宽高,不依赖 DOM / Canvas / React,可在 Node 与测试中直接运行。
 *
 * 设计取舍(对应 docs/agent-spec/03 §4B 第 3 步):
 *   - 只处理**轴对齐**的水平/垂直网格;透视与旋转校正不在本阶段,检测失败时交由用户手动设置;
 *   - 用边缘投影的**格点评分**找单元格周期:对每个候选周期,取让格点最强的相位,
 *     再看整条格点上的平均边缘强度。每格都有边界(珠子边缘或细线)时,真实单元格
 *     周期能让**所有**格点落在边界上,半周期会有一半格点落在格子中间而明显掉分;
 *     若图纸只画每 10 格一条的粗线、格子之间完全无线,只能识别出 10 格周期 ——
 *     这类图会得到偏大的格子,必须由用户手动改列数/行数;
 *   - 再用自相关做周期性验证:纯色图、照片、噪点不会有稳定周期,直接判失败;
 *   - 检测不可靠时返回 status='failed' 与可解释原因,**绝不**返回一个"看起来成功"的猜测网格;
 *   - 边界取首尾两段有效格点(网格线),两侧留白/图例不会把列数撑大。
 *
 * 坐标约定:bounds 为原图像素坐标,首尾都是**网格线**的位置;列数 = 两端之间的间隔数。
 */

export const DETECT_MIN_CELL = 4
export const DETECT_MAX_CELL = 160
export const DETECT_MAX_GRID = 200

/** 自相关低于该值视为没有周期性(纯色图、照片、噪点) */
const MIN_CORRELATION = 0.3
/** 自相关局部极大至少要达到全局最高分的这个比例,才被当作基频 */
const PERIOD_TOLERANCE = 0.6
/** 有效格点段允许的断档比例(中间偶尔一条线偏淡) */
const MIN_RUN_FILL = 0.9
/** 高通的滑动窗口:去掉缓慢变化的底色/光照,保留网格线的尖峰 */
const HIGH_PASS_WINDOW = 31

const LUM_R = 0.2126
const LUM_G = 0.7152
const LUM_B = 0.0722

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function fail(reason, extra = {}) {
  return { ok: false, status: 'failed', reason, confidence: 0, ...extra }
}

function toLuma(data, width, height) {
  const out = new Float32Array(width * height)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = LUM_R * data[p] + LUM_G * data[p + 1] + LUM_B * data[p + 2]
  }
  return out
}

/**
 * 边缘投影:每个 x(或 y)位置上的平均亮度突变强度。
 * 用「前向差 + 后向差」,1px 细线的峰值正好落在线上,而不是偏到相邻像素。
 */
function edgeProfile(luma, width, height, axis) {
  if (axis === 'vertical') {
    const prof = new Float32Array(width)
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let y = 0; y < height; y++) {
        const i = y * width + x
        const l = luma[i]
        const left = x > 0 ? luma[i - 1] : l
        const right = x + 1 < width ? luma[i + 1] : l
        sum += Math.abs(l - left) + Math.abs(right - l)
      }
      prof[x] = sum / height
    }
    return prof
  }
  const prof = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const l = luma[i]
      const up = y > 0 ? luma[i - width] : l
      const down = y + 1 < height ? luma[i + width] : l
      sum += Math.abs(l - up) + Math.abs(down - l)
    }
    prof[y] = sum / width
  }
  return prof
}

/** 去基线:减去滑动均值并截断负值,只留下高于局部背景的尖峰 */
function highPass(profile, windowSize) {
  const n = profile.length
  const out = new Float32Array(n)
  const half = Math.max(1, windowSize >> 1)
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + profile[i]
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(n, i + half + 1)
    const mean = (prefix[b] - prefix[a]) / (b - a)
    const v = profile[i] - mean
    out[i] = v > 0 ? v : 0
  }
  return out
}

/** 归一化自相关:去掉信号强度差异,只保留周期性 */
function correlationAt(profile, lag) {
  let num = 0
  let e1 = 0
  let e2 = 0
  const n = profile.length
  for (let i = 0; i + lag < n; i++) {
    const a = profile[i]
    const b = profile[i + lag]
    num += a * b
    e1 += a * a
    e2 += b * b
  }
  const denom = Math.sqrt(e1 * e2)
  return denom > 1e-9 ? num / denom : 0
}

function peakAt(profile, pos) {
  const n = profile.length
  const a = pos > 0 ? profile[pos - 1] : 0
  const b = profile[pos]
  const c = pos + 1 < n ? profile[pos + 1] : 0
  return Math.max(a, b, c)
}

/**
 * 给定周期,找到让格点最强的相位,并返回该相位下所有格点的强度。
 *
 * 相位评分用**精确**的投影值而不是 ±1 邻域最大值:1px 线在投影上会跨 2–3 个像素,
 * 用邻域最大值会让相邻两个相位同分,平局时取到靠前的相位 → 整条网格偏移 1px。
 */
function bestLattice(profile, period) {
  const n = profile.length
  let bestPhase = 0
  let bestScore = -1
  for (let phase = 0; phase < period; phase++) {
    let sum = 0
    let count = 0
    for (let p = phase; p < n; p += period) {
      sum += profile[p]
      count++
    }
    const score = count ? sum / count : 0
    if (score > bestScore) {
      bestScore = score
      bestPhase = phase
    }
  }
  const peaks = []
  for (let p = bestPhase; p < n; p += period) {
    // 强度取 ±1 邻域最大值:抗锯齿会把线拆到相邻像素,阈值判定用邻域更稳
    peaks.push({ pos: p, value: peakAt(profile, p) })
  }
  return { phase: bestPhase, peaks, score: bestScore }
}

/**
 * 最长有效格点段。
 *
 * 两侧留白处没有网格线,格点强度接近 0,会被阈值切开。取首尾两个有效格点,
 * 并要求中间断档不超过 10%(某条线偏淡时不至于把整段腰斩)。
 */
function latticeExtent(peaks) {
  if (!peaks.length) return null
  const values = peaks.map((p) => p.value)
  const sorted = values.slice().sort((a, b) => a - b)
  const maxV = sorted[sorted.length - 1] || 0
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] || 0
  const threshold = Math.max(maxV * 0.15, p90 * 0.25, 1e-6)

  const active = []
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i].value >= threshold) active.push(i)
  }
  if (active.length < 2) return null

  const first = active[0]
  const last = active[active.length - 1]
  const span = last - first + 1
  if (active.length / span < MIN_RUN_FILL) return null

  return {
    first: peaks[first].pos,
    last: peaks[last].pos,
    activeCount: span,
    total: peaks.length,
  }
}

/**
 * 找单元格周期(基频)。
 *
 * 只看「格点评分最高的周期」会被整数倍骗到:真实周期 20px 时,40px 的格点
 * 也能全部落在线上;若每隔一条线的对比度更强(交替配色很常见),40px 的平均分
 * 反而更高。因此以**自相关**定基频:
 *   1. 计算 [minLag, maxLag] 内每个 lag 的归一化自相关;
 *   2. 取第一个超过阈值(≥ 全局最高分 60% 且 ≥ MIN_CORRELATION)的**局部极大**,
 *      它才是最小重复单元 —— 整数倍的自相关更高,但位置更靠后;
 *   3. 纯色图/照片/噪点没有稳定局部极大 → 返回 null,由调用方报失败。
 */
function findPeriod(profile, minLag, maxLag) {
  if (maxLag < minLag) return null
  const corr = new Float32Array(maxLag + 2)
  let maxCorr = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    const c = correlationAt(profile, lag)
    corr[lag] = c
    if (c > maxCorr) maxCorr = c
  }
  if (maxCorr < MIN_CORRELATION) return null

  const threshold = Math.max(MIN_CORRELATION, maxCorr * PERIOD_TOLERANCE)
  for (let lag = minLag; lag <= maxLag; lag++) {
    const c = corr[lag]
    if (c < threshold) continue
    const prev = lag > minLag ? corr[lag - 1] : -Infinity
    const next = lag < maxLag ? corr[lag + 1] : -Infinity
    if (c >= prev && c >= next) return { period: lag, corr: c }
  }

  // 没有明确局部极大(信号很平):退回全局最大值,仍要求达到 MIN_CORRELATION
  let bestLag = minLag
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > corr[bestLag]) bestLag = lag
  return corr[bestLag] >= MIN_CORRELATION ? { period: bestLag, corr: corr[bestLag] } : null
}

/**
 * 检测图纸网格。
 *
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} imageData
 * @param {{minCell?: number, maxCell?: number, maxGrid?: number}} [options]
 * @returns {{
 *   ok: boolean,
 *   status: 'auto'|'low-confidence'|'failed',
 *   confidence: number,
 *   reason?: string,
 *   bounds?: {x0:number,y0:number,x1:number,y1:number},
 *   cols?: number, rows?: number,
 *   cellWidth?: number, cellHeight?: number,
 *   period?: {x:number,y:number}
 * }}
 */
export function detectChartGrid(imageData, options = {}) {
  const { data, width, height } = imageData || {}
  if (!data || !(width > 8) || !(height > 8)) return fail('invalidImage')
  if (data.length < width * height * 4) return fail('invalidImage')

  const minCell = options.minCell ?? DETECT_MIN_CELL
  const maxCell = options.maxCell ?? DETECT_MAX_CELL
  const maxGrid = options.maxGrid ?? DETECT_MAX_GRID

  const luma = toLuma(data, width, height)
  const vProfile = highPass(edgeProfile(luma, width, height, 'vertical'), HIGH_PASS_WINDOW)
  const hProfile = highPass(edgeProfile(luma, width, height, 'horizontal'), HIGH_PASS_WINDOW)

  const vPeriod = findPeriod(vProfile, minCell, Math.min(maxCell, Math.floor(width / 3)))
  const hPeriod = findPeriod(hProfile, minCell, Math.min(maxCell, Math.floor(height / 3)))
  if (!vPeriod || !hPeriod) return fail('noPeriodicity')

  const vExtent = latticeExtent(bestLattice(vProfile, vPeriod.period).peaks)
  const hExtent = latticeExtent(bestLattice(hProfile, hPeriod.period).peaks)
  if (!vExtent || !hExtent) return fail('noLatticeExtent')

  // 两端都是网格线,间隔数才是格子数
  const cols = vExtent.activeCount - 1
  const rows = hExtent.activeCount - 1
  if (cols < 2 || rows < 2) return fail('tooFewCells', { cols, rows })
  if (cols > maxGrid || rows > maxGrid) return fail('gridTooLarge', { cols, rows, maxGrid })

  const cellWidth = (vExtent.last - vExtent.first) / cols
  const cellHeight = (hExtent.last - hExtent.first) / rows
  if (cellWidth < minCell || cellHeight < minCell) return fail('cellTooSmall')

  const confidence = clamp01(
    0.75 * Math.min(vPeriod.corr, hPeriod.corr)
    + 0.25 * Math.min(1, Math.min(cols, rows) / 8)
  )

  return {
    ok: true,
    status: confidence >= 0.55 ? 'auto' : 'low-confidence',
    confidence,
    bounds: { x0: vExtent.first, y0: hExtent.first, x1: vExtent.last, y1: hExtent.last },
    cols,
    rows,
    cellWidth,
    cellHeight,
    period: { x: vPeriod.period, y: hPeriod.period },
  }
}
