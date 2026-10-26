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

// ── 部署标识 ────────────────────────────────────────────────
//
// 构建产物里写一个只有本次构建才有的标识,部署后可以用它确认
// 「这份 dist 已经在线上」—— IndexNow 提交脚本靠它判断是否可以开始通知。
// 若只看 sitemap 是否可达,旧部署同样能返回 200,新内容却还没上线,
// 提交过去只会让搜索引擎抓到 404 或旧页面。
//
// 取值优先级:
//   1. VERCEL_GIT_COMMIT_SHA —— 实际部署由 Vercel 构建,只有它带着 commit sha。
//      用 GitHub Actions 的 GITHUB_SHA 是错的:CI 里那个构建产物并不上线,
//      Vercel 重新构建时没有这个变量,两边算出来的标识永远对不上。
//   2. GITHUB_SHA —— 非 Vercel 环境(本地模拟 CI)时可用。
//   3. 随机串 —— 本地构建。
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12)
  || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const BUILD_META = `<meta name="build-id" content="${BUILD_ID}" />`

// 先把标识写进 index.html,后续所有派生页面都从它复制,不会漏页。
// 放在 charset 之后:解析器在读到 charset 前不该遇到非 ASCII,这里虽全是 ASCII,
// 但保持「charset 尽量靠前」的既有结构更稳。
const indexWithBuildId = indexHtml.includes('<meta charset="UTF-8" />')
  ? indexHtml.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />${EOL}  ${BUILD_META}`)
  : indexHtml
if (!indexWithBuildId.includes(BUILD_META)) {
  throw new Error('预渲染中止:无法写入 build-id 标识(meta charset 结构可能已变化)')
}

// 预检:index.html 必须包含全部待替换标签,否则预渲染页面会静默缺失 SEO meta(构建失败优于收录退化)
//
// 匹配式一律写成 `...content="..."[^>]*>` —— index.html 里的这些标签带
// data-rh="true"(见下方 HEAD_ATTR 的说明),用 `\s*\/?>` 收尾会匹配不到,
// 替换静默失效、页面却照常产出。`[^>]*` 容忍结尾任意属性,标签以后再加属性也不会失灵。
const REQUIRED_TAGS = [
  [/<title>.*?<\/title>/s, '<title>'],
  [/<meta name="description" content="[^"]*"[^>]*>/, 'meta description'],
  [/<meta name="robots" content="[^"]*"[^>]*>/, 'meta robots'],
  [/<link rel="canonical" href="[^"]*"[^>]*>/, 'link canonical'],
  [/<meta property="og:url" content="[^"]*"[^>]*>/, 'meta og:url'],
  [/<meta property="og:title" content="[^"]*"[^>]*>/, 'meta og:title'],
  [/<meta property="og:description" content="[^"]*"[^>]*>/, 'meta og:description'],
  [/hreflang="x-default"/, 'hreflang x-default'],
  [/<div id="root"><\/div>/, '<div id="root">'],
]
for (const [re, label] of REQUIRED_TAGS) {
  if (!re.test(indexHtml)) {
    throw new Error(`预渲染中止:index.html 缺少 ${label} 标签,替换无法生效`)
  }
}

/**
 * head 标签上的 data-rh 标记。
 *
 * react-helmet-async 的 updateTags 只清理 `head.querySelectorAll('meta[data-rh]')`
 * 命中的旧标签;预渲染写死在 HTML 里的标签不带该属性时,Helmet 首帧提交会**再追加
 * 一份**,页面就出现两条 canonical / 两条 robots / 两条 description —— canonical
 * 与 robots 出现多条时,搜索引擎按「第一条」或直接判为无效,noindex 页的
 * `index, follow` 也可能压过 `noindex`。
 *
 * 反过来也要注意:凡是带了这个属性、但 Helmet 并没有渲染的标签,会在首帧被当成
 * 「上一轮留下的旧标签」删掉。所以只有 App.jsx 的 seoHelmet 与 ContentSeo.jsx
 * 真正渲染的那几个标签才带它(keywords / og:site_name / og:locale / og:image:* 不带)。
 */
const HEAD_ATTR = ' data-rh="true"'

// ── 多语言 hreflang:每路由指向本路由的语言变体 ─────────────
// zh-CN / x-default 指向裸路径;en / ja / ko 指向 ?lang= 变体(与 public/sitemap.xml 一致)。
// index.html 里首页的 5 行 hreflang 保持不动;子路由预渲染时整体改写。
//
// 这几行 link 在 index.html 里带 data-rh="true"(见 index.html 的说明):
// react-helmet-async 只清理带该属性的旧标签,预渲染写死的标签不带它就会在首帧
// 被再追加一份,页面出现两条 canonical。所以这里的改写必须原样保留该属性。
const LANGS = ['zh-CN', 'en', 'ja', 'ko', 'x-default']
function langHref(lang, routePath) {
  const base = SITE + routePath
  if (lang === 'zh-CN' || lang === 'x-default') return base
  return `${base}?lang=${lang.toLowerCase()}`
}
// 单语页(隐私政策 / 服务条款)只声明自身与 x-default。
// 这两页正文写死在 LegalPages.jsx 里、只有中文,`?lang=en` 返回的仍是中文内容 ——
// 声明 en/ja/ko 变体会让 hreflang 指向语言不符的页面,Google 会整组忽略,
// 与 public/sitemap.xml 里「正文为中文单语,不提供 ?lang= 变体」的说明也自相矛盾。
function hreflangBlock(routePath, singleLanguage = false) {
  const langs = singleLanguage ? ['zh-CN', 'x-default'] : LANGS
  return langs
    .map((l) => `  <link rel="alternate" hreflang="${l}" href="${langHref(l, routePath)}" data-rh="true" />`)
    .join(EOL)
}
// 匹配 index.html 中连续的多语言 hreflang 块(zh-CN 起,x-default 终),兼容 CRLF/LF
const hreflangLineRe = (lang) => `  <link rel="alternate" hreflang="${lang}" href="https://tangnotes\\.site[^"]*" data-rh="true" />\\r?\\n`
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

/**
 * 站内链接。
 *
 * 静态正文此前全是纯文本,`<a href>` 数量为 0 —— 而 Google / Bing / 搜狗 / 百度
 * 都要求「重要页面能被标准 <a href> 到达」。SPA 的导航是 React 挂载后才渲染的,
 * 不执行 JS 的抓取端只看得到这些预渲染块,没有链接就意味着 /gallery 下的模板详情
 * 页只能靠 sitemap 发现,而 sitemap 是弱信号。
 *
 * 链接目标全部是站内已存在的路由,不引入新页面。
 */
function link(href, text) {
  return `<a href="${href}">${esc(text)}</a>`
}

// 页面底部固定的站内导航:让每个预渲染页都至少有一条通往主要栏目的路径。
function siteNav(exclude = '') {
  const items = [
    ['/', '拼豆画布工具'],
    ['/gallery', '拼豆图库与模板'],
    ['/tutorials', '拼豆教程'],
    ['/my/beads', '我的色卡与库存'],
  ].filter(([href]) => href !== exclude)
  return `<p class="note">继续浏览:${items.map(([href, text]) => link(href, text)).join(' · ')}</p>`
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
  b.push('<p>每篇教程都可交互阅读;配合画布工具把图纸直接载入制作。</p>')
  b.push(siteNav('/tutorials'))
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
  b.push(siteNav('/gallery'))
  return staticShell(b.join('\n'))
}

/**
 * 首页静态正文。
 *
 * 此前首页是空壳 `<div id="root"></div>` —— 理由写在 injectRoot 的注释里:
 * 怕用户在 JS 就绪前先看到一屏文字。但那是**没有守卫机制时**的判断;现在
 * `html.js-booting #seo-static{visibility:hidden}` 已经在首帧前把静态正文藏好,
 * 用户看不到它,而不执行 JS 的抓取端(百度 / 搜狗 / 360 / Bing 的部分管线)
 * 读得到。首页是全站权重最高、也是唯一 priority 1.0 的页面,留空壳等于把
 * 最大的一个入口交给「资源空短」判定。
 *
 * 正文内容全部是产品真实能力,不含任何 App 里没有的说法 —— 静态正文必须是
 * 应用真实内容的子集,否则就从预渲染变成伪装内容(cloaking)。
 */
function homeStatic() {
  const b = []
  b.push('<h1>拼豆Studio · 免费在线拼豆图纸生成器</h1>')
  b.push('<p class="lead">在浏览器里直接设计拼豆图纸:自由绘制像素图案,或上传一张图片一键转成拼豆图纸,配色按 CIEDE2000 感知色差匹配真实品牌色卡,最后导出带色号的专业 PNG / SVG 图纸。无需注册即可使用。</p>')

  b.push('<h2>能做什么</h2>')
  b.push('<ul>')
  b.push('<li>自由绘制:画笔、橡皮、油漆桶填充、抓手平移,支持矩形与自定义尺寸网格</li>')
  b.push('<li>图片转拼豆:上传照片自动量化为像素拼豆图纸,可选 Floyd-Steinberg 或 Bayer 抖动</li>')
  b.push('<li>真实品牌配色:COCO / MARD / MARD291 / Perler / Hama / Artkal 六大色卡,按 CIEDE2000 取最接近的豆子</li>')
  b.push('<li>专业导出:PNG / SVG 图纸,可带每颗豆子的品牌色号、颜色清单与用量统计</li>')
  b.push('<li>模板与教程:内置图纸模板可一键载入画布,配套从入门到进阶的中文教程</li>')
  b.push('</ul>')

  b.push('<h2>适合谁</h2>')
  b.push('<p>拼豆新手、亲子手工、像素画爱好者,以及需要按品牌色号备料的手工创作者。界面支持简体中文、English、日本語、한국어。</p>')

  b.push(siteNav('/'))
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
  // 把构建期生成的静态正文注入 #root:不执行 JS 的抓取端(百度 / 搜狗 / 360 及部分 AI 引擎)
  // 能读到真实正文,而非只有一个空 <div id="root">。执行 JS 的浏览器在 React 首帧渲染时
  // 会用应用替换掉它 —— 这是标准预渲染(SSG)行为,抓取端与用户看到的是同一份 HTML,
  // 不属于「隐藏文字/伪装内容」。
  //
  // 为什么还要内联隐藏:JS 下载 + 解析 + React 首帧需要几百毫秒,这段时间用户会看到
  // 一屏「纯文字」,然后突然被应用替换 —— 视觉上像加载错页。这里在 <head> 末尾放一段
  // 同步脚本,在**首次绘制之前**给 <html> 加 .js-booting,由 CSS 把 #seo-static 隐藏;
  // React 首帧挂载后移除该类,静态正文也就随 #root 一起被替换。
  // 不执行 JS 的抓取端不会加这个类,因此仍然读得到正文。
  //
  // 范围:内容页与首页(/、/gallery、/tutorials)。首页此前被排除,理由是「注入正文会在
  // JS 就绪前闪出一屏文字」——但那个判断成立的前提是**没有守卫**;现在守卫已经在首帧前
  // 把 #seo-static 藏好,用户根本看不到它,而抓取端读得到。首页是全站权重最高的一页,
  // 留空壳会被判「资源空短」。隐私 / 条款 / 后台保持空 root(法务页正文在 JS 里,后台 noindex)。
  if (!inner) return html

  const bootScript = '<script>document.documentElement.classList.add("js-booting")</script>'
  const bootStyle = '<style>html.js-booting #seo-static{visibility:hidden}</style>'
  const withGuard = html.includes('</head>')
    ? html.replace('</head>', `${bootScript}${bootStyle}</head>`)
    : html
  return withGuard.replace('<div id="root"></div>', `<div id="root">${inner}</div>`)
}

// ── 子路由预渲染 SEO HTML ─────────────────────────────────
const PAGES = [
  {
    file: 'gallery.html',
    path: '/gallery',
    title: '拼豆图库与模板 - 拼豆Studio',
    desc: '浏览拼豆图案模板库：按主题、分类与难度筛选，一键载入画布开始创作，也能把图纸颜色一键重映射到手上的品牌色卡，支持收藏与云端作品管理。',
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆图库与模板', item: `${SITE}/gallery` },
    ],
  },
  {
    file: 'tutorials.html',
    path: '/tutorials',
    title: '拼豆教程 - 从入门到进阶 · 拼豆Studio',
    desc: '系统学习拼豆制作：入门工具与第一个作品、熨烫温度全解、防变形技巧、配色设计、进阶技巧与成品保护，配有图示与温度对照表，新手与进阶玩家都适用。',
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
    singleLanguage: true,
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '隐私政策', item: `${SITE}/privacy` },
    ],
  },
  {
    file: 'terms.html',
    path: '/terms',
    title: '服务条款 - 拼豆Studio',
    desc: '使用拼豆Studio在线拼豆图纸设计工具的服务条款：账户安全、用户内容、模板库与使用规范。',
    singleLanguage: true,
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '服务条款', item: `${SITE}/terms` },
    ],
  },
]

// 首页:注入静态正文(与 /gallery、/tutorials 同一套首帧守卫机制)
const homeHtml = injectRoot(indexWithBuildId, ROOT_STATIC['/'])
fs.writeFileSync(path.join(dist, 'index.html'), homeHtml)
console.log('prerendered: index.html -> / (with static body)')

// ── SPA 兜底壳 ───────────────────────────────────────────
//
// 动态内容页(/gallery/theme|collection|pattern)与私有页(/login、/profile …)没有
// 构建期静态文件,靠 vercel.json 的 rewrite 落到某个 HTML。此前它们全部落到
// index.html —— 也就是首页那份正文。这带来两个问题:
//   · 抓取端访问一个尚不存在的新模板 URL,读到的是首页正文(内容与 URL 不符);
//   · 首页现在有静态正文了,把它当作所有兜底路由的模板会让同一份正文出现在
//     任意多个 URL 上,制造重复内容。
//
// 所以单独产出一份**不带静态正文**的空壳:meta 是站点级的,页面由 React 渲染。
// 已有的内容快照(og-snapshot 产出的 index.html)是静态文件,优先级高于 rewrite,
// 不受影响;只有构建后才发布的新内容会落到这个壳。
//
// canonical / og:url 一并删掉,而不是指向首页:这个壳服务的是**任意**动态 URL
// (新发布的图纸、新主题、/login 等)。声明 canonical=https://tangnotes.site/ 等于
// 告诉搜索引擎「这些页面都是首页的副本」,新内容会被直接排除索引;删掉之后
// 抓取端按自指处理,React 挂载后 Helmet 再写入真正的 canonical。
const spaHtml = indexWithBuildId
  .replace(/<title>.*?<\/title>/s, '<title>拼豆Studio - 免费在线拼豆图纸生成</title>')
  .replace(
    /<meta name="description" content="[^"]*"[^>]*>/,
    `<meta name="description" content="拼豆Studio 免费在线拼豆图纸生成工具：自由绘制或上传图片转像素拼豆，支持六大品牌色卡与 PNG/SVG 图纸导出。"${HEAD_ATTR} />`,
  )
  .replace(/\s*<link rel="canonical" href="[^"]*"[^>]*>/, '')
  .replace(/\s*<meta property="og:url" content="[^"]*"[^>]*>/, '')
  // hreflang 同理:壳不知道自己是哪个页面,留着首页那 5 行等于声称本页是首页的
  // 语言变体。整块删掉(未声明不算错),Helmet 挂载后按真实路由重新写入。
  .replace(HREFLANG_BLOCK_RE, '')
fs.writeFileSync(path.join(dist, 'spa.html'), spaHtml)
console.log('prerendered: spa.html -> SPA fallback shell (no static body)')

// ── 404 页 ───────────────────────────────────────────────
//
// 此前 vercel.json 的兜底 rewrite 是 `/:path*` → index.html:任何不存在的 URL 都
// 返回 200 + 首页,再由 React 的 `*` 路由跳回 `/`。百度、Google、Bing 都明确把
// 这种「200 的软 404」列为应避免的做法 —— 它会制造无限多个可索引的重复 URL。
// 现在兜底 rewrite 只覆盖真实存在的路由,未命中路径由 Vercel 返回 404.html
// (状态码 404),页面内给出返回入口。
const notFoundBody = staticShell([
  '<h1>页面不存在</h1>',
  '<p class="lead">这个地址没有对应的内容。可能是链接过期,或者图纸已被作者删除。</p>',
  `<p>${link('/', '返回拼豆画布工具')} · ${link('/gallery', '浏览拼豆图库')} · ${link('/tutorials', '阅读拼豆教程')}</p>`,
].join('\n'))
const notFoundHtml = indexWithBuildId
  .replace(/<title>.*?<\/title>/s, '<title>页面不存在 - 拼豆Studio</title>')
  .replace(
    /<meta name="description" content="[^"]*"[^>]*>/,
    `<meta name="description" content="该地址没有对应的内容。"${HEAD_ATTR} />`,
  )
  .replace(/<meta name="robots" content="[^"]*"[^>]*>/, `<meta name="robots" content="noindex, nofollow"${HEAD_ATTR} />`)
  .replace(/<link rel="canonical" href="[^"]*"[^>]*>/, `<link rel="canonical" href="${SITE}/"${HEAD_ATTR} />`)
  .replace(/<meta property="og:url" content="[^"]*"[^>]*>/, `<meta property="og:url" content="${SITE}/"${HEAD_ATTR} />`)
  .replace('<div id="root"></div>', `<div id="root">${notFoundBody}</div>`)
fs.writeFileSync(path.join(dist, '404.html'), notFoundHtml)
console.log('prerendered: 404.html -> not-found page')

for (const page of PAGES) {
  const url = SITE + page.path
  // robots 指令与首页(index.html)及运行时 Helmet 保持一致,避免同一站出现两种写法
  const robots = page.noindex
    ? `<meta name="robots" content="noindex, nofollow"${HEAD_ATTR} />`
    : `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"${HEAD_ATTR} />`

  let out = indexWithBuildId
    .replace(/<title>.*?<\/title>/s, `<title>${page.title}</title>`)
    .replace(/<meta name="description" content="[^"]*"[^>]*>/, `<meta name="description" content="${page.desc}"${HEAD_ATTR} />`)
    .replace(/<meta name="robots" content="[^"]*"[^>]*>/, robots)
    .replace(/<link rel="canonical" href="[^"]*"[^>]*>/, `<link rel="canonical" href="${url}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:url" content="[^"]*"[^>]*>/, `<meta property="og:url" content="${url}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:title" content="[^"]*"[^>]*>/, `<meta property="og:title" content="${page.title}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:description" content="[^"]*"[^>]*>/, `<meta property="og:description" content="${page.desc}"${HEAD_ATTR} />`)

  // 改写 hreflang 指向本路由语言变体,避免整站都指向首页
  if (!HREFLANG_BLOCK_RE.test(out)) {
    throw new Error(`预渲染中止:index.html 多语言 hreflang 块缺失或结构变化,${page.file} 无法改写`)
  }
  out = out.replace(HREFLANG_BLOCK_RE, hreflangBlock(page.path, page.singleLanguage))

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
console.log(`完成 ${PAGES.length} 个预渲染页面(静态正文:首页 /gallery /tutorials)`)
