import { describe, it, expect, afterEach, vi } from 'vitest'
import { isPrivateIp, lookupIpRegion, resetIpRegionCache } from './ipGeolocation'

afterEach(() => {
  resetIpRegionCache()
  vi.unstubAllGlobals()
})

describe('isPrivateIp', () => {
  it('识别内网与保留地址', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.16.0.5', '172.31.255.1', '169.254.1.1', '0.0.0.0', '::1', 'fc00::1', 'localhost', '']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('公网地址返回 false', () => {
    for (const ip of ['8.8.8.8', '114.114.114.114', '172.32.0.1', '2001:db8::1']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })
})

describe('lookupIpRegion', () => {
  it('拼接 国家 / 省 / 市并去重', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, country: '中国', region: '广东省', city: '深圳' }),
    })))
    await expect(lookupIpRegion('114.114.114.114')).resolves.toBe('中国 广东省 深圳')
  })

  it('相邻重复字段只保留一个', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, country: 'Singapore', region: 'Singapore', city: 'Singapore' }),
    })))
    await expect(lookupIpRegion('8.8.8.8')).resolves.toBe('Singapore')
  })

  it('结果缓存:同一 IP 只请求一次', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, country: '中国', region: '北京', city: '北京' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await lookupIpRegion('1.2.3.4')
    await lookupIpRegion('1.2.3.4')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('失败结果同样缓存,刷新前不重试', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down') })
    vi.stubGlobal('fetch', fetchMock)
    await expect(lookupIpRegion('5.6.7.8')).resolves.toBe(null)
    await expect(lookupIpRegion('5.6.7.8')).resolves.toBe(null)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('接口报 success=false 时返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, message: 'Invalid IP' }),
    })))
    await expect(lookupIpRegion('9.9.9.9')).resolves.toBe(null)
  })

  it('内网地址不发请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(lookupIpRegion('192.168.1.10')).resolves.toBe(null)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
