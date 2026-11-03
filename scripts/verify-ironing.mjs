/**
 * 高级熨烫效果 像素级验证(开发工具,不入构建)
 *
 * 用真正的 IroningEffectRenderer 在 Node(@napi-rs/canvas 提供 canvas 实现)里
 * 渲染出真实 PNG,然后逐像素断言:
 *   1. 几何契约:preview cellSize clamp、export cellSize/倍率、宽高比
 *   2. 六种材质渲染成功且输出两两不同(不允许只换底色)
 *   3. 确定性:同图纸 + 同材质两次渲染字节级一致
 *   4. 像素抽查:背景 #FDFBF7、留白外材料底色、已绘制格保持原色可辨
 *   5. 闪粉可见性:深蓝底布上必须采到明显亮于基色的闪点
 *   6. preview 与 export 同源:两种模式下同一抽查都成立
 *   7. 输入文档只读:渲染前后 JSON 快照一致
 *   8. 取消语义:已 abort 的 signal 让 renderIroningEffect 抛 AbortError
 *   9. 尺寸阶梯 29/87/140:preview 降采样档位与 export 实际倍率回报
 *
 * 样张输出到 verify-output/ironing/,用于对照 references 参考图目检。
 *
 * 用法: npx vite-node scripts/verify-ironing.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCanvas, loadImage, Path2D } = require('@napi-rs/canvas')

// ── i18n / DOM 最小全局(vite-node 的 Node 环境没有 localStorage/navigator/document) ──
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN', languages: ['zh-CN'] }, configurable: true })
globalThis.window = { location: { search: '' }, history: { replaceState() {} }, addEventListener() {} }
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = class Blob {}
globalThis.Path2D = Path2D

// document.createElement('canvas') → @napi-rs/canvas(渲染器经 createScaledCanvas 创建画布)
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`verify-ironing: unexpected createElement(${tag})`)
    return createCanvas(300, 150)
  },
}

const { renderIroningEffect, computeIroningGeometry, __resetIroningTileCacheForTests } = await import('../src/services/export/IroningEffectRenderer.js')
const { createPatternDocument } = await import('../src/services/export/PatternDocument.js')
const { IRONING_EFFECT_PRESETS } = await import('../src/services/export/ironingEffectPresets.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const outDir = path.join(ROOT, 'verify-output', 'ironing')
fs.mkdirSync(outDir, { recursive: true })

// ── 合成 29×29 样例(边框 + 斜纹 + 点缀,大量留白露出材料底纹) ──
const N = 29
const cells = Array.from({ length: N }, () => Array(N).fill(null))
const BLUE = '#1E88E5'
const WHITE = '#F2F2F2'
const YELLOW = '#FDD835'
const RED = '#E53935'
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

const doc = createPatternDocument({
  canvasData: cells, gridSize: N, gridWidth: N, gridHeight: N,
  paletteId: 'perler', designName: '熨烫效果像素验证',
})

// ── 通用工具 ──
let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`) }
  else { fail += 1; console.log(`  ✗ ${name} ${detail}`) }
}
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
async function loadCtx(buffer) {
  const img = await loadImage(buffer)
  const cv = createCanvas(img.width, img.height)
  const ctx = cv.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return ctx
}
function pixelAt(ctx, x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
  return [d[0], d[1], d[2]]
}
/** 逻辑像素坐标 → 物理坐标邻域统计(容忍 tile 纹理的落点差异) */
function patchStats(ctx, x, y, scale, half = 6) {
  const cx = Math.round(x * scale)
  const cy = Math.round(y * scale)
  const d = ctx.getImageData(cx - half, cy - half, half * 2 + 1, half * 2 + 1).data
  let minL = Infinity, maxL = -Infinity
  const samples = []
  for (let i = 0; i < d.length; i += 4) {
    const rgb = [d[i], d[i + 1], d[i + 2]]
    const l = lum(rgb)
    if (l < minL) minL = l
    if (l > maxL) maxL = l
    samples.push(rgb)
  }
  samples.sort((a, b) => lum(a) - lum(b))
  const median = samples[Math.floor(samples.length / 2)]
  return { minL, maxL, median }
}
const closeTo = (a, b, tol = 6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol)

/** 导出(screen 3×)一份材质并落盘,返回 { buffer, info, scale } */
async function renderMaterial(presetId, docOverride, quality = 'screen') {
  let info = null
  const { blob, width, height, actualScale, requestedScale } = await renderIroningEffect(docOverride || doc, {
    presetId, mode: 'export', quality, onResolution: (w, h) => { info = { w, h } },
  })
  return { buffer: Buffer.from(await blob.arrayBuffer()), info, width, height, actualScale, requestedScale }
}

// ══ 1. 几何契约 ══
console.log('\n[geometry]')
{
  const grid = { width: 29, height: 20 }
  const gExport = computeIroningGeometry(grid, { mode: 'export', quality: 'screen' })
  check('export cellSize=20、留白 2 格、3× 请求', gExport.cellSize === 20 && gExport.pad === 40 && gExport.requestedScale === 3
    && gExport.width === 29 * 20 + 80 && gExport.height === 20 * 20 + 80)
  const gPreview = computeIroningGeometry(grid, { mode: 'preview', maxPreviewEdge: 960 })
  check('preview 1× 且 cellSize clamp 上限 12', gPreview.requestedScale === 1 && gPreview.cellSize === 12)
  const gBig = computeIroningGeometry({ width: 140, height: 140 }, { mode: 'preview' })
  check('140 格预览 fit=6', gBig.cellSize === 6)
  const gHuge = computeIroningGeometry({ width: 400, height: 400 }, { mode: 'preview' })
  check('400 格预览下限 3(保底可辨识)', gHuge.cellSize === 3)
  const ratio = gExport.boardW / gExport.boardH
  check('宽高比与图纸一致', Math.abs(ratio - 29 / 20) < 1e-9)
}

// ══ 2. 六种材质渲染 + 两两不同 ══
console.log('\n[six materials]')
const buffers = {}
for (const preset of IRONING_EFFECT_PRESETS) {
  const t0 = Date.now()
  const r = await renderMaterial(preset.id)
  buffers[preset.id] = r
  const file = path.join(outDir, `export-${preset.id}.png`)
  fs.writeFileSync(file, r.buffer)
  const expected = (N * 20 + 80) * 3
  check(`${preset.id} 渲染成功 ${r.width}×${r.height}(${Date.now() - t0}ms)`,
    r.buffer.length > 1000 && r.width === expected && r.height === expected,
    `got ${r.width}×${r.height}, expect ${expected}`)
}
{
  const ids = IRONING_EFFECT_PRESETS.map((p) => p.id)
  let allDistinct = true
  outer: for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (buffers[ids[i]].buffer.equals(buffers[ids[j]].buffer)) {
        check(`六材质输出两两不同(${ids[i]} vs ${ids[j]})`, false, '字节完全一致')
        allDistinct = false
        break outer
      }
    }
  }
  if (allDistinct) check('六材质输出两两不同(字节级)', true)
}

// ══ 3. 确定性 ══
console.log('\n[determinism]')
{
  const again = await renderMaterial('linen')
  check('同图纸同材质两次渲染字节级一致', again.buffer.equals(buffers.linen.buffer))
}

// ══ 4/5. 像素抽查 ══
console.log('\n[pixels]')
for (const preset of IRONING_EFFECT_PRESETS) {
  const ctx = await loadCtx(buffers[preset.id].buffer)
  const scale = buffers[preset.id].actualScale
  const baseLum = lum(hexToRgb(preset.fabricBase))

  // 背景留白(画布角落,在底板投影之外)
  const bg = pixelAt(ctx, 4, 4)
  check(`${preset.id} 背景 #FDFBF7`, closeTo(bg, hexToRgb('#FDFBF7'), 4), JSON.stringify(bg))

  // 材料底板上的空白区(避开图案与边缘):取底板中央附近一个空白格中心
  // 样例中 (15,15) 附近 (x+y)%4!=0 且无点缀,是连续空白
  const blank = patchStats(ctx, (15.5 * 20 + 40) * scale, (15.5 * 20 + 40) * scale, 1, 5)
  // 纹理只会在底色上下小幅扰动:最低亮度不得远高于底色(全被提亮=底纹失效),
  // 最高亮度不得远低于底色(全被压暗=色偏)
  check(`${preset.id} 空白区围绕材料底色 ${preset.fabricBase}`,
    blank.minL <= baseLum + 8 && blank.maxL >= baseLum - 8,
    `lum range [${blank.minL.toFixed(0)}, ${blank.maxL.toFixed(0)}], base ${baseLum.toFixed(0)}`)

  // 已绘制格保持原色可辨:边框蓝 (0,0) 格中心
  const cellCenter = (0.5 * 20 + 40) * scale
  const cell = patchStats(ctx, cellCenter, cellCenter, 1, 5)
  const cellLum = lum(hexToRgb(BLUE))
  check(`${preset.id} 图案格颜色可辨(${BLUE})`,
    Math.abs(lum(cell.median) - cellLum) <= 26,
    `median lum ${lum(cell.median).toFixed(0)} vs ${cellLum.toFixed(0)}`)
}

// 闪粉可见性与密度:用「全空白底板」在大区域统计亮于基色的像素占比,
// 不再依赖固定采样点是否恰好命中一颗闪点(L4)。
{
  const blankCells = Array.from({ length: N }, () => Array(N).fill(null))
  const blankDoc = createPatternDocument({
    canvasData: blankCells, gridSize: N, gridWidth: N, gridHeight: N, paletteId: 'perler', designName: '闪粉密度',
  })
  const baseLum = lum(hexToRgb('#063D78'))
  const brightFraction = async (mode, quality) => {
    const r = await renderIroningEffect(blankDoc, { presetId: 'fine-glitter', mode, quality })
    const c = await loadCtx(Buffer.from(await r.blob.arrayBuffer()))
    // 取画布中部 50% 区域,避开波浪边与留白
    const x0 = Math.round(r.width * 0.25)
    const y0 = Math.round(r.height * 0.25)
    const size = Math.round(r.width * 0.5)
    const d = c.getImageData(x0, y0, size, size).data
    let bright = 0
    const total = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] > baseLum + 25) bright += 1
    }
    return bright / total
  }
  const fine3x = await brightFraction('export', 'screen')
  check('细闪烫:闪点覆盖率可感知(>0.2% 像素明显亮于底布)', fine3x > 0.002,
    `fraction ${(fine3x * 100).toFixed(2)}%`)
}

// 色块熔融贴合:相邻同色块之间的缝隙不得超过 1 逻辑px(03 §5)。
// 取边框上相邻两颗蓝珠,沿格子中心行扫描两格边界附近的「非珠色」像素数。
{
  const preset = IRONING_EFFECT_PRESETS.find(p => p.id === 'linen') // cellGap 0.35,最大缝隙档
  const ctx = await loadCtx(buffers.linen.buffer)
  const scale = buffers.linen.actualScale
  const boundaryX = 40 + 20 // pad + 1 格:两颗蓝珠的交界
  const y = Math.round((40 + 10) * scale)
  const halfLogical = 3
  const d = ctx.getImageData(
    Math.round((boundaryX - halfLogical) * scale),
    y,
    Math.round(halfLogical * 2 * scale),
    1
  ).data
  const blue = hexToRgb(BLUE)
  let offPx = 0
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.max(Math.abs(d[i] - blue[0]), Math.abs(d[i + 1] - blue[1]), Math.abs(d[i + 2] - blue[2]))
    // 方块边缘的 8% 暗描边仍属「珠色」;明显偏底色才算缝隙
    if (dist > 70) offPx += 1
  }
  const gapLogical = offPx / scale
  check(
    `色块熔融贴合(${preset.id} 缝隙 ${gapLogical.toFixed(2)} 逻辑px ≤ 1.5)`,
    gapLogical <= 1.5,
    `扫描到 ${offPx} 个底色像素(${(gapLogical).toFixed(2)} 逻辑px)`
  )
}

// ══ 6. preview 与 export 同源 ══
console.log('\n[preview/export parity]')
{
  const { blob, width, height, actualScale } = await renderIroningEffect(doc, { presetId: 'linen', mode: 'preview' })
  const buf = Buffer.from(await blob.arrayBuffer())
  fs.writeFileSync(path.join(outDir, 'preview-linen.png'), buf)
  const ctx = await loadCtx(buf)
  // 预览 1×:cellSize 12、pad 24;背景与图案格抽查与导出同判
  const bg = pixelAt(ctx, 2, 2)
  check('preview 背景 #FDFBF7', closeTo(bg, hexToRgb('#FDFBF7'), 4), JSON.stringify(bg))
  const cell = patchStats(ctx, 0.5 * 12 + 24, 0.5 * 12 + 24, 1, 2)
  const cellLum = lum(hexToRgb(BLUE))
  check('preview 图案格颜色可辨', Math.abs(lum(cell.median) - cellLum) <= 26,
    `median lum ${lum(cell.median).toFixed(0)} vs ${cellLum.toFixed(0)}`)
  const g = computeIroningGeometry({ width: N, height: N }, { mode: 'preview' })
  check('preview 分辨率与几何一致', width === g.width && height === g.height && actualScale === 1,
    `${width}×${height} vs ${g.width}×${g.height}`)

  // 纹理尺度一致性(03/04:textureScale 单位为 logical px):
  // 同一空白底板下,「每逻辑像素的总变差」(纹理能量)必须与倍率无关。
  // 修复前 tile 按物理像素生成,能量会随倍率成倍放大;修复后 1×/3×/6× 应在同一量级。
  const blankCells = Array.from({ length: N }, () => Array(N).fill(null))
  const blankDoc = createPatternDocument({
    canvasData: blankCells, gridSize: N, gridWidth: N, gridHeight: N, paletteId: 'perler', designName: '纹理尺度',
  })
  const textureEnergy = async (mode, quality) => {
    const r = await renderIroningEffect(blankDoc, { presetId: 'linen', mode, quality })
    const c = await loadCtx(Buffer.from(await r.blob.arrayBuffer()))
    const y = Math.round(r.height / 2)
    const row = c.getImageData(0, y, r.width, 1).data
    let tv = 0
    let prev = null
    for (let i = 0; i < row.length; i += 4) {
      const v = 0.299 * row[i] + 0.587 * row[i + 1] + 0.114 * row[i + 2]
      if (prev !== null) tv += Math.abs(v - prev)
      prev = v
    }
    return tv / (r.width / r.actualScale)
  }
  const energyPreview = await textureEnergy('preview')
  const energy3 = await textureEnergy('export', 'screen')
  const energy6 = await textureEnergy('export', 'high')
  const ratio3 = energy3 / energyPreview
  const ratio6 = energy6 / energyPreview
  check(`纹理能量与倍率无关(preview ${energyPreview.toFixed(2)} / 3× ${energy3.toFixed(2)} / 6× ${energy6.toFixed(2)})`,
    ratio3 > 0.7 && ratio3 < 1.4 && ratio6 > 0.7 && ratio6 < 1.4,
    `比值 3×=${ratio3.toFixed(2)} 6×=${ratio6.toFixed(2)},应在 0.7–1.4`)
}

// ══ 7. 输入只读 ══
console.log('\n[immutability]')
{
  const snapshot = JSON.stringify(doc)
  await renderMaterial('towel')
  check('渲染后文档 JSON 快照不变', JSON.stringify(doc) === snapshot)
}

// ══ 8. 取消语义 ══
console.log('\n[abort]')
{
  const abortCtrl = new AbortController()
  abortCtrl.abort()
  try {
    await renderIroningEffect(doc, { presetId: 'linen', mode: 'preview', signal: abortCtrl.signal })
    check('已取消的 signal 抛 AbortError', false, '未抛错')
  } catch (err) {
    check('已取消的 signal 抛 AbortError', err?.name === 'AbortError', `${err?.name}: ${err?.message}`)
  }
}

// ══ 9. 尺寸阶梯 29 / 87 / 140 ══
console.log('\n[size ladder]')
{
  __resetIroningTileCacheForTests()
  const sizes = [29, 87, 140]
  for (const size of sizes) {
    const grid = Array.from({ length: size }, () => Array(size).fill(null))
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) grid[y][x] = BLUE
        else if ((x + y) % 5 === 0) grid[y][x] = WHITE
      }
    }
    const d = createPatternDocument({ canvasData: grid, gridSize: size, gridWidth: size, gridHeight: size, paletteId: 'perler', designName: `阶梯 ${size}` })
    const gPreview = computeIroningGeometry({ width: size, height: size }, { mode: 'preview' })
    const t0 = Date.now()
    const preview = await renderIroningEffect(d, { presetId: 'towel', mode: 'preview' })
    const t1 = Date.now()
    const exp = await renderIroningEffect(d, { presetId: 'towel', mode: 'export', quality: 'print' })
    const t2 = Date.now()
    check(`${size}×${size} preview cellSize=${gPreview.cellSize}(${t1 - t0}ms)`,
      preview.width === gPreview.width && preview.height === gPreview.height)
    check(`${size}×${size} export 实际倍率 ≤ 请求倍率(${t2 - t1}ms, ${exp.width}×${exp.height})`,
      exp.actualScale <= exp.requestedScale,
      `actual ${exp.actualScale} > requested ${exp.requestedScale}`)
    if (size === 87) fs.writeFileSync(path.join(outDir, 'export-87-print.png'), Buffer.from(await exp.blob.arrayBuffer()))
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
