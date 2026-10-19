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
/** 最多尝试几个自相关峰作为候选周期(按强度降序) */
const MAX_PERIOD_CANDIDATES = 6
/** 「线上 vs 格中」强度比下限:整数倍周期的比值接近 1,真实网格远大于 1 */
const MIN_LATTICE_CONTRAST = 4
/** 格内/格间颜色对比度下限(低于此值说明网格切错了) */
const MIN_GRID_QUALITY = 0.15
/** 有效格点段要求的最小连续比例:整数倍周期会留下交替空缺,必须被切断 */
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

function peakAt(profile, pos, radius = 1) {
  const n = profile.length
  let best = 0
  for (let q = Math.max(0, pos - radius); q <= Math.min(n - 1, pos + radius); q++) {
    if (profile[q] > best) best = profile[q]
  }
  return best
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
 * 线上 vs 格中的对比度。
 *
 * 真实单元格周期会让格点全部落在线上、半格位置落在格子内部;整数倍周期则会让
 * 半格位置也落在**真实**网格线上,两者强度接近 → 比值接近 1。
 * 用 ±12% 周期的邻域取最大值,容忍截图缩放带来的轻微错位。
 */
function lineStrength(profile, pos, radius) {
  const n = profile.length
  let best = 0
  for (let q = Math.max(0, pos - radius); q <= Math.min(n - 1, pos + radius); q++) {
    if (profile[q] > best) best = profile[q]
  }
  return best
}

function latticeContrast(profile, period, phase) {
  const n = profile.length
  const radius = Math.max(1, Math.round(period * 0.12))
  let onSum = 0
  let onN = 0
  let offSum = 0
  let offN = 0
  for (let q = phase; q + period <= n; q += period) {
    onSum += lineStrength(profile, q, radius)
    onN++
    const mid = Math.round(q + period / 2)
    offSum += lineStrength(profile, mid, radius)
    offN++
  }
  if (!onN || !offN) return 0
  return (onSum / onN) / (offSum / offN + 1e-6)
}

/**
 * 最长连续有效格点段。
 *
 * 两侧留白处没有网格线,格点强度接近 0,会被阈值切开。
 *
 * 这里必须**严格**(fill ≥ 0.9):整数倍周期会让一半格点落在格子中间,
 * 那些位置的强度会掉下去,段就被切断 —— 这正是区分真实周期与整数倍周期的关键。
 * 放松阈值会让「2 格并 1 格」的错网格通过,产生列数悄悄减半的结果。
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
 * 三个陷阱,按顺序处理:
 *   1. **整数倍**:真实周期 24px 时,48/240 的格点也能全部落在线上。自相关在整数倍上
 *      往往更高(尤其「每 10 格一条粗线」会让 240 成为最强峰),所以不能直接取最大峰;
 *   2. **半周期**:如果每格都有线,12px 也能让格点全部落在线上 —— 但此时 12 的一半
 *      格点会落在格子中间,格点段会被阈值切断;
 *   3. **非周期纹理**(照片/噪点):自相关没有稳定峰。
 *
 * 做法:
 *   a. 取自相关最强的几个局部极大作为候选(它们通常是真实周期的整数倍);
 *   b. 对每个候选枚举**升序的约数**,用「格点段是否连续有效」判定哪个才是真实周期 ——
 *      整数倍会让一半格点落在格子中间,段被切断;真实周期则整段连续;
 *   c. 全部候选都过不了段连续性 → 视为没有网格,返回 null。
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

  // 自相关局部极大(候选周期),按强度降序
  const peaks = []
  for (let lag = minLag; lag <= maxLag; lag++) {
    const c = corr[lag]
    if (c < MIN_CORRELATION) continue
    const prev = lag > minLag ? corr[lag - 1] : -Infinity
    const next = lag < maxLag ? corr[lag + 1] : -Infinity
    if (c >= prev && c >= next) peaks.push({ lag, corr: c })
  }
  if (!peaks.length) return null
  peaks.sort((a, b) => b.corr - a.corr)

  const tryPeriod = (period) => {
    if (period < minLag || period > maxLag) return null
    const lattice = bestLattice(profile, period)
    const extent = latticeExtent(lattice.peaks)
    if (!extent) return null
    // 「线上 vs 格中」对比度:真实网格的格点远强于半格位置。
    // 整数倍周期会让半格位置也落在真实网格线上,两者接近 → 拒绝。
    // 这一步专门拦住「检测出了周期,但它是真实格子的 2 倍/10 倍」的静默错误。
    const contrast = latticeContrast(profile, period, lattice.phase)
    if (contrast < MIN_LATTICE_CONTRAST) return null
    return { period, corr: corr[period] || 0, extent, contrast }
  }

  // 低于 minCell 的真实格子:此时只能识别出它的整数倍(2 格并 1 格)。
  // 若不检查,3px 格子的图纸会被静默识别成「一半的列数」。宁可报 cellTooSmall,
  // 也不能给用户一个列数悄悄减半的结果。
  // latticeExtent 自带连续性判定:半周期只有一半位置真有线时,会被切断而返回 null。
  const tooSmall = (hit) => {
    const half = hit.period / 2
    if (!Number.isInteger(half) || half < 2 || half >= minLag) return null
    const halfExtent = latticeExtent(bestLattice(profile, half).peaks)
    if (!halfExtent) return null
    return { period: half, corr: corr[half] || 0, extent: halfExtent, tooSmall: true }
  }

  for (const peak of peaks.slice(0, MAX_PERIOD_CANDIDATES)) {
    // 升序约数 + 候选本身:最小的「段连续」周期才是真实单元格
    const divisors = []
    for (let d = minLag; d < peak.lag; d++) {
      if (peak.lag % d === 0) divisors.push(d)
    }
    for (const d of divisors) {
      const hit = tryPeriod(d)
      if (hit) return tooSmall(hit) || hit
    }
    const hit = tryPeriod(peak.lag)
    if (hit) return tooSmall(hit) || hit
  }
  return null
}

/**
 * 网格质量评估:正确的网格里,每格中心区域颜色几乎一致(珠子/色块),
 * 而不同格子之间有差异;错误网格(例如把 29×29 的图纸识别成 2×2)会把
 * 许多真实格子塞进一个"大格",格内方差与格间方差接近。
 *
 * 用 inter/(intra+floor) 作为判据:真网格通常 >3,错网格接近 1。
 * 这一步专门拦住「检测出了一个周期,但周期是真实格子的整数倍」的静默错误 ——
 * 宁可报失败让用户手动设置,也不能给出列数悄悄减半的结果。
 */
function gridQuality(data, width, height, bounds, cols, rows) {
  const cellW = (bounds.x1 - bounds.x0) / cols
  const cellH = (bounds.y1 - bounds.y0) / rows
  const stepX = Math.max(1, Math.round(cellW / 5))
  const stepY = Math.max(1, Math.round(cellH / 5))
  const cellMeans = []
  let intra = 0
  let counted = 0

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = bounds.x0 + (x + 0.5) * cellW
      const cy = bounds.y0 + (y + 0.5) * cellH
      let sr = 0; let sg = 0; let sb = 0; let n = 0
      const samples = []
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const px = Math.round(cx + dx * stepX)
          const py = Math.round(cy + dy * stepY)
          if (px < 0 || py < 0 || px >= width || py >= height) continue
          const o = (py * width + px) * 4
          const r = data[o]; const g = data[o + 1]; const b = data[o + 2]
          samples.push([r, g, b])
          sr += r; sg += g; sb += b; n++
        }
      }
      if (n < 5) continue
      const mr = sr / n; const mg = sg / n; const mb = sb / n
      let v = 0
      for (const [r, g, b] of samples) {
        v += (r - mr) ** 2 + (g - mg) ** 2 + (b - mb) ** 2
      }
      intra += v / n
      counted++
      cellMeans.push([mr, mg, mb])
    }
  }
  if (counted < 4) return 0
  intra /= counted

  let gr = 0; let gg = 0; let gb = 0
  for (const [r, g, b] of cellMeans) { gr += r; gg += g; gb += b }
  gr /= cellMeans.length; gg /= cellMeans.length; gb /= cellMeans.length
  let inter = 0
  for (const [r, g, b] of cellMeans) {
    inter += (r - gr) ** 2 + (g - gg) ** 2 + (b - gb) ** 2
  }
  inter /= cellMeans.length

  return inter / (intra + 25)
}
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
  if (vPeriod.tooSmall || hPeriod.tooSmall) return fail('cellTooSmall')

  // findPeriod 已用格点段连续性验证过,这里直接复用其边界
  const vExtent = vPeriod.extent
  const hExtent = hPeriod.extent

  // 两端都是网格线,间隔数才是格子数
  const cols = vExtent.activeCount - 1
  const rows = hExtent.activeCount - 1
  if (cols < 2 || rows < 2) return fail('tooFewCells', { cols, rows })
  if (cols > maxGrid || rows > maxGrid) return fail('gridTooLarge', { cols, rows, maxGrid })

  const cellWidth = (vExtent.last - vExtent.first) / cols
  const cellHeight = (hExtent.last - hExtent.first) / rows
  if (cellWidth < minCell || cellHeight < minCell) return fail('cellTooSmall')

  // 静默错误拦截:周期是真实格子的整数倍时,网格看起来「成立」但每格混进了多颗珠子。
  // 用格内/格间颜色对比度判定;明显不像逐格图纸就报失败,交给用户手动设置。
  const quality = gridQuality(data, width, height, {
    x0: vExtent.first, y0: hExtent.first, x1: vExtent.last, y1: hExtent.last,
  }, cols, rows)
  if (quality < MIN_GRID_QUALITY) return fail('lowGridQuality', { cols, rows, quality })

  const confidence = clamp01(
    0.6 * Math.min(vPeriod.corr, hPeriod.corr)
    + 0.25 * Math.min(1, Math.min(cols, rows) / 8)
    + 0.15 * Math.min(1, quality / 6)
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
