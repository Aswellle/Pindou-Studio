/**
 * 生成分享图 public/og-image.png (1200×630, PNG)。
 *
 * 背景:微信/微博/Facebook/X/Telegram 等分享预览大多不支持 SVG og:image,
 * 故用 @napi-rs/canvas 将 public/og-image.svg 的设计栅格化为标准 1200×630 PNG。
 *
 * 依赖 @napi-rs/canvas(未写入 package.json,同 verify-export.mjs 的用法):
 *   npm i --no-save @napi-rs/canvas
 *
 * 仅在改版设计需要重出图时手动运行:
 *   node scripts/generate-og-image.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, '..', 'public', 'og-image.png')

// 注册中文字体(微软雅黑,常规+粗体同族以便按 weight 命中);
// 缺字体时回退到系统无衬线,重出图需在有该字体的机器上跑
for (const p of ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyhbd.ttc']) {
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, 'Microsoft YaHei')
}

const W = 1200
const H = 630
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')

// 背景:暖色渐变(与 SVG 一致)
const bg = ctx.createLinearGradient(0, 0, W, H)
bg.addColorStop(0, '#fdfbf7')
bg.addColorStop(1, '#fbe4d8')
ctx.fillStyle = bg
ctx.fillRect(0, 0, W, H)

function roundedRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function bead(x, y, color, size = 40, radius = 6) {
  ctx.fillStyle = color
  roundedRect(x, y, size, size, radius)
  ctx.fill()
}

// 左:小熊像素画(单元格 40px)
const bear = [
  [0, 40], [40, 40], [80, 40], [120, 40], [160, 40],
  [0, 80], [40, 80], [80, 80], [120, 80], [160, 80],
  [40, 120], [80, 120], [120, 120],
  [0, 160], [40, 160], [80, 160], [120, 160], [160, 160],
  [40, 200], [120, 200],
]
const bearColors = {
  '0,40': '#8D6E63', '40,40': '#8D6E63', '80,40': '#8D6E63', '120,40': '#8D6E63', '160,40': '#8D6E63',
  '0,80': '#8D6E63', '40,80': '#FFFFFF', '80,80': '#8D6E63', '120,80': '#FFFFFF', '160,80': '#8D6E63',
  '40,120': '#8D6E63', '80,120': '#FFD54F', '120,120': '#8D6E63',
  '0,160': '#8D6E63', '40,160': '#8D6E63', '80,160': '#8D6E63', '120,160': '#8D6E63', '160,160': '#8D6E63',
  '40,200': '#8D6E63', '120,200': '#8D6E63',
}
for (const [dx, dy] of bear) bead(60 + dx, 120 + dy, bearColors[`${dx},${dy}`])

// 右:品牌色卡 8 格(60px)
const swatches = [
  [0, 0, '#E53935'], [70, 0, '#FDD835'], [140, 0, '#32CD32'], [210, 0, '#1976D2'],
  [0, 70, '#F06292'], [70, 70, '#BA68C8'], [140, 70, '#00BCD4'], [210, 70, '#FF9800'],
]
for (const [dx, dy, color] of swatches) bead(900 + dx, 80 + dy, color, 60, 8)

ctx.textAlign = 'center'

// 主标题
ctx.fillStyle = '#2b2420'
ctx.font = 'bold 72px "Microsoft YaHei", sans-serif'
ctx.fillText('拼豆Studio', 600, 220)

// 副标题
ctx.fillStyle = '#6f6259'
ctx.font = '32px "Microsoft YaHei", sans-serif'
ctx.fillText('在线拼豆图纸设计工具', 600, 300)

// 特性胶囊
const pills = [
  [350, '#e8734a', '自由绘制'],
  [520, '#4a9b8e', '图片转拼豆'],
  [690, '#e8734a', '专业导出'],
]
for (const [x, color, label] of pills) {
  ctx.fillStyle = color
  roundedRect(x, 360, 160, 48, 24)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 18px "Microsoft YaHei", sans-serif'
  ctx.fillText(label, x + 80, 390)
}

// 品牌行 + 底部 URL
ctx.fillStyle = '#a3968a'
ctx.font = '22px "Microsoft YaHei", sans-serif'
ctx.fillText('支持 Perler · Hama · Artkal 三大品牌色卡', 600, 460)
ctx.font = '20px Consolas, Menlo, monospace'
ctx.fillText('tangnotes.site', 600, 560)

const png = await canvas.encode('png')
fs.writeFileSync(out, png)
console.log(`wrote ${out} (${canvas.width}x${canvas.height})`)
