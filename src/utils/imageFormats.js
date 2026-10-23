/**
 * 非原生图片格式的规范化(纯函数 + 动态依赖)。
 *
 * 浏览器 `<img>` 能解 PNG / JPEG / GIF / WebP / AVIF / SVG,但解不了:
 *   - **HEIC/HEIF** —— iOS 相册默认格式。Safari 原生支持,Chrome/Firefox/Edge
 *     不支持;iPhone 拍的照片传到 Windows/Android 或电脑上就解不开。
 *   - **PDF** —— 商家提供的电子图纸、论坛下载的图纸常是 PDF。
 *
 * 这两个都靠动态 import 的重量级库解决,所以本模块的职责是:
 *   1. 按文件头魔数识别格式(不能只信 MIME);
 *   2. 把非原生格式转换成浏览器能解的 Blob(HEIC→PNG、PDF→PNG)。
 *
 * 依赖体积(都只在用户真的导入该格式时才下载):
 *   - libheif-js  ~1.4MB wasm(含 libde265 解码器)
 *   - pdfjs-dist  460KB 主库 + 1.26MB worker
 * 因此绝不能在模块顶层 import —— 那会把它们拖进主包。
 *
 * 格式判定函数(`isHeicFile` / `isPdfFile`)放在 imageGuard 里 ——
 * 那里是门控层,本模块只负责「转换」。
 */

// 显式 .js 扩展名:本文件会被 scripts/verify-formats.mjs 用 Node 直接 import
// (Node ESM 不做扩展名补全),与 ogSnapshot.js / ogCard.js 的写法一致。
import { isHeicFile, isPdfFile, MAX_IMAGE_PIXELS } from './imageGuard.js'

/**
 * 读取文件头并判定真实格式(魔数)。
 *
 * 为什么不能只信 MIME:拖放/剪贴板路径下浏览器给的类型并不可靠,
 * 微信/QQ 传文件、改扩展名的场景都出现过 type 与实际不符。
 * 但魔数判定**只用于识别我们额外支持的格式**,不用于拒绝 ——
 * 原生支持的格式仍按原 MIME 前缀放行,避免误伤(见 imageGuard 的约定)。
 *
 * @param {File|Blob} file
 * @returns {Promise<'heic'|'pdf'|'svg'|'png'|'jpeg'|'gif'|'webp'|'avif'|'unknown'>}
 */
export async function sniffFormat(file) {
  let bytes
  try {
    bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  } catch {
    return 'unknown'
  }
  const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to))

  // HEIC/HEIF:ftyp box 在偏移 4,品牌标识在 8
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (/^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)) return 'heic'
  }
  // PDF:%PDF-
  if (bytes.length >= 5 && ascii(0, 5) === '%PDF-') return 'pdf'
  // PNG
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png'
  // JPEG
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  // GIF
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif'
  // WebP:RIFF....WEBP
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  // AVIF / HEIF 图像序列也用 ftyp,品牌在 8
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp' && /^(avif|avis)$/.test(ascii(8, 12))) return 'avif'
  // SVG:文本格式,可能有 XML 声明/注释/DOCTYPE 前缀,只看前 32 字节不够,
  // 这里只做「看起来像文本且含 <svg」的粗判,真正的解析在 imageGuard.readSvgSize
  if (bytes.length && /^\s*</.test(String.fromCharCode(...bytes.slice(0, 8)))) return 'svg'
  return 'unknown'
}

/**
 * 解码 HEIC/HEIF 为 PNG Blob。
 *
 * @param {File|Blob} file
 * @param {object} [opts]
 * @param {number} [opts.maxPixels] 像素总数上限(与原生格式同一条红线)
 * @returns {Promise<Blob>}
 * @throws {Error} 'heicDecodeFailed' | 'heicUnsupported' | 'tooManyPixels'
 */
export async function heicToPngBlob(file, { maxPixels = MAX_IMAGE_PIXELS } = {}) {
  // 动态 import:libheif 是 1.4MB 的 wasm,不进主包。
  // 该包是 CJS/UMD 打包产物,ESM 下只有 default 一个导出 ——
  // `HeifDecoder` 挂在 default 上,直接解构命名导出会拿到 undefined。
  let mod
  try {
    mod = await import('libheif-js')
  } catch {
    throw new Error('heicUnsupported')
  }
  const libheif = mod?.default || mod
  const HeifDecoder = libheif?.HeifDecoder
  if (typeof HeifDecoder !== 'function') throw new Error('heicUnsupported')

  const buf = await file.arrayBuffer()
  const decoder = new HeifDecoder()
  let images
  try {
    images = decoder.decode(new Uint8Array(buf))
  } catch {
    throw new Error('heicDecodeFailed')
  }
  if (!images || images.length === 0) throw new Error('heicDecodeFailed')

  // 第一张通常是主图;有些 HEIC 带缩略图/深度图作为额外 image
  const img = images.find((im) => im.is_primary?.()) || images[0]
  const width = img.get_width()
  const height = img.get_height()
  if (!width || !height) throw new Error('heicDecodeFailed')
  // 像素红线:原生格式在选文件时就能从文件头量出尺寸并拦下,HEIC 要等解出
  // 图像句柄才知道。libheif 的 display() 只能按原始分辨率吐整张 RGBA ——
  // 它的缩放着色器没有暴露到 JS 封装层 —— 所以一张 48MP 的 iPhone 照片
  // 会一次性分配约 195MB,移动端直接 OOM。这里在分配之前用同一条红线拒绝。
  // 注意:此时只读到了句柄尺寸,像素缓冲尚未分配,拒绝是零成本的。
  if (width * height > maxPixels) throw new Error('tooManyPixels')

  const target = { data: new Uint8ClampedArray(width * height * 4), width, height }
  const rgba = await new Promise((resolve) => {
    // libheif 的 display 是回调式且内部 setTimeout,不能同步取
    img.display(target, (result) => resolve(result))
  })
  if (!rgba?.data?.length) throw new Error('heicDecodeFailed')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.putImageData(new ImageData(rgba.data, width, height), 0, 0)

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('heicDecodeFailed'))
    }, 'image/png')
  })
}

/** PDF 栅格化的长边上限:图纸通常一页,太高只会浪费内存 */
export const PDF_MAX_SIDE = 2400

/**
 * 把 PDF 第一页栅格化为 PNG Blob。
 *
 * 为什么只取第一页:拼豆图纸基本是单页;多页 PDF 让用户选页是另一套 UI,
 * 不在本次范围内。真要支持时把 pageNumber 提成参数即可。
 *
 * @param {File|Blob} file
 * @param {object} [opts]
 * @param {number} [opts.maxSide] 栅格化长边上限
 * @param {number} [opts.pageNumber] 页号(1 起)
 * @returns {Promise<Blob>}
 * @throws {Error} 'pdfDecodeFailed' | 'pdfUnsupported'
 */
export async function pdfToPngBlob(file, { maxSide = PDF_MAX_SIDE, pageNumber = 1 } = {}) {
  let pdfjs
  try {
    // legacy 构建兼容性最好(不依赖顶层 await / 新语法),移动端 Safari 也能跑。
    // worker 用 `?url` 让 Vite 把它作为独立资源发出去并返回真实 URL ——
    // 不配置 workerSrc 时 pdfjs 会降级成 fake worker,在主线程同步解析,
    // 一个多页图纸 PDF 就能把界面卡住数秒。
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs = lib
    if (worker?.default) lib.GlobalWorkerOptions.workerSrc = worker.default
  } catch {
    throw new Error('pdfUnsupported')
  }

  const buf = await file.arrayBuffer()
  // pdfjs 的 PDFDocumentProxy 没有 destroy() —— 释放入口在 loadingTask 上,
  // 它会连带销毁 transport 与 worker。只留 doc 引用会让 worker 泄漏。
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // 图纸 PDF 里的图片/字体不需要联网取,禁用外部资源也避免注入风险
    isEvalSupported: false,
    disableFontFace: true,
  })
  const doc = await loadingTask.promise

  try {
    if (doc.numPages < 1) throw new Error('pdfDecodeFailed')
    const page = await doc.getPage(Math.min(pageNumber, doc.numPages))
    const base = page.getViewport({ scale: 1 })
    // 图纸 PDF 常是 A4(595×842),按 1× 渲染只有 595px,逐格采样每格不足 1px。
    // 直接按 maxSide 放大到目标长边;超大页面(海报尺寸)也由 maxSide 封顶。
    const scale = maxSide / Math.max(base.width, base.height)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    // PDF 背景默认透明,先铺白底,否则透明区域会被当成黑色/空
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport }).promise

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('pdfDecodeFailed'))
      }, 'image/png')
    })
  } finally {
    await loadingTask.destroy()
  }
}

/**
 * 把「可能是非原生格式」的文件规范化为浏览器可解码的 Blob。
 *
 * 原生支持的格式原样返回,**不做任何转换** —— 这条路径必须与改造前
 * 完全一致,否则会引入既有格式的回归。
 *
 * @param {File|Blob} file
 * @param {object} [opts]
 * @param {number} [opts.pdfMaxSide]
 * @returns {Promise<{blob: Blob, kind: 'native'|'heic'|'pdf', converted: boolean}>}
 */
export async function normalizeToDecodableBlob(file, { pdfMaxSide } = {}) {
  const format = await sniffFormat(file)
  if (format === 'heic' || isHeicFile(file)) {
    return { blob: await heicToPngBlob(file), kind: 'heic', converted: true }
  }
  if (format === 'pdf' || isPdfFile(file)) {
    return { blob: await pdfToPngBlob(file, { maxSide: pdfMaxSide }), kind: 'pdf', converted: true }
  }
  return { blob: file, kind: 'native', converted: false }
}
