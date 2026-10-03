import { describe, it, expect } from 'vitest'
import { readImageDimensions, INVALID_IMAGE } from './imageDimensions'

function makePngFile(width, height, { truncate = false, badSignature = false } = {}) {
  const buf = new ArrayBuffer(33)
  const view = new DataView(buf)
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  signature.forEach((b, i) => view.setUint8(i, badSignature ? 0x00 : b))
  view.setUint32(8, 13, false) // IHDR chunk length
  ;[0x49, 0x48, 0x44, 0x52].forEach((b, i) => view.setUint8(12 + i, b)) // 'IHDR'
  view.setUint32(16, width, false)
  view.setUint32(20, height, false)
  const bytes = new Uint8Array(buf)
  return new File([truncate ? bytes.slice(0, 10) : bytes], 'test.png', { type: 'image/png' })
}

function makeJpegFile(width, height, { truncate = false } = {}) {
  const bytes = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // segment length = 17
    0x08, // precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, // numComponents
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
  ])
  return new File([truncate ? bytes.slice(0, 6) : bytes], 'test.jpg', { type: 'image/jpeg' })
}

describe('readImageDimensions', () => {
  it('reads width/height from a valid PNG header', async () => {
    await expect(readImageDimensions(makePngFile(800, 600))).resolves.toEqual({ width: 800, height: 600 })
  })

  it('reads oversized dimensions from a PNG header without decoding pixel data', async () => {
    await expect(readImageDimensions(makePngFile(20000, 20000))).resolves.toEqual({ width: 20000, height: 20000 })
  })

  it('rejects a PNG with a corrupted signature', async () => {
    await expect(readImageDimensions(makePngFile(800, 600, { badSignature: true }))).resolves.toBe(INVALID_IMAGE)
  })

  it('rejects a truncated PNG', async () => {
    await expect(readImageDimensions(makePngFile(800, 600, { truncate: true }))).resolves.toBe(INVALID_IMAGE)
  })

  it('reads width/height from a valid JPEG SOF0 header', async () => {
    await expect(readImageDimensions(makeJpegFile(1920, 1080))).resolves.toEqual({ width: 1920, height: 1080 })
  })

  it('reads oversized dimensions from a JPEG SOF0 header without decoding pixel data', async () => {
    await expect(readImageDimensions(makeJpegFile(20000, 20000))).resolves.toEqual({ width: 20000, height: 20000 })
  })

  it('rejects a truncated JPEG with no SOF marker reachable', async () => {
    await expect(readImageDimensions(makeJpegFile(1920, 1080, { truncate: true }))).resolves.toBe(INVALID_IMAGE)
  })

  it('returns null for formats it does not parse (byte-size gate still applies)', async () => {
    const file = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], 'test.gif', { type: 'image/gif' })
    await expect(readImageDimensions(file)).resolves.toBe(null)
  })
})
