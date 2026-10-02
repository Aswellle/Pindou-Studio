import { describe, it, expect } from 'vitest'
import {
  checkImageFile,
  checkImagePixels,
  readImageSize,
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
