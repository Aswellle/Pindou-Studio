import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  absoluteUrl,
  clampDescription,
  patternDimensions,
  patternStats,
  buildPatternSnapshot,
  buildThemeSnapshot,
  buildCollectionSnapshot,
  buildDynamicSitemap,
  appendToSitemap,
  renderSnapshotHtml,
} from './ogSnapshot'

describe('ogSnapshot · 基础工具', () => {
  it('escapeHtml 转义全部五个字符(静态正文是拼字符串,漏一个就能注入)', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)"> & \'')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; \'',
    )
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('absoluteUrl 只补站内相对路径,绝对地址原样返回', () => {
    expect(absoluteUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(absoluteUrl('http://cdn.example.com/a.png')).toBe('http://cdn.example.com/a.png')
    expect(absoluteUrl('/covers/a.png')).toBe('https://tangnotes.site/covers/a.png')
    expect(absoluteUrl('covers/a.png')).toBe('https://tangnotes.site/covers/a.png')
    expect(absoluteUrl('')).toBe('')
    expect(absoluteUrl(null)).toBe('')
  })

  it('clampDescription 压缩空白并按长度截断', () => {
    expect(clampDescription('a   b\n c')).toBe('a b c')
    const long = 'x'.repeat(200)
    const out = clampDescription(long, 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })

  it('patternDimensions 按最大行长推导宽(矩形安全)', () => {
    expect(patternDimensions([['#a', '#b'], ['#c']])).toEqual({ width: 2, height: 2 })
    expect(patternDimensions([])).toEqual({ width: 0, height: 0 })
    expect(patternDimensions(null)).toEqual({ width: 0, height: 0 })
  })

  it('patternStats 统计颗数并按数量降序', () => {
    const stats = patternStats([['#a', '#a', '#b'], ['#c', null, '#a']])
    expect(stats.beads).toBe(5)
    expect(stats.colorCount).toBe(3)
    expect(stats.list[0]).toEqual({ hex: '#a', count: 3 })
  })
})

describe('buildPatternSnapshot', () => {
  const tpl = {
    id: 'tpl-1',
    name: 'Duck',
    nameZh: '小鸭',
    paletteId: 'perler',
    pattern: [['#FFD700', '#FFD700'], ['#000000', null]],
  }

  it('生成绝对路径 + 含尺寸/豆数/用色数的标题描述', () => {
    const snap = buildPatternSnapshot(tpl)
    expect(snap.path).toBe('/gallery/pattern/tpl-1')
    expect(snap.title).toBe('小鸭 拼豆图纸 - 拼豆Studio')
    expect(snap.description).toContain('2×2')
    expect(snap.description).toContain('3 颗豆子')
    expect(snap.description).toContain('2 种颜色')
  })

  it('正文含颜色清单与制作信息', () => {
    const snap = buildPatternSnapshot(tpl)
    expect(snap.bodyHtml).toContain('小鸭')
    expect(snap.bodyHtml).toContain('豆子总数:3 颗')
    expect(snap.bodyHtml).toContain('#FFD700 · 2 颗')
    expect(snap.bodyHtml).toContain('#000000 · 1 颗')
  })

  it('名称里的 HTML 被转义(防注入)', () => {
    const snap = buildPatternSnapshot({ ...tpl, nameZh: '<script>alert(1)</script>' })
    expect(snap.bodyHtml).not.toContain('<script>')
    expect(snap.bodyHtml).toContain('&lt;script&gt;')
    expect(snap.title).not.toContain('<script>')
  })

  it('缺 id / pattern / 名称时返回 null(不产出空快照)', () => {
    expect(buildPatternSnapshot(null)).toBe(null)
    expect(buildPatternSnapshot({ ...tpl, id: undefined })).toBe(null)
    expect(buildPatternSnapshot({ ...tpl, pattern: undefined })).toBe(null)
    expect(buildPatternSnapshot({ ...tpl, name: '', nameZh: '' })).toBe(null)
  })
})

describe('buildThemeSnapshot / buildCollectionSnapshot', () => {
  const patterns = [
    { id: 'p1', nameZh: '小鸭' },
    { id: 'p2', nameZh: '小猫' },
  ]

  it('主题快照列出关联图纸名', () => {
    const snap = buildThemeSnapshot({ slug: 'spring', title: '春天', description: '春季主题' }, patterns)
    expect(snap.path).toBe('/gallery/theme/spring')
    expect(snap.title).toBe('春天 - 拼豆图纸主题 - 拼豆Studio')
    expect(snap.description).toBe('春季主题')
    expect(snap.bodyHtml).toContain('小鸭')
    expect(snap.bodyHtml).toContain('包含图纸(2 张)')
  })

  it('主题无描述时用图纸数量兜底', () => {
    const snap = buildThemeSnapshot({ slug: 'spring', title: '春天' }, patterns)
    expect(snap.description).toContain('2 张')
  })

  it('主题封面补全为绝对地址;无封面为空', () => {
    expect(buildThemeSnapshot({ slug: 's', title: 'T', coverUrl: '/c.png' }).image)
      .toBe('https://tangnotes.site/c.png')
    expect(buildThemeSnapshot({ slug: 's', title: 'T' }).image).toBe('')
  })

  it('合集优先用策展说明作为描述', () => {
    const snap = buildCollectionSnapshot(
      { slug: 'pets', title: '宠物', description: '描述', curationNote: '策展说明' },
      patterns,
    )
    expect(snap.title).toBe('宠物 - 拼豆精选合集 - 拼豆Studio')
    expect(snap.description).toBe('策展说明')
    expect(snap.bodyHtml).toContain('策展说明')
  })

  it('空主题/空合集也能出快照(只是列表为空)', () => {
    const snap = buildThemeSnapshot({ slug: 'empty', title: '空主题' }, [])
    expect(snap.bodyHtml).toContain('正在整理中')
  })

  it('缺 slug / title 返回 null', () => {
    expect(buildThemeSnapshot({ title: 'T' })).toBe(null)
    expect(buildThemeSnapshot({ slug: 's' })).toBe(null)
    expect(buildCollectionSnapshot({ slug: 'c' })).toBe(null)
  })
})

describe('buildDynamicSitemap', () => {
  it('每个已发布对象一条,含 lastmod 与 5 条 hreflang', () => {
    const xml = buildDynamicSitemap({
      themes: [{ slug: 'spring', updated_at: '2026-10-01T10:00:00Z' }],
      collections: [{ slug: 'pets', updated_at: '2026-10-02T10:00:00Z' }],
      templates: [{ id: 't1', name: 'Duck', updated_at: '2026-10-03T10:00:00Z' }],
    })
    expect(xml).toContain('https://tangnotes.site/gallery/theme/spring')
    expect(xml).toContain('<lastmod>2026-10-01</lastmod>')
    expect(xml).toContain('https://tangnotes.site/gallery/collection/pets')
    expect(xml).toContain('https://tangnotes.site/gallery/pattern/t1')
    expect((xml.match(/hreflang="x-default"/g) || []).length).toBe(3)
  })

  it('lastmod 用内容更新时间,不随构建漂移', () => {
    const xml = buildDynamicSitemap({ themes: [{ slug: 'a', updated_at: '2026-01-05T00:00:00Z' }] })
    expect(xml).toContain('<lastmod>2026-01-05</lastmod>')
  })

  it('没有更新时间的对象不输出 lastmod(而不是写构建日期)', () => {
    const xml = buildDynamicSitemap({ themes: [{ slug: 'a' }] })
    expect(xml).not.toContain('<lastmod>')
  })

  it('无名称的模板跳过(内置模板 nameKey 不进 sitemap)', () => {
    const xml = buildDynamicSitemap({ templates: [{ id: 'builtin-1', nameKey: 'bear' }] })
    expect(xml).toBe('')
  })

  it('空输入产出空字符串', () => {
    expect(buildDynamicSitemap()).toBe('')
    expect(buildDynamicSitemap({ themes: [], collections: [], templates: [] })).toBe('')
  })
})

describe('appendToSitemap', () => {
  it('插到 </urlset> 之前', () => {
    const base = '<urlset>\n  <url><loc>a</loc></url>\n</urlset>\n'
    const out = appendToSitemap(base, '  <url><loc>b</loc></url>')
    expect(out.indexOf('<loc>b</loc>')).toBeLessThan(out.indexOf('</urlset>'))
    expect(out).toContain('<loc>a</loc>')
  })

  it('无动态条目时原样返回', () => {
    const base = '<urlset></urlset>'
    expect(appendToSitemap(base, '')).toBe(base)
  })

  it('结构异常(没有 </urlset>)时不动原文件', () => {
    const base = '<urlset>'
    expect(appendToSitemap(base, 'x')).toBe(base)
  })
})

describe('renderSnapshotHtml', () => {
  // 贴近真实的 index.html 结构(含 CRLF、5 行 hreflang、空 #root)
  const INDEX = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <title>拼豆Studio - 首页</title>',
    '  <meta name="description" content="首页描述" />',
    '  <meta name="robots" content="index, follow" />',
    '  <link rel="canonical" href="https://tangnotes.site/" />',
    '  <link rel="alternate" hreflang="zh-CN" href="https://tangnotes.site/" />',
    '  <link rel="alternate" hreflang="en" href="https://tangnotes.site/?lang=en" />',
    '  <link rel="alternate" hreflang="ja" href="https://tangnotes.site/?lang=ja" />',
    '  <link rel="alternate" hreflang="ko" href="https://tangnotes.site/?lang=ko" />',
    '  <link rel="alternate" hreflang="x-default" href="https://tangnotes.site/" />',
    '  <meta property="og:title" content="OG 首页" />',
    '  <meta property="og:description" content="OG 描述" />',
    '  <meta property="og:url" content="https://tangnotes.site/" />',
    '  <meta property="og:image" content="https://tangnotes.site/og-image.png" />',
    '  <meta name="twitter:title" content="TW 首页" />',
    '  <meta name="twitter:description" content="TW 描述" />',
    '  <meta name="twitter:image" content="https://tangnotes.site/og-image.png" />',
    '</head>',
    '<body>',
    '  <div id="root"></div>',
    '  <script type="module" src="/src/main.jsx"></script>',
    '</body>',
    '</html>',
  ].join('\n')

  const snap = {
    path: '/gallery/pattern/t1',
    title: '小鸭 拼豆图纸 - 拼豆Studio',
    description: '小鸭拼豆图纸',
    image: '',
    bodyHtml: '<h1>小鸭</h1>',
  }

  it('改写 title / description / canonical / og / twitter', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('<title>小鸭 拼豆图纸 - 拼豆Studio</title>')
    expect(out).toContain('<meta name="description" content="小鸭拼豆图纸" />')
    expect(out).toContain('<link rel="canonical" href="https://tangnotes.site/gallery/pattern/t1" />')
    expect(out).toContain('<meta property="og:url" content="https://tangnotes.site/gallery/pattern/t1" />')
    expect(out).toContain('<meta name="twitter:title" content="小鸭 拼豆图纸 - 拼豆Studio" />')
  })

  it('hreflang 指向本页而不是首页', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('hreflang="en" href="https://tangnotes.site/gallery/pattern/t1?lang=en"')
    expect(out).toContain('hreflang="x-default" href="https://tangnotes.site/gallery/pattern/t1"')
    // 首页那几行必须已被整体替换,不能残留
    expect(out).not.toContain('hreflang="en" href="https://tangnotes.site/?lang=en"')
  })

  it('无封面时保留站点默认 og:image(不留空 content)', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('<meta property="og:image" content="https://tangnotes.site/og-image.png" />')
  })

  it('有封面时替换 og:image 与 twitter:image', () => {
    const out = renderSnapshotHtml(
      INDEX,
      { ...snap, image: 'https://tangnotes.site/covers/a.png' },
      'https://tangnotes.site/gallery/pattern/t1',
    )
    expect(out).toContain('<meta property="og:image" content="https://tangnotes.site/covers/a.png" />')
    expect(out).toContain('<meta name="twitter:image" content="https://tangnotes.site/covers/a.png" />')
  })

  it('注入静态正文与首帧隐藏守卫', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('<section id="seo-static"><h1>小鸭</h1></section>')
    expect(out).toContain('js-booting')
    expect(out).not.toContain('<div id="root"></div>')
  })

  it('noindex 时 robots 改为 noindex', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1', { noindex: true })
    expect(out).toContain('<meta name="robots" content="noindex, nofollow" />')
  })

  it('CRLF 模板保持 CRLF(不把换行风格改混)', () => {
    const crlf = INDEX.replace(/\n/g, '\r\n')
    const out = renderSnapshotHtml(crlf, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('\r\n')
    expect(out).not.toMatch(/[^\r]\n/)
  })
})
