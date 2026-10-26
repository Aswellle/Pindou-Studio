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

  it('传入 ogImage 时补全为绝对地址(社交平台不解析相对路径)', () => {
    const snap = buildPatternSnapshot(tpl, { ogImage: '/og/pattern/tpl-1-abc.png' })
    expect(snap.image).toBe('https://tangnotes.site/og/pattern/tpl-1-abc.png')
  })

  it('未传 ogImage 时 image 为空(绘制层负责退回站点默认图)', () => {
    expect(buildPatternSnapshot(tpl).image).toBe('')
    expect(buildPatternSnapshot(tpl, { ogImage: '' }).image).toBe('')
  })

  it('ogImage 已是绝对地址时原样保留(便于换 CDN)', () => {
    const snap = buildPatternSnapshot(tpl, { ogImage: 'https://cdn.example.com/a.png' })
    expect(snap.image).toBe('https://cdn.example.com/a.png')
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
  // 贴近真实的 index.html 结构(含 CRLF、5 行 hreflang、空 #root)。
  // 关键:index.html 里 Helmet 会渲染的那些标签带 data-rh="true" —— 这是
  // react-helmet-async 识别「上一轮自己写下的标签」的唯一依据,改写时丢了它,
  // 首帧就会再追加一份同名标签。fixture 必须照实带上,否则测不出这个回归。
  const INDEX = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <title>拼豆Studio - 首页</title>',
    '  <meta name="description" content="首页描述" data-rh="true" />',
    '  <meta name="robots" content="index, follow" data-rh="true" />',
    '  <link rel="canonical" href="https://tangnotes.site/" data-rh="true" />',
    '  <link rel="alternate" hreflang="zh-CN" href="https://tangnotes.site/" data-rh="true" />',
    '  <link rel="alternate" hreflang="en" href="https://tangnotes.site/?lang=en" data-rh="true" />',
    '  <link rel="alternate" hreflang="ja" href="https://tangnotes.site/?lang=ja" data-rh="true" />',
    '  <link rel="alternate" hreflang="ko" href="https://tangnotes.site/?lang=ko" data-rh="true" />',
    '  <link rel="alternate" hreflang="x-default" href="https://tangnotes.site/" data-rh="true" />',
    '  <meta property="og:title" content="OG 首页" data-rh="true" />',
    '  <meta property="og:description" content="OG 描述" data-rh="true" />',
    '  <meta property="og:url" content="https://tangnotes.site/" data-rh="true" />',
    '  <meta property="og:image" content="https://tangnotes.site/og-image.png" data-rh="true" />',
    '  <meta property="og:image:width" content="1200" />',
    '  <meta property="og:image:height" content="630" />',
    '  <meta property="og:image:alt" content="拼豆Studio - 在线拼豆图纸设计工具" />',
    '  <meta name="twitter:title" content="TW 首页" data-rh="true" />',
    '  <meta name="twitter:description" content="TW 描述" data-rh="true" />',
    '  <meta name="twitter:image" content="https://tangnotes.site/og-image.png" data-rh="true" />',
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
    expect(out).toContain('<meta name="description" content="小鸭拼豆图纸" data-rh="true" />')
    expect(out).toContain('<link rel="canonical" href="https://tangnotes.site/gallery/pattern/t1" data-rh="true" />')
    expect(out).toContain('<meta property="og:url" content="https://tangnotes.site/gallery/pattern/t1" data-rh="true" />')
    expect(out).toContain('<meta name="twitter:title" content="小鸭 拼豆图纸 - 拼豆Studio" data-rh="true" />')
  })

  it('改写后的 Helmet 标签保留 data-rh(否则首帧会再追加一份)', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    // 每个标签在全文只应出现一次
    for (const re of [
      /<meta name="description"/g,
      /<meta name="robots"/g,
      /<link rel="canonical"/g,
      /<meta property="og:url"/g,
      /<meta property="og:title"/g,
      /<meta name="twitter:title"/g,
    ]) {
      expect(out.match(re) || []).toHaveLength(1)
    }
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
    expect(out).toContain('<meta property="og:image" content="https://tangnotes.site/og-image.png" data-rh="true" />')
  })

  it('有封面时替换 og:image 与 twitter:image', () => {
    const out = renderSnapshotHtml(
      INDEX,
      { ...snap, image: 'https://tangnotes.site/covers/a.png' },
      'https://tangnotes.site/gallery/pattern/t1',
    )
    expect(out).toContain('<meta property="og:image" content="https://tangnotes.site/covers/a.png" data-rh="true" />')
    expect(out).toContain('<meta name="twitter:image" content="https://tangnotes.site/covers/a.png" data-rh="true" />')
  })

  it('封面尺寸未知时删除 og:image:width/height(避免按错误比例裁切)', () => {
    // 主题/合集的 cover_url 是管理员上传的任意尺寸,首页声明的 1200×630 是错的。
    // 缺少这两行时平台会自己探测真实尺寸,比声明错误尺寸安全。
    const out = renderSnapshotHtml(
      INDEX,
      { ...snap, image: 'https://tangnotes.site/covers/a.png' },
      'https://tangnotes.site/gallery/pattern/t1',
    )
    expect(out).not.toContain('og:image:width')
    expect(out).not.toContain('og:image:height')
  })

  it('封面尺寸已知时改写 og:image:width/height', () => {
    const out = renderSnapshotHtml(
      INDEX,
      { ...snap, image: 'https://tangnotes.site/og/pattern/x-abc.png' },
      'https://tangnotes.site/gallery/pattern/x',
      { imageSize: { width: 1200, height: 630 } },
    )
    expect(out).toContain('<meta property="og:image:width" content="1200" />')
    expect(out).toContain('<meta property="og:image:height" content="630" />')
  })

  it('尺寸与实际不同时按传入值改写(不是照抄首页的 1200×630)', () => {
    const out = renderSnapshotHtml(
      INDEX,
      { ...snap, image: 'https://tangnotes.site/covers/a.png' },
      'https://tangnotes.site/gallery/theme/t',
      { imageSize: { width: 800, height: 450 } },
    )
    expect(out).toContain('<meta property="og:image:width" content="800" />')
    expect(out).toContain('<meta property="og:image:height" content="450" />')
    expect(out).not.toContain('content="1200"')
  })

  it('无封面时不碰尺寸 meta(站点默认图确实是 1200×630)', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('<meta property="og:image:width" content="1200" />')
    expect(out).toContain('<meta property="og:image:height" content="630" />')
  })

  it('有封面时 og:image:alt 换成内容标题(不再是站点级文案)', () => {
    const out = renderSnapshotHtml(
      INDEX,
      { ...snap, image: 'https://tangnotes.site/og/pattern/x-abc.png' },
      'https://tangnotes.site/gallery/pattern/x',
    )
    expect(out).toContain('<meta property="og:image:alt" content="小鸭 拼豆图纸 - 拼豆Studio" />')
    expect(out).not.toContain('在线拼豆图纸设计工具')
  })

  it('无封面时 og:image:alt 保持站点级文案', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('在线拼豆图纸设计工具')
  })

  it('注入静态正文与首帧隐藏守卫', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('<section id="seo-static"><h1>小鸭</h1></section>')
    expect(out).toContain('js-booting')
    expect(out).not.toContain('<div id="root"></div>')
  })

  it('noindex 时 robots 改为 noindex', () => {
    const out = renderSnapshotHtml(INDEX, snap, 'https://tangnotes.site/gallery/pattern/t1', { noindex: true })
    expect(out).toContain('<meta name="robots" content="noindex, nofollow" data-rh="true" />')
  })

  it('CRLF 模板保持 CRLF(不把换行风格改混)', () => {
    const crlf = INDEX.replace(/\n/g, '\r\n')
    const out = renderSnapshotHtml(crlf, snap, 'https://tangnotes.site/gallery/pattern/t1')
    expect(out).toContain('\r\n')
    expect(out).not.toMatch(/[^\r]\n/)
  })
})
