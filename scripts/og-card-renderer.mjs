/**
 * 图纸分享卡片绘制(构建期,依赖 @napi-rs/canvas)。
 *
 * 为什么需要:图纸没有封面字段,templates 表里也没有封面列。快照页
 * (`buildPatternSnapshot`)一直返回 `image: ''`,所有图纸分享出去都是
 * 同一张站点默认图 —— 而图纸恰恰是最高频的分享对象。
 *
 * 做法:把图案本身画成 1200×630 的卡片(左图案 / 右标题·尺寸·色卡),
 * 输出到 dist/og/pattern/<id>-<hash>.png。文件名带内容指纹,内容变了
 * URL 就变,社交平台自然会重新抓取。
 *
 * 字体:用 @fontsource/noto-sans-sc 随仓库分发的 woff2 子集,不依赖系统字体
 * (Vercel 构建机是 Linux,没有微软雅黑)。Noto Sans SC 按 unicode-range
 * 拆成 97 个子集,而 @napi-rs/canvas 的 registerFromPath 在同一族名下
 * **只认第一个注册的子集**,所以这里把每个子集注册成独立族名,
 * 再用 CSS 字体回退链把它们串起来 —— 渲染时浏览器/canvas 会逐族查找,
 * 命中哪个子集就用哪个。
 *
 * 该模块只被 scripts/generate-og-snapshots.js 调用,不进前端包。
 *
 * 依赖 @napi-rs/canvas(未写入 package.json,同 generate-og-image.js /
 * verify-export.mjs 的用法)。它是原生模块,装不上时不能阻断构建 ——
 * 由调用方 catch,降级为「不生成卡片,继续用站点默认图」。
 */

import fs from 'node:fs'
import path from 'node:path'
import { planPatternCard, OG_CARD_WIDTH, OG_CARD_HEIGHT } from '../src/features/gallery/ogCard.js'

const FONT_DIR = 'node_modules/@fontsource/noto-sans-sc/files'

let fontChain = null
let canvasLib = null

/**
 * 惰性加载原生 canvas。
 *
 * 为什么不在顶层 import:顶层 import 失败会让整个快照脚本在**模块解析阶段**
 * 就崩掉,连 try/catch 都来不及 —— 而卡片只是增强项,不该拖垮 OG 快照本身。
 *
 * @returns {object|null} { createCanvas, GlobalFonts };不可用时返回 null
 */
export async function loadCanvasLib() {
  if (canvasLib !== null) return canvasLib || null
  try {
    canvasLib = await import('@napi-rs/canvas')
  } catch {
    canvasLib = false
  }
  return canvasLib || null
}

/**
 * 注册 Noto Sans SC 的全部子集,返回可直接塞进 ctx.font 的族名回退链。
 * 只做一次(模块级缓存):97 个子集注册约 150ms,每张卡片重复注册没有意义。
 *
 * @param {string} root 仓库根目录
 * @param {object} lib  { createCanvas, GlobalFonts }
 * @returns {string} 形如 `"SC400-1","SC400-2",…`;字体缺失时返回空串
 */
export function loadFontChain(root, lib) {
  if (fontChain !== null) return fontChain
  const dir = path.join(root, FONT_DIR)
  if (!fs.existsSync(dir) || !lib?.GlobalFonts) {
    fontChain = ''
    return ''
  }

  const families = []
  let files = []
  try {
    files = fs.readdirSync(dir)
  } catch {
    fontChain = ''
    return ''
  }

  for (const weight of [400, 700]) {
    const re = new RegExp(`^noto-sans-sc-(\\d+)-${weight}-normal\\.woff2$`)
    for (const file of files) {
      const m = file.match(re)
      if (!m) continue
      const family = `SC${weight}-${m[1]}`
      try {
        lib.GlobalFonts.registerFromPath(path.join(dir, file), family)
        families.push(family)
      } catch {
        // 单个子集注册失败不影响其余子集;真缺字时卡片上会是空白而不是崩溃
      }
    }
  }

  fontChain = families.map((f) => `"${f}"`).join(',')
  return fontChain
}

/** 测试用:清空字体缓存 */
export function resetFontChain() {
  fontChain = null
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fontOf(weight, size, chain) {
  const family = chain || 'sans-serif'
  return `${weight === 'bold' ? 'bold ' : ''}${size}px ${family}`
}

/**
 * 画一张卡片,返回 PNG Buffer。
 *
 * @param {object} template - 云端模板行
 * @param {object} [opts]
 * @param {string} [opts.root] 仓库根目录(定位字体)
 * @returns {Promise<Buffer|null>} 规划失败(无名称/空图案)或 canvas 不可用时返回 null
 */
export async function renderPatternCard(template, { root = process.cwd() } = {}) {
  const lib = await loadCanvasLib()
  if (!lib) return null
  const { createCanvas } = lib
  const chain = loadFontChain(root, lib)
  const probe = createCanvas(1, 1).getContext('2d')

  // 先用 canvas 的真实度量规划布局,再画 —— 折行必须基于真实字宽,
  // 否则中英混排标题会溢出右栏。
  const measure = (text, { fontSize, weight }) => {
    probe.font = fontOf(weight, fontSize, chain)
    return probe.measureText(text).width
  }

  const plan = planPatternCard(template, { measure })
  if (!plan) return null

  const canvas = createCanvas(OG_CARD_WIDTH, OG_CARD_HEIGHT)
  const ctx = canvas.getContext('2d')

  // 背景:与站点一致的暖色
  ctx.fillStyle = plan.background
  ctx.fillRect(0, 0, plan.width, plan.height)

  // ── 左侧:图案预览 ────────────────────────────────────────
  const pv = plan.preview
  ctx.fillStyle = pv.bg
  roundedRect(ctx, pv.x, pv.y, pv.w, pv.h, 20)
  ctx.fill()

  const pattern = template.pattern
  for (let r = 0; r < pv.rows; r++) {
    const row = pattern[r]
    if (!Array.isArray(row)) continue
    for (let c = 0; c < pv.cols; c++) {
      const cell = row[c]
      if (!cell) continue
      const x = pv.gridX + c * pv.cell + pv.inset
      const y = pv.gridY + r * pv.cell + pv.inset
      const size = pv.cell - pv.inset * 2
      if (size <= 0) continue
      ctx.fillStyle = cell
      if (pv.radius > 0) {
        roundedRect(ctx, x, y, size, size, pv.radius)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, size, size)
      }
    }
  }

  // ── 右侧:标题与信息 ──────────────────────────────────────
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  const t = plan.title
  ctx.fillStyle = t.color
  ctx.font = fontOf(t.weight, t.fontSize, chain)
  t.lines.forEach((line, i) => {
    ctx.fillText(line, t.x, t.y + i * t.lineHeight)
  })

  const blocks = [plan.meta, plan.stats, plan.swatchLabel]
  for (const b of blocks) {
    ctx.fillStyle = b.color
    ctx.font = fontOf(b.weight, b.fontSize, chain)
    ctx.fillText(b.text, b.x, b.y)
  }

  // ── 色卡 ──────────────────────────────────────────────────
  for (const sw of plan.swatches) {
    ctx.fillStyle = sw.hex
    roundedRect(ctx, sw.x, sw.y, sw.size, sw.size, 6)
    ctx.fill()
    // 极浅的颜色在白底上看不出边界,补一圈淡描边
    ctx.strokeStyle = 'rgba(43, 36, 32, 0.12)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = '#2b2420'
    ctx.font = fontOf('bold', 17, chain)
    ctx.fillText(`${sw.count} 颗`, sw.countX, sw.countY)
    ctx.fillStyle = '#a3968a'
    ctx.font = fontOf('normal', 15, chain)
    ctx.fillText(sw.hex.toUpperCase(), sw.hexX, sw.hexY)
  }

  if (plan.overflow) {
    ctx.fillStyle = plan.overflow.color
    ctx.font = fontOf('normal', plan.overflow.fontSize, chain)
    ctx.fillText(plan.overflow.text, plan.overflow.x, plan.overflow.y)
  }

  // ── 页脚 ──────────────────────────────────────────────────
  ctx.textAlign = plan.footer.align || 'left'
  ctx.fillStyle = plan.footer.color
  ctx.font = fontOf('normal', plan.footer.fontSize, chain)
  ctx.fillText(plan.footer.text, plan.footer.x, plan.footer.y)

  return canvas.encode('png')
}