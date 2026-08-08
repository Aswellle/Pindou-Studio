import { PERLER_PALETTE } from './perler'
import { HAMA_PALETTE } from './hama'
import { ARTKAL_PALETTE } from './artkal'
import { MARD_PALETTE, MARD291_PALETTE } from './mard'
import { COCO_PALETTE } from './coco'

// 选择列表顺序:COCO → MARD(221 默认)→ MARD 291(完整)→ Perler → Hama → Artkal
// (MARD 221 为国内图纸生态默认标准,MARD 291 为完整选项;COCO 为性价比主流)
export const PALETTES = {
  coco: COCO_PALETTE,
  mard: MARD_PALETTE,
  mard291: MARD291_PALETTE,
  perler: PERLER_PALETTE,
  hama: HAMA_PALETTE,
  artkal: ARTKAL_PALETTE,
}

export const PALETTE_LIST = Object.values(PALETTES).map(p => ({
  ...p,
  colorCount: p.colors.length  // 从实际数据派生，不依赖声明字段
}))

export function getPalette(id) {
  return PALETTES[id] || PERLER_PALETTE
}

// ==================== 颜色查找（CIEDE2000） ====================

function srgbToLinear(v) {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b)
  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505
  const xn = 0.95047, yn = 1.0, zn = 1.08883
  const fx = labF(x / xn), fy = labF(y / yn), fz = labF(z / zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function degToRad(d) { return (d * Math.PI) / 180 }
function radToDeg(r) { return (r * 180) / Math.PI }

function ciede2000(lab1, lab2) {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2
  const avgLp = (L1 + L2) / 2
  const C1 = Math.sqrt(a1 * a1 + b1 * b1)
  const C2 = Math.sqrt(a2 * a2 + b2 * b2)
  const avgC = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.sqrt(a1p * a1p + b1 * b1)
  const C2p = Math.sqrt(a2p * a2p + b2 * b2)
  const avgCp = (C1p + C2p) / 2
  let h1p = Math.atan2(b1, a1p); if (h1p < 0) h1p += 2 * Math.PI
  let h2p = Math.atan2(b2, a2p); if (h2p < 0) h2p += 2 * Math.PI
  const avgHp = Math.abs(h1p - h2p) > Math.PI
    ? (h1p + h2p + 2 * Math.PI) / 2
    : (h1p + h2p) / 2
  let dh = 0
  if (Math.abs(h1p - h2p) <= Math.PI) dh = h2p - h1p
  else if (h2p <= h1p) dh = h2p - h1p + 2 * Math.PI
  else dh = h2p - h1p - 2 * Math.PI
  const dL = L2 - L1, dC = C2p - C1p
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh / 2)
  const T = 1 - 0.17 * Math.cos(avgHp - degToRad(30)) + 0.24 * Math.cos(2 * avgHp)
          + 0.32 * Math.cos(3 * avgHp + degToRad(6)) - 0.2 * Math.cos(4 * avgHp - degToRad(63))
  const dt = degToRad(30) * Math.exp(-Math.pow((radToDeg(avgHp) - 275) / 25, 2))
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)))
  const Sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2))
  const Sc = 1 + 0.045 * avgCp
  const Sh = 1 + 0.015 * avgCp * T
  const Rt = -Math.sin(2 * dt) * Rc
  return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh))
}

// 缓存每个色板的 Lab 值，避免重复计算
const labCache = new Map()
function getPaletteLabs(palette) {
  if (labCache.has(palette.id)) return labCache.get(palette.id)
  const labs = palette.colors.map(c => rgbToLab(c.rgb.r, c.rgb.g, c.rgb.b))
  labCache.set(palette.id, labs)
  return labs
}

/**
 * 主线程颜色查找 — 使用 CIEDE2000（Phase 6.1）
 * 返回最接近的色板颜色对象
 */
export function findClosestColor(targetHex, paletteId) {
  const palette = getPalette(paletteId)
  // 非法输入显式返回 null,不再静默返回 colors[0](NaN → 误导性的"最接近色")
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(targetHex || '')
  if (!m) return null
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  const targetLab = rgbToLab(r, g, b)
  const labs = getPaletteLabs(palette)

  let closest = palette.colors[0]
  let minDist = Infinity

  for (let i = 0; i < palette.colors.length; i++) {
    const d = ciede2000(targetLab, labs[i])
    if (d < minDist) { minDist = d; closest = palette.colors[i] }
  }

  return closest
}
