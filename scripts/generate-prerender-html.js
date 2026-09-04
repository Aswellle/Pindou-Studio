/**
 * 构建后处理:为每个子路由生成预渲染静态 SEO HTML
 *
 * 字体加载由 main.jsx 的 JS 动态 import 完成(桌面端 ≥1025px 按需加载,
 * 移动端不执行不下载;失败仅降级到系统字体),字体文件随 CSS 由 Vite 打包。
 * 此处仅负责子路由预渲染 SEO HTML。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

  fs.writeFileSync(path.join(dist, page.file), out)
  console.log(`prerendered: ${page.file} -> ${url}`)
}
console.log(`完成 ${PAGES.length} 个预渲染页面`)
