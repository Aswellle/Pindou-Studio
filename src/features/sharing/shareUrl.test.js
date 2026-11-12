import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  SITE_ORIGIN,
  currentOrigin,
  sharePath,
  shareUrl,
  isSharePath,
  shareIdFromPath,
} from './shareUrl'

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UPPER = '550E8400-E29B-41D4-A716-446655440000'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sharePath / shareUrl', () => {
  it('sharePath 生成站内路径', () => {
    expect(sharePath(UUID)).toBe(`/share/${UUID}`)
  })

  it('默认按当前访问环境生成链接(浏览器运行时)', () => {
    vi.stubGlobal('window', { location: { origin: 'http://192.168.0.105:5283' } })
    expect(shareUrl(UUID)).toBe(`http://192.168.0.105:5283/share/${UUID}`)
  })

  it('非浏览器环境回退生产 canonical 域名', () => {
    vi.stubGlobal('window', undefined)
    expect(shareUrl(UUID)).toBe(`${SITE_ORIGIN}/share/${UUID}`)
    expect(currentOrigin()).toBe(SITE_ORIGIN)
  })

  it('显式传 origin 优先于运行时环境,并去掉末尾斜杠', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5283' } })
    expect(shareUrl(UUID, 'https://example.com/')).toBe(`https://example.com/share/${UUID}`)
    expect(shareUrl(UUID)).toBe(`http://localhost:5283/share/${UUID}`)
  })

  it('window.location 缺 origin 时回退生产域名', () => {
    vi.stubGlobal('window', { location: {} })
    expect(shareUrl(UUID)).toBe(`${SITE_ORIGIN}/share/${UUID}`)
  })
})

describe('isSharePath / shareIdFromPath', () => {
  it('只认 UUID 形状', () => {
    expect(isSharePath(`/share/${UUID}`)).toBe(true)
    expect(isSharePath(`/share/${UUID}/`)).toBe(true)
    expect(isSharePath(`/share/${UPPER}`)).toBe(true)
    expect(isSharePath('/share/abc')).toBe(false)
    expect(isSharePath('/share')).toBe(false)
    expect(isSharePath(`/share/${UUID}?x=1`)).toBe(false)
    expect(isSharePath(null)).toBe(false)
  })

  it('shareIdFromPath 提取 UUID,非法返回 null', () => {
    expect(shareIdFromPath(`/share/${UUID}`)).toBe(UUID)
    expect(shareIdFromPath('/share/not-a-uuid')).toBeNull()
    expect(shareIdFromPath('/gallery')).toBeNull()
    expect(shareIdFromPath(undefined)).toBeNull()
  })
})
