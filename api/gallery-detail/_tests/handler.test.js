/**
 * 图库详情页存在性校验测试(消除软 404 的核心契约)。
 *
 * 不启动 Vercel:直接调用共享处理器,桩掉 readFile(壳文件)与 fetch(Supabase)。
 * 覆盖:形状校验、存在→200、缺失→404、上游故障→200 兜底、方法限制。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }))

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
  // 部分命名空间导入会读 default,补上避免 mock 恢复失败
  default: { readFile: readFileMock },
}))

import { readFile } from 'node:fs/promises'
import { handleGalleryDetail, __resetGalleryDetailShellCache } from '../../_galleryDetail.js'

const SPA_SHELL = '<!doctype html><html><head><title>SPA 壳</title></head><body><div id="root"></div></body></html>'
const NOT_FOUND_SHELL = '<!doctype html><html><head><title>404 壳</title><meta name="robots" content="noindex, nofollow" /></head><body>404</body></html>'

const UUID = '01823ca3-0655-4162-8bff-e532917dfb34'

function makeResponse({ body, status = 200, ok = true }) {
  return { ok, status, json: async () => body }
}

async function callHandler(handler, { method = 'GET', req } = {}) {
  const res = {
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
  await handler({ method, query: {}, headers: {}, ...req }, res)
  return res
}

const callPattern = (value, opts = {}) =>
  callHandler((req, res) => handleGalleryDetail(req, res, { type: 'pattern', value }), opts)
const callTheme = value =>
  callHandler((req, res) => handleGalleryDetail(req, res, { type: 'theme', value }))

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.example.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'publishable-key')
  __resetGalleryDetailShellCache()
  readFile.mockReset()
  readFile.mockImplementation(async file => {
    if (String(file).endsWith('404.html')) return NOT_FOUND_SHELL
    return SPA_SHELL
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('形状校验 · 不合法 id/slug 直接 404 且不发查询', () => {
  it('非 UUID 的 pattern id → 404 + 404 壳', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await callPattern('abc')
    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(NOT_FOUND_SHELL)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('路径穿越/空白 slug → 404', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const bad of ['../etc/passwd', 'a b', '']) {
      const res = await callTheme(bad)
      expect(res.statusCode).toBe(404)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('存在性判定', () => {
  it('pattern 存在 → 200 + SPA 壳(构建后新增内容的直链仍可用)', async () => {
    const fetchMock = vi.fn(async () => makeResponse({ body: [{ id: UUID }] }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await callPattern(UUID)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(SPA_SHELL)
    // 查询口径:公开白名单字段只取 id,RLS 兜底权限
    const url = fetchMock.mock.calls[0][0]
    expect(url).toBe(`https://sb.example.co/rest/v1/templates?id=eq.${UUID}&select=id&limit=1`)
  })

  it('pattern 不存在 → 404(消除软 404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [] })))
    const res = await callPattern(UUID)
    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(NOT_FOUND_SHELL)
  })

  it('theme/collection 只认已发布:查询带 status=eq.published', async () => {
    const fetchMock = vi.fn(async () => makeResponse({ body: [{ id: 'x' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await callTheme('spring')
    expect(res.statusCode).toBe(200)
    const url = fetchMock.mock.calls[0][0]
    expect(url).toBe('https://sb.example.co/rest/v1/gallery_themes?slug=eq.spring&status=eq.published&select=id&limit=1')
  })

  it('未发布的 theme(RLS 返回空)→ 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [] })))
    const res = await callTheme('draft-theme')
    expect(res.statusCode).toBe(404)
  })
})

describe('上游故障与兜底', () => {
  it('REST 5xx → 200 + SPA 壳(不把临时故障固化成 404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: {}, ok: false, status: 503 })))
    const res = await callPattern(UUID)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(SPA_SHELL)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('网络异常 → 200 兜底', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    const res = await callPattern(UUID)
    expect(res.statusCode).toBe(200)
  })

  it('壳文件缺失时 404 降级为纯文本 404 页(仍带 noindex)', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [] })))
    const res = await callPattern(UUID)
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('noindex, nofollow')
    expect(res.body).toContain('页面不存在')
  })

  it('非 GET/HEAD → 405', async () => {
    const res = await callPattern(UUID, { method: 'POST' })
    expect(res.statusCode).toBe(405)
  })
})
