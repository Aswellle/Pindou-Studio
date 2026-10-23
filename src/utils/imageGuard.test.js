import { describe, it, expect } from 'vitest'
import {
  checkImageFile,
  checkImagePixels,
  readImageSize,
  readSvgSize,
  ensureSvgSize,
  isSvgFile,
  readImageHead,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
} from './imageGuard'
import zh from '../i18n/locales/zh-CN.json'

/** 构造 PNG 头(仅签名 + IHDR 的尺寸字段,足够 readImageSize 判定) */
function pngHeader(width, height) {
  const b = new Uint8Array(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  b.set([0x00, 0x00, 0x00, 0x0d], 8)          // IHDR 长度 13
  b.set([0x49, 0x48, 0x44, 0x52], 12)          // 'IHDR'
  b.set([(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff], 16)
  b.set([(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff], 20)
  return b
}

/** 构造 JPEG 头:FF D8 [+ 可选 APP0 段] + SOF0(精度/高/宽) */
function jpegHeader(width, height, { withAppSegment = false } = {}) {
  const parts = [[0xff, 0xd8]]
  if (withAppSegment) parts.push([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])
  parts.push([0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03, 0x01, 0x11, 0x00])
  return new Uint8Array(parts.flat())
}

describe('checkImageFile', () => {
  it('非图片类型 → notImage(含空 type 与缺省入参)', () => {
    expect(checkImageFile({ type: 'text/plain', size: 10 })).toBe('notImage')
    expect(checkImageFile({ type: '', size: 10 })).toBe('notImage')
    expect(checkImageFile(null)).toBe('notImage')
    expect(checkImageFile(undefined)).toBe('notImage')
  })

  it('超过字节上限 → imageTooLarge;恰好等于上限放行', () => {
    expect(checkImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('imageTooLarge')
    expect(checkImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull()
    expect(checkImageFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toBeNull()
  })

  it('自定义上限生效', () => {
    expect(checkImageFile({ type: 'image/png', size: 2000 }, { maxBytes: 1000 })).toBe('imageTooLarge')
  })

  it('错误码与 i18n 键一一对应(避免向用户露出原始码)', () => {
    // 组件按 `quantizer.errors.<code>` 直接拼键取值:任一侧漏配都会让用户看到 raw code
    expect(Object.keys(zh.quantizer.errors).sort()).toEqual(['imageTooLarge', 'notImage', 'tooManyPixels'])
    expect(checkImageFile({ type: 'text/plain' })).toBe('notImage')
    expect(checkImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('imageTooLarge')
    expect(checkImagePixels(pngHeader(20000, 20000))).toBe('tooManyPixels')
  })
})

describe('readImageSize', () => {
  it('解析 PNG IHDR 尺寸', () => {
    expect(readImageSize(pngHeader(1280, 720))).toEqual({ width: 1280, height: 720 })
    expect(readImageSize(pngHeader(20000, 20000))).toEqual({ width: 20000, height: 20000 })
  })

  it('解析 JPEG SOF0 尺寸(含跳过前置 APP0 段)', () => {
    expect(readImageSize(jpegHeader(640, 480))).toEqual({ width: 640, height: 480 })
    expect(readImageSize(jpegHeader(640, 480, { withAppSegment: true }))).toEqual({ width: 640, height: 480 })
  })

  it('无法解析时返回 null(截断/垃圾数据/非 PNG-JPEG 格式),不抛错', () => {
    expect(readImageSize(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(readImageSize(pngHeader(100, 100).slice(0, 20))).toBeNull()
    expect(readImageSize(new Uint8Array(64))).toBeNull()
    expect(readImageSize('RIFF....WEBP')).toBeNull()
    expect(readImageSize(new Uint8Array(0))).toBeNull()
  })

  it('段长度非法时不进入死循环,直接按无法解析处理', () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(readImageSize(broken)).toBeNull()
  })

  it('接受 ArrayBuffer 入参', () => {
    expect(readImageSize(pngHeader(32, 16).buffer)).toEqual({ width: 32, height: 16 })
  })
})

describe('checkImagePixels', () => {
  it('像素数超限 → tooManyPixels(小字节大像素的像素画场景)', () => {
    expect(checkImagePixels(pngHeader(20000, 20000))).toBe('tooManyPixels')
    expect(checkImagePixels(jpegHeader(8000, 6000))).toBe('tooManyPixels')
  })

  it('恰好等于上限放行', () => {
    expect(checkImagePixels(pngHeader(8000, 5000))).toBeNull() // 4000 万
    expect(MAX_IMAGE_PIXELS).toBe(40e6)
  })

  it('解析不出尺寸时放行(不误伤 WebP/AVIF 等未解析格式)', () => {
    expect(checkImagePixels('RIFF....WEBP')).toBeNull()
    expect(checkImagePixels(new Uint8Array(0))).toBeNull()
  })

  it('自定义上限生效(恰好等于上限放行,超出才拦)', () => {
    expect(checkImagePixels(pngHeader(100, 100), { maxPixels: 10000 })).toBeNull()
    expect(checkImagePixels(pngHeader(200, 100), { maxPixels: 10000 })).toBe('tooManyPixels')
  })
})

describe('readSvgSize', () => {
  const svg = (attrs, inner = '') =>
    `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`

  it('读 width / height 属性', () => {
    expect(readSvgSize(svg('width="800" height="600"'))).toEqual({ width: 800, height: 600 })
  })

  it('接受 px 单位', () => {
    expect(readSvgSize(svg('width="800px" height="600px"'))).toEqual({ width: 800, height: 600 })
  })

  it('宽高缺失时退化到 viewBox', () => {
    expect(readSvgSize(svg('viewBox="0 0 320 240"'))).toEqual({ width: 320, height: 240 })
  })

  it('viewBox 带负偏移与逗号分隔', () => {
    expect(readSvgSize(svg('viewBox="-10,-20,320,240"'))).toEqual({ width: 320, height: 240 })
  })

  it('宽高优先于 viewBox(渲染尺寸才是解码尺寸)', () => {
    expect(readSvgSize(svg('width="100" height="50" viewBox="0 0 1000 500"')))
      .toEqual({ width: 100, height: 50 })
  })

  it('相对单位(100% / 2em)不可预判 → 退化到 viewBox', () => {
    expect(readSvgSize(svg('width="100%" height="100%" viewBox="0 0 640 480"')))
      .toEqual({ width: 640, height: 480 })
  })

  it('属性顺序无关、单引号同样识别', () => {
    expect(readSvgSize(`<svg height='300' width='400'>`)).toEqual({ width: 400, height: 300 })
  })

  it('注释里的假 svg 标签不干扰', () => {
    const text = `<!-- <svg width="99999" height="99999"> -->\n<svg width="50" height="50">`
    expect(readSvgSize(text)).toEqual({ width: 50, height: 50 })
  })

  it('没有尺寸信息 → null(交给调用方放行)', () => {
    expect(readSvgSize('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull()
    expect(readSvgSize('<html></html>')).toBeNull()
    expect(readSvgSize('')).toBeNull()
    expect(readSvgSize(null)).toBeNull()
  })

  it('非文本入参 → null', () => {
    expect(readSvgSize(pngHeader(10, 10))).toBeNull()
  })
})

describe('SVG 像素门控(小文件大像素的绕过路径)', () => {
  it('几 KB 的 SVG 声明上万像素时被拦下', () => {
    // 这正是 SVG 必须单独处理的原因:PNG/JPEG 的像素门控读文件头,
    // 对文本格式完全失效,一个 60 字节的 SVG 能解出上百亿像素。
    const huge = '<svg width="50000" height="50000"></svg>'
    expect(huge.length).toBeLessThan(100)
    expect(checkImagePixels(huge)).toBe('tooManyPixels')
  })

  it('正常尺寸的 SVG 放行', () => {
    expect(checkImagePixels('<svg width="800" height="600"></svg>')).toBeNull()
  })

  it('readImageSize 对字符串走 SVG 分支,对字节走 PNG/JPEG 分支', () => {
    expect(readImageSize('<svg viewBox="0 0 64 32"></svg>')).toEqual({ width: 64, height: 32 })
    expect(readImageSize(pngHeader(64, 32))).toEqual({ width: 64, height: 32 })
  })
})

describe('ensureSvgSize', () => {
  it('只有 viewBox 时补上显式宽高(否则 <img> 按 300×150 解码)', () => {
    const out = ensureSvgSize('<svg viewBox="0 0 200 200"><rect/></svg>')
    expect(out).toContain('width="200"')
    expect(out).toContain('height="200"')
    // viewBox 必须保留:它决定内容坐标系,删了图形会错位
    expect(out).toContain('viewBox="0 0 200 200"')
  })

  it('已有宽高则原样返回(不碰用户文件)', () => {
    const src = '<svg width="800" height="600"><rect/></svg>'
    expect(ensureSvgSize(src)).toBe(src)
  })

  it('已有 px 单位也算显式宽高', () => {
    const src = '<svg width="800px" height="600px"><rect/></svg>'
    expect(ensureSvgSize(src)).toBe(src)
  })

  it('只缺一个维度时只补那一个', () => {
    const out = ensureSvgSize('<svg width="500" viewBox="0 0 500 400"><rect/></svg>')
    expect(out).toContain('width="500"')
    expect(out).toContain('height="400"')
    // 原有的 width 不该被重复插入
    expect(out.match(/width="500"/g)).toHaveLength(1)
  })

  it('没有 viewBox 也没有宽高 → 原样返回(无从推断)', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    expect(ensureSvgSize(src)).toBe(src)
  })

  it('相对单位(100%)不算显式尺寸,用 viewBox 补', () => {
    const out = ensureSvgSize('<svg width="100%" height="100%" viewBox="0 0 640 480"><rect/></svg>')
    expect(out).toContain('width="640"')
    expect(out).toContain('height="480"')
  })

  it('非 SVG 文本 / 空值原样返回', () => {
    expect(ensureSvgSize('<html></html>')).toBe('<html></html>')
    expect(ensureSvgSize('')).toBe('')
    expect(ensureSvgSize(null)).toBeNull()
  })

  it('补完的尺寸能被 readSvgSize 读回(两个函数口径一致)', () => {
    const out = ensureSvgSize('<svg viewBox="0 0 128 64"><rect/></svg>')
    expect(readSvgSize(out)).toEqual({ width: 128, height: 64 })
  })
})

describe('isSvgFile / readImageHead', () => {
  const makeFile = (content, { type = 'image/svg+xml', name = 'a.svg' } = {}) => {
    const blob = new Blob([content], { type })
    // Blob.type 是只读 getter,File 语义需要可覆盖的 name/type
    return Object.defineProperty(blob, 'name', { value: name, configurable: true })
  }

  it('按 MIME 识别 SVG', () => {
    expect(isSvgFile({ type: 'image/svg+xml' })).toBe(true)
    expect(isSvgFile({ type: 'image/png' })).toBe(false)
  })

  it('MIME 缺失时退化到扩展名', () => {
    expect(isSvgFile({ type: '', name: 'chart.svg' })).toBe(true)
    expect(isSvgFile({ type: '', name: 'CHART.SVG' })).toBe(true)
    expect(isSvgFile({ type: '', name: 'chart.png' })).toBe(false)
  })

  it('空入参不算 SVG', () => {
    expect(isSvgFile(null)).toBe(false)
    expect(isSvgFile({})).toBe(false)
  })

  it('SVG 文件读成文本,PNG 文件读成字节', async () => {
    const svgHead = await readImageHead(makeFile('<svg width="10" height="10"></svg>'))
    expect(typeof svgHead).toBe('string')
    expect(svgHead).toContain('<svg')

    const pngHead = await readImageHead(makeFile(pngHeader(10, 10), { type: 'image/png', name: 'a.png' }))
    expect(pngHead).toBeInstanceOf(Uint8Array)
  })

  it('读失败返回 null(调用方放行,不阻断)', async () => {
    expect(await readImageHead({ slice: () => { throw new Error('boom') } })).toBeNull()
  })
})
