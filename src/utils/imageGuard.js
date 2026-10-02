/**
 * 图片上传守卫(纯函数,无 DOM) —— 图片转拼豆入口的文件门控。
 *
 * 为什么需要:量化管线会在主线程 `new Image()` **全分辨率解码**后再降采样到 ≤3000px
 * (见 src/hooks/useImageQuantizer.js 的 loadImage),解码内存与像素数成正比而非与文件
 * 字节数成正比 —— 一张 20000×20000 的纯色 PNG 压缩后可能只有几 MB,却能解出约 1.6GB
 * 的 RGBA 位图。因此在「文件选择期」同时按字节数与像素数设限,把风险挡在解码之前。
 *
 * 约束:只做拒绝判断,不改动既有可接受范围 —— 类型判定与原实现的
 * `file.type.startsWith('image/')` 一致,不会新增对原本可用文件的拒绝。
 *
 * 错误码约定:返回值即 i18n 键后缀(`quantizer.errors.<code>`),组件直接拼键取文案。
 * 新增一条规则必须同时补 4 语言的对应文案,否则会向用户露出原始错误码。
 */

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024 // 30MB
export const MAX_IMAGE_PIXELS = 40e6            // 4000 万像素

/**
 * 文件级门控:类型 + 字节数(同步,无需读取内容)。
 * @returns {null|'notImage'|'imageTooLarge'} null 表示通过,否则返回错误码(即 i18n 键后缀)
 */
export function checkImageFile(file, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) return 'notImage'
  if (file.size > maxBytes) return 'imageTooLarge'
  return null
}

/**
 * 仅从文件头解析像素尺寸(PNG IHDR / JPEG SOF),不做解码。
 * 解析不出(PNG/JPEG 之外的格式、截断、损坏)返回 null —— 调用方应放行,不误伤合法格式。
 * @param {Uint8Array|ArrayBuffer} bytes 文件前若干 KB
 * @returns {{width:number,height:number}|null}
 */
export function readImageSize(bytes) {
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
 * @returns {null|'tooManyPixels'} null 表示通过
 */
export function checkImagePixels(bytes, { maxPixels = MAX_IMAGE_PIXELS } = {}) {
  const size = readImageSize(bytes)
  if (!size) return null
  return size.width * size.height > maxPixels ? 'tooManyPixels' : null
}
