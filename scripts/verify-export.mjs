/**
 * 导出质量验证脚本(临时工具,不入构建)
 * 用真实 node canvas(@napi-rs/canvas) + worker 量化算法,生成专业模式 PNG 和 SVG,
 * 验证超采样清晰度与色彩匹配效果。
 *
 * 用法: node scripts/verify-export.mjs <图片路径> <网格宽> <网格高> [maxColors]
 */
import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { fileURLToPath } from 'url'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { PERLER_PALETTE } from '../src/data/palettes/perler.js' // 带扩展名直接导入(node ESM 不解析无扩展名)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const imgPath = process.argv[2]
const gridW = parseInt(process.argv[3] || '140', 10)
const gridH = parseInt(process.argv[4] || '140', 10)
const maxColors = parseInt(process.argv[5] || '32', 10)
if (!imgPath || !fs.existsSync(imgPath)) {
  console.error('用法: node scripts/verify-export.mjs <图片路径> <网格宽> <网格高> [maxColors]')
  process.exit(1)
}

// ── 1. 加载图片并缩放到 ≤3000px(与 useImageQuantizer 一致) ──────
const img = await loadImage(imgPath)
const maxSource = 3000
const s = Math.min(maxSource / Math.max(img.width, img.height), 1)
const sw = Math.round(img.width * s)
const sh = Math.round(img.height * s)
const src = createCanvas(sw, sh)
const sctx = src.getContext('2d')
sctx.imageSmoothingEnabled = true
sctx.imageSmoothingQuality = 'high'
sctx.drawImage(img, 0, 0, sw, sh)
const imageData = sctx.getImageData(0, 0, sw, sh)

console.log(`图片 ${img.width}x${img.height} → 缩放 ${sw}x${sh}, 网格 ${gridW}x${gridH}, maxColors=${maxColors}`)

// ── 2. 在 vm 沙箱中执行 worker 量化算法(纯函数,无浏览器依赖) ───
const workerCode = fs.readFileSync(path.join(ROOT, 'src/workers/imageQuantizer.worker.js'), 'utf8')
let workerResult = null
const sandbox = {
  self: {
    postMessage: (msg) => { workerResult = msg },
  },
  console, Math, Infinity,
  Array, Object, Set, Map, Number, String, Boolean,
  Uint8Array, Uint8ClampedArray, Uint16Array, Float32Array, Int32Array,
  parseInt, parseFloat, isNaN, isFinite, Date,
}
vm.createContext(sandbox)
vm.runInContext(workerCode, sandbox)

const palette = PERLER_PALETTE
sandbox.self.onmessage({
  data: {
    type: 'QUANTIZE',
    payload: {
      imageData: { width: sw, height: sh, data: imageData.data.buffer },
      gridSize: gridW,
      gridWidth: gridW,
      gridHeight: gridH,
      maxColors,
      paletteColors: palette.colors,
      dithering: 'none',
      brightness: 0,
      contrast: 0,
      highQuality: true,
      removeBackground: false,
    },
  },
})

if (!workerResult || workerResult.type !== 'COMPLETE') {
  console.error('量化失败:', workerResult)
  process.exit(1)
}
const { indexBuffer, width, height, quantizedColors, BLANK_MARKER } = workerResult.payload
const indices = new Uint16Array(indexBuffer)
const BLANK = BLANK_MARKER ?? 0xffff
const canvasData = []
for (let y = 0; y < height; y++) {
  const row = []
  for (let x = 0; x < width; x++) {
    const idx = indices[y * width + x]
    row.push(idx === BLANK ? null : quantizedColors[idx].id)
  }
  canvasData.push(row)
}
const usedColors = new Set(canvasData.flat().filter(Boolean))
console.log(`量化完成: 使用 ${usedColors.size} 种色号`)

// ── 3. 专业模式 PNG 绘制(与 BeadPatternExporter 同逻辑) ──────
const CELL = 28
const HEADER_H = 80
const LEGEND_H = 50
const COL_LABEL_H = 28
const ROW_LABEL_W = 36
const PANEL_W = 260
const PAD = 20
const sheetW = gridW * CELL + ROW_LABEL_W + PAD * 2 + PANEL_W
const sheetH = gridH * CELL + HEADER_H + LEGEND_H + COL_LABEL_H + PAD * 2

// 超采样 scale(与 createScaledCanvas 一致:固定 3 倍,超浏览器 canvas 上限 2.68 亿降级)
let scale = 3
if (sheetW * scale * sheetH * scale > 268_000_000) scale = 2
if (sheetW * scale * sheetH * scale > 268_000_000) scale = 1
console.log(`图纸逻辑 ${sheetW}x${sheetH}, scale=${scale}, 物理 ${sheetW * scale}x${sheetH * scale} (每格 ${CELL * scale}px)`)

const out = createCanvas(sheetW * scale, sheetH * scale)
const ctx = out.getContext('2d')
ctx.scale(scale, scale)

const hexOf = (id) => {
  const c = quantizedColors.find(q => q.id === id)
  return c ? (c.hex || '#888888') : '#888888'
}
const textColorForBg = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 140 ? '#1a1a1a' : '#f0f0f0'
}

// 表头
ctx.fillStyle = '#ffffff'
ctx.fillRect(0, 0, sheetW, sheetH)
ctx.fillStyle = '#2c2c2c'
ctx.fillRect(0, 0, sheetW, HEADER_H)
ctx.fillStyle = '#ffffff'
ctx.font = 'bold 24px "Microsoft YaHei", sans-serif'
ctx.textAlign = 'center'
ctx.textBaseline = 'middle'
ctx.fillText('验证测试图', sheetW / 2, HEADER_H / 2 - 12)
ctx.font = '14px "Microsoft YaHei", sans-serif'
ctx.fillStyle = '#aaaaaa'
ctx.fillText(`${gridW} × ${gridH} 格子 · 验证导出`, sheetW / 2, HEADER_H / 2 + 18)

// 网格
const gsX = PAD + ROW_LABEL_W
const gsY = HEADER_H + LEGEND_H + PAD + COL_LABEL_H
ctx.fillStyle = '#ffffff'
ctx.fillRect(gsX, gsY, gridW * CELL, gridH * CELL)
for (let y = 0; y < gridH; y++) {
  for (let x = 0; x < gridW; x++) {
    const cell = canvasData[y]?.[x]
    if (!cell) continue
    const hex = hexOf(cell)
    ctx.fillStyle = hex
    ctx.fillRect(gsX + x * CELL + 0.5, gsY + y * CELL + 0.5, CELL - 1, CELL - 1)
    // 色号
    const code = cell
    const fontSize = code.length >= 4 ? 8 : Math.max(9, Math.floor(CELL * 0.38))
    ctx.fillStyle = textColorForBg(hex)
    ctx.font = `bold ${fontSize}px "Helvetica", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(code, gsX + x * CELL + CELL / 2, gsY + y * CELL + CELL / 2 + 1)
  }
}
// 网格线(不透明)
ctx.strokeStyle = '#d0d0d0'
ctx.lineWidth = 1
for (let i = 0; i <= gridW; i++) {
  ctx.beginPath()
  ctx.moveTo(gsX + i * CELL + 0.5, gsY)
  ctx.lineTo(gsX + i * CELL + 0.5, gsY + gridH * CELL)
  ctx.stroke()
}
for (let i = 0; i <= gridH; i++) {
  ctx.beginPath()
  ctx.moveTo(gsX, gsY + i * CELL + 0.5)
  ctx.lineTo(gsX + gridW * CELL, gsY + i * CELL + 0.5)
  ctx.stroke()
}
ctx.strokeStyle = '#666666'
ctx.lineWidth = 1.5
for (let i = 0; i <= gridW; i += 10) {
  ctx.beginPath()
  ctx.moveTo(gsX + i * CELL + 0.5, gsY)
  ctx.lineTo(gsX + i * CELL + 0.5, gsY + gridH * CELL)
  ctx.stroke()
}
for (let i = 0; i <= gridH; i += 10) {
  ctx.beginPath()
  ctx.moveTo(gsX, gsY + i * CELL + 0.5)
  ctx.lineTo(gsX + gridW * CELL, gsY + i * CELL + 0.5)
  ctx.stroke()
}

// 色卡面板
const panelX = sheetW - PANEL_W - PAD
ctx.fillStyle = '#f8f8f8'
ctx.fillRect(panelX, HEADER_H + LEGEND_H + PAD, PANEL_W, sheetH - HEADER_H - LEGEND_H - PAD * 2)
ctx.fillStyle = '#222222'
ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'
ctx.textAlign = 'left'
ctx.fillText('颜色清单', panelX + 12, HEADER_H + LEGEND_H + PAD + 18)
let py = HEADER_H + LEGEND_H + PAD + 38
for (const id of usedColors) {
  const hex = hexOf(id)
  ctx.fillStyle = hex
  ctx.fillRect(panelX + 10, py - 9, 18, 18)
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(panelX + 10, py - 9, 18, 18)
  ctx.fillStyle = '#333333'
  ctx.font = '11px "Helvetica", sans-serif'
  ctx.fillText(id, panelX + 34, py + 4)
  py += 24
}

// 输出 PNG
const outDir = path.join(ROOT, 'verify-output')
fs.mkdirSync(outDir, { recursive: true })
const pngPath = path.join(outDir, `bead-${gridW}x${gridH}.png`)
fs.writeFileSync(pngPath, out.toBuffer('image/png'))
console.log(`PNG 已输出: ${pngPath} (${sheetW * scale}x${sheetH * scale}, ${(fs.statSync(pngPath).size / 1024).toFixed(0)}KB)`)

// ── 4. 专业模式 SVG(纯矢量) ────────────────────────────────
let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}">
  <style>text { font-family: "Helvetica", "Microsoft YaHei", sans-serif; }</style>
  <rect width="100%" height="100%" fill="white"/>
  <rect x="0" y="0" width="${sheetW}" height="${HEADER_H}" fill="#2c2c2c"/>
  <text x="${sheetW / 2}" y="${HEADER_H / 2 - 12}" fill="white" font-size="24" font-weight="bold" text-anchor="middle">验证测试图</text>
  <text x="${sheetW / 2}" y="${HEADER_H / 2 + 18}" fill="#aaaaaa" font-size="14" text-anchor="middle">${gridW} × ${gridH} 格子 · 验证导出</text>
`
for (let y = 0; y < gridH; y++) {
  for (let x = 0; x < gridW; x++) {
    const cell = canvasData[y]?.[x]
    if (!cell) continue
    const hex = hexOf(cell)
    const fontSize = cell.length >= 4 ? 8 : Math.max(9, Math.floor(CELL * 0.38))
    const tColor = textColorForBg(hex)
    svg += `  <rect x="${gsX + x * CELL + 0.5}" y="${gsY + y * CELL + 0.5}" width="${CELL - 1}" height="${CELL - 1}" fill="${hex}"/>\n`
    svg += `  <text x="${gsX + x * CELL + CELL / 2}" y="${gsY + y * CELL + CELL / 2}" fill="${tColor}" font-size="${fontSize}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${cell}</text>\n`
  }
}
svg += `</svg>`
const svgPath = path.join(outDir, `bead-${gridW}x${gridH}.svg`)
fs.writeFileSync(svgPath, svg)
console.log(`SVG 已输出: ${svgPath} (矢量,任意放大无损)`)
console.log(`输出目录: ${outDir}`)
