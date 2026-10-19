/**
 * gridDetector — 从图片像素中检测拼豆图纸的网格周期与图纸边界。
 *
 * 纯函数:输入 RGBA 像素与宽高,不依赖 DOM / Canvas / React,可在 Node 与测试中直接运行。
 *
 * 设计取舍(对应 docs/agent-spec/03 §4B 第 3 步):
 *   - 只处理**轴对齐**的水平/垂直网格;透视与旋转校正不在本阶段,检测失败时交由用户手动设置;
 *   - 检测不可靠时返回 status='failed' 与可解释原因,**绝不**返回一个"看起来成功"的猜测网格;
 *   - 边界取首尾两条网格线,两侧留白/图例不会把列数撑大。
 *
 * ── 算法:逐格跟踪 ──
 *
 * 旧实现先估一个**整数**周期,再按固定步长铺格点。真实截图几乎不会落在整数像素上
 * (24px 图纸缩到 0.95 倍就是 22.8px),固定步长每格累积约 0.2px 漂移,29 格后偏出
 * 5.8px(约 1/4 格),格点逐渐离开网格线 → 报错或给出错误列数。
 *
 * 现在分四步:
 *   1. **找候选线**:边缘投影(前向差 + 后向差)上的全部局部极大。位置用「线中心投影」
 *      的加权质心精修。粗线(每 10 格一条、线宽 3px)在边缘投影上是双峰,直接取峰会
 *      落在一条边缘上、整条线偏 1.5px;线中心投影上它是一个居中的单峰,与线宽无关。
 *   2. **估格宽**:候选线两两相邻间距的**众数**。图纸里绝大多数相邻线正好相隔一格,
 *      所以众数就是格宽;少数漏检造成的 2–3 倍间距不会污染它。
 *      这一步不能用强度:相邻两格颜色接近时,它们之间的线强度可以低到全局最强的 3%,
 *      任何强度门槛都会把格宽估成 2 倍。
 *   3. **逐格跟踪**:从最强的种子线出发,每一步都预测「上一条线 + 当前格宽」,
 *      在预测位置附近找**最近的**候选线并吸附过去,再用实测位置作为下一个锚点。
 *      因此误差不累积,扫描造成的轻微不等距也能跟上。
 *      相邻两格颜色接近时线可能真的不存在,允许连续漏检几格并按预测继续前进;
 *      漏掉的线由两侧真实线插值补上 —— 有真实线夹着,插值误差不会累积。
 *   4. **两端修剪**:跟踪会一路走进右侧图例、标题笔画等弱边缘。这些线的强度
 *      只有真实网格线的一小部分,从两端反复剪掉,直到端点可信为止。
 *      只剪两端:图纸内部的弱线是真实存在的,不能动。
 *
 * 坐标约定:bounds 为原图像素坐标,首尾都是**网格线**的位置;列数 = 两端之间的间隔数。
 */

export const DETECT_MIN_CELL = 4
export const DETECT_MAX_CELL = 160
export const DETECT_MAX_GRID = 200

/**
 * 高通滑动窗口:去掉缓慢变化的底色/光照,保留网格线的尖峰。
 *
 * **必须小于最窄的格宽**。边缘投影本身已经是逐像素差分,缓慢的光照变化
 * 早就被消掉了,这里只需要削掉几像素尺度的底色起伏。窗口若大于格宽,
 * 窗口内会同时包含**相邻两条格线**,局部均值被抬高,弱线会被减成 0 ——
 * 13px 格宽下窗口 31 正好会吃掉整条格线。
 */
const HIGH_PASS_WINDOW = 9
/** 格内/格间颜色对比度下限(低于此值说明网格切错了) */
const MIN_GRID_QUALITY = 0.15

/**
 * 候选线的最低强度(相对全局最强线)—— **低阈值**,用于补齐弱线。
 *
 * 图纸上每 10 格一条粗线,其余是细线,强度差可达 10 倍;扫描/JPEG 又会让
 * 部分细线进一步变淡。低阈值保证这些线不丢,代价是会收进伪峰 ——
 * 伪峰由高阈值那一路估出的格宽来过滤。
 */
const PEAK_THRESHOLD_RATIO = 0.04
/**
 * 强线阈值——只用来**估计格宽**。
 *
 * 粗线和清晰细线都在这个水平之上,足以确定格点阵;用它们估出的格宽不会
 * 被伪峰稀释。之后再用低阈值补齐,跟踪时按格宽吸附,伪峰自然被跳过。
 */
const PEAK_THRESHOLD_RATIO_STRONG = 0.1
/** 相邻 2px 内的极大合并为一条线(粗线的两个边缘峰) */
const PEAK_MERGE_DISTANCE = 2
/** 一条线的半宽上限(px):超过说明是大面积色块的亮度起伏,不是网格线 */
const MAX_LINE_HALF_WIDTH = 12
/** 候选线数量上限(防御性:图纸最大 200 格) */
const PEAK_MAX_COUNT = 400

/** 格宽候选:相邻间距众数的这些分数也纳入考虑(应对全程只检出 2–4 倍间距的情况) */
const CELL_DIVISORS = [1, 2, 3, 4]
/** 格宽候选的最低格点填充率:低于此值说明过度细分,格点比线多 */
const CELL_MIN_FILL = 0.75
/**
 * 用**强峰**估格宽时的填充率下限。
 *
 * 强峰里只有粗线和清晰细线,被 JPEG 压淡的细线本来就缺席,所以格点阵上
 * 必然有很多空格点 —— fill 天然偏低。只要间距一致(格宽正确),这些空格点
 * 会在低阈值补齐阶段被填上。门槛设高会让整条轴被判成「无周期性」。
 */
const CELL_MIN_FILL_STRONG = 0.5

/** 跟踪时允许的最小相邻间距(px)。比 DETECT_MIN_CELL 松,先如实测出来再判定是否过小 */
const TRACK_MIN_GAP = 2
/** 作为种子尝试的最强线个数 */
const TRACK_SEED_COUNT = 6
/** 每步搜索窗口的半宽(相对当前格宽估计) */
const TRACK_SEARCH_WINDOW = 0.45
/** 格宽滚动估计使用的最远间距个数 */
const TRACK_HISTORY = 5
/** 允许连续漏检的格数上限:超过即认为已走出图纸 */
const TRACK_MAX_MISSES = 3
/** 跟踪步数上限(防御性) */
const TRACK_MAX_ITER = 2000
/** 相邻间距不得超过格宽的这个倍数(超过说明跟踪跳格了) */
const TRACK_MAX_STEP_RATIO = 2.3
/** 相邻间距不得低于格宽的这个倍数(低于说明吸附回了同一条线) */
const TRACK_MIN_STEP_RATIO = 0.5

/**
 * 两端修剪:强度低于链中位强度的这个比例 → 视为图例/标题等非网格边缘。
 *
 * 不能设高:相邻两格颜色接近时,真实网格线的强度可以低到中位的 40% 以下,
 * 设成 0.5 会把图纸内部的弱线从端点剪掉,整条链随之缩短。
 * 主要判据是**间距不符**(图例/标题的边缘不在等距格点上),
 * 强度只用来兜底挡掉极弱的杂散边缘。
 */
const TRIM_STRENGTH_RATIO = 0.3
/** 两端修剪:间距偏离链中位数超过此比例 → 视为走出图纸 */
const TRIM_GAP_TOLERANCE = 0.15
/** 端点修剪:强度低于链中位强度的这个比例 → 视为图例/标题边缘 */
const TRIM_OUTLIER_STRENGTH = 0.45
/** 网格线覆盖率相对链中位数的下限:低于此值说明只覆盖一小段(图例色块/标题笔画) */
const MIN_LINE_COVERAGE_RATIO = 0.6
/** 判定「该像素处有边缘」的亮度差下限 */
const LINE_EDGE_MIN = 12
/** 修剪时保护的最少线数(首末各一条,至少还要剩这么多) */
const TRIM_MIN_LINES = 4

/**
 * 间距一致性容忍比例。
 *
 * 真实图纸的相邻间距偏差通常在 5% 内(扫描/缩放造成的轻微不等距),
 * 而图例/标题边缘与网格线的间距会差 20% 以上。容忍度设 0.2 足以区分两者;
 * 放得更松会让图例边缘混进网格,列数偏多。
 */
const TRACK_GAP_TOLERANCE = 0.2
/** 间距落在容忍范围内的最低比例 */
const TRACK_MIN_CONSISTENT = 0.85
/** 格点阵残差容忍(相对格宽):超过即视为不在阵上的杂线 */
const LATTICE_RESIDUAL_RATIO = 0.3

const LUM_R = 0.2126
const LUM_G = 0.7152
const LUM_B = 0.0722

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function fail(reason, extra = {}) {
  return { ok: false, status: 'failed', reason, confidence: 0, ...extra }
}

function median(values) {
  if (!values.length) return 0
  const s = values.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
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
 *
 * 图像首/末列只有单侧邻居,原本只累加到一个差分(强度约为内部的一半)。
 * 图纸常被裁到网格边界,这条边界线若强度减半,会导致首列被当成噪声丢掉,
 * 所以这里把单侧差分乘 2 补偿回同一量纲。
 */
function edgeProfile(luma, width, height, axis) {
  if (axis === 'vertical') {
    const prof = new Float32Array(width)
    for (let x = 0; x < width; x++) {
      const leftMissing = x === 0
      const rightMissing = x + 1 >= width
      const gain = leftMissing || rightMissing ? 2 : 1
      let sum = 0
      for (let y = 0; y < height; y++) {
        const i = y * width + x
        const l = luma[i]
        const left = leftMissing ? l : luma[i - 1]
        const right = rightMissing ? l : luma[i + 1]
        sum += Math.abs(l - left) + Math.abs(right - l)
      }
      prof[x] = (sum * gain) / height
    }
    return prof
  }
  const prof = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    const upMissing = y === 0
    const downMissing = y + 1 >= height
    const gain = upMissing || downMissing ? 2 : 1
    let sum = 0
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const l = luma[i]
      const up = upMissing ? l : luma[i - width]
      const down = downMissing ? l : luma[i + width]
      sum += Math.abs(l - up) + Math.abs(down - l)
    }
    prof[y] = (sum * gain) / width
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

/**
 * 线中心投影:每一列(行)的平均亮度相对局部背景的偏差绝对值。
 *
 * 边缘投影的峰值落在**线的边缘**上。1px 细线还好,但图纸每 10 格一条的粗线
 * (3px 宽)会呈现两个边缘峰,取峰会把它带偏约 1.5px,导致相邻间距一宽一窄。
 * 这里用「平均亮度偏离局部背景」:整条线是一个居中的单峰,加权质心就是线的中心。
 */
function inkProfile(luma, width, height, axis) {
  const n = axis === 'vertical' ? width : height
  const mean = new Float64Array(n)
  if (axis === 'vertical') {
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) mean[x] += luma[row + x]
    }
    for (let x = 0; x < n; x++) mean[x] /= height
  } else {
    for (let y = 0; y < height; y++) {
      let s = 0
      for (let x = 0; x < width; x++) s += luma[y * width + x]
      mean[y] = s / width
    }
  }

  // 这里的窗口可以比高通窗口大一些:它只用来找**局部背景**给单条线定中心,
  // 不参与候选筛选,窗口大一点反而更稳(粗线中心不至于被自身拉平)。
  // 但仍不能大到跨过相邻格线 —— 取 11,在最小可用格宽 12px 下仍安全。
  const half = Math.max(1, Math.min(5, n >> 3))
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + mean[i]
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(n, i + half + 1)
    const baseline = (prefix[b] - prefix[a]) / (b - a)
    out[i] = Math.abs(mean[i] - baseline)
  }
  return out
}

/**
 * 用线中心投影测量一条线的中心与宽度。
 *
 * 从候选索引向两侧扩展,只要 ink 仍高于峰高的 50% 就继续。
 * 返回 null 表示**不是网格线**:扩展超过半宽上限仍未降到一半,说明这是一个
 * 大面积色块/图案区域的亮度起伏,而不是贯穿整幅图的细线。
 * 网格线在 2× 放大时最宽也就 6px,半宽上限 12px 足够宽松。
 */
function measureLine(ink, i) {
  const n = ink.length
  const peak = ink[i]
  if (!(peak > 0)) return null
  const threshold = peak * 0.5
  let l = i
  while (l > 0 && i - l < MAX_LINE_HALF_WIDTH && ink[l - 1] >= threshold) l--
  let r = i
  while (r < n - 1 && r - i < MAX_LINE_HALF_WIDTH && ink[r + 1] >= threshold) r++

  let wsum = 0
  let vsum = 0
  for (let k = l; k <= r; k++) {
    wsum += ink[k] * k
    vsum += ink[k]
  }
  if (!(vsum > 0)) return { pos: i, width: r - l + 1 }
  return { pos: wsum / vsum, width: r - l + 1 }
}

/**
 * 收集候选线(按位置排序)。
 *
 * 用**边缘投影**找局部极大:细线对比度低时边缘投影仍有明显尖峰,比 ink 更灵敏
 * (ink 是整行平均,细线在整行均值里只占 1/29,容易被图案颜色淹没)。
 * 再用 **ink 定中心**:粗线在边缘投影上是两个边缘峰,但它们各自的 ink 扩展都会
 * 覆盖整条线,收敛到同一个中心,因此粗线双峰会自动合并成一条。
 */
function collectPeaks(ink, strengthProfile, threshold) {
  const n = strengthProfile.length
  const raw = []
  // 首/末像素也要参与:图纸常被裁到网格边界,边界线正好落在第 0 列或最后一列。
  // 这两列的投影已做过单侧差分补偿,强度与内部线同量纲。
  for (let i = 0; i < n; i++) {
    const v = strengthProfile[i]
    if (v < threshold) continue
    if (i > 0 && v < strengthProfile[i - 1]) continue
    if (i + 1 < n && v < strengthProfile[i + 1]) continue
    raw.push({ i, value: v })
  }

  const peaks = []
  for (const r of raw) {
    const line = measureLine(ink, r.i)
    // ink 上没有对应峰(纯边缘噪声)时回落到边缘峰自身的索引
    const pos = line ? line.pos : r.i
    const prev = peaks[peaks.length - 1]
    if (prev && pos - prev.pos < PEAK_MERGE_DISTANCE) {
      if (r.value > prev.value) {
        prev.i = r.i
        prev.pos = pos
        prev.value = r.value
      }
      continue
    }
    if (prev && pos <= prev.pos) continue
    peaks.push({ i: r.i, pos, value: r.value })
    if (peaks.length >= PEAK_MAX_COUNT) break
  }
  return peaks
}

/**
 * 用一条候选格宽给所有候选线打分。
 *
 * 按 p ≈ origin + k·cell 给每条线分配格序号 k,统计:
 *   - inliers:落在容忍内的线数
 *   - span:覆盖的格序号跨度(即格点数)
 *   - fill:inliers / span
 *
 * **fill 是关键判据**。格宽取小了,格点阵仍能覆盖所有真实线(24 的格点必然也是
 * 12 的格点),inliers 一样多甚至更多,所以不能只看 inliers —— 但过度细分会
 * 产生大量**没有线**的格点,fill 急剧下降。正确的格宽下每个格点都有一条线。
 */
function scoreCell(peaks, cell) {
  if (!(cell >= TRACK_MIN_GAP)) return null

  // 用 RANSAC 思路选锚点:逐个峰当作格点阵的第一条线,取 inliers 最多的那个。
  // 不能直接用 peaks[0] —— JPEG 压缩噪声、图案细节会产生强度很低的伪峰,
  // 它们可能排在真实网格线前面,把 origin 带偏,让整条格点阵对不上。
  let best = null
  const tol = cell * 0.2
  for (const anchor of peaks) {
    let minK = Infinity
    let maxK = -Infinity
    let inliers = 0
    for (const p of peaks) {
      const k = Math.round((p.pos - anchor.pos) / cell)
      if (Math.abs(p.pos - (anchor.pos + k * cell)) > tol) continue
      inliers++
      if (k < minK) minK = k
      if (k > maxK) maxK = k
    }
    if (inliers < 3 || !(maxK > minK)) continue
    const span = maxK - minK + 1
    const fill = inliers / span
    if (!best || inliers > best.inliers || (inliers === best.inliers && fill > best.fill)) {
      best = { cell, origin: anchor.pos, inliers, span, fill }
    }
  }
  return best
}

function pushInto(set, v, maxCell) {
  if (v >= TRACK_MIN_GAP && v <= maxCell) set.add(Math.round(v * 100) / 100)
}

/**
 * 估计格宽:候选线相邻间距的众数,并尝试它的 1/2、1/3、1/4
 * (应对全程只检出一半/三分之一线的情况)。
 *
 * 在填充率达标的前提下取 inliers 最多的候选;同分时取**较大**的格宽
 * (宁可少切,不可多切)。
 *
 * `minFill` 可调:用**强峰**(只有粗线和清晰细线)估格宽时,细线本来就缺席,
 * fill 天然偏低,此时应放宽门槛 —— 只要间距一致就说明格宽对,细线交给
 * 后续低阈值补齐。用全部峰时则必须严格,否则会过度细分。
 */
function estimateCell(peaks, maxCell, minFill = CELL_MIN_FILL) {
  // 3 条线(2 个间距)就足以估格宽;更小的图纸由 detectChartGrid 的
  // cols/rows >= 2 校验兜底,不会给出只有一个格子的结果。
  if (peaks.length < 3) return null
  const gaps = []
  for (let i = 1; i < peaks.length; i++) {
    const g = peaks[i].pos - peaks[i - 1].pos
    if (g >= TRACK_MIN_GAP && g <= maxCell * 1.6) gaps.push(g)
  }
  if (!gaps.length) return null

  // 候选格宽直接来自**实测间距**(保留小数):真实截图几乎不会落在整数像素上,
  // 四舍五入到整数会让整条格点阵随格数漂移。
  // 相邻间距的中位数是最稳的单格估计;另外取若干较小的间距,应对部分漏检。
  const sorted = gaps.slice().sort((a, b) => a - b)
  const bases = new Set()
  const push = (v) => {
    if (v >= TRACK_MIN_GAP && v <= maxCell) bases.add(Math.round(v * 100) / 100)
  }
  push(sorted[sorted.length >> 1])
  // 取若干分位作为备选,覆盖「一部分间距是 2 格」的情形
  for (const q of [0.2, 0.3, 0.4, 0.6]) {
    push(sorted[Math.floor(sorted.length * q)])
  }

  const candidates = new Set()
  for (const base of bases) {
    for (const d of CELL_DIVISORS) pushInto(candidates, base / d, maxCell)
  }

  let best = null
  const all = []
  for (const cell of candidates) {
    const score = scoreCell(peaks, cell)
    if (!score) continue
    all.push(score)
    // 填充率不达标 = 过度细分,直接淘汰
    if (score.fill < minFill) continue
    if (
      !best
      || score.inliers > best.inliers
      || (score.inliers === best.inliers && score.cell > best.cell)
    ) {
      best = score
    }
  }
  if (best) {
    best = refineCell(peaks, best)
    best.candidates = all
  }
  return best
}

/**
 * 用最小二乘把格宽精修到亚像素。
 *
 * 候选格宽来自间距的粗估,残差还有 0.1–0.3px;对整条格点阵做一次
 * 「格序号固定、拟合 origin 与 cell」的线性回归,可以把误差压到 0.01px,
 * 二十几格累积下来才有意义。
 */
function refineCell(peaks, score) {
  let origin = score.origin
  let cell = score.cell
  for (let pass = 0; pass < 3; pass++) {
    let sx = 0; let sy = 0; let sxx = 0; let sxy = 0; let n = 0
    const tol = cell * 0.3
    for (const p of peaks) {
      const k = Math.round((p.pos - origin) / cell)
      if (Math.abs(p.pos - (origin + k * cell)) > tol) continue
      sx += k; sy += p.pos; sxx += k * k; sxy += k * p.pos; n++
    }
    if (n < 2) break
    const denom = n * sxx - sx * sx
    if (Math.abs(denom) < 1e-9) break
    const nextCell = (n * sxy - sx * sy) / denom
    const nextOrigin = (sy - nextCell * sx) / n
    if (!(nextCell > 0)) break
    origin = nextOrigin
    cell = nextCell
  }
  return { ...score, origin, cell }
}

/** 在预测位置附近找**最近**的候选线(不是最强线:强线可能是两格外的粗线) */
function nearestPeak(peaks, target, window, exclude) {
  let best = null
  let bestD = Infinity
  for (const p of peaks) {
    if (p === exclude) continue
    const d = Math.abs(p.pos - target)
    if (d <= window && d < bestD) {
      best = p
      bestD = d
    }
  }
  return best
}

/**
 * 从一条种子线出发,逐格跟踪一个方向。
 *
 * 每一步都用「上一条已吸附的线 + 当前格宽」预测下一个位置,再吸附到最近的
 * 候选线 —— 锚点始终是**实测位置**,所以非整数格宽不会累积成漂移。
 * 找不到线时按预测继续前进(允许连续漏检),重新捕获后把跨过的格子数记在 skip 上。
 */
function trackDirection(peaks, seed, cell, dir) {
  const out = []
  const steps = []
  let cur = seed.pos
  let est = cell
  let misses = 0

  for (let iter = 0; iter < TRACK_MAX_ITER; iter++) {
    const target = cur + dir * est
    const window = est * TRACK_SEARCH_WINDOW
    const cand = nearestPeak(peaks, target, window, null)

    if (!cand) {
      misses++
      if (misses > TRACK_MAX_MISSES) break
      cur = target
      continue
    }

    const span = (cand.pos - cur) * dir
    if (span < est * TRACK_MIN_STEP_RATIO || span > est * TRACK_MAX_STEP_RATIO) {
      // 吸附回了同一条线,或跨得太远:当作没找到,按预测继续
      misses++
      if (misses > TRACK_MAX_MISSES) break
      cur = target
      continue
    }

    out.push({ pos: cand.pos, value: cand.value, skip: misses })
    const perCell = span / (misses + 1)
    steps.push(perCell)
    if (steps.length > TRACK_HISTORY) steps.shift()
    est = median(steps)
    cur = cand.pos
    misses = 0
  }
  return out
}

/**
 * 把一条方向上的跟踪结果展开成线列表,漏检的格子按相邻两条真实线线性插值。
 *
 * 插值只发生在**两条真实线之间**,误差不累积:即使连续漏 3 格,
 * 也只是在这 3 格里做等分,不会把整条链带偏。
 */
function expandTracked(entries, startPos) {
  const lines = []
  const strengths = []
  let prev = startPos
  for (const e of entries) {
    const steps = e.skip + 1
    for (let k = 1; k < steps; k++) {
      lines.push(prev + ((e.pos - prev) * k) / steps)
      // 插值出来的线没有像素证据,强度记 0
      strengths.push(0)
    }
    lines.push(e.pos)
    strengths.push(e.value)
    prev = e.pos
  }
  return { lines, strengths }
}

/**
 * 从两端修剪不可信的线。
 *
 * 跟踪会一路走进右侧图例、标题笔画等弱边缘 —— 它们的强度只有真实网格线的
 * 一小部分。反复剪掉强度明显偏弱或间距明显不符的端点,直到端点可信为止。
 * **只剪两端**:图纸内部的弱线(相邻两格颜色接近)是真实存在的,不能动。
 */
function trimEnds(lines, strengths, referenceCell) {
  const L = lines.slice()
  const S = strengths.slice()
  const refCell = referenceCell > 0 ? referenceCell : 0
  while (L.length > TRIM_MIN_LINES) {
    const measured = S.filter((v) => v > 0)
    const level = measured.length ? median(measured) : 0
    // 间距基准优先用全局格宽估计:链内部若有漏检,局部中位数会被拉偏
    const cell = refCell > 0 ? refCell : median(
      L.slice(1).map((v, i) => v - L[i]),
    )

    const weakFirst = S[0] > 0 && level > 0 && S[0] < level * TRIM_STRENGTH_RATIO
    const weakLast = S[S.length - 1] > 0 && level > 0 && S[S.length - 1] < level * TRIM_STRENGTH_RATIO
    const badFirstGap = L.length > 2 && Math.abs(L[1] - L[0] - cell) > cell * TRIM_GAP_TOLERANCE
    const badLastGap = L.length > 2
      && Math.abs(L[L.length - 1] - L[L.length - 2] - cell) > cell * TRIM_GAP_TOLERANCE

    // 插值线(强度 0)在端点没有像素证据,直接剪掉
    const zeroFirst = S[0] === 0
    const zeroLast = S[S.length - 1] === 0

    const dropFirst = badFirstGap || weakFirst || zeroFirst
    const dropLast = badLastGap || weakLast || zeroLast
    if (!dropFirst && !dropLast) break

    if (dropFirst && dropLast) {
      // 两端都不合格时只剪更差的一侧,避免一次剪掉真实边界。
      // 间距偏差优先于强度:图例边缘的特征是「不在格点上」,而不是「比较弱」。
      const firstScore = (L.length > 2 ? Math.abs(L[1] - L[0] - cell) / (cell || 1) : 0) * 4
        + (S[0] === 0 ? 1 : S[0] / (level || 1))
      const lastScore = (L.length > 2 ? Math.abs(L[L.length - 1] - L[L.length - 2] - cell) / (cell || 1) : 0) * 4
        + (S[S.length - 1] === 0 ? 1 : S[S.length - 1] / (level || 1))
      if (firstScore >= lastScore) {
        L.shift(); S.shift()
      } else {
        L.pop(); S.pop()
      }
      continue
    }
    if (dropFirst) { L.shift(); S.shift() } else { L.pop(); S.pop() }
  }
  return { lines: L, strengths: S }
}

/**
 * 间距一致性校验。
 *
 * 只要有一条间距明显偏大(漏线)或整体不齐(不是规整网格),就判不可信。
 * 这是最后一道闸:宁可报失败让用户手动设置,也不给一个列数悄悄减半的结果。
 */
function validateGaps(lines) {
  if (lines.length < 3) return null
  const gaps = []
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1])
  const cell = median(gaps)
  if (!(cell >= TRACK_MIN_GAP)) return null
  let consistent = 0
  for (const g of gaps) {
    if (Math.abs(g - cell) <= cell * TRACK_GAP_TOLERANCE) consistent++
  }
  if (consistent / gaps.length < TRACK_MIN_CONSISTENT) return null
  return { cell, gaps, consistent: consistent / gaps.length }
}

/**
 * 用格点阵裁决每条线是否可信。
 *
 * 以 estimateCell 拟合出的 (origin, cell) 为基准,把跟踪得到的线分成两类:
 *   - 落在阵上(残差 ≤ 0.3 格宽):保留,位置用**实测值**(不用拟合值,避免抹平扫描畸变);
 *   - 不在阵上:剔除。图例/标题的边缘、图案内部纹理都属于这一类。
 *
 * 同时把阵中**缺失**的格点用相邻实测线插值补上(两端必须有真实线夹着),
 * 这样连续漏检的格子也能补齐,而不会凭空在图纸外生成线。
 */
function reconcileLattice(lines, strengths, estimate) {
  const { origin, cell } = estimate
  if (!(cell > 0)) return { lines, strengths }

  // 每条线归到最近的格序号;同一序号有多条时取残差最小的(其余视为重复检出)
  const byIndex = new Map()
  for (let i = 0; i < lines.length; i++) {
    const k = Math.round((lines[i] - origin) / cell)
    const residual = Math.abs(lines[i] - (origin + k * cell))
    const prev = byIndex.get(k)
    if (!prev || residual < prev.residual) {
      byIndex.set(k, { pos: lines[i], value: strengths[i], residual })
    }
  }

  const keys = Array.from(byIndex.keys()).sort((a, b) => a - b)
  if (keys.length < 2) return { lines, strengths }

  // 只保留残差在半格以内的线
  const kept = keys.filter((k) => byIndex.get(k).residual <= cell * LATTICE_RESIDUAL_RATIO)
  if (kept.length < 2) return { lines, strengths }

  // 连续格序号之间补插值线(只补被真实线夹住的空洞)
  const outLines = []
  const outStrengths = []
  for (let i = 0; i < kept.length; i++) {
    const k = kept[i]
    const item = byIndex.get(k)
    if (i > 0) {
      const prevK = kept[i - 1]
      const prevItem = byIndex.get(prevK)
      const gap = k - prevK
      if (gap > 1 && gap <= TRACK_MAX_MISSES + 1) {
        for (let s = 1; s < gap; s++) {
          outLines.push(prevItem.pos + ((item.pos - prevItem.pos) * s) / gap)
          outStrengths.push(0)
        }
      }
    }
    outLines.push(item.pos)
    outStrengths.push(item.value)
  }
  return { lines: outLines, strengths: outStrengths }
}

/**
 * 计算每条候选线在图像**纵向上的覆盖率**:这一列(行)上真正有边缘像素的比例。
 *
 * 网格线贯穿整张图纸,覆盖率接近 1;图例色块、标题笔画、图案内部的局部边缘
 * 只覆盖一小段高度,覆盖率明显偏低。这比强度可靠:强度会被线的对比度影响,
 * 而覆盖率只关心「这条线是不是贯穿全图」。
 */
function lineCoverage(luma, width, height, axis, pos) {
  const idx = Math.round(pos)
  const n = axis === 'vertical' ? height : width
  const limit = axis === 'vertical' ? width : height
  if (idx <= 0 || idx >= limit - 1) return 1 // 贴边的线无法判定,按可信处理
  let hits = 0
  // 粗线(每 10 格一条的加粗线)中心两侧还在线内,单点差值≈0。
  // 取 ±2px 窗口内的最大差值,让粗线与细线用同一判据。
  const RAD = 2
  if (axis === 'vertical') {
    for (let y = 0; y < height; y++) {
      const base = y * width
      let best = 0
      for (let d = -RAD; d <= RAD; d++) {
        const j = idx + d
        if (j <= 0 || j >= limit - 1) continue
        const i = base + j
        const l = luma[i]
        const v = Math.abs(l - luma[i - 1]) + Math.abs(luma[i + 1] - l)
        if (v > best) best = v
      }
      if (best > LINE_EDGE_MIN) hits++
    }
  } else {
    for (let x = 0; x < width; x++) {
      let best = 0
      for (let d = -RAD; d <= RAD; d++) {
        const j = idx + d
        if (j <= 0 || j >= limit - 1) continue
        const i = j * width + x
        const l = luma[i]
        const v = Math.abs(l - luma[i - width]) + Math.abs(luma[i + width] - l)
        if (v > best) best = v
      }
      if (best > LINE_EDGE_MIN) hits++
    }
  }
  return hits / n
}

/**
 * 剔除端点处覆盖率明显偏低的线(图例色块、标题笔画)。
 *
 * 用**相对**覆盖率:与链内各线覆盖率的中位数比较。
 * 图纸边界线的覆盖率本来就低(图纸外是留白,它只跨图纸高度、不跨整幅图),
 * 用绝对阈值会误剪边界;而图例色块只覆盖图纸高度的一小段,
 * 相对中位数仍明显偏低。
 */
function trimLowCoverage(lines, strengths, luma, width, height, axis, debugOut) {
  const L = lines.slice()
  const S = strengths.slice()
  while (L.length > TRIM_MIN_LINES) {
    const covs = L.map((p) => lineCoverage(luma, width, height, axis, p))
    const ref = median(covs)
    if (debugOut) {
      debugOut.coverages = {
        first: +covs[0].toFixed(2),
        last: +covs[covs.length - 1].toFixed(2),
        median: +ref.toFixed(2),
        n: L.length,
      }
    }
    const badFirst = ref > 0 && covs[0] < ref * MIN_LINE_COVERAGE_RATIO
    const badLast = ref > 0 && covs[covs.length - 1] < ref * MIN_LINE_COVERAGE_RATIO
    if (!badFirst && !badLast) break
    if (badFirst && badLast) {
      if (covs[0] <= covs[covs.length - 1]) { L.shift(); S.shift() } else { L.pop(); S.pop() }
      continue
    }
    if (badFirst) { L.shift(); S.shift() } else { L.pop(); S.pop() }
  }
  return { lines: L, strengths: S }
}

/**
 * 剔除端点间距超差或强度偏弱的线。
 *
 * 图例色块、标题笔画等边缘与网格线的间距会明显偏离格宽,但它们可能恰好落在
 * 格点阵的残差容忍内(单个残差小),因此不会被 reconcileLattice 剔除。
 * 这里以**估计格宽**为基准,从两端反复剔除间距超差的端点,直到两端都合格。
 *
 * 与 trimEnds 的区别:这里**只看间距**,不看强度,而且放在格点阵裁决之后,
 * 确保「已对齐到阵上但仍多出一列」的情况也能收干净。
 */
function trimOutlierEnds(lines, strengths, cell) {
  const L = lines.slice()
  const S = strengths.slice()
  while (L.length > TRIM_MIN_LINES) {
    const gaps = []
    for (let i = 1; i < L.length; i++) gaps.push(L[i] - L[i - 1])
    const ref = L.length >= 5 ? median(gaps) : cell
    if (!(ref > 0)) break

    const measured = S.filter((v) => v > 0)
    const level = measured.length ? median(measured) : 0

    const firstGap = L[1] - L[0]
    const lastGap = L[L.length - 1] - L[L.length - 2]
    const firstWeak = S[0] > 0 && level > 0 && S[0] < level * TRIM_OUTLIER_STRENGTH
    const lastWeak = S[S.length - 1] > 0 && level > 0 && S[S.length - 1] < level * TRIM_OUTLIER_STRENGTH
    const firstGapBad = Math.abs(firstGap - ref) > ref * TRIM_GAP_TOLERANCE
    const lastGapBad = Math.abs(lastGap - ref) > ref * TRIM_GAP_TOLERANCE

    // 判定条件(任一成立):
    //   1. 间距明显超差 —— 图例/标题边缘不在等距格点上;
    //   2. 强度明显偏弱 **且** 间距也偏大 —— 低分辨率下真实线强度也会偏低,
    //      单看强度会误剪;两者同时偏离才说明不是网格线。
    const badFirst = firstGapBad
      || (firstWeak && Math.abs(firstGap - ref) > ref * TRIM_GAP_TOLERANCE * 0.6)
    const badLast = lastGapBad
      || (lastWeak && Math.abs(lastGap - ref) > ref * TRIM_GAP_TOLERANCE * 0.6)
    if (!badFirst && !badLast) break
    if (badFirst && badLast) {
      const firstScore = Math.abs(firstGap - ref) / ref
        + (level > 0 && S[0] > 0 ? S[0] / level : 1)
      const lastScore = Math.abs(lastGap - ref) / ref
        + (level > 0 && S[S.length - 1] > 0 ? S[S.length - 1] / level : 1)
      if (firstScore <= lastScore) {
        L.shift(); S.shift()
      } else {
        L.pop(); S.pop()
      }
      continue
    }
    if (badFirst) { L.shift(); S.shift() } else { L.pop(); S.pop() }
  }
  return { lines: L, strengths: S }
}

/**
 * 对一条轴的投影做逐格跟踪,返回真实网格线位置。
 *
 * 尝试多个种子并取「线数最多」的链:线越多说明格宽越小,越不可能是真实格子的整数倍。
 *
 * @returns {{lines:number[], strengths:number[], cell:number, consistency:number} | null}
 */
function trackAxis(profile, ink, maxCell, luma, width, height, axis, debugOut) {
  const n = profile.length
  if (n < 8) return null

  const sorted = Array.from(profile).sort((a, b) => a - b)
  const maxV = sorted[n - 1] || 0
  if (maxV <= 0) return null

  // **两遍收集候选峰。** 图纸每 10 格一条粗线,粗线强度可以是细线的 5–10 倍;
  // JPEG 压缩又会在最强线的几个百分点处制造大量伪峰。单一阈值两头不讨好:
  // 太高会丢掉所有细线(间距变成 24/72 交替),太低会让伪峰稀释格点填充率。
  // 所以先用强峰把格宽钉死,再用低阈值收全部峰,让跟踪时的格宽吸收其余差异。
  const strongPeaks = collectPeaks(ink, profile, maxV * PEAK_THRESHOLD_RATIO_STRONG)
  const allPeaks = collectPeaks(ink, profile, maxV * PEAK_THRESHOLD_RATIO)
  const peaks = allPeaks.length > strongPeaks.length ? allPeaks : strongPeaks
  // 最少 3 条线才能确定一个格宽(2 个间距);更小的图纸会在 cols/rows 校验处被拒
  if (peaks.length < 3) return null

  const strongEstimate = strongPeaks.length >= 6
    ? estimateCell(strongPeaks, maxCell, CELL_MIN_FILL_STRONG)
    : null
  const estimate = strongEstimate || estimateCell(peaks, maxCell)
  if (debugOut) {
    debugOut.peaks = peaks
    debugOut.strongPeaks = strongPeaks
    debugOut.estimate = estimate
    debugOut.cellCandidates = estimate ? estimate.candidates : null
  }
  if (!estimate) return null

  const seeds = peaks.slice().sort((a, b) => b.value - a.value).slice(0, TRACK_SEED_COUNT)

  let best = null
  for (const seed of seeds) {
    const right = trackDirection(peaks, seed, estimate.cell, 1)
    const left = trackDirection(peaks, seed, estimate.cell, -1)

    // 拼成从左到右;漏检的格子在这里按两端真实线插值补齐
    const lines = []
    const strengths = []
    const leftExpanded = expandTracked(left.slice().reverse(), seed.pos)
    lines.push(...leftExpanded.lines)
    strengths.push(...leftExpanded.strengths)
    lines.push(seed.pos)
    strengths.push(seed.value)
    const rightExpanded = expandTracked(right, seed.pos)
    lines.push(...rightExpanded.lines)
    strengths.push(...rightExpanded.strengths)

    const trimmed = trimEnds(lines, strengths, estimate.cell)
    const reconciled = reconcileLattice(trimmed.lines, trimmed.strengths, estimate)
    const outlied = trimOutlierEnds(reconciled.lines, reconciled.strengths, estimate.cell)
    // 覆盖率修剪放在最后:图例色块只有一格高,覆盖率远低于贯穿图纸的网格线。
    // 放在间距修剪之后,避免先被间距误剪掉真实边界线。
    const covered = trimLowCoverage(
      outlied.lines, outlied.strengths, luma, width, height, axis, debugOut,
    )
    const final = covered
    const gaps = validateGaps(final.lines)
    if (debugOut) {
      debugOut.chains = debugOut.chains || []
      debugOut.chains.push({
        seed: +seed.pos.toFixed(2),
        raw: lines.length,
        trimmed: trimmed.lines.length,
        reconciled: reconciled.lines.length,
        outlied: outlied.lines.length,
        covered: covered.lines.length,
        final: final.lines.length,
        gapsOk: !!gaps,
        tail: final.lines.slice(-3).map((v) => +v.toFixed(1)),
      })
    }
    if (!gaps) continue

    // 线数越多 = 格宽越小 = 越接近真实单元格(整数倍周期会更少)
    const score = final.lines.length
    if (!best || score > best.score) {
      best = {
        lines: final.lines,
        strengths: final.strengths,
        cell: gaps.cell,
        consistency: gaps.consistent,
        score,
        estimate,
        peakCount: peaks.length,
        peakList: peaks,
      }
    }
  }
  if (debugOut && best) {
    debugOut.lines = best.lines
    debugOut.strengths = best.strengths
  }
  return best
}

/**
 * 网格质量评估:正确的网格里,每格中心区域颜色几乎一致(珠子/色块),
 * 而不同格子之间有差异;错误网格(例如把 29×29 的图纸识别成 2×2)会把
 * 许多真实格子塞进一个"大格",格内方差与格间方差接近。
 *
 * 用 inter/(intra+floor) 作为判据:真网格通常 >3,错网格接近 1。
 * 这一步专门拦住「图纸只画每 10 格一条粗线、细线全无」时把 10 格当成 1 格的情况。
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
  const vInk = inkProfile(luma, width, height, 'vertical')
  const hInk = inkProfile(luma, width, height, 'horizontal')
  const vProfile = highPass(edgeProfile(luma, width, height, 'vertical'), HIGH_PASS_WINDOW)
  const hProfile = highPass(edgeProfile(luma, width, height, 'horizontal'), HIGH_PASS_WINDOW)

  const vDebug = options.debug ? {} : null
  const hDebug = options.debug ? {} : null
  const v = trackAxis(vProfile, vInk, Math.min(maxCell, Math.floor(width / 3)), luma, width, height, 'vertical', vDebug)
  const h = trackAxis(hProfile, hInk, Math.min(maxCell, Math.floor(height / 3)), luma, width, height, 'horizontal', hDebug)
  if (!v || !h) {
    return fail('noPeriodicity', options.debug ? {
      debug: {
        x: v ? { lines: v.lines, cell: v.cell, estimate: v.estimate, peakCount: v.peakCount } : null,
        y: h ? { lines: h.lines, cell: h.cell, estimate: h.estimate, peakCount: h.peakCount } : null,
        xRaw: vDebug,
        yRaw: hDebug,
        xPeaksList: vDebug?.peaks,
        yPeaksList: hDebug?.peaks,
        xCellCandidates: vDebug?.cellCandidates,
        yCellCandidates: hDebug?.cellCandidates,
        xChains: vDebug?.chains,
        yChains: hDebug?.chains,
        xCoverage: vDebug?.coverages,
        yCoverage: hDebug?.coverages,
      },
    } : {})
  }

  const cols = v.lines.length - 1
  const rows = h.lines.length - 1
  if (cols < 2 || rows < 2) return fail('tooFewCells', { cols, rows })
  if (cols > maxGrid || rows > maxGrid) return fail('gridTooLarge', { cols, rows, maxGrid })

  const bounds = {
    x0: v.lines[0],
    y0: h.lines[0],
    x1: v.lines[v.lines.length - 1],
    y1: h.lines[h.lines.length - 1],
  }
  const cellWidth = (bounds.x1 - bounds.x0) / cols
  const cellHeight = (bounds.y1 - bounds.y0) / rows
  // 格子太小(截图被缩得很厉害)时如实报错,而不是给出一个列数翻倍的网格
  if (cellWidth < minCell || cellHeight < minCell) return fail('cellTooSmall')

  // 静默错误拦截:网格看起来「成立」但每格混进了多颗珠子时,格内方差会很高
  const quality = gridQuality(data, width, height, bounds, cols, rows)
  if (quality < MIN_GRID_QUALITY) return fail('lowGridQuality', { cols, rows, quality })

  const confidence = clamp01(
    0.45 * Math.min(1, Math.min(cols, rows) / 8)
    + 0.35 * Math.min(1, (v.consistency + h.consistency) / 2)
    + 0.2 * Math.min(1, quality / 6),
  )

  const result = {
    ok: true,
    status: confidence >= 0.55 ? 'auto' : 'low-confidence',
    confidence,
    bounds,
    cols,
    rows,
    cellWidth,
    cellHeight,
    period: { x: cellWidth, y: cellHeight },
  }
  if (options.debug) {
    result.debug = {
      xLines: v.lines,
      yLines: h.lines,
      xStrengths: v.strengths,
      yStrengths: h.strengths,
      xEstimate: v.estimate,
      yEstimate: h.estimate,
      xPeaks: v.peakCount,
      yPeaks: h.peakCount,
      xPeaksList: v.peakList,
      yPeaksList: h.peakList,
      xChains: vDebug?.chains,
      yChains: hDebug?.chains,
      xCoverage: vDebug?.coverages,
      yCoverage: hDebug?.coverages,
      xCellCandidates: vDebug?.cellCandidates,
      yCellCandidates: hDebug?.cellCandidates,
    }
  }
  return result
}
