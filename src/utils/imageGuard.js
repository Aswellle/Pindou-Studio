/**
 * 图片上传守卫(纯函数,无 DOM) —— 图片转拼豆入口的文件门控。
 *
 * 为什么需要:量化管线会在主线程 `new Image()` **全分辨率解码**后再降采样到 ≤3000px
 * (见 src/hooks/useImageQuantizer.js 的 loadImage),解码内存与像素数成正比而非与文件
 * 字节数成正比 —— 一张 20000×20000 的纯色 PNG 压缩后可能只有几 MB,却能解出约 1.6GB
 * 的 RGBA 位图。因此在「文件选择期」同时按字节数与像素数设限,把风险挡在解码之前。
 *
 * 约束:只做拒绝判断,不改动既有可接受范围 —— 类型判定保持
 * `file.type.startsWith('image/')` 的原口径,不会新增对原本可用文件的拒绝。
 * 唯一放宽的是 PDF:它不是 `image/*`,但在「导入图纸」路径下会被栅格化成
 * 位图再走同一条管线,由 `allowPdf` 显式开启(默认关闭,不影响其他入口)。
 *
 * 错误码约定:返回值即 i18n 键后缀(`quantizer.errors.<code>`),组件直接拼键取文案。
 * 新增一条规则必须同时补 4 语言的对应文案,否则会向用户露出原始错误码。
 */

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024 // 30MB
export const MAX_IMAGE_PIXELS = 40e6            // 4000 万像素
export const MAX_PDF_BYTES = 50 * 1024 * 1024   // 50MB:图纸 PDF 常含扫描图,比图片宽

/** 是否 SVG:按 MIME 判断,退化到扩展名(部分系统给空 type) */
export function isSvgFile(file) {
  if (!file) return false
  if (String(file.type || '').toLowerCase() === 'image/svg+xml') return true
  return /\.svg$/i.test(String(file.name || ''))
}

/** 是否 PDF:按 MIME 判断,退化到扩展名(拖放/微信传文件常给空 type) */
export function isPdfFile(file) {
  if (!file) return false
  if (String(file.type || '').toLowerCase() === 'application/pdf') return true
  return /\.pdf$/i.test(String(file.name || ''))
}

/** 是否 HEIC/HEIF:iOS 相册默认格式,浏览器原生解不了 */
export function isHeicFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type === 'image/heic' || type === 'image/heif'
    || type === 'image/heic-sequence' || type === 'image/heif-sequence') {
    return true
  }
  return /\.(heic|heif)$/i.test(String(file.name || ''))
}

/**
 * 读文件前若干字节,并按格式给出像素门控所需的输入。
 *
 * SVG 是文本,必须解码成字符串才能读根元素尺寸;PNG/JPEG 传字节即可。
 * 读失败返回 null —— 调用方应放行,交由解码阶段自然报错。
 *
 * @returns {Promise<Uint8Array|string|null>}
 */
export async function readImageHead(file, { bytes = 65536 } = {}) {
  try {
    const buf = await file.slice(0, bytes).arrayBuffer()
    return isSvgFile(file) ? new TextDecoder().decode(buf) : new Uint8Array(buf)
  } catch {
    return null
  }
}

/**
 * 文件级门控:类型 + 字节数(同步,无需读取内容)。
 *
 * @param {File|Blob} file
 * @param {object} [opts]
 * @param {number} [opts.maxBytes]
 * @param {boolean} [opts.allowPdf] 是否接受 PDF(仅「导入图纸」路径开启)
 * @returns {null|'notImage'|'imageTooLarge'|'pdfTooLarge'} null 表示通过
 */
export function checkImageFile(file, { maxBytes = MAX_IMAGE_BYTES, allowPdf = false } = {}) {
  if (!file) return 'notImage'
  if (allowPdf && isPdfFile(file)) {
    return file.size > MAX_PDF_BYTES ? 'pdfTooLarge' : null
  }
  if (!String(file.type || '').startsWith('image/')) return 'notImage'
  if (file.size > maxBytes) return 'imageTooLarge'
  return null
}

/**
 * 从 SVG 文本里读根元素的 width / height / viewBox。
 *
 * 为什么单独处理 SVG:它是**文本**矢量格式,压缩后几 KB 就能声明
 * `width="50000" height="50000"`,解码出来的位图却有 100 亿像素。
 * 前面 PNG/JPEG 的像素门控全靠文件头,对 SVG 完全失效 —— 不加这一条,
 * 一张几 KB 的 SVG 就能绕过 4000 万像素上限把标签页解到 OOM。
 *
 * **安全前提**:SVG 只经 `<img src=blob:...>` 解码,从不 `innerHTML` 插入。
 * 该上下文下浏览器不执行 SVG 内的 `<script>`、不解析 `<foreignObject>` 里的
 * HTML、也不加载外部 `href` 引用的资源 —— 因此这里只需处理尺寸,不必做
 * 脚本/外部引用的清洗。若将来有人把 SVG 直接插进 DOM,这个前提就失效了,
 * 那时必须另做清洗(白名单标签 + 移除 on* 属性 + 剥离外部 href)。
 *
 * 只读前若干个 KB 已经够:根 `<svg>` 标签必然在文件开头(前面只可能有
 * XML 声明、注释、DOCTYPE)。解析不出尺寸时返回 null(交给调用方放行)——
 * 没有 width/height 也没有 viewBox 的 SVG 会按容器默认尺寸渲染,不会爆内存。
 *
 * @param {string} text SVG 文本(文件前若干 KB 即可)
 * @returns {{width:number,height:number}|null}
 */
export function readSvgSize(text) {
  if (typeof text !== 'string' || !text) return null
  // 去掉注释,避免注释里的 `<svg width=...>` 干扰
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '')
  const tag = stripped.match(/<svg\b[^>]*>/i)
  if (!tag) return null
  const attrs = tag[0]

  const num = (name) => {
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
    if (!m) return null
    // 只接受纯数字(可带单位 px / 无单位);`100%` / `2em` 这类相对单位无法预判像素
    const v = m[1].trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
    return v ? Number(v[1]) : null
  }

  const w = num('width')
  const h = num('height')
  if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h) }

  // 退化到 viewBox:minX minY width height
  const vb = attrs.match(/\bviewBox\s*=\s*["']\s*([-\d.\s,]+)\s*["']/i)
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) }
    }
  }
  return null
}

/**
 * 给缺显式宽高的 SVG 补上 width/height,避免 `<img>` 按默认 300×150 解码。
 *
 * 只靠 viewBox 的 SVG 在 `<img>` 里没有固有尺寸,浏览器按 CSS 默认替换元素
 * 尺寸(300×150)渲染 —— 一张 200×200 格的矢量图纸会被压成 300px 宽,
 * 逐格采样时每格不到 1.5px,识别必然失败。这里把 viewBox 的尺寸写成
 * 显式 width/height,让解码分辨率等于设计尺寸。
 *
 * 已有 width/height(含 px 单位)则原样返回,不碰用户文件。
 *
 * @param {string} text SVG 文本
 * @returns {string} 可能被改写的 SVG 文本
 */
export function ensureSvgSize(text) {
  if (typeof text !== 'string' || !text) return text
  const tag = text.match(/<svg\b[^>]*>/i)
  if (!tag) return text
  const attrs = tag[0]
  const hasW = /\bwidth\s*=\s*["']\s*\d+(?:\.\d+)?(?:px)?\s*["']/i.test(attrs)
  const hasH = /\bheight\s*=\s*["']\s*\d+(?:\.\d+)?(?:px)?\s*["']/i.test(attrs)
  if (hasW && hasH) return text

  const size = readSvgSize(text)
  if (!size) return text

  let patched = attrs
  if (!hasW) patched = patched.replace(/<svg\b/i, `<svg width="${size.width}"`)
  if (!hasH) patched = patched.replace(/<svg\b/i, `<svg height="${size.height}"`)
  return text.replace(tag[0], patched)
}

/**
 * 仅从文件头解析像素尺寸(PNG IHDR / JPEG SOF / SVG 根元素),不做解码。
 * 解析不出(其他格式、截断、损坏)返回 null —— 调用方应放行,不误伤合法格式。
 * @param {Uint8Array|ArrayBuffer|string} bytes 文件前若干 KB;SVG 传文本
 * @returns {{width:number,height:number}|null}
 */
export function readImageSize(bytes) {
  if (typeof bytes === 'string') return readSvgSize(bytes)
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  // PNG: 89 50 4E 47 0D 0A 1A 0A | 长度(4)=13 | 'IHDR' | width(4) height(4) @ 16..23
  if (u8.length >= 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
    const width = ((u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19]) >>> 0
    const height = ((u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23]) >>> 0
    return width && height ? { width, height } : null
  }

  // JPEG: FF D8 起逐段扫描,遇 SOF0..SOF15(排除 C4=DHT / C8=JPG / CC=DAC)读 精度(1) 高(2) 宽(2)
  if (u8.length >= 4 && u8[0] === 0xff && u8[1] === 0xd8) {
    let i = 2
    while (i + 9 < u8.length) {
      if (u8[i] !== 0xff) { i += 1; continue } // 段间填充字节
      const marker = u8[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue } // 无长度段
      const segmentLength = (u8[i + 2] << 8) | u8[i + 3]
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSOF) {
        const height = (u8[i + 5] << 8) | u8[i + 6]
        const width = (u8[i + 7] << 8) | u8[i + 8]
        return width && height ? { width, height } : null
      }
      if (segmentLength <= 0) return null // 长度非法:避免死循环,按无法解析处理
      i += 2 + segmentLength
    }
    return null
  }

  return null // WebP/AVIF/GIF 等:此处不解析,交由调用方放行
}

/**
 * 像素总数门控:解析不出尺寸时返回 null(放行)。
 *
 * SVG 必须传**文本**(`readImageSize` 据此走 `readSvgSize`);传 ArrayBuffer
 * 会走 PNG/JPEG 分支、解析不出尺寸,等于对 SVG 完全失去像素门控 ——
 * 一个几 KB 的 `width="50000"` SVG 就能解出上百亿像素。
 *
 * @param {Uint8Array|ArrayBuffer|string} bytes 文件前若干 KB;SVG 传文本
 * @returns {null|'tooManyPixels'} null 表示通过
 */
export function checkImagePixels(bytes, { maxPixels = MAX_IMAGE_PIXELS } = {}) {
  const size = readImageSize(bytes)
  if (!size) return null
  return size.width * size.height > maxPixels ? 'tooManyPixels' : null
}
