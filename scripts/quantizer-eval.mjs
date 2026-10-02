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

function rgbToLuma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function countConnectedComponents(canvasData, targetId) {
  const height = canvasData.length
  const width = height ? canvasData[0].length : 0
  const seen = new Uint8Array(width * height)
  let components = 0
  let smallest = Infinity
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if (seen[start] || canvasData[y][x] !== targetId) continue
      components += 1
      let size = 0
      const queue = [start]
      seen[start] = 1
      for (let qi = 0; qi < queue.length; qi += 1) {
        const index = queue[qi]
        const cy = Math.floor(index / width)
        const cx = index % width
        size += 1
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const next = ny * width + nx
          if (!seen[next] && canvasData[ny][nx] === targetId) {
            seen[next] = 1
            queue.push(next)
          }
        }
      }
      smallest = Math.min(smallest, size)
    }
  }
  return { components, smallest: Number.isFinite(smallest) ? smallest : 0 }
}

function countIsolatedBeads(canvasData) {
  const height = canvasData.length
  const width = height ? canvasData[0].length : 0
  let isolated = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const current = canvasData[y][x]
      if (!current) continue
      const neighbors = []
      if (x > 0 && canvasData[y][x - 1]) neighbors.push(canvasData[y][x - 1])
      if (x + 1 < width && canvasData[y][x + 1]) neighbors.push(canvasData[y][x + 1])
      if (y > 0 && canvasData[y - 1][x]) neighbors.push(canvasData[y - 1][x])
      if (y + 1 < height && canvasData[y + 1][x]) neighbors.push(canvasData[y + 1][x])
      if (neighbors.length >= 2 && neighbors.every((id) => id !== current)) isolated += 1
    }
  }
  return isolated
}

function edgeSimilarity(sourceLuma, outputLuma, width, height) {
  let sourceEnergy = 0, error = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      const right = x + 1 < width ? i + 1 : i
      const down = y + 1 < height ? i + width : i
      const sourceEdge = Math.abs(sourceLuma[i] - sourceLuma[right]) + Math.abs(sourceLuma[i] - sourceLuma[down])
      const outputEdge = Math.abs(outputLuma[i] - outputLuma[right]) + Math.abs(outputLuma[i] - outputLuma[down])
      sourceEnergy += sourceEdge
      error += Math.abs(sourceEdge - outputEdge)
    }
  }
  return sourceEnergy > 0 ? Math.max(0, 1 - error / sourceEnergy) : 1
}

function calculateQualityScore({ fidelityOklab, structural, edge, saliency, manufacturability }) {
  const colorFidelity = clamp01(1 - fidelityOklab / 0.25)
  return 100 * (0.4 * colorFidelity + 0.25 * structural + 0.15 * edge + 0.1 * saliency + 0.1 * manufacturability)
}

function structuralSimilarity(source, output) {
  if (!source.length || source.length !== output.length) return 0
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length
  const sourceMean = mean(source), outputMean = mean(output)
  let sourceVariance = 0, outputVariance = 0, covariance = 0
  for (let i = 0; i < source.length; i += 1) {
    const sourceDelta = source[i] - sourceMean
    const outputDelta = output[i] - outputMean
    sourceVariance += sourceDelta * sourceDelta
    outputVariance += outputDelta * outputDelta
    covariance += sourceDelta * outputDelta
  }
  const count = source.length
  sourceVariance /= count
  outputVariance /= count
  covariance /= count
  const c1 = 6.5025
  const c2 = 58.5225
  const numerator = (2 * sourceMean * outputMean + c1) * (2 * covariance + c2)
  const denominator = (sourceMean ** 2 + outputMean ** 2 + c1) * (sourceVariance + outputVariance + c2)
  return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 1
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}


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
    imageMode: 'auto',
    qualityMode: process.env.EVAL_QUALITY || 'fine',
    randomSeed: 20261002
  }
  const result = await runQuantize(payload)
  const canvasData = toCanvasData(result)

  if (process.env.AREA_DEBUG) {
    const area = worker.computeEdgeAwareAreaColors(source.data, source.width, source.height, outW, outH, 0, 0)
    const base0 = name.replace(/\.[^.]+$/, '')
    renderAreaColors(area.colors, outW, outH, join(outDir, `${base0}__AREA-raw.png`))
  }

  // 保真度：文档 §三十二规定使用平均 ΔOKLab；同时保留 ΔE00 作为辅助报告。
  const areaResultForFid = worker.computeEdgeAwareAreaColors(source.data, source.width, source.height, outW, outH, 0, 0)
  const areaForFid = areaResultForFid.colors
  const hexByIdFid = {}
  for (const c of result.quantizedColors) hexByIdFid[c.id] = c.hex
  let fidSum = 0, fidOklabSum = 0, fidN = 0
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const id = canvasData[y]?.[x]
      const a = areaForFid[y * outW + x]
      if (!id || !a) continue
      const hex = hexByIdFid[id] || '#000000'
      const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
      fidSum += worker.deltaE2000(a.lab, worker.rgbToLab(...rgb))
      fidOklabSum += worker.deltaEOKLab(worker.rgbToOklab(...a.rgb), worker.rgbToOklab(...rgb))
      fidN += 1
    }
  }
  const fidelity = fidN ? fidSum / fidN : 0
  const fidelityOklab = fidN ? fidOklabSum / fidN : 0
  const sourceLuma = areaForFid.map((area) => area ? rgbToLuma(...area.rgb) : 0)
  const outputLuma = []
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const id = canvasData[y]?.[x]
      const hex = id ? (hexByIdFid[id] || '#000000') : '#000000'
      outputLuma.push(rgbToLuma(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)))
    }
  }
  const edge = edgeSimilarity(sourceLuma, outputLuma, outW, outH)
  const structural = structuralSimilarity(sourceLuma, outputLuma)
  const edgeStrength = worker.computeEdgeStrength(areaResultForFid.edgeMap)
  const saliencyMap = worker.computeSaliencyMap(areaForFid, edgeStrength, outW, outH, null)
  let saliencyError = 0, salientCount = 0
  for (let i = 0; i < saliencyMap.length; i += 1) {
    if (saliencyMap[i] < 0.5 || !areaForFid[i]) continue
    saliencyError += Math.abs(sourceLuma[i] - outputLuma[i]) / 255
    salientCount += 1
  }
  const saliency = clamp01(1 - (salientCount ? saliencyError / salientCount : 0))
  const isolatedBeads = countIsolatedBeads(canvasData)
  const connectedComponents = Object.keys(result.colorStats).reduce(
    (sum, id) => sum + countConnectedComponents(canvasData, id).components, 0
  )
  const manufacturability = clamp01(
    1 - isolatedBeads / Math.max(1, outW * outH) * 4 - connectedComponents / Math.max(1, outW * outH) * 0.15
  )
  const qualityScore = calculateQualityScore({ fidelityOklab, structural, edge, saliency, manufacturability })

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
    fidelity: Number(fidelity.toFixed(4)),
    fidelityOklab: Number(fidelityOklab.toFixed(4)),
    qualityScore: Number(qualityScore.toFixed(2)),
    quality: {
      colorFidelity: Number(clamp01(1 - fidelityOklab / 0.25).toFixed(4)),
      colorDeltaOklab: Number(fidelityOklab.toFixed(4)),
      colorDeltaE00: Number(fidelity.toFixed(4)),
      structural: Number(structural.toFixed(4)),
      edge: Number(edge.toFixed(4)),
      saliency: Number(saliency.toFixed(4)),
      manufacturability: Number(manufacturability.toFixed(4)),
      isolatedBeads,
      connectedComponents
    },
    topColors,
    detectedType: result.detectedType,
    dithering: result.effectiveDithering
  })
  console.log(`${name}: ${outW}x${outH} type=${result.detectedType} dither=${result.effectiveDithering} colors ${maxColors}→${result.effectiveMaxColors} (used ${usedColors}, blank ${blankCount}, dE00 ${fidelity.toFixed(2)})`)
  console.log(`  top: ${topColors}`)
}
console.log('\n' + report.map((r) => JSON.stringify(r)).join('\n'))
const reportPath = join(outDir, 'report.json')
writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  weights: { color: 0.4, structural: 0.25, edge: 0.15, saliency: 0.1, manufacturability: 0.1 },
  reports: report
}, null, 2))
console.log(`quality report: ${reportPath}`)
