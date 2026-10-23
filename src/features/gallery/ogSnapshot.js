/**
 * 动态内容页的 OG 快照(构建期)。
 *
 * 为什么需要:主题 / 合集 / 图纸详情是数据驱动的,只在客户端用 Helmet 设置 meta。
 * 社交平台与不执行 JS 的抓取端拿到的永远是 index.html 里那套站点级 meta ——
 * 分享出去只有「拼豆Studio」而不是「小鸭拼豆图纸 · 29×29」。
 *
 * 做法:构建时从 Supabase 拉已发布内容,为每个对象生成一份静态 HTML
 * (头部 meta 改写 + #root 内注入静态正文),写到 dist/gallery/{theme|collection|pattern}/<id>/index.html。
 * Vercel 静态文件优先于 rewrite:命中快照就返回快照,未命中的 slug 仍落到
 * 兜底 rewrite → SPA,新内容不会因为「构建后才发布」而 404。
 *
 * 本文件只放纯函数(不读环境变量、不发请求),便于单测;
 * 拉数据与写文件在 scripts/generate-prerender-html.js。
 */

export const SITE = 'https://tangnotes.site'

/** HTML 文本转义:静态正文直接拼字符串,任何字段都必须先过这里 */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 站内相对路径补全为绝对地址。
 * 社交平台不解析相对 URL,og:image 漏了这一步分享卡片会没有图。
 */
export function absoluteUrl(url, site = SITE) {
  if (typeof url !== 'string' || !url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${site}${url.startsWith('/') ? '' : '/'}${url}`
}

/** meta description 控制在 160 字以内,超出截断并补省略号 */
export function clampDescription(text, max = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trimEnd()}…`
}

export const themePath = (slug) => `/gallery/theme/${encodeURIComponent(slug)}`
export const collectionPath = (slug) => `/gallery/collection/${encodeURIComponent(slug)}`
export const patternPath = (id) => `/gallery/pattern/${encodeURIComponent(id)}`

/** 模板展示名:云端模板有 name/nameZh,内置模板只有 nameKey(不进快照) */
export function templateDisplayName(template) {
  if (!template) return ''
  return template.nameZh || template.name || ''
}

/** 从 pattern 推导真实宽高(与 src/data/templates.js 的 patternDimensions 同口径) */
export function patternDimensions(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0) return { width: 0, height: 0 }
  let width = 0
  for (const row of pattern) {
    if (Array.isArray(row) && row.length > width) width = row.length
  }
  return { width, height: pattern.length }
}

/**
 * 统计豆子总数与逐色颗数。
 * 逐色清单按颗数降序 —— 照着买豆子时这才是真正要看的信息。
 */
export function patternStats(pattern) {
  const counts = new Map()
  let beads = 0
  for (const row of pattern || []) {
    for (const cell of row || []) {
      if (!cell) continue
      beads++
      counts.set(cell, (counts.get(cell) || 0) + 1)
    }
  }
  const list = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex, count]) => ({ hex, count }))
  return { beads, colorCount: list.length, list }
}

// ── 静态正文(注入 #root,React 首帧时整体替换) ──────────────
//
// 注意:下面 build*Snapshot 返回的 title / description **已经是 HTML 转义后**的值。
// 它们唯一的用途就是拼进 HTML 的 <title> 与 <meta content="...">,
// 在数据层统一转义比让每个调用点记得转义更不容易漏。
function listItems(items) {
  if (!items.length) return ''
  return `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`
}

function colorListHtml(stats) {
  return listItems(stats.list.map(
    (c) => `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${escapeHtml(c.hex)};margin-right:6px;vertical-align:-1px"></span>${escapeHtml(c.hex)} · ${c.count} 颗`,
  ))
}

/**
 * 图纸详情快照。
 *
 * `ogImage` 由构建脚本传入(生成的分享卡片路径)。为空的后果只是退回站点
 * 默认图 —— 纯函数层不负责画图,也不知道卡片生成成功与否。
 *
 * @param {object} template - 云端模板行(含 pattern)
 * @param {object} [opts]
 * @param {string} [opts.ogImage] 分享卡片路径(站内绝对路径或完整 URL)
 * @param {{width:number,height:number}} [opts.ogImageSize] 卡片实际像素尺寸;
 *   与 ogCard 的 OG_CARD_WIDTH/HEIGHT 一致时才会被写入 meta
 * @returns {{path:string,title:string,description:string,image:string,imageSize:object|null,bodyHtml:string}|null}
 */
export function buildPatternSnapshot(template, { site = SITE, ogImage = '', ogImageSize = null } = {}) {
  if (!template?.id || !template?.pattern) return null
  const name = templateDisplayName(template)
  if (!name) return null

  const { width, height } = patternDimensions(template.pattern)
  const stats = patternStats(template.pattern)
  const path = patternPath(template.id)
  const brand = template.paletteId || 'perler'

  const title = escapeHtml(`${name} 拼豆图纸 - 拼豆Studio`)
  const description = escapeHtml(clampDescription(
    `${name}拼豆图纸:${width}×${height},共 ${stats.beads} 颗豆子、${stats.colorCount} 种颜色。` +
    '可一键载入画布继续编辑,或导出带色号的专业 PNG/SVG 图纸。',
  ))

  const bodyHtml = [
    `<h1>${escapeHtml(name)} 拼豆图纸</h1>`,
    `<p class="lead">${width}×${height} 的拼豆图纸,共 ${stats.beads} 颗豆子、${stats.colorCount} 种颜色。` +
      '可以直接载入画布继续修改,或导出带色号的制作图纸。</p>',
    '<h2>制作信息</h2>',
    listItems([
      `尺寸:${width} × ${height}`,
      `豆子总数:${stats.beads} 颗`,
      `用色数:${stats.colorCount} 种`,
      `色卡:${escapeHtml(brand)}`,
    ]),
    `<h2>颜色清单(共 ${stats.colorCount} 种)</h2>`,
    colorListHtml(stats),
    '<p class="note">在拼豆Studio 打开本页可复制到自己的图纸、导出图纸或直接开始制作。</p>',
  ].join('\n')

  return { path, title, description, image: absoluteUrl(ogImage, site), imageSize: ogImageSize, bodyHtml }
}
/**
 * 主题快照。patterns 为该主题下的模板(已按关联顺序解析)。
 */
export function buildThemeSnapshot(theme, patterns = [], { site = SITE } = {}) {
  if (!theme?.slug) return null
  const title = theme.title || ''
  if (!title) return null

  const path = themePath(theme.slug)
  const desc = theme.description || ''
  const names = patterns.map((p) => templateDisplayName(p)).filter(Boolean)

  const metaTitle = escapeHtml(`${title} - 拼豆图纸主题 - 拼豆Studio`)
  const description = escapeHtml(clampDescription(
    desc || `${title}主题共收录 ${names.length} 张拼豆图纸,可直接载入画布制作。`,
  ))

  const bodyHtml = [
    `<h1>${escapeHtml(title)}</h1>`,
    desc ? `<p class="lead">${escapeHtml(desc)}</p>` : '',
    `<h2>包含图纸(${names.length} 张)</h2>`,
    names.length ? listItems(names.map(escapeHtml)) : '<p>该主题的图纸正在整理中。</p>',
    '<p class="note">在拼豆Studio 打开主题页可按分类、难度与用色数进一步筛选。</p>',
  ].filter(Boolean).join('\n')

  return { path, title: metaTitle, description, image: absoluteUrl(theme.coverUrl, site), bodyHtml }
}

/** 合集快照。 */
export function buildCollectionSnapshot(collection, patterns = [], { site = SITE } = {}) {
  if (!collection?.slug) return null
  const title = collection.title || ''
  if (!title) return null

  const path = collectionPath(collection.slug)
  const note = collection.curationNote || ''
  const desc = collection.description || ''
  const names = patterns.map((p) => templateDisplayName(p)).filter(Boolean)

  const metaTitle = escapeHtml(`${title} - 拼豆精选合集 - 拼豆Studio`)
  const description = escapeHtml(clampDescription(
    note || desc || `${title}合集共收录 ${names.length} 张拼豆图纸。`,
  ))

  const bodyHtml = [
    `<h1>${escapeHtml(title)}</h1>`,
    note ? `<p class="lead">${escapeHtml(note)}</p>` : (desc ? `<p class="lead">${escapeHtml(desc)}</p>` : ''),
    `<h2>合集内容(${names.length} 张)</h2>`,
    names.length ? listItems(names.map(escapeHtml)) : '<p>该合集的图纸正在整理中。</p>',
    '<p class="note">在拼豆Studio 打开合集页可查看全部图纸并一键载入画布。</p>',
  ].filter(Boolean).join('\n')

  return { path, title: metaTitle, description, image: absoluteUrl(collection.coverUrl, site), bodyHtml }
}

// ── sitemap ────────────────────────────────────────────────
function isoDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function sitemapUrl({ loc, lastmod, priority, changefreq = 'weekly' }) {
  const lines = [
    '  <url>',
    `    <loc>${escapeHtml(loc)}</loc>`,
  ]
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`)
  lines.push(`    <changefreq>${changefreq}</changefreq>`)
  lines.push(`    <priority>${priority}</priority>`)
  lines.push('    <mobile:mobile type="pc,mobile"/>')
  for (const [lang, href] of hreflangPairs(loc)) {
    lines.push(`    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeHtml(href)}"/>`)
  }
  lines.push('  </url>')
  return lines.join('\n')
}

/** 与页面内 hreflang / 预渲染 HTML 一致的 5 条语言变体 */
export function hreflangPairs(url) {
  return [
    ['zh-CN', url],
    ['en', `${url}?lang=en`],
    ['ja', `${url}?lang=ja`],
    ['ko', `${url}?lang=ko`],
    ['x-default', url],
  ]
}

/**
 * 动态内容页的 sitemap 条目(插入到 </urlset> 之前)。
 * lastmod 取内容自身的更新时间而不是构建时间:构建时间会让每次部署都声称
 * 「全部页面刚改过」,抓取端会逐渐忽略这个字段。
 */
export function buildDynamicSitemap({ themes = [], collections = [], templates = [], site = SITE } = {}) {
  const blocks = []

  for (const theme of themes) {
    blocks.push(sitemapUrl({
      loc: `${site}${themePath(theme.slug)}`,
      lastmod: isoDate(theme.updatedAt || theme.updated_at || theme.createdAt || theme.created_at),
      priority: '0.6',
      changefreq: 'weekly',
    }))
  }

  for (const collection of collections) {
    blocks.push(sitemapUrl({
      loc: `${site}${collectionPath(collection.slug)}`,
      lastmod: isoDate(collection.updatedAt || collection.updated_at || collection.createdAt || collection.created_at),
      priority: '0.6',
      changefreq: 'weekly',
    }))
  }

  for (const template of templates) {
    if (!templateDisplayName(template)) continue
    blocks.push(sitemapUrl({
      loc: `${site}${patternPath(template.id)}`,
      lastmod: isoDate(template.updatedAt || template.updated_at || template.createdAt || template.created_at),
      priority: '0.5',
      changefreq: 'monthly',
    }))
  }

  return blocks.join('\n')
}

/** 把动态条目插进已有 sitemap 的 </urlset> 之前;已有则原样返回(幂等) */
export function appendToSitemap(xml, dynamicBlocks) {
  if (!dynamicBlocks) return xml
  const marker = '</urlset>'
  const idx = xml.lastIndexOf(marker)
  if (idx === -1) return xml
  return `${xml.slice(0, idx)}${dynamicBlocks}\n${xml.slice(idx)}`
}

// ── HTML 改写(纯函数,便于单测) ────────────────────────────
const SEO_STYLE = `<style>
    #seo-static{max-width:860px;margin:0 auto;padding:32px 20px 60px;color:#33291f;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.8;box-sizing:border-box}
    #seo-static h1{font-size:26px;line-height:1.45;margin:0 0 6px}
    #seo-static .lead{font-size:16px;color:#5d5147;margin:0 0 18px}
    #seo-static h2{font-size:19px;margin:22px 0 8px}
    #seo-static ul{margin:0 0 12px;padding-left:22px}
    #seo-static li{margin:3px 0}
    #seo-static .note{color:#7a6c60;font-size:13px;margin-top:20px}
    @media (max-width:640px){#seo-static h1{font-size:21px}#seo-static{padding-top:20px}}
  </style>`

const HREFLANG_LANGS = ['zh-CN', 'en', 'ja', 'ko', 'x-default']

/**
 * 把首页模板改写成快照页。
 *
 * 只改 head 里的 meta/hreflang 与 #root 内的静态正文,脚本、字体、JSON-LD 全部保留 ——
 * 抓取端读到的是一份完整可用的 HTML,执行 JS 的浏览器照常启动 SPA。
 *
 * @param {string} indexHtml - dist/index.html 的原始内容
 * @param {{title:string,description:string,image:string,bodyHtml:string}} snap
 * @param {string} canonicalUrl - 本页绝对地址
 * @param {{noindex?:boolean, imageSize?:{width:number,height:number}}} [opts]
 *   imageSize 为 og:image 的真实像素尺寸;不传则删除尺寸 meta(交给平台自行探测)
 */
export function renderSnapshotHtml(indexHtml, snap, canonicalUrl, { noindex = false, imageSize = null } = {}) {
  const EOL = indexHtml.includes('\r\n') ? '\r\n' : '\n'
  const robots = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'

  let out = indexHtml
    .replace(/<title>.*?<\/title>/s, `<title>${snap.title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${snap.description}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, `<meta name="robots" content="${robots}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${canonicalUrl}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${snap.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${snap.description}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${snap.title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${snap.description}" />`)

  // 封面:有则替换;无则保留站点默认图(空 content 会让社交平台显示无图卡片)
  //
  // 尺寸也要一起处理。index.html 把 og:image:width/height 写死成站点默认图的
  // 1200×630,而主题/合集的 cover_url 是管理员上传的任意尺寸 —— 元数据说
  // 1200×630、图片却是别的比例时,部分平台会按声明比例裁切,或直接不渲染大图。
  // 图纸卡片确实是 1200×630(见 ogCard.OG_CARD_WIDTH),由调用方显式声明。
  if (snap.image) {
    out = out
      .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${snap.image}" />`)
      .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${snap.image}" />`)
      // alt 描述的是「这张图是什么」。换成内容自己的图后仍留着站点级 alt,
      // 无障碍与部分平台的图片描述会张冠李戴。
      .replace(/<meta property="og:image:alt" content="[^"]*"\s*\/?>/, `<meta property="og:image:alt" content="${snap.title}" />`)

    // 尺寸未知的封面(主题/合集)直接删掉这两行 —— 缺元数据时平台会自己探测
    // 图片尺寸,比声明一个错误的尺寸更安全。
    if (!imageSize) {
      out = out
        .replace(/\s*<meta property="og:image:width" content="[^"]*"\s*\/?>/g, '')
        .replace(/\s*<meta property="og:image:height" content="[^"]*"\s*\/?>/g, '')
    } else {
      out = out
        .replace(/<meta property="og:image:width" content="[^"]*"\s*\/?>/, `<meta property="og:image:width" content="${imageSize.width}" />`)
        .replace(/<meta property="og:image:height" content="[^"]*"\s*\/?>/, `<meta property="og:image:height" content="${imageSize.height}" />`)
    }
  }

  // hreflang:首页那 5 行指向 /,留着会让每个快照页都声称自己是首页的语言变体
  const hreflangBlock = HREFLANG_LANGS.map((lang) => {
    const href = lang === 'zh-CN' || lang === 'x-default' ? canonicalUrl : `${canonicalUrl}?lang=${lang}`
    return `  <link rel="alternate" hreflang="${lang}" href="${href}" />${EOL}`
  }).join('')
  const existingHreflang = /(?: {2}<link rel="alternate" hreflang="[^"]+" href="https:\/\/tangnotes\.site[^"]*" \/>\r?\n){5}/
  out = out.replace(existingHreflang, hreflangBlock)

  // 首帧前隐藏静态正文(与 generate-prerender-html.js 同一机制):
  // 抓取端不执行 JS,读得到;用户不会先看到一屏纯文字再被应用替换。
  const bootScript = '<script>document.documentElement.classList.add("js-booting")</script>'
  const bootStyle = '<style>html.js-booting #seo-static{visibility:hidden}</style>'
  if (out.includes('</head>')) out = out.replace('</head>', `${bootScript}${bootStyle}</head>`)

  const body = `${SEO_STYLE}<section id="seo-static">${snap.bodyHtml}</section>`
  // 注入的样式与正文是按 \n 拼的,统一换成模板文件的换行风格,
  // 避免同一份 HTML 里 CRLF/LF 混用(后续用文本工具处理时容易踩坑)
  const bodyForEol = EOL === '\n' ? body : body.replace(/\r?\n/g, EOL)
  return out.replace('<div id="root"></div>', `<div id="root">${bodyForEol}</div>`)
}

