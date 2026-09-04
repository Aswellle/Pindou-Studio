/**
 * 构建后处理:为首页与每个子路由生成预渲染静态 SEO HTML
 *
 * 1) 头部:每路由替换 title/description/canonical/hreflang/OG/Breadcrumb。
 * 2) 正文(C 批):把真实静态内容块注入 <div id="root"> 内。
 *    页面仍是 CSR,但 React 挂载时会把 #root 整体清空重绘——所以这段静态正文只
 *    会短暂存在:对真人(等 JS 起来)几乎不可见、也不会与 App 重复;对不执行 JS
 *    或只读原始 HTML 的抓取端(Baidu、部分 AI 引擎)则能被读到。内容从本地数据
 *    (tutorials.zh / zh-CN locale)在构建时生成,与产品文案保持同步。
 *
 * 字体加载由 main.jsx 的 JS 动态 import 完成(桌面端 ≥1025px 按需加载,
 * 移动端不执行不下载;失败仅降级到系统字体),字体文件随 CSS 由 Vite 打包。
 * 此处仅负责子路由预渲染 SEO HTML。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { TUTORIALS_ZH } from '../src/data/tutorials.zh.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '..', 'dist')
const SITE = 'https://tangnotes.site'

const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8')
// 保持源文件换行风格(index.html 在仓库中为 CRLF),避免注入段落与全文件换行不一致
const EOL = indexHtml.includes('\r\n') ? '\r\n' : '\n'

// 预检:index.html 必须包含全部待替换标签,否则预渲染页面会静默缺失 SEO meta(构建失败优于收录退化)
const REQUIRED_TAGS = [
  [/<title>.*?<\/title>/s, '<title>'],
  [/<meta name="description"[^>]*>/, 'meta description'],
  [/<meta name="robots"[^>]*>/, 'meta robots'],
  [/<link rel="canonical"[^>]*>/, 'link canonical'],
  [/<meta property="og:url"[^>]*>/, 'meta og:url'],
  [/<meta property="og:title"[^>]*>/, 'meta og:title'],
  [/<meta property="og:description"[^>]*>/, 'meta og:description'],
  [/hreflang="x-default"/, 'hreflang x-default'],
  [/<div id="root"><\/div>/, '<div id="root">'],
]
for (const [re, label] of REQUIRED_TAGS) {
  if (!re.test(indexHtml)) {
    throw new Error(`预渲染中止:index.html 缺少 ${label} 标签,替换无法生效`)
  }
}

// ── 多语言 hreflang:每路由指向本路由的语言变体 ─────────────
// zh-CN / x-default 指向裸路径;en / ja / ko 指向 ?lang= 变体(与 public/sitemap.xml 一致)。
// index.html 里首页的 5 行 hreflang 保持不动;子路由预渲染时整体改写。
const LANGS = ['zh-CN', 'en', 'ja', 'ko', 'x-default']
function langHref(lang, routePath) {
  const base = SITE + routePath
  if (lang === 'zh-CN' || lang === 'x-default') return base
  return `${base}?lang=${lang.toLowerCase()}`
}
function hreflangBlock(routePath) {
  return LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${langHref(l, routePath)}" />`).join(EOL)
}
// 匹配 index.html 中连续的多语言 hreflang 块(zh-CN 起,x-default 终),兼容 CRLF/LF
const hreflangLineRe = (lang) => `  <link rel="alternate" hreflang="${lang}" href="https://tangnotes\\.site[^"]*" />\\r?\\n`
const HREFLANG_BLOCK_RE = new RegExp(hreflangLineRe('zh-CN') + LANGS.slice(1).map(hreflangLineRe).join(''))

// 页面级面包屑 JSON-LD(仅内容子页注入;首页/隐私/条款/后台不带面包屑)
function breadcrumbScript(crumbs) {
  const body = crumbs
    .map(
      (c, i) =>
        [
          '      {',
          '        "@type": "ListItem",',
          `        "position": ${i + 1},`,
          `        "name": ${JSON.stringify(c.name)},`,
          `        "item": ${JSON.stringify(c.item)}`,
          '      }',
        ].join(EOL),
    )
    .join(',' + EOL)
  return [
    '  <!-- BreadcrumbList: 面包屑导航结构化数据 -->',
    '  <script type="application/ld+json">',
    '  {',
    '    "@context": "https://schema.org",',
    '    "@type": "BreadcrumbList",',
    '    "itemListElement": [',
    body,
    '    ]',
    '  }',
    '  </script>',
  ].join(EOL)
}

// ── 静态正文块(C 批):预渲染进 #root,React 挂载时整体替换 ──
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
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

function staticShell(inner) {
  return SEO_STYLE + `<section id="seo-static">${inner}</section>`
}

function escapeJsonLookup(locale, pathKey) {
  return pathKey.split('.').reduce((o, k) => (o == null ? o : o[k]), locale)
}

// 中文(默认界面语言)教程索引:6 大节 + 18 篇文章标题
function tutorialsStatic() {
  const b = []
  b.push('<h1>拼豆教程 · 从入门到进阶</h1>')
  b.push('<p class="lead">拼豆Studio 内置系统性的拼豆制作教程:从入门工具与第一个作品,到熨烫温度、防变形、配色设计、进阶技巧与成品保护,配有图示与温度对照表,新手与进阶玩家都适用。界面支持简体中文 / English / 日本語 / 한국어。</p>')
  for (const section of TUTORIALS_ZH) {
    b.push(`<h2>${esc(section.title)}</h2>`)
    b.push('<ul>')
    for (const t of section.children || []) b.push(`<li>${esc(t.title)}</li>`)
    b.push('</ul>')
  }
  b.push('<p class="note">每篇教程都可交互阅读;配合画布工具把图纸直接载入制作。</p>')
  return staticShell(b.join('\n'))
}

// 图库:模板分类 + 能力说明(内置数据驱动;云端模板库为运行时数据,不做数量断言)
function galleryStatic(locale) {
  const b = []
  const cats = locale.gallery && locale.gallery.categories
  const catNames = cats ? Object.keys(cats).filter((k) => k !== 'all').map((k) => cats[k]) : []
  b.push('<h1>拼豆图库与模板</h1>')
  b.push('<p class="lead">拼豆Studio 提供拼豆图纸模板库:按分类与难度挑选喜欢的图案,一键载入画布开始创作,也可以收藏到自己的作品集。</p>')
  b.push(`<h2>模板分类</h2>`)
  b.push(`<p>内置模板覆盖${catNames.join('、')}等主题,搭配六大拼豆品牌色卡(COCO/MARD/MARD291/Perler/Hama/Artkal)。</p>`)
  b.push('<h2>载入与重映射</h2>')
  b.push('<p>选中模板后即可直接开始拼制;如果手上的珠子来自其它品牌,可把整张图纸的颜色一键重映射到对应品牌色卡,让用珠量与实际色号一致。</p>')
  b.push('<p>注册登录后,个人作品与收藏会自动保存到云端,跨设备继续创作;后台也支持管理员持续扩充模板库。</p>')
  b.push('<p class="note">图库与教程配合使用,从模仿到原创。</p>')
  return staticShell(b.join('\n'))
}

// 首页:工具概述(面向爬虫与 AI 引擎的可读正文)
function homeStatic() {
  const b = []
  b.push('<h1>拼豆Studio · 免费在线拼豆图纸设计工具</h1>')
  b.push('<p class="lead">拼豆Studio 是一款免费、在线、无需安装的拼豆(熔珠/Perler Beads)图纸设计工具,界面支持简体中文 / English / 日本語 / 한국어。</p>')
  b.push('<h2>怎么用</h2>')
  b.push('<p>像网格画一样自由绘制拼豆图案:画笔、橡皮、区域填充与平移工具,加上撤销/重做,可以慢慢推敲;也可以把画好的图纸存进作品集。</p>')
  b.push('<p>想把喜欢的图片变成拼豆?上传图片后,工具会用 K-means 在 Lab 色彩空间挑选配色,再用 CIEDE2000 感知均匀算法把每个像素匹配到最近的珠色,并配合抖动与细化算法还原细节——一键得到像素拼豆图纸。</p>')
  b.push('<h2>支持六大拼豆品牌色卡</h2>')
  b.push('<p>内置六套真实品牌色卡,按你实际购买的珠子选色:COCO(中国,小颗粒)、MARD(中国)、MARD 291(中国,扩展色)、Perler(美国)、Hama(丹麦)、Artkal(中国/荷兰),共上千种颜色。</p>')
  b.push('<h2>导出与分享</h2>')
  b.push('<p>可导出高清 PNG 或 SVG 拼豆图纸:专业模式在每个格子上标注品牌色号并附颜色清单,适合照着图纸制作;逼真模式模拟珠子质感,适合展示与分享成品。</p>')
  b.push('<p>内置模板库与 18 篇从入门到进阶的多语言教程,新手到进阶玩家都能直接上手。</p>')
  return staticShell(b.join('\n'))
}

// 供脚本按路由取静态正文(无正文页为 null)
const zhLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'locales', 'zh-CN.json'), 'utf-8'))
const ROOT_STATIC = {
  '/': homeStatic(),
  '/gallery': galleryStatic(zhLocale),
  '/tutorials': tutorialsStatic(),
}

function injectRoot(html, inner) {
  return inner ? html.replace('<div id="root"></div>', '<div id="root">' + inner + '</div>') : html
}

// ── 子路由预渲染 SEO HTML ─────────────────────────────────
const PAGES = [
  {
    file: 'gallery.html',
    path: '/gallery',
    title: '拼豆图库与模板 - 拼豆Studio',
    desc: '浏览并收藏拼豆图案模板，按分类与难度筛选，一键载入画布开始创作。支持收藏与作品管理，适合拼豆爱好者和手工达人。',
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆图库与模板', item: `${SITE}/gallery` },
    ],
  },
  {
    file: 'tutorials.html',
    path: '/tutorials',
    title: '拼豆教程 - 从入门到进阶 · 拼豆Studio',
    desc: '系统学习拼豆制作：入门指南、熨烫全解、防变形技巧、配色设计、进阶技巧与作品保护，配有图示与温度对照表，新手友好。',
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆教程', item: `${SITE}/tutorials` },
    ],
  },
  {
    file: 'admin.html',
    path: '/admin',
    title: '后台管理 - 拼豆Studio',
    desc: '拼豆Studio 站点后台管理。',
    noindex: true,
  },
  {
    file: 'privacy.html',
    path: '/privacy',
    title: '隐私政策 - 拼豆Studio',
    desc: '了解拼豆Studio如何收集、使用和保护您的个人信息，以及账号验证、云端存储与第三方服务的详细说明。',
  },
  {
    file: 'terms.html',
    path: '/terms',
    title: '服务条款 - 拼豆Studio',
    desc: '使用拼豆Studio在线拼豆图纸设计工具的服务条款：账户安全、用户内容、模板库与使用规范。',
  },
]

// 首页:仅注入静态正文(head 保持 Vite 产物原样)
const homeHtml = injectRoot(indexHtml, ROOT_STATIC['/'])
fs.writeFileSync(path.join(dist, 'index.html'), homeHtml)
console.log('prerendered: index.html -> / (static body injected)')

for (const page of PAGES) {
  const url = SITE + page.path
  const robots = page.noindex
    ? '<meta name="robots" content="noindex, nofollow" />'
    : '<meta name="robots" content="index, follow" />'

  let out = indexHtml
    .replace(/<title>.*?<\/title>/s, `<title>${page.title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${page.desc}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, robots)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${page.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${page.desc}" />`)

  // 改写 hreflang 指向本路由语言变体,避免整站都指向首页
  if (!HREFLANG_BLOCK_RE.test(out)) {
    throw new Error(`预渲染中止:index.html 多语言 hreflang 块缺失或结构变化,${page.file} 无法改写`)
  }
  out = out.replace(HREFLANG_BLOCK_RE, hreflangBlock(page.path))

  // 面包屑只给内容子页注入
  if (page.breadcrumb) {
    out = out.replace('</head>', breadcrumbScript(page.breadcrumb) + EOL + '</head>')
  }

  // 静态正文(仅首页/图库/教程;隐私/条款/后台保持空 root)
  if (ROOT_STATIC[page.path]) {
    out = injectRoot(out, ROOT_STATIC[page.path])
  }

  fs.writeFileSync(path.join(dist, page.file), out)
  console.log(`prerendered: ${page.file} -> ${url}`)
}
console.log(`完成 ${PAGES.length} 个预渲染页面 + 首页静态正文`)
