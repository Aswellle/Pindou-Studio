/**
 * 导出质量门禁(可重复执行)
 *
 * 把两条既有验证链路收成一个入口,并给出明确的退出码:
 *   1. `verify-export.mjs` — worker 量化 + V1 专业图纸 PNG/SVG;
 *   2. `verify-v2-png.mjs` — PatternDocument + RasterRenderer 的 14 条像素断言。
 *
 * 依赖 @napi-rs/canvas(以 --no-save 安装,不在 package.json)。缺失时给出
 * 安装命令并以退出码 1 结束 —— 门禁不因“工具没装”被当成通过。
 *
 * 用法:
 *   node scripts/verify-exports.mjs [图片路径] [宽] [高] [maxColors]
 * 未提供图片时使用仓库内置的合成样例(不依赖 testing-images/ 里的用户文件)。
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

try {
  require.resolve('@napi-rs/canvas')
} catch {
  console.error('缺少 @napi-rs/canvas。请先运行: npm i --no-save @napi-rs/canvas')
  process.exit(1)
}

// 默认样例:用 V2 验证脚本同一套合成图,避免依赖用户本地图片
const SAMPLE = path.join(ROOT, 'verify-output', 'samples', 'sample.png')
function ensureSample() {
  if (fs.existsSync(SAMPLE)) return SAMPLE
  fs.mkdirSync(path.dirname(SAMPLE), { recursive: true })
  const { createCanvas } = require('@napi-rs/canvas')
  const N = 64
  const canvas = createCanvas(N * 8, N * 8)
  const ctx = canvas.getContext('2d')
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const hue = ((x + y) * 360) / (N * 2)
      ctx.fillStyle = `hsl(${hue}, 70%, ${35 + ((x * y) % 40)}%)`
      ctx.fillRect(x * 8, y * 8, 8, 8)
    }
  }
  fs.writeFileSync(SAMPLE, canvas.toBuffer('image/png'))
  return SAMPLE
}

const imgPath = process.argv[2] || ensureSample()
const gridW = process.argv[3] || '57'
const gridH = process.argv[4] || '57'
const maxColors = process.argv[5] || '24'

/**
 * vite-node 不在 package.json 里(与 @napi-rs/canvas 一样按需安装)。
 * 优先用本地 node_modules,其次复用 npx 缓存;都找不到时明确报错并给出安装命令,
 * 不静默跳过 V2 断言。
 */
function findViteNode() {
  const local = path.join(ROOT, 'node_modules', 'vite-node', 'vite-node.mjs')
  if (fs.existsSync(local)) return local
  const npxCache = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx')
    : path.join(process.env.HOME || '', '.npm', '_npx')
  try {
    for (const dir of fs.readdirSync(npxCache)) {
      const candidate = path.join(npxCache, dir, 'node_modules', 'vite-node', 'vite-node.mjs')
      if (fs.existsSync(candidate)) return candidate
    }
  } catch { /* 缓存目录不存在 */ }
  return null
}

const run = (label, cmd, args) => {
  console.log(`\n=== ${label} ===`)
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT })
  if (res.status !== 0) {
    console.error(`${label} 失败(退出码 ${res.status})`)
    process.exit(res.status || 1)
  }
}

run('V1 量化 + 专业图纸导出', process.execPath, [
  path.join(ROOT, 'scripts', 'verify-export.mjs'), imgPath, gridW, gridH, maxColors,
])

const viteNode = findViteNode()
if (!viteNode) {
  console.error('缺少 vite-node。请先运行: npm i --no-save vite-node')
  process.exit(1)
}
run('V2 PatternDocument 像素断言', process.execPath, [
  viteNode, path.join(ROOT, 'scripts', 'verify-v2-png.mjs'),
])

console.log('\n导出质量门禁通过。')
