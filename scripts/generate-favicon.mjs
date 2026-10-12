/**
 * 生成站点图标文件(零依赖:Node 内置 zlib 手写 PNG/ICO 编码)。
 *
 * 背景:index.html 原先的 favicon 是 data: URI,搜索引擎无法作为独立资源抓取,
 * Google/Bing 搜索结果不显示站点图标(影响点击率)。本脚本把同一枚 4×4 拼豆色卡
 * 标记栅格化为真实文件:
 *   public/favicon.svg          — 矢量版(现代浏览器,可 <link rel="icon" type="image/svg+xml">)
 *   public/favicon-32.png       — 32×32 PNG
 *   public/favicon.ico          — ICO 容器(内含 32×32 PNG,Bing/百度等按 /favicon.ico 探测)
 *   public/apple-touch-icon.png — 180×180(iOS 添加到主屏)
 *   public/logo-512.png         — 512×512(Organization JSON-LD logo 用方形图)
 *
 * 图形与 index.html 原 data: URI 完全一致(4×4 十六格品牌色),不改品牌外观。
 *
 * 用法(仅在需要重出图时手动运行,产物随仓库提交):
 *   node scripts/generate-favicon.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '..', 'public')

// 与 index.html 原 data:URI 逐格一致(行优先 4×4)
const GRID = [
  ['#E53935', '#FDD835', '#32CD32', '#1976D2'],
  ['#F06292', '#BA68C8', '#00BCD4', '#FF9800'],
  ['#FFFFFF', '#E0E0E0', '#000000', '#795548'],
  ['#8D6E63', '#A1887F', '#BDBDBD', '#6D4C41'],
]

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// ── 极简 PNG 编码器(RGBA8,无滤波)────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** 把 4×4 色卡渲染成 size×size 的 PNG Buffer */
function renderPng(size) {
  const cell = size / 4
  // cell 必须为整数,保证像素边界锐利(32/180/512 均整除)
  if (!Number.isInteger(cell)) throw new Error(`size ${size} 无法被 4 整除`)

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size) // 每行前置 1 字节 filter=0
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1) + 1
    const gy = Math.min(3, Math.floor(y / cell))
    for (let x = 0; x < size; x++) {
      const gx = Math.min(3, Math.floor(x / cell))
      const [r, g, b] = hexToRgb(GRID[gy][gx])
      const o = rowStart + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = 255
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  // 10/11/12 = compression/filter/interlace = 0
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO 容器(单帧,内含 PNG 数据;宽度/高度为 0 表示 256) */
function encodeIco(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0 // palette
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bit count
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12) // offset = 6 + 16
  return Buffer.concat([header, entry, png])
}

function svgMarkup() {
  const rects = []
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const color = GRID[gy][gx].toLowerCase()
      rects.push(`<rect x="${gx * 8}" y="${gy * 8}" width="8" height="8" fill="${color}"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="拼豆Studio">${rects.join('')}</svg>\n`
}

const png32 = renderPng(32)
fs.writeFileSync(path.join(pub, 'favicon.svg'), svgMarkup())
fs.writeFileSync(path.join(pub, 'favicon-32.png'), png32)
fs.writeFileSync(path.join(pub, 'favicon.ico'), encodeIco(png32, 32))
fs.writeFileSync(path.join(pub, 'apple-touch-icon.png'), renderPng(180))
fs.writeFileSync(path.join(pub, 'logo-512.png'), renderPng(512))
console.log('wrote public/favicon.svg, favicon-32.png, favicon.ico, apple-touch-icon.png, logo-512.png')
