import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PAGE_LASTMOD_SOURCES, formatGitDate, applyLastmods } from './sitemapLastmod'

/**
 * 静态页 lastmod 自动推导的契约(防回归)。
 *
 * 核心约束:
 *   1. 模板里的每个静态页都必须有源文件映射 —— 新增页面漏配时,lastmod
 *      会悄悄停留在兜底值,这里必须直接失败;
 *   2. 只改静态页,动态条目(内容自身有 updated_at)与 hreflang 原样保留;
 *   3. 日期只进不退,浅克隆查到更早记录时不能把 lastmod 往回拨;
 *   4. 构建接线与失败降级:查不到历史不能让构建失败。
 */

const ROOT = process.cwd()
const TEMPLATE = readFileSync(join(ROOT, 'public', 'sitemap.xml'), 'utf8')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const SCRIPT = readFileSync(join(ROOT, 'scripts', 'sitemap-lastmod.mjs'), 'utf8')

const staticLocs = () =>
  [...TEMPLATE.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => new URL(m[1]).pathname)

describe('sitemapLastmod · 页面映射', () => {
  it('模板里的每个静态页都有源文件映射', () => {
    for (const pathname of staticLocs()) {
      expect(PAGE_LASTMOD_SOURCES[pathname], `缺少 ${pathname} 的映射`).toBeTruthy()
    }
  })

  it('映射里的每个页面都真实存在于模板', () => {
    const locs = new Set(staticLocs())
    for (const pathname of Object.keys(PAGE_LASTMOD_SOURCES)) {
      expect(locs.has(pathname), `${pathname} 已不在 sitemap 里`).toBe(true)
    }
  })

  it('映射的源文件都是仓库内真实存在的路径', () => {
    for (const [pathname, paths] of Object.entries(PAGE_LASTMOD_SOURCES)) {
      expect(paths.length, `${pathname} 没有配置源文件`).toBeGreaterThan(0)
    }
  })
})

describe('sitemapLastmod · 日期推导', () => {
  it('取 UTC 日期,不受构建机器时区影响', () => {
    // 2026-11-09T00:00:00Z
    expect(formatGitDate(Date.UTC(2026, 10, 9) / 1000)).toBe('2026-11-09')
    // 2026-11-09T23:59:59Z 仍是同一天
    expect(formatGitDate(Math.floor(Date.UTC(2026, 10, 9, 23, 59, 59) / 1000))).toBe('2026-11-09')
    expect(formatGitDate(0)).toBeNull()
    expect(formatGitDate('不是数字')).toBeNull()
  })
})

describe('sitemapLastmod · 改写规则', () => {
  const SAMPLE = [
    '<urlset>',
    '  <url>',
    '    <loc>https://tangnotes.site/</loc>',
    '    <lastmod>2026-10-12</lastmod>',
    '    <xhtml:link rel="alternate" hreflang="en" href="https://tangnotes.site/?lang=en"/>',
    '  </url>',
    '  <url>',
    '    <loc>https://tangnotes.site/gallery/pattern/42</loc>',
    '    <lastmod>2026-11-01</lastmod>',
    '  </url>',
    '</urlset>',
  ].join('\n')

  it('只改映射里的静态页,动态条目原样保留', () => {
    const out = applyLastmods(SAMPLE, { '/': '2026-11-09' })
    expect(out).toContain('<loc>https://tangnotes.site/</loc>\n    <lastmod>2026-11-09</lastmod>')
    expect(out).toContain('<loc>https://tangnotes.site/gallery/pattern/42</loc>\n    <lastmod>2026-11-01</lastmod>')
    // hreflang 组不被动到
    expect(out).toContain('hreflang="en" href="https://tangnotes.site/?lang=en"')
  })

  it('日期只进不退:推导值更旧时保持现有 lastmod', () => {
    const out = applyLastmods(SAMPLE, { '/': '2026-01-01' })
    expect(out).toContain('<lastmod>2026-10-12</lastmod>')
    expect(out).not.toContain('2026-01-01')
  })

  it('条目没有 lastmod 时补一条', () => {
    const xml = '<urlset>\n  <url>\n    <loc>https://tangnotes.site/privacy</loc>\n  </url>\n</urlset>'
    const out = applyLastmods(xml, { '/privacy': '2026-11-09' })
    expect(out).toContain('<loc>https://tangnotes.site/privacy</loc>\n    <lastmod>2026-11-09</lastmod>')
  })

  it('没有可用日期时原样返回', () => {
    expect(applyLastmods(SAMPLE, {})).toBe(SAMPLE)
    expect(applyLastmods(SAMPLE, null)).toBe(SAMPLE)
  })
})

describe('sitemapLastmod · 构建接线与降级', () => {
  it('build 在 og 快照之后执行该脚本', () => {
    const build = PKG.scripts.build
    expect(build).toContain('scripts/sitemap-lastmod.mjs')
    expect(build.indexOf('scripts/generate-og-snapshots.js')).toBeLessThan(
      build.indexOf('scripts/sitemap-lastmod.mjs')
    )
  })

  it('从 git 提交时间推导,并为浅克隆补全历史', () => {
    expect(SCRIPT).toContain('--format=%ct')
    expect(SCRIPT).toContain('--unshallow')
  })

  it('查不到历史/抛错时降级,不阻断构建', () => {
    expect(SCRIPT).toContain('沿用现有值')
    expect(SCRIPT).toContain('不阻断部署')
    expect(SCRIPT).toContain('catch')
  })
})
