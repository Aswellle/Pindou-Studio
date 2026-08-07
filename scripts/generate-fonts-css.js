/**
 * 生成精简字体 CSS(只保留 woff2,去掉 woff 回退)。
 * 原因:fontsource/lxgw 完整 CSS 含 600+ 条 @font-face,每条带
 * woff2+woff 双回退,构建后主 CSS 达 683KB(gzip 271KB)。
 * woff2 已覆盖全部现代浏览器,woff 回退冗余 → 删除可显著缩小 CSS,
 * 字体文件本身(woff2 子集)按需加载机制不变,不影响任何功能。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'src', 'styles')

const SOURCES = [
  { pkg: '@fontsource/noto-sans-sc', file: '400.css', out: 'noto-sans-sc-400.css' },
  { pkg: '@fontsource/noto-sans-sc', file: '500.css', out: 'noto-sans-sc-500.css' },
  { pkg: '@fontsource/noto-sans-sc', file: '600.css', out: 'noto-sans-sc-600.css' },
  { pkg: '@fontsource/noto-sans-sc', file: '700.css', out: 'noto-sans-sc-700.css' },
  { pkg: 'lxgw-wenkai-webfont', file: 'lxgwwenkai-regular.css', out: 'lxgwwenkai-regular.css' },
  { pkg: 'lxgw-wenkai-webfont', file: 'lxgwwenkai-bold.css', out: 'lxgwwenkai-bold.css' },
]

// 删除 woff 回退:`, url(./files/xxx.woff) format('woff')`
const woffRe = /,\s*url\(\.\/files\/[^)]+\.woff\)\s*format\('woff'\)/g

// 字体 url 重写:./files/X.woff2 → ../../node_modules/<pkg>/files/X.woff2
// (可解析的真实路径,Vite 构建时才能把字体文件打包为带 hash 的 asset)
function rewriteUrl(css, pkg) {
  return css.replace(/\.\/files\/([^)]+\.woff2)/g, (m, file) => {
    return '../../node_modules/' + pkg + '/files/' + file
  })
}

fs.mkdirSync(outDir, { recursive: true })

let totalBefore = 0
let totalAfter = 0

// 合并所有字体为一个 CSS(桌面端异步加载)
const parts = []

for (const src of SOURCES) {
  const cssPath = path.join(root, 'node_modules', src.pkg, src.file)
  const css = fs.readFileSync(cssPath, 'utf-8')
  const slim = rewriteUrl(css.replace(woffRe, ''), src.pkg)
  parts.push(`/* ${src.out} */\n` + slim)
  totalBefore += css.length
  totalAfter += slim.length
  console.log(`${src.out}: ${css.length} -> ${slim.length}`)
}

const merged = parts.join('\n')
fs.writeFileSync(path.join(outDir, 'fonts-all.css'), merged)
console.log(`合并 fonts-all.css: ${totalBefore} -> ${merged.length}`)
