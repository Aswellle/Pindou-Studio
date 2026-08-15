/**
 * 从拼豆图纸图片批量生成统一协议模板 JSON
 * 用法: node scripts/gen-templates-from-images.mjs <源目录> [paletteId] [maxColors] [removeBackground] [gridW]
 *   paletteId: mard(默认)|mard291|perler|hama|artkal|coco —— 颜色精确吸附到该品牌真实色卡
 *   maxColors: 量化用色上限(默认 24)
 *   removeBackground: 1(默认,移除检测到的背景成空格)/ 0
 *   gridW: 网格基准宽(默认 57,矩形图按比例)
 * 输出: verify-output/templates/<文件名>.json(name 暂用文件名,分类后用脚本重命名)
 * 同时打印每张图的紧凑 ASCII 轮廓(用于人工辨认图案内容)
 */
import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { fileURLToPath } from 'url'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { PERLER_PALETTE } from '../src/data/palettes/perler.js'
import { HAMA_PALETTE } from '../src/data/palettes/hama.js'
import { ARTKAL_PALETTE } from '../src/data/palettes/artkal.js'
import { MARD_PALETTE, MARD291_PALETTE } from '../src/data/palettes/mard.js'
import { COCO_PALETTE } from '../src/data/palettes/coco.js'

const PALETTES = { perler: PERLER_PALETTE, hama: HAMA_PALETTE, artkal: ARTKAL_PALETTE, mard: MARD_PALETTE, mard291: MARD291_PALETTE, coco: COCO_PALETTE }
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const EXTS = ['.webp', '.png', '.jpg', '.jpeg', '.gif']

const srcDir = process.argv[2]
const paletteId = process.argv[3] || 'mard'
const maxColors = parseInt(process.argv[4] || '24', 10)
const removeBackground = (process.argv[5] || '1') !== '0'
const gridW = parseInt(process.argv[6] || '57', 10)
if (!srcDir || !fs.existsSync(srcDir)) { console.error('用法: node scripts/gen-templates-from-images.mjs <源目录> [paletteId] [maxColors] [removeBackground] [gridW]'); process.exit(1) }
const palette = PALETTES[paletteId] || MARD_PALETTE

// worker 沙箱
const workerCode = fs.readFileSync(path.join(ROOT, 'src/workers/imageQuantizer.worker.js'), 'utf8')
let workerResult = null
const sandbox = { self: { postMessage: (m) => { workerResult = m } }, console, Math, Infinity, Array, Object, Set, Map, Number, String, Boolean, Uint8Array, Uint8ClampedArray, Uint16Array, Float32Array, Int32Array, parseInt, parseFloat, isNaN, isFinite, Date }
vm.createContext(sandbox); vm.runInContext(workerCode, sandbox)

const outDir = path.join(ROOT, 'verify-output', 'templates')
fs.mkdirSync(outDir, { recursive: true })

const files = fs.readdirSync(srcDir).filter(f => EXTS.includes(path.extname(f).toLowerCase()))
console.log(`共 ${files.length} 张图, 品牌=${paletteId}(${palette.colors.length}色), maxColors=${maxColors}, removeBackground=${removeBackground}, 基准宽=${gridW}\n`)

for (const f of files) {
  const img = await loadImage(path.join(srcDir, f))
  // 网格:基准宽 gridW,高按图片比例取整(≤200)
  const gridH = Math.min(200, Math.max(9, Math.round(gridW * img.height / img.width)))
  // 源缩放(≤3000,与 useImageQuantizer 一致)
  const s = Math.min(3000 / Math.max(img.width, img.height), 1)
  const sw = Math.round(img.width * s), sh = Math.round(img.height * s)
  const src = createCanvas(sw, sh); const sctx = src.getContext('2d')
  sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, 0, 0, sw, sh)
  const imageData = sctx.getImageData(0, 0, sw, sh)

  workerResult = null
  sandbox.self.onmessage({ data: { type: 'QUANTIZE', payload: { imageData: { width: sw, height: sh, data: imageData.data.buffer }, gridSize: gridW, gridWidth: gridW, gridHeight: gridH, maxColors, paletteColors: palette.colors, dithering: 'none', brightness: 0, contrast: 0, highQuality: true, removeBackground } } })
  if (!workerResult || workerResult.type !== 'COMPLETE') { console.log(`❌ ${f}: 量化失败 ${workerResult?.type}`); continue }

  const { indexBuffer, width, height, quantizedColors, BLANK_MARKER } = workerResult.payload
  const indices = new Uint16Array(indexBuffer)
  const BLANK = BLANK_MARKER ?? 0xffff
  const hexById = new Map(quantizedColors.map(q => [q.id, q.hex]))
  const pattern = []
  for (let y = 0; y < height; y++) { const row = []; for (let x = 0; x < width; x++) { const i = indices[y * width + x]; row.push(i === BLANK ? null : hexById.get(quantizedColors[i].id)); } pattern.push(row) }

  const cells = pattern.flat(); const filled = cells.filter(Boolean).length
  const used = new Set(cells.filter(Boolean))
  const fillPct = Math.round(filled / cells.length * 100)
  const base = path.basename(f, path.extname(f))
  const tpl = { name: base, nameZh: base, category: 'icon', difficulty: 'easy', paletteId, pattern }
  fs.writeFileSync(path.join(outDir, `${base}.json`), JSON.stringify(tpl, null, 0))

  // 颜色字母 ASCII:每个色号 → 字母,便于辨认图案内容;存到 verify-output/ascii/
  const colors = [...new Set(cells.filter(Boolean))]
  const letters = new Map(colors.map((c, i) => [c, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i] || '?']))
  const art = pattern.map(row => row.map(c => c ? letters.get(c) : '.').join('')).join('\n')
  const asciiDir = path.join(ROOT, 'verify-output', 'ascii')
  fs.mkdirSync(asciiDir, { recursive: true })
  fs.writeFileSync(path.join(asciiDir, `${base}.txt`), `${base}  ${width}x${height} 填充${fillPct}% 用色${used.size}\n色号: ${colors.map((c, i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i] + '=' + c).join(' ')}\n\n` + art)
  console.log(`▶ ${base}  ${width}x${height} 填充${fillPct}% 用色${used.size}`)
}
console.log('\nJSON 输出目录:', outDir)
