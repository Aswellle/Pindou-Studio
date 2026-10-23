import { describe, it, expect } from 'vitest'
import { sniffFormat, normalizeToDecodableBlob, heicToPngBlob } from './imageFormats'

/**
 * 格式嗅探。
 *
 * 转换本身依赖 DOM canvas 与两个重量级库,跑不进 jsdom;
 * 但「这个文件到底是什么格式」是纯字节判断,也是最容易判错的地方 ——
 * 判错会让原生格式走转换路径(慢且可能失败),或者让 HEIC 走原生解码(必失败)。
 *
 * 另一个重点是**回归保护**:原生格式必须原样返回,一个字节都不碰。
 * 这是 B4 接入时对既有 PNG/JPEG/SVG 路径的零改动承诺。
 */

/** 造一个带字节内容的 Blob;type 只是提示,嗅探只看字节 */
function blobOf(bytes, type = '') {
  return new Blob([new Uint8Array(bytes)], { type })
}

/** ASCII 转字节数组 */
const ascii = (s) => [...s].map((c) => c.charCodeAt(0))

describe('sniffFormat · 非原生格式', () => {
  it('识别 HEIC(ftyp box + heic 品牌)', async () => {
    // 真实 HEIC 头:[size:4][ftyp][brand:4]
    const head = [0x00, 0x00, 0x00, 0x18, ...ascii('ftyp'), ...ascii('heic'), 0x00, 0x00, 0x00, 0x00]
    expect(await sniffFormat(blobOf(head))).toBe('heic')
  })

  it('识别 HEIF 家族的其他品牌(mif1 / msf1)', async () => {
    for (const brand of ['mif1', 'msf1', 'heix', 'hevc']) {
      const head = [0x00, 0x00, 0x00, 0x18, ...ascii('ftyp'), ...ascii(brand)]
      expect(await sniffFormat(blobOf(head))).toBe('heic')
    }
  })

  it('识别 AVIF(同样是 ftyp,但品牌不同)', async () => {
    const head = [0x00, 0x00, 0x00, 0x18, ...ascii('ftyp'), ...ascii('avif')]
    expect(await sniffFormat(blobOf(head))).toBe('avif')
  })

  it('识别 PDF(%PDF- 魔数)', async () => {
    expect(await sniffFormat(blobOf([...ascii('%PDF-1.7'), 0x0a]))).toBe('pdf')
  })

  it('PDF 的魔数不在第 0 字节时不误判(规范要求必须在开头)', async () => {
    expect(await sniffFormat(blobOf([0x00, ...ascii('%PDF-')]))).toBe('unknown')
    // 偏移 1 处完整出现 %PDF- 也不算 —— 判定必须锚定在字节 0。
    // 只查偏移 1 的实现会把它误判成 PDF,进而对普通二进制跑 PDF 解析。
    expect(await sniffFormat(blobOf([0xff, ...ascii('%PDF-1.4')]))).toBe('unknown')
    expect(await sniffFormat(blobOf([0x00, ...ascii('%PDF-1.7'), 0x0a]))).toBe('unknown')
  })
})

describe('sniffFormat · 原生格式', () => {
  it('识别 PNG', async () => {
    expect(await sniffFormat(blobOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png')
  })

  it('PNG 只给前 4 字节不算(签名必须完整 8 字节)', async () => {
    // 缺 \r\n\x1a\n 的四字节前缀与 PNG 签名只是巧合相同,
    // 宽松匹配会把恰好以 89 50 4E 47 开头的其他二进制当成 PNG。
    expect(await sniffFormat(blobOf([0x89, 0x50, 0x4e, 0x47]))).toBe('unknown')
  })

  it('识别 JPEG', async () => {
    expect(await sniffFormat(blobOf([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
  })

  it('识别 GIF87a / GIF89a', async () => {
    expect(await sniffFormat(blobOf(ascii('GIF87a')))).toBe('gif')
    expect(await sniffFormat(blobOf(ascii('GIF89a')))).toBe('gif')
  })

  it('识别 WebP(RIFF....WEBP)', async () => {
    const head = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]
    expect(await sniffFormat(blobOf(head))).toBe('webp')
  })

  it('识别 SVG(以 < 开头的文本)', async () => {
    expect(await sniffFormat(blobOf(ascii('<svg width="1"')))).toBe('svg')
    expect(await sniffFormat(blobOf(ascii('  \n<svg')))).toBe('svg')
  })

  it('无法识别的字节返回 unknown(交给调用方按原 MIME 处理)', async () => {
    expect(await sniffFormat(blobOf([0x00, 0x01, 0x02, 0x03]))).toBe('unknown')
  })

  it('空文件返回 unknown,不崩溃', async () => {
    expect(await sniffFormat(blobOf([]))).toBe('unknown')
  })

  it('读不出字节时返回 unknown(不抛)', async () => {
    expect(await sniffFormat({ slice: () => { throw new Error('boom') } })).toBe('unknown')
  })
})

describe('sniffFormat · 不依赖 MIME', () => {
  it('MIME 撒谎时以字节为准', async () => {
    // 声称是 png,实际是 pdf
    expect(await sniffFormat(blobOf(ascii('%PDF-1.4'), 'image/png'))).toBe('pdf')
    // 声称是 pdf,实际是 png(完整 8 字节签名,缺 \r\n\x1a\n 就不算 PNG)
    const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    expect(await sniffFormat(blobOf(pngSig, 'application/pdf'))).toBe('png')
  })
})

describe('normalizeToDecodableBlob · 原生格式零改动', () => {
  it('PNG / JPEG / SVG 原样返回,不做转换', async () => {
    const png = blobOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png')
    const r = await normalizeToDecodableBlob(png)
    expect(r.converted).toBe(false)
    expect(r.kind).toBe('native')
    // 必须是同一个对象 —— 重新包一层 Blob 会多一次内存拷贝
    expect(r.blob).toBe(png)
  })

  it('SVG 原样返回(SVG 的尺寸修补在调用方,不在这里)', async () => {
    const svg = blobOf(ascii('<svg width="10" height="10"></svg>'), 'image/svg+xml')
    const r = await normalizeToDecodableBlob(svg)
    expect(r.converted).toBe(false)
    expect(r.blob).toBe(svg)
  })

  it('无扩展名无 MIME 的普通字节也原样返回', async () => {
    const unknown = blobOf([0x00, 0x01, 0x02])
    const r = await normalizeToDecodableBlob(unknown)
    expect(r.converted).toBe(false)
    expect(r.blob).toBe(unknown)
  })
})

describe('heicToPngBlob · 像素红线', () => {
  it('超限时抛 tooManyPixels,且在分配像素缓冲之前就拒绝', async () => {
    // 假解码器:只提供 get_width/get_height。若实现先分配再判断,
    // 这里会因为没有 display() 而抛 TypeError —— 断言捕获到的是 tooManyPixels
    // 而不是 TypeError,就证明判定发生在解码之前。
    const mod = await import('libheif-js')
    const RealDecoder = (mod.default || mod).HeifDecoder
    const original = RealDecoder.prototype.decode

    RealDecoder.prototype.decode = () => [{
      get_width: () => 8064,   // iPhone 48MP:8064×6048 ≈ 4877 万像素
      get_height: () => 6048,
      is_primary: () => true,
      display: () => { throw new Error('不应该走到解码:像素红线必须先拦下') },
    }]
    try {
      await expect(heicToPngBlob(blobOf([]), { maxPixels: 40e6 }))
        .rejects.toThrow('tooManyPixels')
    } finally {
      RealDecoder.prototype.decode = original
    }
  })

  it('恰好等于上限时放行(红线是「超过」,不是「达到」)', async () => {
    // 与原生格式共用同一条语义:`> maxPixels` 才拒绝,`=== maxPixels` 通过。
    // 写成 `>=` 会把边界上的图误判成超限,而 4000 万像素本身是允许的。
    const mod = await import('libheif-js')
    const RealDecoder = (mod.default || mod).HeifDecoder
    const original = RealDecoder.prototype.decode
    let reachedDisplay = false

    RealDecoder.prototype.decode = () => [{
      get_width: () => 8000,
      get_height: () => 5000,   // 8000×5000 = 4000 万,恰好等于默认上限
      is_primary: () => true,
      display: (_target, cb) => { reachedDisplay = true; cb(null) },
    }]
    try {
      await expect(heicToPngBlob(blobOf([])))
        .rejects.toThrow('heicDecodeFailed')
      expect(reachedDisplay).toBe(true)
    } finally {
      RealDecoder.prototype.decode = original
    }
  })

  it('未超限时不触发红线(交由后续解码路径处理)', async () => {    const mod = await import('libheif-js')
    const RealDecoder = (mod.default || mod).HeifDecoder
    const original = RealDecoder.prototype.decode
    let reachedDisplay = false

    RealDecoder.prototype.decode = () => [{
      get_width: () => 100,
      get_height: () => 100,
      is_primary: () => true,
      display: (_target, cb) => { reachedDisplay = true; cb(null) },
    }]
    try {
      // 100×100 远低于红线,不应抛 tooManyPixels;
      // 后续因假 display 不回调而抛 heicDecodeFailed —— 说明红线已放行
      await expect(heicToPngBlob(blobOf([]), { maxPixels: 40e6 }))
        .rejects.toThrow('heicDecodeFailed')
      expect(reachedDisplay).toBe(true)
    } finally {
      RealDecoder.prototype.decode = original
    }
  })
})
