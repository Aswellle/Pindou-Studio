/**
 * Export V2 PNG 像素级验证(开发工具,不入构建)
 *
 * 用真正的 RasterRenderer 在 Node(@napi-rs/canvas 提供 canvas 实现)里
 * 渲染出真实 PNG,然后逐像素断言:
 *   1. 表头深色带 / 图例条 / 颜色面板背景的底色
 *   2. 专业模式格子内部为纯色填充(整数坐标 → 无抗锯齿混色)
 *   3. 品牌署名 Logo 的 4×4 色块之一
 *   4. 拟真模式珠子的中心孔(比基色显著偏暗)与月牙高光(比基色偏亮)
 *   5. 取消语义:已 abort 的 signal 让 renderPatternDocumentToPNG 抛 AbortError
 *
 * 用法: npx vite-node scripts/verify-v2-png.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCanvas, loadImage } = require('@napi-rs/canvas')

// ── i18n / DOM 最小全局(vite-node 的 Node 环境没有 localStorage/navigator/document) ──
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN', languages: ['zh-CN'] }, configurable: true })
globalThis.window = { location: { search: '' }, history: { replaceState() {} }, addEventListener() {} }
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = class Blob {}

// document.createElement('canvas') → @napi-rs/canvas(RasterRenderer 经 createScaledCanvas 创建画布)
const realCreateCanvas = (w, h) => createCanvas(w, h)
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`verify-v2-png: unexpected createElement(${tag})`)
    return realCreateCanvas(300, 150)
  },
}

const { createPatternDocument } = await import('../src/services/export/PatternDocument.js')
const { renderPatternDocumentToPNG } = await import('../src/services/export/RasterRenderer.js')
const { PERLER_PALETTE } = await import('../src/data/palettes/perler.js')
const { BRAND_MARK_CELLS } = await import('../src/services/export/brandMark.js')
const { createScaledCanvas } = await import('../src/services/BeadPatternExporter.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const outDir = path.join(ROOT, 'verify-output', 'v2-png')
fs.mkdirSync(outDir, { recursive: true })

// ── 合成 29×29 样例(与 generate-v2-evidence 同款:边框+斜纹+点缀+微量) ──
const N = 29
const hexOf = (id) => PERLER_PALETTE.colors.find(c => c.id === id)?.hex
const BLUE = hexOf('P25')
const WHITE = hexOf('P01')
const YELLOW = hexOf('P02')
const RED = hexOf('P14')

const cells = Array.from({ length: N }, () => Array(N).fill(null))
for (let i = 0; i < N; i++) {
  cells[0][i] = BLUE; cells[N - 1][i] = BLUE; cells[i][0] = BLUE; cells[i][N - 1] = BLUE
}
for (let y = 2; y < N - 2; y++) {
  for (let x = 2; x < N - 2; x++) {
    if ((x + y) % 4 === 0) cells[y][x] = WHITE
  }
}
for (const [x, y] of [[5, 5], [22, 6], [8, 20], [20, 22], [14, 10], [10, 14]]) cells[y][x] = YELLOW
for (const [x, y] of [[14, 4], [4, 24], [24, 14]]) cells[y][x] = RED

const makeDoc = (beadStyle) => createPatternDocument({
  canvasData: cells, gridSize: N, paletteId: 'perler',
  designName: 'Export V2 像素验证', beadStyle, palette: PERLER_PALETTE,
})

// ── 像素工具 ──
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
// 打开 PNG → 返回可 getImageData 的 ctx(整个 sheet 缓存一份)
async function loadCtx(buffer) {
  const img = await loadImage(buffer)
  const cv = realCreateCanvas(img.width, img.height)
  const ctx = cv.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return ctx
}
function pixelAt(ctx, logicalX, logicalY, scale) {
  const d = ctx.getImageData(Math.round(logicalX * scale), Math.round(logicalY * scale), 1, 1).data
  return [d[0], d[1], d[2]]
}
// 逻辑坐标邻域内的亮度最小/最大值(容忍 1~2 物理像素的取整偏差)
function patchLum(ctx, logicalX, logicalY, scale, half = 3) {
  const cx = Math.round(logicalX * scale)
  const cy = Math.round(logicalY * scale)
  const d = ctx.getImageData(cx - half, cy - half, half * 2 + 1, half * 2 + 1).data
  let min = Infinity, max = -Infinity
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    if (l < min) min = l
    if (l > max) max = l
  }
  return { min, max }
}
const closeTo = (a, b, tol = 6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol)

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`) }
  else { fail += 1; console.log(`  ✗ ${name} ${detail}`) }
}

// ── 渲染两种风格 ──
const LAYOUT = { cellSize: 28, headerHeight: 80, legendHeight: 50, padding: 20, rowLabelWidth: 36, colLabelHeight: 28, panelWidth: 260 }
const layoutOf = (doc) => doc.layout
const results = {}

for (const beadStyle of ['professional', 'realistic']) {
  const doc = makeDoc(beadStyle)
  const { layout } = doc
  let resInfo = null
  const blob = await renderPatternDocumentToPNG(doc, {
    onResolution: (w) => { resInfo = w },
  })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const file = path.join(outDir, `v2-${beadStyle}.png`)
  fs.writeFileSync(file, buffer)
  const sheetW = doc.grid.width * layout.cellSize + layout.rowLabelWidth * 2 + layout.padding * 2 + layout.panelWidth
  const scale = resInfo / sheetW
  console.log(`\n[${beadStyle}] ${file} (${resInfo}px, scale ${scale})`)

  const sheetW2 = sheetW
  const gridStartX = layout.padding + layout.rowLabelWidth
  const gridStartY = layout.headerHeight + layout.legendHeight + layout.padding + layout.colLabelHeight
  const legendCY = layout.headerHeight + layout.legendHeight / 2
  const markSize = 8 * 4
  const markX = sheetW2 - layout.padding - (markSize + 8 + 84)
  const markY = Math.round(legendCY - markSize / 2)

  // 1. 表头深色带
  const ctx = await loadCtx(buffer)
  const headerPx = pixelAt(ctx, 6, 6, scale)
  check('表头深色带 #2c2c2c', closeTo(headerPx, hexToRgb('#2c2c2c')), JSON.stringify(headerPx))

  // 2. 图例条底色
  const legendPx = pixelAt(ctx, 400, legendCY, scale)
  check('图例条底色 #f0f0f0', closeTo(legendPx, hexToRgb('#f0f0f0')), JSON.stringify(legendPx))

  // 3. 颜色面板背景
  const panelPx = pixelAt(ctx, sheetW2 - layout.panelWidth - layout.padding + 130, layout.headerHeight + layout.legendHeight + layout.padding + 200, scale)
  check('颜色面板底色 #f8f8f8', closeTo(panelPx, hexToRgb('#f8f8f8')), JSON.stringify(panelPx))

  // 4. 品牌署名 Logo 首块色
  const brandPx = pixelAt(ctx, markX + 4, markY + 4, scale)
  check('品牌 Logo 首块色', closeTo(brandPx, hexToRgb(BRAND_MARK_CELLS[0][0])), JSON.stringify(brandPx))

  if (beadStyle === 'professional') {
    // 5. 专业模式:格子内部纯色(整数坐标 → 无混色)。点缀黄珠 (5,5)
    const px1 = pixelAt(ctx, gridStartX + 5 * 28 + 14, gridStartY + 5 * 28 + 14, scale)
    check('专业格内部纯色填充', closeTo(px1, hexToRgb(YELLOW), 8), `expect ${YELLOW}, got ${JSON.stringify(px1)}`)
    // 边框珠 (0,0)
    const px0 = pixelAt(ctx, gridStartX + 12, gridStartY + 12, scale)
    check('边框珠纯色填充', closeTo(px0, hexToRgb(BLUE), 8), JSON.stringify(px0))
  } else {
    // 6. 拟真模式:中心孔暗区 vs 月牙高光亮区,差距必须显著(取边框蓝珠 (0,0))
    const cx = gridStartX + 14
    const cy = gridStartY + 14
    const r = 28 / 2 - 2
    const baseLum = lum(hexToRgb(BLUE))
    const hole = patchLum(ctx, cx, cy, scale)
    const hi = patchLum(ctx, cx - r * 0.28, cy - r * 0.28, scale)
    check('拟真珠中心孔存在(孔区明显暗于基色)', hole.min < baseLum - 5, `hole min ${hole.min.toFixed(0)} vs base ${baseLum.toFixed(0)}`)
    check('拟真珠月牙高光存在(高光区明显亮于基色)', hi.max > baseLum + 15, `hi max ${hi.max.toFixed(0)} vs base ${baseLum.toFixed(0)}`)
    check('孔/高光对比显著(珠子立体感)', hi.max - hole.min > 40, `${(hi.max - hole.min).toFixed(0)}`)
  }
}

// ── 7. 取消语义:已 abort 的 signal → AbortError ──
console.log('\n[abort]')
const abortCtrl = new AbortController()
abortCtrl.abort()
try {
  await renderPatternDocumentToPNG(makeDoc('professional'), { signal: abortCtrl.signal })
  check('已取消的 signal 抛 AbortError', false, '未抛错')
} catch (err) {
  check('已取消的 signal 抛 AbortError', err?.name === 'AbortError', `${err?.name}: ${err?.message}`)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
