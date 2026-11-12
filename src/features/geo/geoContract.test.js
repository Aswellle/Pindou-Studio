import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GEO 落地契约(防回归)。
 *
 * 锁的是「AI 检索端能否拿到、能否引用本站」的几件基础设施:
 *   1. robots.txt 对「检索型」与「纯训练型」AI 爬虫的策略不能互相污染;
 *   2. llms.txt / llms-full.txt 由构建期从站内数据生成,不允许出现手写副本;
 *   3. 内容页的主题实体(Article / WebApplication / CollectionPage / FAQPage)
 *      与页面可见内容同源 —— 结构化数据和正文不一致会被判为误导性标记;
 *   4. 工具页的问答在 React 页面与静态快照里取同一份数据。
 *
 * 断言读源码文本而不是跑构建(构建要联网拉 Supabase,不进单测)。
 */

const ROOT = process.cwd()
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8')

const ROBOTS = read('public', 'robots.txt')
const PRERENDER = read('scripts', 'generate-prerender-html.js')
const VERCEL = JSON.parse(read('vercel.json'))
const PKG = JSON.parse(read('package.json'))
const INDEX_HTML = read('index.html')

/** 把 robots.txt 按空行/指令解析成组(只关心 Allow / Disallow / Content-Signal) */
function robotGroups(source) {
  const groups = []
  let current = null
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      // robots.txt 语义:连续多条 User-agent 共享同一组规则
      const last = groups[groups.length - 1]
      if (last && !last.allow.length && !last.disallow.length && !last.signals.length) {
        last.agents.push(value)
        current = last
      } else {
        current = { agents: [value], allow: [], disallow: [], signals: [] }
        groups.push(current)
      }
      continue
    }
    if (!current) continue
    if (key === 'allow') current.allow.push(value)
    else if (key === 'disallow') current.disallow.push(value)
    else if (key === 'content-signal') current.signals.push(value)
  }
  return groups
}

const groups = robotGroups(ROBOTS)
const starGroup = groups.find((g) => g.agents.includes('*'))

describe('robots.txt · AI 检索与训练策略分离', () => {
  const SEARCH_BOTS = [
    'OAI-SearchBot',
    'ChatGPT-User',
    'PerplexityBot',
    'Perplexity-User',
    'Claude-SearchBot',
    'Claude-User',
    'DuckAssistBot',
    'MistralAI-User',
    'Amazonbot',
    'meta-externalfetcher',
    'Applebot',
    'Googlebot',
    'Bingbot',
  ]
  const TRAINING_BOTS = [
    'GPTBot',
    'ClaudeBot',
    'anthropic-ai',
    'CCBot',
    'Applebot-Extended',
    'meta-externalagent',
  ]

  it('* 组放行全部路径,只屏蔽四条非内容路径', () => {
    expect(starGroup).toBeTruthy()
    expect(starGroup.allow).toContain('/')
    for (const path of ['/api/', '/_vercel/', '/sb/', '/spa.html']) {
      expect(starGroup.disallow).toContain(path)
    }
  })

  it('* 组带 Content-Signal:允许检索与引用、不允许训练', () => {
    const signal = starGroup.signals.join(' ')
    expect(signal).toContain('search=yes')
    expect(signal).toContain('ai-input=yes')
    expect(signal).toContain('ai-train=no')
  })

  it('AI 检索爬虫没有整站 Disallow 组(允许 = 未提专属组或无 Disallow: /)', () => {
    for (const bot of SEARCH_BOTS) {
      const blocked = groups.some((g) => g.agents.includes(bot) && g.disallow.includes('/'))
      expect(blocked, `${bot} 被整站屏蔽,会从 AI 检索结果里消失`).toBe(false)
    }
  })

  it('纯训练型爬虫被整站禁止', () => {
    for (const bot of TRAINING_BOTS) {
      const group = groups.find((g) => g.agents.includes(bot))
      expect(group, `${bot} 缺少专属组`).toBeTruthy()
      expect(group.disallow, `${bot} 应整站禁止`).toContain('/')
    }
  })

  it('Google-Extended 显式允许,并重抄四条屏蔽路径', () => {
    const group = groups.find((g) => g.agents.includes('Google-Extended'))
    expect(group).toBeTruthy()
    expect(group.allow).toContain('/')
    expect(group.disallow).toEqual(starGroup.disallow)
  })

  it('sitemap 指向生成的 dist 聚合文件', () => {
    expect(ROBOTS).toContain('Sitemap: https://tangnotes.site/sitemap.xml')
  })
})

describe('llms.txt · 构建期生成,单一数据源', () => {
  it('public 下不允许出现手写 llms.txt', () => {
    expect(existsSync(join(ROOT, 'public', 'llms.txt'))).toBe(false)
  })

  it('构建链在 vite build 之后、预渲染之前生成 llms 文件', () => {
    const build = PKG.scripts.build
    expect(build).toContain('generate-llms-txt.mjs')
    const llmsAt = build.indexOf('generate-llms-txt.mjs')
    const viteAt = build.indexOf('vite build')
    const prerenderAt = build.indexOf('generate-prerender-html.js')
    expect(llmsAt).toBeGreaterThan(viteAt)
    expect(llmsAt).toBeLessThan(prerenderAt)
  })

  it('llms 文件带 text/plain 响应头,避免按 HTML 解析', () => {
    const llmsHeader = VERCEL.headers.find((h) => h.source === '/llms.txt')
    const fullHeader = VERCEL.headers.find((h) => h.source === '/llms-full.txt')
    for (const header of [llmsHeader, fullHeader]) {
      expect(header).toBeTruthy()
      const type = header.headers.find((h) => h.key === 'Content-Type')
      expect(type?.value).toContain('text/plain')
    }
  })
})

describe('内容页结构化数据 · 与可见内容同源', () => {
  it('工具页输出专属主题实体与 FAQPage(问答与正文同一份数据)', () => {
    expect(PRERENDER).toContain("case '/ironing':")
    expect(PRERENDER).toContain("case '/bead-calculator':")
    expect(PRERENDER).toContain("case '/pixel-art':")
    expect(PRERENDER).toContain("case '/colors':")
    expect(PRERENDER).toContain("case '/bead-patterns':")
    expect(PRERENDER).toContain('faqQuestions(IRONING_FAQ)')
    expect(PRERENDER).toContain('faqQuestions(PATTERNS_FAQ)')
    expect(PRERENDER).toContain('faqQuestions(PIXEL_ART_FAQ)')
  })

  it('教程文章的 Article 带 section、更新日期,熨烫文章带官方引用', () => {
    expect(PRERENDER).toContain('function articleScript(article, section, url)')
    expect(PRERENDER).toContain('articleScript(article, section, url)')
    expect(PRERENDER).toContain('IRONING_ARTICLE_IDS.includes(article.id)')
    expect(PRERENDER).toContain('data.citation = IRONING_SOURCES.map')
    expect(PRERENDER).toContain('TUTORIAL_DATE_MODIFIED')
  })

  it('首页实体声明主题域与联系方式', () => {
    expect(INDEX_HTML).toContain('"knowsAbout"')
    expect(INDEX_HTML).toContain('"contactPoint"')
    expect(INDEX_HTML).toContain('"browserRequirements"')
    expect(INDEX_HTML).toContain('https://tangnotes.site/contact')
  })
})

describe('工具页问答 · React 与静态快照同源', () => {
  const pages = [
    ['src/features/tools/IroningGuidePage.jsx', 'IRONING_FAQ'],
    ['src/features/tools/BeadPatternsPage.jsx', 'PATTERNS_FAQ'],
    ['src/features/tools/PixelArtPage.jsx', 'PIXEL_ART_FAQ'],
  ]

  it('三页都引入 ToolFaq 并渲染同一份问答数据', () => {
    for (const [file, faqConst] of pages) {
      const source = read(...file.split('/'))
      expect(source).toContain(`import { ${faqConst} } from './toolFaq'`)
      expect(source).toContain(`<ToolFaq items={${faqConst}} />`)
    }
    expect(PRERENDER).toContain('function toolFaqHtml(items)')
    expect(PRERENDER).toContain('toolFaqHtml(IRONING_FAQ)')
    expect(PRERENDER).toContain('toolFaqHtml(PATTERNS_FAQ)')
    expect(PRERENDER).toContain('toolFaqHtml(PIXEL_ART_FAQ)')
  })

  it('问答答案不含查询参数变体与外站链接(内容是单语正文)', () => {
    const faqSource = read('src', 'features', 'tools', 'toolFaq.js')
    expect(faqSource).not.toContain('?lang=')
    expect(faqSource).not.toContain('http')
  })
})
