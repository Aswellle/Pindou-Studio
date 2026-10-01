// 量化效果评测 harness —— 用 testing-images 里的真实图片按 UI 默认参数跑完整管线，
// 输出「原图参照 | 拼豆图纸」并排 PNG + 关键参数报告，供视觉核对。
// 用法: node scripts/quantizer-eval.mjs [图片目录] [输出目录]
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCanvas, loadImage } = require('@napi-rs/canvas')

// ---- worker 模块加载(与测试同款 self stub;postMessage 回路到 mainThreadHandler) ----
// WORKER_PATH 可切换对比版本(如 git show 旧版到临时文件)
const workerPath = process.env.WORKER_PATH
  ? pathToFileURL(process.env.WORKER_PATH).href
  : new URL('../src/workers/imageQuantizer.worker.js', import.meta.url).href
let mainThreadHandler = null
globalThis.self = { postMessage: (m) => mainThreadHandler?.({ data: m }), onmessage: null }
const worker = await import(workerPath)
const { getPalette } = await import('../src/data/palettes/index.js')
const { recommendGridSize, suggestMaxColorsForGrid } = await import('../src/utils/autoGrid.js')

const inDir = process.argv[2] || 'testing-images'
const outDir = process.argv[3] || 'verify-output/quantizer-eval'
mkdirSync(outDir, { recursive: true })

const files = readdirSync(inDir).filter((f) => /\.(jpe?g|png|webp|bmp)$/i.test(f))
if (!files.length) { console.error('no images in', inDir); process.exit(1) }

// 与 useImageQuantizer.js 相同的源图预处理
function prepareSource(img, outW, outH) {
  const minSourcePerCell = 49
  const maxSourceSize = 3000
  const targetSourceSize = Math.min(
    Math.max(outW, outH) * minSourcePerCell,
    maxSourceSize,
    Math.max(img.width, img.height)
  )
  const scale = targetSourceSize / Math.max(img.width, img.height)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h }
}

// 与 ImageQuantizer.jsx analyzeImageElement 相同的自动尺寸分析
function autoSize(img) {
  const maxSide = 96
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  return recommendGridSize({ data, width: w, height: h, sourceWidth: img.width, sourceHeight: img.height })
}

function runQuantize(payload) {
  return new Promise((resolve, reject) => {
    mainThreadHandler = (event) => {
      const { type, payload: p, error } = event.data
      if (type === 'COMPLETE') resolve(p)
      else if (type === 'ERROR') reject(new Error(error))
    }
    self.onmessage({ data: { type: 'QUANTIZE', payload } })
  })
}

// 与 useImageQuantizer.js 相同的 indexBuffer → canvasData 还原
function toCanvasData(payload) {
  const { indexBuffer, width, height, quantizedColors, BLANK_MARKER } = payload
  const indices = new Uint16Array(indexBuffer)
  const BLANK = BLANK_MARKER ?? 0xffff
  const canvasData = new Array(height)
  for (let y = 0; y < height; y += 1) {
    const row = new Array(width)
    for (let x = 0; x < width; x += 1) {
      const idx = indices[y * width + x]
      row[x] = idx === BLANK ? null : quantizedColors[idx].id
    }
    canvasData[y] = row
  }
  return canvasData
}

// 三面板渲染: ①原图 1:1(等高缩放,无马赛克) ②网格分辨率参照 ③拼豆图纸
function renderCompare(img, result, outPath, cell = 8) {
  const { width: W, height: H, quantizedColors } = result
  const hexById = {}
  for (const c of quantizedColors) hexById[c.id] = c.hex
  const canvasData = toCanvasData(result)

  const pad = 12
  const panelH = H * cell
  // 原图按 panelH 等高缩放(保持 1:1 画质观感,不做网格马赛克)
  const origW = Math.max(1, Math.round(img.width * (panelH / img.height)))
  const panelW1 = Math.min(origW, 900)
  const srcH = Math.round(img.height * (panelW1 / img.width))
  const panelW2 = W * cell
  const totalW = pad + panelW1 + pad + panelW2 + pad + panelW2 + pad

  const canvas = createCanvas(totalW, panelH + pad * 2)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // ① 原图 1:1
  ctx.drawImage(img, pad, pad, panelW1, panelH)

  // ② 网格分辨率参照(豆子网格能看到的极限细节)
  const refCanvas = createCanvas(W, H)
  const refCtx = refCanvas.getContext('2d')
  refCtx.imageSmoothingEnabled = true
  refCtx.drawImage(img, 0, 0, W, H)
  ctx.drawImage(refCanvas, pad + panelW1 + pad, pad, panelW2, panelH)

  // ③ 拼豆图纸色块
  const ox = pad + panelW1 + pad + panelW2 + pad
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const id = canvasData[y]?.[x]
      const hex = id ? hexById[id] : null
      if (!hex) continue
      ctx.fillStyle = hex
      ctx.fillRect(ox + x * cell, pad + y * cell, cell, cell)
    }
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'))
}

// 中间产物诊断:渲染量化前的格子均值图(原始 vs 中值滤波后)
function renderAreaColors(areaColors, W, H, outPath, cell = 8) {
  const canvas = createCanvas(W * cell + 24, H * cell + 24)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const c = areaColors[y * W + x]
      if (!c) continue
      const [r, g, b] = c.rgb
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(12 + x * cell, 12 + y * cell, cell, cell)
    }
  }
  writeFileSync(outPath, canvas.toBuffer('image/png'))
}

const report = []
for (const name of files) {
  const img = await loadImage(join(inDir, name))
  const size = autoSize(img)
  const outW = size.gridWidth
  const outH = size.gridHeight
  const maxColors = suggestMaxColorsForGrid(outW, outH)
  const palette = getPalette(process.env.EVAL_PALETTE || 'perler')

  const source = prepareSource(img, outW, outH)
  const payload = {
    imageData: { width: source.width, height: source.height, data: source.data.buffer },
    gridSize: Math.max(outW, outH),
    gridWidth: outW,
    gridHeight: outH,
    maxColors,
    paletteColors: palette.colors,
    dithering: 'auto',           // 当前 UI 默认
    brightness: 0,
    contrast: 0,
    highQuality: true,
    removeBackground: true,
    colorSpace: process.env.EVAL_COLORSPACE || 'lab',
    imageMode: 'auto'            // 当前 UI 默认
  }
  const result = await runQuantize(payload)
  const canvasData = toCanvasData(result)

  if (process.env.AREA_DEBUG) {
    const area = worker.computeEdgeAwareAreaColors(source.data, source.width, source.height, outW, outH, 0, 0)
    const base0 = name.replace(/\.[^.]+$/, '')
    renderAreaColors(area.colors, outW, outH, join(outDir, `${base0}__AREA-raw.png`))
    renderAreaColors(worker.medianSmoothAreaColors(area.colors, outW, outH), outW, outH, join(outDir, `${base0}__AREA-median.png`))
  }

  const usedColors = Object.keys(result.colorStats).length
  let blankCount = 0
  for (const row of canvasData) for (const v of row) if (!v) blankCount += 1
  const topColors = Object.entries(result.colorStats)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, n]) => `${id}:${n}`)
    .join(' ')

  const base = name.replace(/\.[^.]+$/, '')
  const outPath = join(outDir, `${base}__${outW}x${outH}_${result.detectedType}_${result.effectiveDithering === 'floyd-steinberg' ? 'fs' : result.effectiveDithering === 'ordered' ? 'bayer' : 'none'}_c${result.effectiveMaxColors}.png`)
  renderCompare(img, result, outPath)

  report.push({
    name,
    size: `${outW}x${outH}`,
    detailScore: size.detailScore.toFixed(2),
    requestedColors: maxColors,
    effectiveColors: result.effectiveMaxColors,
    usedColors,
    blankCount,
    topColors,
    detectedType: result.detectedType,
    dithering: result.effectiveDithering
  })
  console.log(`${name}: ${outW}x${outH} type=${result.detectedType} dither=${result.effectiveDithering} colors ${maxColors}→${result.effectiveMaxColors} (used ${usedColors}, blank ${blankCount})`)
  console.log(`  top: ${topColors}`)
}
console.log('\n' + report.map((r) => JSON.stringify(r)).join('\n'))
