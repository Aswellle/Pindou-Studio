import { describe, it, expect, afterEach, vi } from 'vitest'
import { isPrivateIp, lookupIpRegion, lookupIpRegions, resetIpRegionCache } from './ipGeolocation'

afterEach(() => {
  resetIpRegionCache()
  vi.unstubAllGlobals()
})

describe('isPrivateIp', () => {
  it('识别内网、保留与链路本地地址', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.10',
      '172.16.0.5',
      '172.31.255.1',
      '169.254.1.1',
      '100.64.0.1',
      '198.18.0.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      'localhost',
      '',
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('公网地址返回 false', () => {
    for (const ip of ['8.8.8.8', '114.114.114.114', '172.32.0.1', '2001:db8::1']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })
})

describe('lookupIpRegions · 经本站代理查询', () => {
  it('批量请求 /api/ip-region 并缓存结果', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ regions: { '8.8.8.8': '美国 加州 山景城' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await lookupIpRegions(['8.8.8.8'], 'session')
    expect(first).toEqual({ '8.8.8.8': '美国 加州 山景城' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/ip-region', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ips).toEqual(['8.8.8.8'])

    // 缓存命中:不再请求
    const second = await lookupIpRegions(['8.8.8.8'], 'session')
    expect(second).toEqual({ '8.8.8.8': '美国 加州 山景城' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('私网地址不发请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const map = await lookupIpRegions(['192.168.1.10', '127.0.0.1'], 'session')
    expect(map).toEqual({ '192.168.1.10': null, '127.0.0.1': null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('无会话令牌时不发请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(lookupIpRegions(['8.8.8.8'], '')).resolves.toEqual({ '8.8.8.8': null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('代理失败返回 null,下一次刷新前不重复请求', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(lookupIpRegion('8.8.8.8', 'session')).resolves.toBeNull()
    await expect(lookupIpRegion('8.8.8.8', 'session')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
