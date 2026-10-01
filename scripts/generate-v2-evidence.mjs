/**
 * Export V2 渲染证据生成器(开发工具,不入构建)
 *
 * 用真正的 VectorRenderer 渲染一张样例图纸 SVG,
 * 供视觉抽查 sheet 布局(表头带/图例条/分级面板/坐标尺/10格粗线)。
 *
 * 用法: npx vite-node scripts/generate-v2-evidence.mjs
 * 输出: verify-output/export-v2-<style>.svg
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// i18n 初始化所需的最小浏览器全局(vite-node 的 Node 环境没有 localStorage/navigator)
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN', languages: ['zh-CN'] }, configurable: true })
globalThis.window = { location: { search: '' }, history: { replaceState() {} }, addEventListener() {} }

const { createPatternDocument } = await import('../src/services/export/PatternDocument.js')
const { renderPatternDocumentToSVG } = await import('../src/services/export/VectorRenderer.js')
const { PERLER_PALETTE } = await import('../src/data/palettes/perler.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ── 合成 29×29 样例图案:边框 + 斜纹 + 点缀 + 微量色(覆盖全部四个分组) ──
const N = 29
const hexOf = (id) => PERLER_PALETTE.colors.find(c => c.id === id)?.hex
const BLUE = hexOf('P25')  // 边框主色(数量多 → major)
const WHITE = hexOf('P01') // 斜纹辅色(中等 → minor)
const YELLOW = hexOf('P02') // 点缀(数粒 → accent)
const RED = hexOf('P14')   // 微量(3 粒 → trace)

const cells = Array.from({ length: N }, () => Array(N).fill(null))
for (let i = 0; i < N; i++) {
  cells[0][i] = BLUE; cells[N - 1][i] = BLUE; cells[i][0] = BLUE; cells[i][N - 1] = BLUE
}
for (let y = 2; y < N - 2; y++) {
  for (let x = 2; x < N - 2; x++) {
    if ((x + y) % 4 === 0) cells[y][x] = WHITE
  }
}
// 点缀色 6 粒(accent)与微量色 3 粒(trace)
for (const [x, y] of [[5, 5], [22, 6], [8, 20], [20, 22], [14, 10], [10, 14]]) cells[y][x] = YELLOW
for (const [x, y] of [[14, 4], [4, 24], [24, 14]]) cells[y][x] = RED

const svgByStyle = (beadStyle) => renderPatternDocumentToSVG(createPatternDocument({
  canvasData: cells,
  gridSize: N,
  paletteId: 'perler',
  designName: 'Export V2 布局验证',
  beadStyle,
  palette: PERLER_PALETTE,
}))

const outDir = path.join(ROOT, 'verify-output')
fs.mkdirSync(outDir, { recursive: true })
for (const style of ['professional', 'realistic']) {
  const p = path.join(outDir, `export-v2-${style}.svg`)
  fs.writeFileSync(p, svgByStyle(style))
  console.log(`已输出: ${p}`)
}
