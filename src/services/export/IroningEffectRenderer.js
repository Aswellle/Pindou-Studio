/**
 * IroningEffectRenderer — 高级熨烫效果的独立 Canvas 2D 渲染器。
 *
 * 定位(03 文档):成品效果模拟(visual mockup),不是图纸编辑、不是物理仿真。
 *   - 输入只读 PatternDocument v2(doc.grid.cells 是 HEX/null 矩阵,绝不回写);
 *   - presetId 是一次渲染的临时参数(来自 ironingEffectPresets),不进入任何持久化数据;
 *   - 与旧 RasterRenderer 的 professional/realistic 完全隔离 —— 本文件不读取
 *     style.beadStyle,旧渲染器也不认识这里的 presetId,两条链路互不可达;
 *   - 预览与导出共用同一套几何/纹理/绘制代码,唯一差异是采样倍率。
 *
 * 渲染层级(Layer A–F,顺序不可变):
 *   A 背景 #FDFBF7 → B 材料底板(波浪边 + 柔和投影)→ C 底纹 tile
 *   → D 图案色块(熔融方块,无中心孔)→ E 统一表面纹理覆盖
 *   → F 光泽 / 内阴影 / 边缘亮线。
 *
 * 性能与内存(09 文档 R4/R9):
 *   - 纹理先画进小尺寸 tile,再按逻辑坐标平铺(drawImage 目标尺寸 = tile 物理
 *     尺寸 / 倍率,1:1 设备像素,不重采样);禁止逐 bead 生成纹理对象;
 *   - tile 只缓存轻量小画布(LRU 上限),不缓存最终导出画布;
 *   - 图案逐格分帧(batch),每批前后检查 AbortSignal,编码前再查一次;
 *   - 导出走 createScaledCanvas 的面积预算(3×/6×/8× 请求,超限自动降级);
 *   - 确定性:同图纸 + 同预设 → 同 seed → 同纹理分布(禁用 Math.random)。
 */

import { createScaledCanvas } from '../BeadPatternExporter'
import { getIroningEffectPreset } from './ironingEffectPresets'

const HEX_RE = /^#[0-9a-fA-F]{6}$/
const BACKGROUND_COLOR = '#FDFBF7'

/** 导出模式的逻辑单元格尺寸(逻辑像素/珠) */
const EXPORT_CELL_SIZE = 20
/** 底板四周留白(单位:格) */
const PAD_CELLS = 2
/** 质量预设 → 请求超采样倍率(实际倍率受 createScaledCanvas 面积预算约束) */
const QUALITY_SCALES = { screen: 3, high: 6, print: 8 }
/** 预览模式单元格尺寸范围(逻辑像素) */
const PREVIEW_CELL_MIN = 3
const PREVIEW_CELL_MAX = 12
/** 逐格绘制的分帧批量 */
const BATCH_SIZE = 2000

// ── 确定性随机 ──────────────────────────────────────────────

/** FNV-1a 32 位哈希(字符串 → uint32) */
function fnv1a(str, seed = 0x811c9dc5) {
  let h = seed >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * 稳定 seed:同一图纸 + 同一预设必须产出同一纹理分布。
 * seed = FNV(presetId ⊕ seedSalt, "WxH", 逐 cell 字符串)。
 * 200×200 全量哈希约 4 万次短字符串遍历,成本可忽略。
 */
function computeTextureSeed(preset, grid) {
  let h = (fnv1a(preset.id) ^ preset.seedSalt) >>> 0
  h = fnv1a(`${grid.width}x${grid.height}`, h)
  const cells = grid.cells
  for (let y = 0; y < grid.height; y++) {
    const row = cells[y]
    for (let x = 0; x < grid.width; x++) {
      const cell = row?.[x]
      h = fnv1a(typeof cell === 'string' ? cell : '\u0000', h)
    }
  }
  return h >>> 0
}

/** mulberry32 — 小而快的确定性 PRNG(返回 () => [0,1)) */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 几何 ────────────────────────────────────────────────────

/**
 * 计算样片几何(纯函数,导出供测试)。
 *
 * - export:cellSize 固定 20,请求倍率按质量预设(screen 3×/high 6×/print 8×),
 *   实际倍率由 createScaledCanvas 的面积预算决定;
 * - preview:cellSize 由 maxPreviewEdge 反推并 clamp 在 3–12,固定 1×。
 *   maxPreviewEdge 是「目标」上限而非硬上限:cellSize 有 3 的可辨识下限,
 *   长边超过约 316 格时会略超该值(当前作品尺寸上限 200 使 UI 不可达)。
 * 两种模式都用「图案 + 四周 PAD_CELLS 格留白」构图,宽高比与图纸一致。
 */
export function computeIroningGeometry(
  grid,
  { mode = 'preview', quality = 'screen', maxPreviewEdge = 960 } = {}
) {
  const maxDim = Math.max(grid.width, grid.height)
  let cellSize
  let requestedScale
  if (mode === 'export') {
    cellSize = EXPORT_CELL_SIZE
    requestedScale = QUALITY_SCALES[quality] || QUALITY_SCALES.screen
  } else {
    // 总逻辑边 = maxDim*cell + 2*PAD_CELLS*cell → cell ≤ maxEdge / (maxDim + 2*PAD_CELLS)
    const fit = Math.floor(maxPreviewEdge / (maxDim + PAD_CELLS * 2))
    cellSize = Math.max(PREVIEW_CELL_MIN, Math.min(PREVIEW_CELL_MAX, fit))
    requestedScale = 1
  }
  const pad = Math.round(cellSize * PAD_CELLS)
  const boardW = grid.width * cellSize
  const boardH = grid.height * cellSize
  return {
    cellSize,
    pad,
    boardW,
    boardH,
    width: boardW + pad * 2,
    height: boardH + pad * 2,
    requestedScale,
  }
}

// ── 输入校验 ────────────────────────────────────────────────

function validateDocument(doc) {
  if (doc?.version !== 2) {
    throw new Error('IroningEffectRenderer: unsupported PatternDocument version')
  }
  const grid = doc.grid
  if (
    !grid ||
    !Number.isInteger(grid.width) ||
    grid.width <= 0 ||
    !Number.isInteger(grid.height) ||
    grid.height <= 0 ||
    !Array.isArray(grid.cells)
  ) {
    throw new Error('IroningEffectRenderer: invalid grid')
  }
}

// ── 路径构建 ────────────────────────────────────────────────

/** 圆角矩形(手动 arcTo,浏览器与 Node canvas 实现行为一致) */
function roundedRectPath(p, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  p.moveTo(x + rr, y)
  p.arcTo(x + w, y, x + w, y + h, rr)
  p.arcTo(x + w, y + h, x, y + h, rr)
  p.arcTo(x, y + h, x, y, rr)
  p.arcTo(x, y, x + w, y, rr)
  p.closePath()
}

/**
 * 邮票状波浪边(参考图的样片轮廓):四条边由连续外凸半圆弧组成。
 * 波长随 cellSize 缩放,幅度温和 —— 既有「裁切质感」又不抢图案。
 */
function scallopedBoardPath(p, x, y, w, h, waveLen) {
  const bump = waveLen * 0.32
  const nX = Math.max(3, Math.round(w / waveLen))
  const nY = Math.max(3, Math.round(h / waveLen))
  const stepX = w / nX
  const stepY = h / nY
  p.moveTo(x, y)
  for (let i = 0; i < nX; i++) p.arc(x + stepX * (i + 0.5), y, bump, Math.PI, Math.PI * 2)
  for (let i = 0; i < nY; i++) p.arc(x + w, y + stepY * (i + 0.5), bump, -Math.PI / 2, Math.PI / 2)
  for (let i = 0; i < nX; i++) p.arc(x + w - stepX * (i + 0.5), y + h, bump, 0, Math.PI)
  for (let i = 0; i < nY; i++) p.arc(x, y + h - stepY * (i + 0.5), bump, Math.PI / 2, (Math.PI * 3) / 2)
  p.closePath()
}

// ── 纹理 tile 生成器 ────────────────────────────────────────
// 约定:tile 画布物理尺寸 = logicalSize * scale,内部绘制按「逻辑 px」;
// 生成器只画透明底上的纹理笔画,材料底色由 Layer B 单独填充。
// 所有随机数来自传入的 rnd(确定性),tile 边缘绘制保持可平铺连续。

function drawMicroGridTile(g, size, rnd, preset) {
  const s = preset.textureScale
  g.lineWidth = 1
  for (let i = 0; i * s <= size + 0.5; i++) {
    const pos = i * s
    // 经纬交替的浮雕线:亮线 + 暗线各一条,宽度 1 逻辑px
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.beginPath()
    g.moveTo(pos + 0.5, 0)
    g.lineTo(pos + 0.5, size)
    g.stroke()
    g.beginPath()
    g.moveTo(0, pos + 0.5)
    g.lineTo(size, pos + 0.5)
    g.stroke()
    g.strokeStyle = 'rgba(0,0,0,0.22)'
    g.beginPath()
    g.moveTo(pos + 1.5, 0)
    g.lineTo(pos + 1.5, size)
    g.stroke()
    g.beginPath()
    g.moveTo(0, pos + 1.5)
    g.lineTo(size, pos + 1.5)
    g.stroke()
    // 单元内轻微明暗差异(织物压纹的不均匀感)
    for (let j = 0; j * s <= size + 0.5; j++) {
      if (rnd() < 0.35) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.10)'
        g.fillRect(pos + 2, j * s + 2, s - 3, s - 3)
      }
    }
  }
}

function drawLinenTile(g, size, rnd, preset) {
  const s = preset.textureScale
  // 经线(纵向)与纬线(横向)交织:每根纱线有独立的明暗与细度
  const strand = (count, horizontal) => {
    const step = size / count
    for (let i = 0; i < count; i++) {
      const pos = Math.round(i * step) + 0.5
      const bright = rnd() < 0.5
      g.strokeStyle = bright ? `rgba(255,255,255,${0.3 + rnd() * 0.35})` : `rgba(0,0,0,${0.1 + rnd() * 0.22})`
      g.lineWidth = 0.8 + rnd() * 0.9
      g.beginPath()
      if (horizontal) {
        g.moveTo(0, pos)
        g.lineTo(size, pos)
      } else {
        g.moveTo(pos, 0)
        g.lineTo(pos, size)
      }
      g.stroke()
      // 纱线上的纤维结(短小亮点,模拟麻纤粗细不均)
      const knots = Math.floor(size / (s * 1.2))
      for (let k = 0; k < knots; k++) {
        if (rnd() < 0.4) continue
        const along = rnd() * size
        g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.25})`
        if (horizontal) g.fillRect(along, pos - 0.8, 1.6 + rnd() * 2, 1.6)
        else g.fillRect(pos - 0.8, along, 1.6, 1.6 + rnd() * 2)
      }
    }
  }
  strand(Math.max(4, Math.round(size / (s * 0.5))), true)
  strand(Math.max(4, Math.round(size / (s * 0.5))), false)
}

function drawTowelTile(g, size, rnd, preset) {
  const s = preset.textureScale
  // 绒圈簇:短小、卷曲、方向随机的小弧线;靠近边缘的弧在 ±size 处补画,
  // 保证平铺时接缝两侧纹理连续
  const loops = Math.round((size / s) * (size / s) * 2.4)
  for (let i = 0; i < loops; i++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const r = s * (0.22 + rnd() * 0.3)
    const start = rnd() * Math.PI * 2
    const span = 2 + rnd() * 3
    const bright = rnd() < 0.55
    const ccw = rnd() < 0.5
    g.strokeStyle = bright ? `rgba(255,255,255,${0.28 + rnd() * 0.4})` : `rgba(0,0,0,${0.12 + rnd() * 0.26})`
    g.lineWidth = s * (0.13 + rnd() * 0.12)
    g.lineCap = 'round'
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (
          Math.abs(cx + ox - size / 2) > size / 2 + r + 2 ||
          Math.abs(cy + oy - size / 2) > size / 2 + r + 2
        )
          continue
        g.beginPath()
        g.arc(cx + ox, cy + oy, r, start, start + span, ccw)
        g.stroke()
      }
    }
  }
  // 绒毛深处的暗斑(少量、低透明度,给绒面纵深)
  const pockets = Math.round((size / s) * (size / s) * 0.35)
  for (let i = 0; i < pockets; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.05})`
    g.beginPath()
    g.arc(rnd() * size, rnd() * size, s * (0.25 + rnd() * 0.4), 0, Math.PI * 2)
    g.fill()
  }
}

function drawBathMeshTile(g, size, rnd, preset) {
  const s = preset.textureScale
  // 斜向交叉网纹:两族对角线,粗细交错;断续的纤维段表现网眼边缘
  const diagonals = (dir, count, base) => {
    const step = size / count
    for (let i = -count; i < count * 2; i++) {
      const offset = i * step
      const bright = rnd() < 0.5
      g.strokeStyle = bright
        ? `rgba(255,255,255,${base + rnd() * 0.3})`
        : `rgba(0,0,0,${base * 0.6 + rnd() * 0.2})`
      g.lineWidth = s * (0.1 + rnd() * 0.1)
      g.beginPath()
      if (dir > 0) {
        g.moveTo(offset, 0)
        g.lineTo(offset + size, size)
      } else {
        g.moveTo(offset, 0)
        g.lineTo(offset - size, size)
      }
      g.stroke()
    }
  }
  diagonals(1, Math.max(3, Math.round(size / s)), 0.28)
  diagonals(-1, Math.max(3, Math.round(size / s)), 0.24)
  // 网眼:交叉点附近的小亮孔
  const holes = Math.round((size / s) * (size / s) * 0.5)
  for (let i = 0; i < holes; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.35})`
    g.beginPath()
    g.arc(rnd() * size, rnd() * size, 0.8 + rnd() * (s * 0.16), 0, Math.PI * 2)
    g.fill()
  }
}

function drawFineSparkleTile(g, size, rnd, preset) {
  // 深色基底上的高密度微小闪点:点径在 sparkleSize 区间内,冷白/浅蓝/银
  const [minS, maxS] = preset.sparkleSize
  const count = Math.round(size * size * preset.sparkleDensity)
  for (let i = 0; i < count; i++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const r = minS + rnd() * (maxS - minS)
    const color = preset.sparkleColors[Math.floor(rnd() * preset.sparkleColors.length)]
    g.globalAlpha = 0.45 + rnd() * 0.55
    g.fillStyle = color
    g.beginPath()
    g.arc(cx, cy, Math.max(0.3, r), 0, Math.PI * 2)
    g.fill()
    // 较大的闪点补一道十字微光(数量受限,避免漫天星芒)
    if (r > maxS * 0.72 && rnd() < 0.3) {
      g.globalAlpha = 0.35
      g.strokeStyle = color
      g.lineWidth = 0.5
      const l = r * (1.6 + rnd() * 1.4)
      g.beginPath()
      g.moveTo(cx - l, cy)
      g.lineTo(cx + l, cy)
      g.stroke()
      g.beginPath()
      g.moveTo(cx, cy - l)
      g.lineTo(cx, cy + l)
      g.stroke()
    }
  }
  g.globalAlpha = 1
  // 基底的细微明暗噪声(深蓝布料不至于变成纯色塑料)
  const mottle = Math.round(size * size * 0.004)
  for (let i = 0; i < mottle; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)'
    g.beginPath()
    g.arc(rnd() * size, rnd() * size, 0.6 + rnd() * 1.6, 0, Math.PI * 2)
    g.fill()
  }
}

function drawCoarseSparkleTile(g, size, rnd, preset) {
  // 大颗粒亮片:不规则多边形小片,带角度与明暗差异;少量星芒高光
  const [minS, maxS] = preset.sparkleSize
  const count = Math.round(size * size * preset.sparkleDensity)
  for (let i = 0; i < count; i++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const r = (minS + rnd() * (maxS - minS)) * 1.4
    const rot = rnd() * Math.PI
    const sides = 4 + Math.floor(rnd() * 3) // 4–6 边不规则片
    const color = preset.sparkleColors[Math.floor(rnd() * preset.sparkleColors.length)]
    g.globalAlpha = 0.55 + rnd() * 0.4
    g.fillStyle = color
    g.beginPath()
    for (let k = 0; k < sides; k++) {
      const ang = rot + (k / sides) * Math.PI * 2
      const rr = r * (0.7 + rnd() * 0.5)
      const px = cx + Math.cos(ang) * rr
      const py = cy + Math.sin(ang) * rr
      if (k === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.closePath()
    g.fill()
    // 片内高光核心
    g.globalAlpha = 0.5 + rnd() * 0.4
    g.fillStyle = '#FFFFFF'
    g.beginPath()
    g.arc(cx - r * 0.2, cy - r * 0.25, r * 0.32, 0, Math.PI * 2)
    g.fill()
    // 少量星芒:只有小比例亮片获得,限制亮度
    if (rnd() < 0.12) {
      g.globalAlpha = 0.4 + rnd() * 0.3
      g.strokeStyle = '#FFFFFF'
      g.lineWidth = 0.7
      const l = r * (1.4 + rnd() * 1.2)
      g.beginPath()
      g.moveTo(cx - l, cy)
      g.lineTo(cx + l, cy)
      g.stroke()
      g.beginPath()
      g.moveTo(cx, cy - l)
      g.lineTo(cx, cy + l)
      g.stroke()
    }
  }
  g.globalAlpha = 1
  // 浅粉基底的细腻扰动
  const mottle = Math.round(size * size * 0.003)
  for (let i = 0; i < mottle; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'
    g.beginPath()
    g.arc(rnd() * size, rnd() * size, 0.8 + rnd() * 2, 0, Math.PI * 2)
    g.fill()
  }
}

const TEXTURE_GENERATORS = {
  'micro-grid': drawMicroGridTile,
  'woven-crosshatch': drawLinenTile,
  'terry-loop': drawTowelTile,
  'bath-mesh': drawBathMeshTile,
  'fine-sparkle': drawFineSparkleTile,
  'coarse-sparkle': drawCoarseSparkleTile,
}

/** 纹理 tile 的逻辑边长:随颗粒尺度变化,保证粗细关系与参考图一致 */
function tileSizeFor(preset) {
  return Math.max(64, Math.min(160, Math.round(preset.textureScale * 12)))
}

// ── tile 缓存(轻量小画布,LRU) ─────────────────────────────

const tileCache = new Map()
/** 缓存按「字节预算」而不是条目数限制:print 档单 tile 可达 6 MB,条目数上限会留下上百 MB 常驻内存 */
const TILE_CACHE_BYTES = 24 * 1024 * 1024
let tileCacheBytes = 0

const tileBytes = tile => tile.width * tile.height * 4

/** 预设指纹:参数被调整(未来调参 UI / HMR)后不得命中旧 tile */
const presetFingerprints = new WeakMap()
function presetFingerprint(preset) {
  let fp = presetFingerprints.get(preset)
  if (!fp) {
    fp = [
      preset.textureType,
      preset.textureScale,
      preset.textureOpacity,
      preset.sparkleDensity,
      preset.sparkleSize.join(','),
      preset.seedSalt,
    ].join('|')
    presetFingerprints.set(preset, fp)
  }
  return fp
}

function getTextureTile(preset, scale, seed, variant) {
  const key = `${preset.id}:${presetFingerprint(preset)}:${scale}:${seed}:${variant}`
  const cached = tileCache.get(key)
  if (cached) {
    // 触碰一次实现 LRU 语义(Map 按插入序迭代)
    tileCache.delete(key)
    tileCache.set(key, cached)
    return cached
  }
  const logical = tileSizeFor(preset)
  const tile = document.createElement('canvas')
  tile.width = logical * scale
  tile.height = logical * scale
  const g = tile.getContext('2d')
  // 生成器一律按「逻辑像素」绘制:tile 的 backing store 随倍率放大以保持锐利,
  // 但 textureScale / sparkleSize 等参数不能跟着倍率变 —— 否则导出倍率越高,
  // 纹理相对底板越细密,预览与导出就不再是同一材质(03/04 规定单位为 logical px)。
  g.scale(scale, scale)
  const rnd = mulberry32((seed ^ preset.seedSalt ^ (variant * 0x9e3779b9)) >>> 0)
  TEXTURE_GENERATORS[preset.textureType](g, logical, rnd, preset)
  tileCache.set(key, tile)
  tileCacheBytes += tileBytes(tile)
  while (tileCacheBytes > TILE_CACHE_BYTES && tileCache.size > 1) {
    const oldestKey = tileCache.keys().next().value
    const oldestTile = tileCache.get(oldestKey)
    tileCache.delete(oldestKey)
    tileCacheBytes -= tileBytes(oldestTile)
  }
  return tile
}

/** 供测试清理缓存(避免用例间状态串扰) */
export function __resetIroningTileCacheForTests() {
  tileCache.clear()
  tileCacheBytes = 0
}

/** 供测试断言字节预算(缓存是轻量小画布,不允许无界常驻) */
export function __getIroningTileCacheStatsForTests() {
  return { entries: tileCache.size, bytes: tileCacheBytes }
}

/**
 * 把 tile 平铺进矩形(逻辑坐标)。drawImage 的目标尺寸 = tile 物理尺寸/倍率,
 * 在 ctx.scale(scale) 下映射回 1:1 设备像素 —— 纹理在高倍率导出下依然锐利。
 */
function drawTiled(ctx, tile, x, y, w, h, alpha, scale, offsetLogical = 0) {
  const step = tile.width / scale
  if (!(step > 0)) return
  const ox = ((offsetLogical % step) + step) % step
  ctx.save()
  ctx.globalAlpha = alpha
  for (let ty = -step; ty < h + step; ty += step) {
    for (let tx = -step; tx < w + step; tx += step) {
      ctx.drawImage(
        tile,
        Math.round(x + tx + ox),
        Math.round(y + ty + ox),
        Math.round(step),
        Math.round(step)
      )
    }
  }
  ctx.restore()
}

// ── 分帧 ────────────────────────────────────────────────────

/** Node 环境(像素验证脚本)无 rAF,退化为 setTimeout 让出事件循环 */
const nextFrame = () =>
  new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve)
    else setTimeout(resolve, 0)
  })

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('导出已取消', 'AbortError')
}

function toPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('PNG encoding failed'))
    }, 'image/png')
  })
}

// ── 主流程 ──────────────────────────────────────────────────

/**
 * 渲染高级熨烫效果图。
 *
 * @param {Object} doc - PatternDocument v2(只读)
 * @param {Object} [options]
 * @param {string} [options.presetId] - 材质 ID(未知回退 linen)
 * @param {'preview'|'export'} [options.mode] - preview 限最大边,export 走质量预设
 * @param {'screen'|'high'|'print'} [options.quality] - 导出质量(请求倍率 3/6/8)
 * @param {number} [options.maxPreviewEdge] - 预览目标最大边(默认 960;受 cellSize 下限影响可能略超)
 * @param {AbortSignal} [options.signal] - 取消信号(分帧与编码前检查)
 * @param {Function} [options.onProgress] - 进度 0–1
 * @param {Function} [options.onResolution] - (物理宽, 物理高)
 * @param {Function} [options.onScale] - (实际倍率, 请求倍率)
 * @returns {Promise<{blob: Blob, width: number, height: number, actualScale: number, requestedScale: number}>}
 */
export async function renderIroningEffect(doc, options = {}) {
  const {
    presetId = 'linen',
    mode = 'preview',
    quality = 'screen',
    maxPreviewEdge = 960,
    signal = null,
    onProgress = null,
    onResolution = null,
    onScale = null,
  } = options

  validateDocument(doc)
  const preset = getIroningEffectPreset(presetId)
  const grid = doc.grid
  const geo = computeIroningGeometry(grid, { mode, quality, maxPreviewEdge })

  onProgress?.(0.05)
  throwIfAborted(signal)

  // 画布:预览与导出都走 createScaledCanvas(预览请求 1×,不占高 DPI 预算)
  const { canvas, scale: actualScale } = createScaledCanvas(geo.width, geo.height, geo.requestedScale)
  onResolution?.(canvas.width, canvas.height)
  onScale?.(actualScale, geo.requestedScale)

  const ctx = canvas.getContext('2d')
  ctx.scale(actualScale, actualScale)
  const { cellSize, pad, boardW, boardH, width, height } = geo

  // 纹理 seed:同图纸同预设必然一致(预览与导出同源的前提)
  const seed = computeTextureSeed(preset, grid)

  // ── Layer A:背景 ──
  ctx.fillStyle = BACKGROUND_COLOR
  ctx.fillRect(0, 0, width, height)

  // ── Layer B:材料底板(邮票状波浪边 + 柔和投影) ──
  const waveLen = Math.max(6, Math.min(28, cellSize * 0.8))
  const boardPath = new Path2D()
  scallopedBoardPath(boardPath, pad, pad, boardW, boardH, waveLen)
  ctx.save()
  ctx.shadowColor = `rgba(60, 42, 30, ${preset.shadowOpacity})`
  ctx.shadowBlur = cellSize * 0.9
  ctx.shadowOffsetY = cellSize * 0.35
  ctx.fillStyle = preset.fabricBase
  ctx.fill(boardPath)
  ctx.restore()

  // 内部图层全部裁切进底板:纹理与图案不会溢出波浪边
  ctx.save()
  ctx.clip(boardPath)

  // 底板厚度感:内圈暗环 + 边缘亮线(后续 Layer F 再补一次光泽)
  ctx.lineWidth = cellSize * 0.7
  ctx.strokeStyle = `rgba(0,0,0,${0.03 + preset.roughness * 0.08})`
  ctx.stroke(boardPath)

  // ── Layer C:材料底纹(第一层 tile) ──
  const tileA = getTextureTile(preset, actualScale, seed, 0)
  drawTiled(ctx, tileA, pad, pad, boardW, boardH, preset.textureOpacity, actualScale)

  onProgress?.(0.15)
  throwIfAborted(signal)

  // ── Layer D:图案色块(熔融方块;空白格保留底纹) ──
  // cellGap 是「逻辑像素」缝隙(03 §5:0–1 px),不是 cellSize 的比例:
  // 熨烫后的色块应当彼此熔融贴合,只留发丝级分界。
  const gap = preset.cellGap
  const inset = gap / 2
  // edgeRadius 控制熔融方块的圆角大小;edgeSoftness 控制边缘融合强度(描边浓度)。
  // 两者都是 preset 契约的一部分,不能只校验不消费。
  const blockR = Math.max(0.5, cellSize * (0.05 + preset.edgeRadius * 0.2))
  const cells = grid.cells
  let processed = 0
  const total = grid.width * grid.height
  for (let y = 0; y < grid.height; y++) {
    const row = cells[y]
    for (let x = 0; x < grid.width; x++) {
      const cell = row?.[x]
      // 只接受合法 HEX;null / 历史脏值一律视为空 → 露出材料底纹
      if (typeof cell !== 'string' || !HEX_RE.test(cell)) {
        processed += 1
        continue
      }
      const px = pad + x * cellSize + inset
      const py = pad + y * cellSize + inset
      const side = cellSize - gap
      const block = new Path2D()
      roundedRectPath(block, px, py, side, side, blockR)
      ctx.fillStyle = cell
      ctx.fill(block)
      // 方块轮廓:低对比描边,浓度由 edgeSoftness(边缘融合程度)决定
      ctx.lineWidth = Math.max(0.5, cellSize * 0.05)
      ctx.strokeStyle = `rgba(0,0,0,${0.03 + preset.edgeSoftness * 0.14})`
      ctx.stroke(block)
      processed += 1
      if (processed % BATCH_SIZE === 0) {
        throwIfAborted(signal)
        onProgress?.(0.15 + 0.55 * (processed / total))
        await nextFrame()
      }
    }
  }
  throwIfAborted(signal)
  onProgress?.(0.75)

  // ── Layer E:统一表面纹理覆盖(第二层 tile,变体 seed + 半格错位) ──
  // 织物材质用低强度让图案「长在材料上」;闪粉材质的闪点必须可见地
  // 跨越底色与图案(参考图),保留较高强度。
  const isSparkle = preset.textureType === 'fine-sparkle' || preset.textureType === 'coarse-sparkle'
  const tileB = getTextureTile(preset, actualScale, seed, 1)
  drawTiled(
    ctx,
    tileB,
    pad,
    pad,
    boardW,
    boardH,
    isSparkle ? Math.min(1, preset.textureOpacity + 0.7) : preset.textureOpacity * 0.65,
    actualScale,
    tileSizeFor(preset) / 2
  )

  // ── Layer F:光泽 / 内阴影 / 边缘亮线 ──
  if (preset.sheen > 0) {
    const sheen = ctx.createLinearGradient(pad, pad, pad + boardW, pad + boardH)
    sheen.addColorStop(0, `rgba(255,255,255,${preset.sheen * 0.16})`)
    sheen.addColorStop(0.45, 'rgba(255,255,255,0)')
    sheen.addColorStop(1, `rgba(255,255,255,${preset.sheen * 0.07})`)
    ctx.fillStyle = sheen
    ctx.fillRect(pad, pad, boardW, boardH)
  }
  ctx.lineWidth = cellSize * 0.55
  ctx.strokeStyle = `rgba(0,0,0,${0.04 + preset.roughness * 0.07})`
  ctx.stroke(boardPath)
  ctx.lineWidth = Math.max(1, cellSize * 0.06)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.stroke(boardPath)

  ctx.restore() // 解除底板裁切
  onProgress?.(0.9)
  throwIfAborted(signal)

  const blob = await toPngBlob(canvas)
  // 编码大画布可能持续数秒:期间用户关闭面板会 abort,编码完成后必须再检查,
  // 否则调用方会继续创建 URL 并下载一个「已被取消」的文件。
  throwIfAborted(signal)
  onProgress?.(1)
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    actualScale,
    requestedScale: geo.requestedScale,
  }
}
