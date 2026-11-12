/**
 * OG Function(api/share-preview/[id].js)集成联调测试。
 *
 * 直接调用默认导出的 handler(req, res),覆盖全部状态码与注入边界:
 *   · 状态码:405 / 404 / 410 / 502 / 200,以及壳不可用时的降级;
 *   · 注入:canonical/og:url、og:image 白名单路径、HTML 转义与 $& 不展开、
 *     description 160 字截断、CRLF 壳、data-rh 清理语义;
 *   · 缓存:壳 5 分钟内存缓存只读一次文件。
 *
 * node:fs/promises 与 global.fetch 全部替换,不触网、不读真实文件;
 * vi.resetModules 隔离模块级 shellCache。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('node:fs/promises', () => {
  const readFile = vi.fn()
  return { readFile, default: { readFile } }
})

const { readFile } = await import('node:fs/promises')

const SITE_URL = 'https://tangnotes.site'
const SB_BASE = 'https://sb.example.com'
const UUID = '550e8400-e29b-41d4-a716-446655440000'

const SHELL_LF = `<!doctype html>
<html lang="zh-CN">
<head>
  <title>拼豆 Studio - 免费在线拼豆图纸设计</title>
  <meta name="description" content="站点级描述" data-rh="true" />
  <meta name="robots" content="index, follow" data-rh="true" />
  <meta property="og:title" content="站点标题" data-rh="true" />
  <meta property="og:description" content="站点级描述" data-rh="true" />
  <meta property="og:image" content="https://tangnotes.site/og-image.png" data-rh="true" />
  <meta name="twitter:title" content="站点标题" data-rh="true" />
  <meta name="twitter:description" content="站点级描述" data-rh="true" />
  <meta name="twitter:image" content="https://tangnotes.site/og-image.png" data-rh="true" />
</head>
<body><div id="root"></div></body>
</html>
`

function makeResponse({ body, status = 200, ok = true }) {
  return { ok, status, json: async () => body }
}

/** 构造 req/res 替身,收集响应 */
async function callHandler(handler, { method = 'GET', id = UUID, headers } = {}) {
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
  await handler({ method, query: { id }, headers }, res)
  return res
}

/** 每个用例重置模块(清 shellCache)后重新加载 handler */
async function loadHandler() {
  vi.resetModules()
  const mod = await import('../[id].js')
  return mod.default
}

/** 安装默认环境与壳文件 */
function stubDefaults(shellText = SHELL_LF) {
  vi.stubEnv('SITE_URL', SITE_URL)
  vi.stubEnv('SUPABASE_URL', SB_BASE)
  // handler 优先读取客户端侧的 VITE_ 变量(publishable key),旧名兜底;
  // 测试环境里两者都钉死,避免命中 .env.local 的真实 key
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key')
  readFile.mockReset()
  readFile.mockResolvedValue(shellText)
}

const restUrl = () =>
  `${SB_BASE}/rest/v1/work_shares?id=eq.${encodeURIComponent(UUID)}&select=id,title,description,author_label,grid_width,grid_height,palette_id,preview_image_path`

const publishedRow = (overrides = {}) => ({
  id: UUID,
  title: '雪景小屋',
  description: '冬日雪景',
  author_label: '拼豆创作者',
  grid_width: 9,
  grid_height: 9,
  palette_id: 'perler',
  preview_image_path: `${UUID}/r1.png`,
  ...overrides,
})

describe('OG Function 方法与 ID 边界', () => {
  let handler
  beforeEach(() => {
    stubDefaults()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('非 GET/HEAD → 405 + Allow 头,不查询数据库', async () => {
    handler = await loadHandler()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await callHandler(handler, { method: 'POST' })
    expect(res.statusCode).toBe(405)
    expect(res.headers.allow).toBe('GET, HEAD')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('非法 UUID → 404 + noindex, nofollow + 兜底标题,不查数据库', async () => {
    handler = await loadHandler()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const id of ['abc', '../../etc', `${UUID}/extra`, '']) {
      const res = await callHandler(handler, { id })
      expect(res.statusCode).toBe(404)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body).toContain('<title>分享不存在或已被撤销 - 拼豆Studio</title>')
      expect(res.body).toContain('noindex, nofollow')
      expect(res.body).not.toContain('rel="canonical"')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('HEAD 与 GET 走同一逻辑', async () => {
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [publishedRow()] })))
    const res = await callHandler(handler, { method: 'HEAD' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('雪景小屋')
  })
})

describe('OG Function 数据边界与状态码', () => {
  let handler
  beforeEach(() => {
    stubDefaults()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('RLS 不可见(空数组)→ 410 + noindex, nofollow,不注入 canonical/og:image', async () => {
    handler = await loadHandler()
    const fetchMock = vi.fn(async url => {
      expect(url).toBe(restUrl())
      expect(url.get).toBeUndefined()
      return makeResponse({ body: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await callHandler(handler)
    expect(res.statusCode).toBe(410)
    expect(res.body).toContain('noindex, nofollow')
    expect(res.body).toContain('<title>分享不存在或已被撤销 - 拼豆Studio</title>')
    expect(res.body).not.toContain('rel="canonical"')
    expect(res.headers['cache-control']).toBe('no-store')
    // 匿名 REST 请求带 apikey + Bearer
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers.apikey).toBe('anon-key')
    expect(init.headers.Authorization).toBe('Bearer anon-key')
  })

  it('REST 500 / 网络拒绝 → 502,壳保持原样', async () => {
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: {}, ok: false, status: 500 })))
    const res = await callHandler(handler)
    expect(res.statusCode).toBe(502)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toContain('<title>拼豆 Studio - 免费在线拼豆图纸设计</title>')

    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    const res2 = await callHandler(handler)
    expect(res2.statusCode).toBe(502)
    expect(res2.headers['cache-control']).toBe('no-store')
  })

  it('缺少服务端环境变量 → 502,绝不带上空鉴权头外发', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_URL', '')
    handler = await loadHandler()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await callHandler(handler)
    expect(res.statusCode).toBe(502)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('200 成功:白名单注入 + canonical/og:url + noindex, follow + 短 CDN 缓存', async () => {
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [publishedRow()] })))
    const res = await callHandler(handler)
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('s-maxage=60, stale-while-revalidate=300')
    expect(res.body).toContain(`<title>雪景小屋 - 拼豆图纸分享 - 拼豆Studio</title>`)
    expect(res.body).toContain('<meta name="robots" content="noindex, follow" data-rh="true"')
    expect(res.body).toContain(`<link rel="canonical" href="${SITE_URL}/share/${UUID}" data-rh="true"`)
    expect(res.body).toContain(`<meta property="og:url" content="${SITE_URL}/share/${UUID}" data-rh="true"`)
    expect(res.body).toContain('<meta name="description" content="冬日雪景 · 尺寸 9 × 9" data-rh="true"')
    expect(res.body).toContain('<meta property="og:title" content="雪景小屋 - 拼豆图纸分享 - 拼豆Studio" data-rh="true"')
    // 站点级旧值全部被替换
    expect(res.body).not.toContain('站点级描述')
    expect(res.body).not.toContain('>站点标题<')
  })

  it('og:image 只接受 <uuid>/r1.png;注入路径与代理前缀一致', async () => {
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [publishedRow()] })))
    const res = await callHandler(handler)
    expect(res.body).toContain(
      `<meta property="og:image" content="${SITE_URL}/sb/storage/v1/object/public/work-share-cards/${UUID}/r1.png" data-rh="true"`
    )
    expect(res.body).toContain(
      `<meta name="twitter:image" content="${SITE_URL}/sb/storage/v1/object/public/work-share-cards/${UUID}/r1.png" data-rh="true"`
    )
  })

  it('VITE_SUPABASE_ANON_KEY 优先于已停用的 legacy SUPABASE_ANON_KEY', async () => {
    // 回归:Supabase 2026-10-24 停用 legacy anon JWT 后,函数若先读
    // SUPABASE_ANON_KEY 会对 REST 拿到 401 → 全站分享页 502
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'publishable-key')
    vi.stubEnv('SUPABASE_ANON_KEY', 'legacy-jwt')
    handler = await loadHandler()
    const fetchMock = vi.fn(async () => makeResponse({ body: [publishedRow()] }))
    vi.stubGlobal('fetch', fetchMock)
    await callHandler(handler)
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers.apikey).toBe('publishable-key')
    expect(init.headers.Authorization).toBe('Bearer publishable-key')
  })

  it('无 SITE_URL 时 canonical/og:image 落到生产域常量,不取请求 Host 也不取部署域名', async () => {
    // 安全回归(审计 run-2 #21):请求 host(x-forwarded-host)可伪造,曾可污染
    // canonical/og:url;VERCEL_URL 是部署域名(带访问保护),og:image 会失效。
    // 新兜底链:显式 env → VERCEL_PROJECT_PRODUCTION_URL → 生产域常量。
    vi.stubEnv('SITE_URL', '')
    vi.stubEnv('VITE_SITE_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    vi.stubEnv('VERCEL_URL', 'pin-bead-studio-abc123.vercel.app')
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [publishedRow()] })))
    const res = await callHandler(handler, {
      headers: { 'x-forwarded-host': 'evil.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(res.body).toContain(`<link rel="canonical" href="https://tangnotes.site/share/${UUID}" data-rh="true"`)
    expect(res.body).toContain(
      `<meta property="og:image" content="https://tangnotes.site/sb/storage/v1/object/public/work-share-cards/${UUID}/r1.png" data-rh="true"`
    )
    expect(res.body).not.toContain('evil.example.com')
    expect(res.body).not.toContain('pin-bead-studio-abc123.vercel.app')
  })

  it.each([
    ['目录穿越', '../../secret/r1.png'],
    ['查询注入', `${UUID}/r1.png?x=1`],
    ['HTML 注入', '"><script>alert(1)</script>'],
    ['非字符串', null],
  ])('preview_image_path %s → 不注入 og:image', async (_name, badPath) => {
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [publishedRow({ preview_image_path: badPath })] })))
    const res = await callHandler(handler)
    expect(res.statusCode).toBe(200)
    // 壳里的站点占位图不再出现,也没有注入非法路径
    expect(res.body).not.toContain('work-share-cards')
    expect(res.body).not.toContain('<script>alert(1)</script>')
    expect(res.body).toContain('og-image.png')
  })
})

describe('OG Function 注入安全边界', () => {
  let handler
  beforeEach(() => {
    stubDefaults()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('标题中的 HTML 与 $& 均被转义/原样,不被展开', async () => {
    handler = await loadHandler()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({ body: [publishedRow({ title: `<img src=x onerror=alert(1)> "$&"'` })] })
      )
    )
    const res = await callHandler(handler)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(
      '<title>&lt;img src=x onerror=alert(1)&gt; &quot;$&amp;&quot;&#39; - 拼豆图纸分享 - 拼豆Studio</title>'
    )
    expect(res.body).not.toContain('<img src=x')
    expect(res.body).not.toContain('onerror=alert(1)> -')
  })

  it('描述超 160 字被截断并以 … 结尾;空白被压缩', async () => {
    handler = await loadHandler()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ body: [publishedRow({ description: `A${' 很长 '.repeat(80)}` })] }))
    )
    const res = await callHandler(handler)
    const match = res.body.match(/<meta name="description" content="([^"]*)"/)
    expect(match).not.toBeNull()
    const description = match[1]
    expect(description.endsWith('…')).toBe(true)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).not.toMatch(/  /)
  })

  it('空标题/空描述回退为纯后缀标题与仅尺寸描述', async () => {
    handler = await loadHandler()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ body: [publishedRow({ title: '', description: '' })] }))
    )
    const res = await callHandler(handler)
    expect(res.body).toContain('<title> - 拼豆图纸分享 - 拼豆Studio</title>')
    expect(res.body).toContain('<meta name="description" content="尺寸 9 × 9" data-rh="true"')
  })

  it('CRLF 壳:canonical/og:url 用同样换行,不出现在同一行乱序', async () => {
    vi.stubEnv('SITE_URL', SITE_URL)
    vi.stubEnv('SUPABASE_URL', SB_BASE)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key')
    readFile.mockReset()
    readFile.mockResolvedValue(SHELL_LF.replace(/\n/g, '\r\n'))
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [publishedRow()] })))
    const res = await callHandler(handler)
    expect(res.body).toContain(`noindex, follow" data-rh="true" />\r\n  <link rel="canonical"`)
  })
})

describe('OG Function 壳加载与缓存', () => {
  let handler
  beforeEach(() => {
    vi.stubEnv('SITE_URL', SITE_URL)
    vi.stubEnv('SUPABASE_URL', SB_BASE)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('壳文件缺失且线上回退失败:404/410/502 降级为纯文本壳', async () => {
    readFile.mockReset()
    readFile.mockRejectedValue(new Error('ENOENT'))
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: {}, ok: false, status: 404 })))
    handler = await loadHandler()

    const invalid = await callHandler(handler, { id: 'abc' })
    expect(invalid.statusCode).toBe(404)
    expect(invalid.body).toBe('<!doctype html><title>404</title>')

    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [] })))
    const gone = await callHandler(handler)
    expect(gone.statusCode).toBe(410)
    expect(gone.body).toBe('<!doctype html><title>410</title>')

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const upstream = await callHandler(handler)
    expect(upstream.statusCode).toBe(502)
    expect(upstream.body).toBe('<!doctype html><title>502</title>')
  })

  it('5 分钟壳缓存生效:两次请求只读一次文件', async () => {
    stubDefaults()
    handler = await loadHandler()
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ body: [publishedRow()] })))
    await callHandler(handler)
    await callHandler(handler)
    expect(readFile).toHaveBeenCalledTimes(1)
  })
})
