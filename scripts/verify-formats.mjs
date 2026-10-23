/**
 * B4 端到端验证:用真实 HEIC / PDF 文件跑转换链路。
 *
 * 为什么单独写:单测只能证明「调用编排正确」,证明不了 libheif / pdfjs
 * 真的能解出像素。这里在 Node 里用 @napi-rs/canvas 顶替 DOM canvas,
 * 把两个转换函数完整跑一遍,并对输出做像素断言。
 *
 * 用法:
 *   node scripts/verify-formats.mjs [heic路径] [pdf路径]
 * 不给路径时用内置合成的 PDF;HEIC 需要真实样本(HEVC 编码无法手写)。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ── 在 import 业务模块前铺好 DOM 垫片 ────────────────────────
// imageFormats.js 用到 document.createElement('canvas')、ImageData、canvas.toBlob
globalThis.ImageData = globalThis.ImageData || NapiImageData

function installCanvasShim() {
  const origCreate = globalThis.document?.createElement
  const doc = globalThis.document || {}
  doc.createElement = (tag) => {
    if (tag !== 'canvas') return origCreate ? origCreate(tag) : {}
    const c = createCanvas(1, 1)
    // @napi-rs/canvas 没有 toBlob,补一个基于 encode 的实现
    c.toBlob = (cb, type = 'image/png') => {
      const fmt = type === 'image/jpeg' ? 'jpeg' : 'png'
      c.encode(fmt).then((buf) => cb(new Blob([buf], { type }))).catch(() => cb(null))
    }
    return c
  }
  globalThis.document = doc
}
installCanvasShim()

const { heicToPngBlob, pdfToPngBlob, sniffFormat } = await import('../src/utils/imageFormats.js')

/** 读 PNG 头拿宽高 */
function pngSize(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (b.readUInt32BE(0) !== 0x89504e47) return null
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/** 统计非白像素比例,证明真的画出了内容而不是空白画布 */
async function inkRatio(blob) {
  const buf = Buffer.from(await blob.arrayBuffer())
  const { loadImage } = await import('@napi-rs/canvas')
  const img = await loadImage(buf)
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, img.width, img.height).data
  let ink = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) ink++
  }
  return { ratio: ink / (img.width * img.height), width: img.width, height: img.height }
}

/** 造一个最小可用 PDF:一页,画一个黑色矩形 */
function makeTestPdf() {
  const content = '0 0 0 rg 100 100 200 300 re f'
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objs.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Blob([Buffer.from(pdf, 'latin1')], { type: 'application/pdf' })
}

let failures = 0
const check = (ok, label, detail = '') => {
  if (ok) {
    console.log(`  PASS  ${label}${detail ? ` (${detail})` : ''}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ''}`)
  }
}

// ── HEIC ───────────────────────────────────────────────────
const heicPath = process.argv[2]
if (heicPath) {
  console.log(`\nHEIC: ${heicPath}`)
  const buf = fs.readFileSync(heicPath)
  const blob = new Blob([buf], { type: 'image/heic' })

  const fmt = await sniffFormat(blob)
  check(fmt === 'heic', '嗅探为 heic', fmt)

  try {
    const out = await heicToPngBlob(blob)
    const size = pngSize(Buffer.from(await out.arrayBuffer()))
    check(!!size, '输出是合法 PNG', size ? `${size.width}x${size.height}` : 'bad header')
    check(size && size.width > 0 && size.height > 0, '尺寸非零')

    const ink = await inkRatio(out)
    check(ink.ratio > 0.01, '画出了真实内容(非空白)', `ink=${(ink.ratio * 100).toFixed(1)}%`)
  } catch (e) {
    failures++
    console.log(`  FAIL  HEIC 转换抛错: ${e.message}`)
  }
} else {
  console.log('\nHEIC: 跳过(未提供样本路径)')
}

// ── PDF ────────────────────────────────────────────────────
const pdfPath = process.argv[3]
console.log(`\nPDF: ${pdfPath || '(使用内置合成 PDF)'}`)
{
  const blob = pdfPath
    ? new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' })
    : makeTestPdf()

  const fmt = await sniffFormat(blob)
  check(fmt === 'pdf', '嗅探为 pdf', fmt)

  try {
    const out = await pdfToPngBlob(blob, { maxSide: 1200 })
    const size = pngSize(Buffer.from(await out.arrayBuffer()))
    check(!!size, '输出是合法 PNG', size ? `${size.width}x${size.height}` : 'bad header')
    // 长边应接近 maxSide(A4 595x842 → 1200 长边)
    check(size && Math.max(size.width, size.height) >= 1000,
      '按 maxSide 放大到目标分辨率', size ? `长边 ${Math.max(size.width, size.height)}` : '')

    const ink = await inkRatio(out)
    check(ink.ratio > 0.001, '画出了 PDF 内容(非空白)', `ink=${(ink.ratio * 100).toFixed(1)}%`)
  } catch (e) {
    failures++
    console.log(`  FAIL  PDF 转换抛错: ${e.message}`)
  }
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
