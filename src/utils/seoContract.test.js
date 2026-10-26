import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isKnownPath } from './seoPath'

/**
 * SEO 落地契约(防回归)。
 *
 * 这组断言锁的是「四家搜索引擎共同要求、而项目曾经不满足」的几件事:
 *   1. 可收录页的原始 HTML 必须自带正文与站内链接(百度/搜狗/360 不执行 JS);
 *   2. 不存在的 URL 必须返回 404,不能是 200 的首页副本(软 404);
 *   3. noindex 页不能被 robots.txt 屏蔽(否则爬虫读不到 noindex);
 *   4. 单语页不能声明多语言 hreflang(否则整组被判无效)。
 *
 * 断言读源码文本而不是跑构建 —— 构建要联网拉 Supabase,不该进单测。
 */

const ROOT = process.cwd()
const PRERENDER = readFileSync(join(ROOT, 'scripts', 'generate-prerender-html.js'), 'utf8')
const VERCEL = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
const ROBOTS = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf8')
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8')
const APP = readFileSync(join(ROOT, 'src', 'App.jsx'), 'utf8')

describe('静态正文 · 首页不再是空壳', () => {
  it('首页被纳入 ROOT_STATIC', () => {
    expect(PRERENDER).toMatch(/'\/':\s*homeStatic\(\)/)
  })

  it('首页静态正文含 h1 与站内链接', () => {
    const fn = PRERENDER.slice(PRERENDER.indexOf('function homeStatic'))
    const body = fn.slice(0, fn.indexOf('\n// 供脚本按路由取静态正文'))
    expect(body).toContain('<h1>')
    expect(body).toContain('siteNav(')
  })

  it('预渲染正文带 <a href> 站内链接(四家引擎都要求可抓取内链)', () => {
    expect(PRERENDER).toContain('function link(href, text)')
    expect(PRERENDER).toMatch(/<a href="\$\{href\}">/)
    // 三个内容页都要挂底部导航
    expect(PRERENDER).toContain("siteNav('/')")
    expect(PRERENDER).toContain("siteNav('/gallery')")
    expect(PRERENDER).toContain("siteNav('/tutorials')")
  })
})

describe('软 404 · 不存在的 URL 不再回退成首页', () => {
  it('兜底 rewrite 不再是无差别的 /:path*', () => {
    const catchAll = VERCEL.rewrites.find((r) => r.source === '/:path*')
    expect(catchAll).toBeUndefined()
  })

  it('SPA 兜底壳指向不带静态正文的空壳,而不是首页', () => {
    const dynamic = VERCEL.rewrites.filter((r) => r.destination === '/spa.html')
    expect(dynamic.length).toBeGreaterThan(0)
    // 首页那份 HTML 带静态正文,拿来当兜底会让同一份正文出现在任意多个 URL 上
    expect(VERCEL.rewrites.some((r) => r.destination === '/index.html')).toBe(false)
  })

  it('SPA 兜底壳不自称 canonical 指向首页(否则新内容被判为首页副本)', () => {
    // 壳服务任意动态 URL,声明 canonical=/ 等于把它们全部排除索引。
    // 正确做法是删掉 canonical/og:url/hreflang,由 React 挂载后 Helmet 按真实路由写入。
    const spa = PRERENDER.slice(PRERENDER.indexOf('const spaHtml'))
    const block = spa.slice(0, spa.indexOf('fs.writeFileSync'))
    expect(block).not.toMatch(/<link rel="canonical" href="\$\{SITE\}\/"/)
    expect(block).toContain('.replace(/\\s*<link rel="canonical"')
    expect(block).toContain('.replace(HREFLANG_BLOCK_RE, \'\')')
  })

  it('三类图库详情路由仍可达', () => {
    const sources = VERCEL.rewrites.map((r) => r.source)
    for (const s of ['/gallery/theme/:slug', '/gallery/collection/:slug', '/gallery/pattern/:id']) {
      expect(sources).toContain(s)
    }
  })

  it('App.jsx 里声明的每条路由都有 rewrite 或静态文件兜底', () => {
    // 去掉 `/:path*` 兜底之后,漏写一条 rewrite 就等于让该路由直接 404。
    // 这条断言把「新增路由」与「新增 rewrite」绑在一起,避免静默掉页。
    const declared = [...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1])
    expect(declared.length).toBeGreaterThan(10)

    const toRegex = (src) => new RegExp(
      `^${src.split('/').map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')}$`,
    )
    const rewriteMatchers = VERCEL.rewrites
      .filter((r) => r.source.startsWith('/') && !r.source.startsWith('/sb/'))
      .map((r) => toRegex(r.source))

    for (const route of declared) {
      if (route === '*' || route === '/') continue // `/` 由 dist/index.html 直接服务
      // 静态文件只覆盖「单段路由且确实预渲染过」的情形(/gallery、/admin 等);
      // /admin/login 不能因为 admin.html 存在就算通过 —— 它必须有自己的 rewrite。
      const segments = route.split('/').filter(Boolean)
      const hasStatic = segments.length === 1
        && VERCEL.redirects.some((r) => r.source === `/${segments[0]}.html`)
      const hasRewrite = rewriteMatchers.some((re) => re.test(route))
      expect(hasStatic || hasRewrite, `${route} 没有 rewrite 兜底,上线后会 404`).toBe(true)
    }
  })

  it('构建期产出 404 页,且标 noindex', () => {
    expect(PRERENDER).toContain("'404.html'")
    expect(PRERENDER).toMatch(/404\.html[\s\S]{0,400}noindex, nofollow/)
  })

  it('客户端不再把未匹配路由静默重定向到首页', () => {
    expect(APP).not.toContain('<Navigate to="/" replace />')
    expect(APP).toContain('<NotFoundPage />')
  })
})

describe('isKnownPath · 已知路由判定', () => {
  it('真实路由返回 true', () => {
    for (const p of ['/', '/gallery', '/tutorials', '/login', '/profile', '/admin',
      '/admin/login', '/admin/dashboard', '/create/image', '/import', '/my/beads',
      '/contact', '/privacy', '/terms']) {
      expect(isKnownPath(p)).toBe(true)
    }
  })

  it('动态详情页与法务历史版本返回 true', () => {
    expect(isKnownPath('/gallery/theme/spring')).toBe(true)
    expect(isKnownPath('/gallery/collection/pets')).toBe(true)
    expect(isKnownPath('/gallery/pattern/abc-123')).toBe(true)
    expect(isKnownPath('/privacy/v2')).toBe(true)
    expect(isKnownPath('/terms/v1')).toBe(true)
  })

  it('未知路径返回 false', () => {
    for (const p of ['/nope', '/gallery/whatever', '/gallery/theme', '/gallery/theme/a/b',
      '/admin/whatever', '/login/extra', '', null]) {
      expect(isKnownPath(p)).toBe(false)
    }
  })

  it('末尾斜杠不影响判定', () => {
    expect(isKnownPath('/gallery/')).toBe(true)
    expect(isKnownPath('/gallery/theme/spring/')).toBe(true)
  })
})

describe('robots.txt · 抓取与索引分离', () => {
  it('不屏蔽 noindex 页(否则爬虫读不到 noindex)', () => {
    // 这些页面在 App.jsx 的 SEO_CONFIG 里是 noindex,必须允许抓取
    for (const p of ['/admin', '/profile', '/login']) {
      expect(ROBOTS).not.toContain(`Disallow: ${p}\n`)
    }
  })

  it('仍屏蔽敏感路径与部署内部路径', () => {
    expect(ROBOTS).toContain('Disallow: /api/')
    expect(ROBOTS).toContain('Disallow: /_vercel/')
  })

  it('声明 sitemap 绝对地址', () => {
    expect(ROBOTS).toContain('Sitemap: https://tangnotes.site/sitemap.xml')
  })
})

describe('单语页 · hreflang 不声明不存在的语言版本', () => {
  it('隐私 / 条款标记为 singleLanguage', () => {
    const privacy = PRERENDER.slice(PRERENDER.indexOf("file: 'privacy.html'"))
    expect(privacy.slice(0, 300)).toContain('singleLanguage: true')
    const terms = PRERENDER.slice(PRERENDER.indexOf("file: 'terms.html'"))
    expect(terms.slice(0, 300)).toContain('singleLanguage: true')
  })

  it('singleLanguage 只输出 zh-CN 与 x-default', () => {
    expect(PRERENDER).toContain("singleLanguage ? ['zh-CN', 'x-default'] : LANGS")
  })

  it('运行时 Helmet 与预渲染一致:单语页不声明 en/ja/ko', () => {
    // 预渲染写 2 条、Helmet 首帧补回 5 条,静态修正等于白做 —— 两边必须同源。
    expect(APP).toMatch(/privacy:\s*\{[\s\S]{0,600}?singleLanguage:\s*true/)
    expect(APP).toMatch(/terms:\s*\{[\s\S]{0,600}?singleLanguage:\s*true/)
    expect(APP).toContain("seo.singleLanguage ? LANGUAGES.filter(l => l.code === 'zh-CN') : LANGUAGES")
  })
})

describe('首页 head · 标题与描述长度', () => {
  it('title 不超过 40 个汉字量级(百度 PC 约 30 汉字截断)', () => {
    const title = (INDEX_HTML.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
    expect(title.length).toBeGreaterThan(10)
    expect(title.length).toBeLessThanOrEqual(40)
  })

  it('description 不超过 90 字', () => {
    const desc = (INDEX_HTML.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ''
    expect(desc.length).toBeGreaterThan(40)
    expect(desc.length).toBeLessThanOrEqual(90)
  })

  it('keywords 收敛到 10 个以内(堆砌无收益且有风险)', () => {
    const kw = (INDEX_HTML.match(/<meta name="keywords" content="([^"]*)"/) || [])[1] || ''
    expect(kw.split(',').length).toBeLessThanOrEqual(10)
  })
})

describe('head 标签 · Helmet 接管不留重复', () => {
  // react-helmet-async 的 updateTags 只清理 head.querySelectorAll('meta[data-rh]')
  // 命中的旧标签。预渲染写死的标签不带 data-rh 时,首帧会再追加一份 ——
  // 页面出现两条 canonical / 两条 robots / 两条 description。
  it('index.html 的 Helmet 托管标签都带 data-rh', () => {
    for (const re of [
      /<meta name="description"[^>]*data-rh="true"/,
      /<meta name="robots"[^>]*data-rh="true"/,
      /<link rel="canonical"[^>]*data-rh="true"/,
      /<meta property="og:title"[^>]*data-rh="true"/,
      /<meta property="og:description"[^>]*data-rh="true"/,
      /<meta property="og:url"[^>]*data-rh="true"/,
      /<meta property="og:image" content[^>]*data-rh="true"/,
      /<meta name="twitter:card"[^>]*data-rh="true"/,
      /<link rel="alternate" hreflang="zh-CN"[^>]*data-rh="true"/,
      /<link rel="alternate" hreflang="x-default"[^>]*data-rh="true"/,
    ]) {
      expect(INDEX_HTML).toMatch(re)
    }
  })

  it('Helmet 不渲染的标签保持不带 data-rh(否则首帧会被当旧标签删掉)', () => {
    // keywords / og:site_name / og:locale / og:image:尺寸与 alt 都不在
    // App.jsx 的 seoHelmet 与 ContentSeo.jsx 的渲染集合里
    for (const re of [
      /<meta name="keywords"[^>]*>/,
      /<meta property="og:site_name"[^>]*>/,
      /<meta property="og:locale" content[^>]*>/,
      /<meta property="og:image:width"[^>]*>/,
      /<meta property="og:image:height"[^>]*>/,
      /<meta property="og:image:alt"[^>]*>/,
    ]) {
      const tag = (INDEX_HTML.match(re) || [''])[0]
      expect(tag).not.toContain('data-rh')
    }
  })

  it('预渲染改写保留 data-rh(两条产出路径都要)', () => {
    // 匹配式用 [^>]*> 收尾,容忍结尾的 data-rh;写成 \s*\/?> 会静默失配,
    // 页面照常产出、只是 meta 没改写成功 —— 所以这里锁住替换式本身。
    expect(PRERENDER).toContain('const HEAD_ATTR')
    // description / robots / canonical / og:url / og:title / og:description
    // 在 spa.html、404.html、PAGES 三处都要带上
    const uses = PRERENDER.match(/\$\{HEAD_ATTR\}/g) || []
    expect(uses.length).toBeGreaterThanOrEqual(9)
    const SNAPSHOT = readFileSync(join(ROOT, 'src', 'features', 'gallery', 'ogSnapshot.js'), 'utf8')
    expect(SNAPSHOT).toContain('const RH = \' data-rh="true"\'')
  })
})
