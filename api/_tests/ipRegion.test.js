/**
 * /api/ip-region 处理器测试(全部 fetch 替换,不触网)。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import handler, { __resetIpRegionServerCache } from '../ip-region.js'

const BASE = 'https://sb.example.com'

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(payload) {
      this.body = payload
    },
  }
}

async function callHandler({ method = 'POST', headers = {}, body = { ips: [] } } = {}) {
  const res = makeRes()
  await handler({ method, headers, body }, res)
  return {
    status: res.statusCode,
    headers: res.headers,
    json: res.body ? JSON.parse(res.body) : null,
  }
}

function installFetch({ isAdmin = true, regionData = null } = {}) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes('/rest/v1/rpc/is_admin')) {
      return { ok: true, status: 200, json: async () => isAdmin }
    }
    if (String(url).startsWith('https://ipwho.is/')) {
      return { ok: true, status: 200, json: async () => regionData }
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = BASE
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
  __resetIpRegionServerCache()
})

afterEach(() => {
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_ANON_KEY
  vi.unstubAllGlobals()
  __resetIpRegionServerCache()
})

describe('/api/ip-region', () => {
  it('拒绝非 POST', async () => {
    installFetch()
    const res = await callHandler({ method: 'GET' })
    expect(res.status).toBe(405)
  })

  it('没有会话令牌返回 401', async () => {
    installFetch()
    const res = await callHandler({ body: { ips: ['8.8.8.8'] } })
    expect(res.status).toBe(401)
  })

  it('非管理员返回 403', async () => {
    installFetch({ isAdmin: false })
    const res = await callHandler({
      headers: { authorization: 'Bearer user-jwt' },
      body: { ips: ['8.8.8.8'] },
    })
    expect(res.status).toBe(403)
  })

  it('管理员查询返回规范化地区', async () => {
    const fetchMock = installFetch({
      regionData: { success: true, country: '中国', region: '江苏省', city: '南京市' },
    })
    const res = await callHandler({
      headers: { authorization: 'Bearer admin-jwt' },
      body: { ips: ['114.114.114.114'] },
    })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ regions: { '114.114.114.114': '中国 江苏 南京' } })
    // 只请求一次 is_admin + 一次供应商
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('跳过内网与非法地址,不发送给供应商', async () => {
    const fetchMock = installFetch()
    const res = await callHandler({
      headers: { authorization: 'Bearer admin-jwt' },
      body: { ips: ['192.168.1.10', 'localhost', 'not-an-ip'] },
    })
    expect(res.status).toBe(200)
    expect(res.json.regions).toEqual({
      '192.168.1.10': null,
      localhost: null,
      'not-an-ip': null,
    })
    // 只有 is_admin,没有 ipwho.is
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('结果缓存:同一 IP 第二次不重复请求供应商', async () => {
    const fetchMock = installFetch({
      regionData: { success: true, country: '中国', region: '北京市', city: '北京市' },
    })
    const headers = { authorization: 'Bearer admin-jwt' }
    await callHandler({ headers, body: { ips: ['114.114.114.114'] } })
    const second = await callHandler({ headers, body: { ips: ['114.114.114.114'] } })
    expect(second.json.regions['114.114.114.114']).toBe('中国 北京')
    // 第一次 is_admin + 供应商;第二次只有 is_admin
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
