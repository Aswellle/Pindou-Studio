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
import { FAQ_PAGE_TEXT, faqItemsFor } from '../src/data/faq.js'
import { GALLERY_CATEGORY_META, categoryPagePath } from '../src/features/gallery/categoryMeta.js'
import {
  BRAND_INTROS,
  COLOR_CHARTS_SEO,
  brandSeo,
  colorBrands,
  colorChartPath,
  colorGroups,
  groupLabel,
} from '../src/features/colors/colorCharts.js'
import { SEO_TEMPLATE_PATH } from './seo-template.mjs'
import { clampSeoDescription } from '../src/utils/seoText.js'
import { IRONING_RULES, IRONING_SOURCES, ironingReference, tutorialArticle } from '../src/features/tools/ironingGuide.js'
import { beadPresetRows } from '../src/features/tools/beadCalculator.js'
import {
  BEAD_PATTERNS_SEO,
  CALCULATOR_SEO,
  IRONING_SEO,
  PIXEL_ART_SEO,
} from '../src/features/tools/toolSeo.js'
import {
  PATTERN_ARTICLE_IDS,
  PATTERN_TIPS,
  PATTERN_WAYS,
  PIXEL_ARTICLE_IDS,
  PIXEL_FEATURES,
  PIXEL_GRID_USES,
  PIXEL_STEPS,
} from '../src/features/tools/landingContent.js'

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

// 把「带 build-id + 空 #root」的干净模板留给动态快照脚本。
// 必须在写首页(注入静态正文)之前落盘:快照要往 #root 注入自己的正文,
// 不能从已经塞满首页内容的 dist/index.html 复制。
fs.writeFileSync(SEO_TEMPLATE_PATH, indexWithBuildId)

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

// ── 多语言 hreflang:只声明 zh-CN 与 x-default ─────────────
// `?lang=en|ja|ko` 是界面语言偏好,不是独立可收录版本:一套静态 HTML 服务所有
// 语言,声明成语言变体会让抓取端看到「中文内容 + 英文 alternate」。此前运行时
// 还把 ?lang= 页的 canonical 改成自指、静态 HTML 却是裸路径 —— 同一页面两套
// canonical,是 GSC「Google 选择的规范网页与用户指定的不同」的主要来源。
// 现在所有页面统一:canonical 一律裸路径,hreflang 只保留默认语言。
// 将来若要吃多语言搜索流量,必须按语言输出独立路径的 HTML,而不是恢复 ?lang=。
//
// 这几行 link 在 index.html 里带 data-rh="true"(见 index.html 的说明):
// react-helmet-async 只清理带该属性的旧标签,预渲染写死的标签不带它就会在首帧
// 被再追加一份,页面出现两条 canonical。所以这里的改写必须原样保留该属性。
const LANGS = ['zh-CN', 'x-default']
function hreflangBlock(routePath) {
  return LANGS
    .map((l) => `  <link rel="alternate" hreflang="${l}" href="${SITE}${routePath}" data-rh="true" />`)
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

/**
 * 图片转拼豆落地页的 HowTo JSON-LD。
 * 三个步骤与 /create/image 页面顶部的 1-2-3 步骤条一一对应,不做超出界面的声明。
 */
function howToScript() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: '如何把图片转换成拼豆图纸',
    description: '上传图片，选择色卡、画布尺寸与目标颜色数，生成带品牌色号的拼豆图纸。',
    totalTime: 'PT2M',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: '上传图片',
        text: '上传 PNG、JPEG、WebP、GIF、AVIF、HEIC 或 PDF 图片，也可以直接粘贴。',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: '调整设置',
        text: '选择 COCO / MARD / Perler 等目标色卡、画布尺寸与目标颜色数。',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: '预览并生成',
        text: '确认像素预览后生成图纸，可继续在画布中编辑或导出 PNG / SVG。',
      },
    ],
  }
  return [
    '  <!-- HowTo: 图片转拼豆步骤(与页面步骤条一致) -->',
    '  <script type="application/ld+json">',
    JSON.stringify(data, null, 2),
    '  </script>',
  ].join(EOL)
}

/**
 * 常见问题页的 FAQPage JSON-LD。
 *
 * 直接取页面静态正文使用的同一份中文问答数据 —— 结构化数据必须与用户
 * 可见内容一致,否则会被判为误导性标记。答案里若出现 `<` 等字符,
 * JSON.stringify 后统一转义,避免与 HTML 解析器冲突。
 */
function faqPageScript() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'zh-CN',
    mainEntity: faqItemsFor('zh').map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
  return [
    '  <!-- FAQPage: 常见问题问答(与页面可见内容一致) -->',
    '  <script type="application/ld+json">',
    JSON.stringify(data, null, 2)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026'),
    '  </script>',
  ].join(EOL)
}

/**
 * 聚合页(图库/教程)的 CollectionPage JSON-LD。
 *
 * 只描述页面本身:名称、描述、所属站点与对应应用实体,与静态正文一一对应,
 * 不添加正文里没有的信息(误导性结构化数据会被搜索引擎忽略)。
 */
function collectionPageScript(page) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE}${page.path}#webpage`,
    url: `${SITE}${page.path}`,
    name: page.title,
    description: page.desc,
    inLanguage: 'zh-CN',
    isPartOf: { '@id': `${SITE}/#website` },
    about: { '@id': `${SITE}/#app` },
  }
  return [
    '  <!-- CollectionPage: 聚合页主题与归属 -->',
    '  <script type="application/ld+json">',
    JSON.stringify(data, null, 2),
    '  </script>',
  ].join(EOL)
}

// ── 静态正文块(C 批):预渲染进 #root,React 挂载时整体替换 ──
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// 属性值(meta content 等)必须额外转义引号,正文里的 esc 不处理引号
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
// 描述截断统一走 src/utils/seoText.js:与运行时 Helmet(Tutorials.jsx)共用同一套
// 规则,保证抓取端与浏览器看到同一条 description;并优先在句末标点收尾。
const clampDesc = clampSeoDescription
const SEO_STYLE = `<style>
    #seo-static{max-width:860px;margin:0 auto;padding:32px 20px 60px;color:#33291f;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.8;box-sizing:border-box}
    #seo-static h1{font-size:26px;line-height:1.45;margin:0 0 6px}
    #seo-static .lead{font-size:16px;color:#5d5147;margin:0 0 18px}
    #seo-static h2{font-size:19px;margin:22px 0 8px}
    #seo-static ul{margin:0 0 12px;padding-left:22px}
    #seo-static li{margin:3px 0}
    #seo-static table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 20px}
    #seo-static th,#seo-static td{border-bottom:1px solid #e8ded1;padding:4px 8px;text-align:left}
    #seo-static thead th{background:#f6efe4;font-weight:600}
    #seo-static .swatch{display:inline-block;width:16px;height:16px;border-radius:3px;border:1px solid rgba(43,36,32,.15);vertical-align:-3px}
    #seo-static .note{color:#7a6c60;font-size:13px;margin-top:20px}
    #seo-static a{color:#d96a3f;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(217,106,63,.4)}
    #seo-static a:hover{text-decoration-color:#d96a3f}
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
    ['/create/image', '图片转拼豆图纸工具'],
    ['/my/beads', '我的色卡与库存'],
    ['/colors', '拼豆色卡对照表'],
    ['/ironing', '拼豆熨烫温度对照表'],
    ['/bead-calculator', '豆子数量计算器'],
    ['/bead-patterns', '拼豆图案'],
    ['/pixel-art', '像素画生成器'],
    ['/faq', '拼豆常见问题'],
  ].filter(([href]) => href !== exclude)
  return `<p class="note">继续浏览:${items.map(([href, text]) => link(href, text)).join(' · ')}</p>`
}

/**
 * 教程首段摘要:不执行 JS 的抓取端(百度/搜狗/360)此前只能看到标题列表,
 * 页面显得内容单薄。这里取应用内真实展示的正文首段(压缩空白、限长),
 * 不新增任何教程里没有的说法。
 */
function firstParagraph(tutorial) {
  const block = (tutorial.blocks || []).find((b) => b && b.type === 'paragraph' && b.text)
  if (!block) return ''
  const text = block.text.replace(/\s+/g, ' ').trim()
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

// 中文(默认界面语言)教程索引:6 大节 + 18 篇教程(标题 + 首段摘要)
function tutorialsStatic() {
  const b = []
  b.push('<h1>拼豆教程 · 从入门到进阶</h1>')
  b.push('<p class="lead">拼豆Studio 内置系统性的拼豆制作教程:从入门工具与第一个作品,到熨烫温度、防变形、配色设计、进阶技巧与成品保护,配有图示与温度对照表,新手与进阶玩家都适用。界面支持简体中文 / English / 日本語 / 한국어。</p>')
  for (const section of TUTORIALS_ZH) {
    b.push(`<h2>${esc(section.title)}</h2>`)
    b.push('<ul>')
    for (const t of section.children || []) {
      const summary = firstParagraph(t)
      const titleLink = link(`/tutorials/${t.id}`, t.title)
      b.push(summary
        ? `<li><strong>${titleLink}</strong>:${esc(summary)}</li>`
        : `<li>${titleLink}</li>`)
    }
    b.push('</ul>')
  }
  b.push(`<p>每篇教程都可交互阅读。看完后可以回到${link('/', '拼豆图纸生成器')}把图片转成拼豆图纸,或从${link('/gallery', '拼豆图纸模板库')}挑选现成图纸直接载入制作。</p>`)
  b.push(siteNav('/tutorials'))
  return staticShell(b.join('\n'))
}

// 图库:模板分类 + 能力说明(内置数据驱动;云端模板库为运行时数据,不做数量断言)
function galleryStatic(locale) {
  const b = []
  const cats = locale.gallery && locale.gallery.categories
  const catNames = cats ? Object.keys(cats).filter((k) => k !== 'all').map((k) => cats[k]) : []
  b.push('<h1>拼豆图库与模板</h1>')
  b.push('<p class="lead">拼豆Studio 提供免费拼豆图纸模板库:按主题、分类与难度挑选像素画图案,一键载入画布开始创作,也可以收藏到自己的作品集。</p>')
  b.push('<h2>免费拼豆图纸模板</h2>')
  b.push('<p>模板按主题与难度组织,点开即可查看网格尺寸与用色;选中后直接载入画布,就能按图纸开始拼制或继续修改。</p>')
  b.push(`<h2>模板分类</h2>`)
  b.push(`<p>内置模板覆盖${catNames.join('、')}等主题,搭配六大拼豆品牌色卡(COCO/MARD/MARD291/Perler/Hama/Artkal)。</p>`)
  // 分类聚合页入口:抓取端从图库页沿标准 <a href> 发现这些独立收录页,
  // 不依赖只在 JS 挂载后才出现的侧栏分类按钮。
  b.push('<h2>按分类浏览</h2>')
  b.push('<ul>')
  for (const meta of GALLERY_CATEGORY_META) {
    b.push(`<li>${link(categoryPagePath(meta.slug), `${meta.label}拼豆图纸`)}</li>`)
  }
  b.push('</ul>')
  b.push('<h2>载入与重映射</h2>')
  b.push('<p>选中模板后即可直接开始拼制;如果手上的珠子来自其它品牌,可把整张图纸的颜色一键重映射到对应品牌色卡,让用珠量与实际色号一致。</p>')
  b.push(`<p>想先了解制作方法,可以阅读${link('/tutorials', '拼豆教程')};想自己画一张图纸,可以回到${link('/', '在线拼豆图纸工具')}。</p>`)
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
  b.push('<p class="lead">在浏览器里直接设计拼豆图纸:上传图片一键转拼豆图纸,或自由绘制像素画与网格图案;配色按 CIEDE2000 感知色差匹配真实品牌色卡,最后导出带色号的专业 PNG / SVG 图纸。无需注册即可使用。</p>')

  b.push('<h2>能做什么</h2>')
  b.push('<ul>')
  b.push('<li>自由绘制:画笔、橡皮、油漆桶填充、抓手平移,支持矩形与自定义尺寸网格</li>')
  b.push('<li>图片转拼豆:上传照片自动量化为像素拼豆图纸,可选 Floyd-Steinberg 或 Bayer 抖动</li>')
  b.push('<li>真实品牌配色:COCO / MARD / MARD291 / Perler / Hama / Artkal 六大色卡,按 CIEDE2000 取最接近的豆子</li>')
  b.push('<li>专业导出:PNG / SVG 图纸,可带每颗豆子的品牌色号、颜色清单与用量统计</li>')
  b.push('<li>分享图纸:把作品一键生成公开分享链接与社交卡片,访客无需注册即可在线查看</li>')
  b.push('<li>模板与教程:内置图纸模板可一键载入画布,配套从入门到进阶的中文教程</li>')
  b.push('</ul>')

  b.push('<h2>图片转拼豆图纸</h2>')
  b.push(`<p>上传照片或插画,工具会把图片量化为指定网格尺寸的像素拼豆图纸;可选 Floyd-Steinberg 或 Bayer 抖动控制渐变与细节,并按 CIEDE2000 匹配最接近的 COCO / MARD / MARD291 / Perler / Hama / Artkal 色号。头像、宠物、动漫角色都可以转换成拼豆图纸。打开${link('/create/image', '图片转拼豆图纸工具')}开始转换。</p>`)

  b.push('<h2>像素画与网格化创作</h2>')
  b.push('<p>除了图片转换,也可以从空白网格开始绘制像素画:画笔、橡皮、油漆桶填充、矩形与套索选区、移动与镜像,网格尺寸可自定义,适合自由创作、改图或按图纸复刻。</p>')

  b.push('<h2>拼豆图纸模板与免费图库</h2>')
  b.push(`<p>${link('/gallery', '拼豆图纸模板库')}提供按主题与难度分类的免费图纸,一键载入画布即可开始制作;如果手上的珠子来自其它品牌,可把整张图纸重映射到对应品牌色卡。</p>`)

  b.push('<h2>拼豆教程与熨烫指南</h2>')
  b.push(`<p>从工具选择、第一个作品,到熨烫温度、防变形、配色设计与成品保护,${link('/tutorials', '拼豆教程')}配有图示与温度对照表,新手与进阶玩家都适用。</p>`)

  b.push('<h2>适合谁</h2>')
  b.push('<p>拼豆新手、亲子手工、像素画爱好者,以及需要按品牌色号备料的手工创作者。界面支持简体中文、English、日本語、한국어。</p>')

  // 按题材找图纸:首页此前只链到 4 个枢纽页,11 个分类聚合页只能靠 sitemap 发现。
  // 这里给出首页直达分类的内链,既方便用户按题材挑图,也让分类页多一条高质量入链。
  b.push('<h2>按题材找图纸</h2>')
  b.push(`<p>常见题材:${GALLERY_CATEGORY_META.slice(0, 6)
    .map((meta) => link(categoryPagePath(meta.slug), `${meta.label}拼豆图纸`))
    .join(' · ')};更多分类见${link('/gallery', '拼豆图纸模板库')}。</p>`)

  b.push(siteNav('/'))
  return staticShell(b.join('\n'))
}

// 图片转拼豆落地页:竞品(MakeBead / PixelBeads)都用独立工具页承接
// 「图片转拼豆」「image to perler bead pattern」这类核心搜索词。
// 正文只描述 /create/image 真实存在的三步流程与选项,不添加应用里没有的说法。
function createImageStatic() {
  const b = []
  b.push('<h1>图片转拼豆图纸 · 免费在线转换工具</h1>')
  b.push('<p class="lead">上传一张照片,工具会自动把它换算成指定尺寸的拼豆网格,并按 COCO / MARD / MARD291 / Perler / Hama / Artkal 真实色卡匹配最接近的豆子;调整颜色数与细节过渡后,就能导出带品牌色号的 PNG / SVG 图纸。</p>')
  b.push('<h2>三步生成拼豆图纸</h2>')
  b.push('<ol>')
  b.push('<li><strong>上传图片</strong>:支持 PNG / JPEG / WebP / GIF / AVIF / HEIC / PDF,也可以直接粘贴图片</li>')
  b.push('<li><strong>调整设置</strong>:选择目标色卡、画布尺寸与目标颜色数;尺寸越大,可用的颜色越多</li>')
  b.push('<li><strong>预览并生成</strong>:确认像素预览后生成图纸,可继续在画布中逐格修改或直接导出</li>')
  b.push('</ol>')
  b.push('<h2>转换时可以控制什么</h2>')
  b.push('<ul>')
  b.push('<li>目标色卡:六大品牌真实色号,按 CIEDE2000 感知色差取最接近的豆子</li>')
  b.push('<li>画布尺寸:默认按图片比例自动匹配,也可以手动指定网格边长</li>')
  b.push('<li>目标颜色数:限制用色数量,方便按现有库存备料</li>')
  b.push('<li>细节过渡:Floyd-Steinberg / Bayer 抖动,或关闭后得到更干净的色块</li>')
  b.push('<li>色彩还原:LAB / OKLAB 两种色彩空间可选</li>')
  b.push('</ul>')
  b.push('<h2>转换之后可以做什么</h2>')
  b.push(`<p>生成的图纸可以直接在${link('/', '拼豆画布工具')}里继续编辑:拖动、镜像、套索选区、逐格修正都支持。需要现成图案时,可以到${link('/gallery', '免费拼豆图纸模板库')}挑选;第一次做拼豆,建议先看${link('/tutorials', '拼豆教程')}里的工具与熨烫章节。</p>`)
  b.push('<p>整个转换在浏览器本地完成,图片不会上传到服务器;不需要注册账号。</p>')
  b.push(siteNav('/create/image'))
  return staticShell(b.join('\n'))
}

// 常见问题:正文来自 src/data/faq.js 的中文默认版本,与运行时默认语言一致。
// 每条问答单独成节,便于抓取端直接读取;不添加数据文件里没有的说法。
function faqStatic() {
  const text = FAQ_PAGE_TEXT.zh
  const items = faqItemsFor('zh')
  const b = []
  b.push(`<h1>${esc(text.title)}</h1>`)
  b.push(`<p class="lead">${esc(text.intro)}</p>`)
  // 问题速览:锚点目录,与运行时 FaqPage 的 faq-toc 同构;跳转目标带 id,
  // 搜索端可以把「问题」直接定位到具体问答块
  b.push(`<p>问题速览:${items.map((item) => `<a href="#faq-${item.id}">${esc(item.question)}</a>`).join(' · ')}</p>`)
  for (const item of items) {
    b.push(`<h2 id="faq-${item.id}">${esc(item.question)}</h2>`)
    b.push(`<p>${esc(item.answer)}</p>`)
  }
  b.push(`<h2>${esc(text.more)}</h2>`)
  b.push(`<p>${link('/create/image', text.links.create)} · ${link('/gallery', text.links.gallery)} · ${link('/tutorials', text.links.tutorials)} · ${link('/colors', text.links.colors)} · ${link('/bead-calculator', text.links.calculator)} · ${link('/ironing', text.links.ironing)} · ${link('/contact', text.links.contact)}</p>`)
  b.push(siteNav('/faq'))
  return staticShell(b.join('\n'))
}

// ── 品牌色卡对照页 ─────────────────────────────────────────
// 色卡平时只藏在色板选择器里,「<品牌> 色号对照表」这类搜索没有可抓取的落点。
// 这里用本地色卡数据渲染完整静态表格(色号 / 名称 / HEX / RGB),
// 与应用内色卡数据同源,不新增任何应用里没有的颜色。
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i

/** 一张色卡的完整表格;有 groupNames 的品牌按色系插入分组行 */
function colorTableHtml(palette) {
  const rows = []
  for (const group of colorGroups(palette)) {
    if (group.key) {
      rows.push(
        `<tr><th colspan="5">${esc(groupLabel(palette, group.key))}(${group.colors.length} 色)</th></tr>`,
      )
    }
    for (const color of group.colors) {
      const swatch = HEX_COLOR_RE.test(color.hex)
        ? `<span class="swatch" style="background:${escAttr(color.hex)}"></span>`
        : ''
      rows.push([
        '<tr>',
        `<td><code>${esc(color.id)}</code></td>`,
        `<td>${swatch}</td>`,
        `<td>${esc(color.nameZh || color.name || color.id)}</td>`,
        `<td><code>${esc(color.hex)}</code></td>`,
        `<td>${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}</td>`,
        '</tr>',
      ].join(''))
    }
  }
  return [
    '<table>',
    '<thead><tr><th>色号</th><th>颜色</th><th>名称</th><th>HEX</th><th>RGB</th></tr></thead>',
    `<tbody>${rows.join('')}</tbody>`,
    '</table>',
  ].join('\n')
}

function colorChartHubStatic() {
  const b = []
  b.push('<h1>拼豆色卡对照表</h1>')
  b.push('<p class="lead">COCO、MARD、MARD 291、Perler、Hama、Artkal 六大拼豆品牌的完整色卡,色号、颜色名称、HEX 与 RGB 色值一一对应,方便按图纸备料或寻找近似替代色。</p>')
  b.push('<table>')
  b.push('<thead><tr><th>品牌</th><th>色号数量</th><th>豆径</th><th>产地</th><th>色系</th></tr></thead>')
  b.push('<tbody>')
  for (const { palette, id, colorCount } of colorBrands()) {
    const groups = colorGroups(palette).filter((group) => group.key).length
    b.push(
      `<tr><td>${link(colorChartPath(id), palette.nameZh || palette.name)}</td>` +
      `<td>${colorCount} 色</td>` +
      `<td>${esc(palette.beadSizeLabel || `${palette.beadSize}mm`)}</td>` +
      `<td>${esc(palette.origin || '-')}</td>` +
      `<td>${groups || '-'}</td></tr>`,
    )
  }
  b.push('</tbody>')
  b.push('</table>')
  b.push('<h2>怎么用这份色卡</h2>')
  b.push('<p>同一色号在不同品牌之间并不通用:换品牌时建议先用色卡转换按 CIEDE2000 就近匹配,再对照实物微调。色值为屏幕显示近似值,实际珠子颜色以实物为准。</p>')
  b.push(`<p>想按自己的照片生成图纸,打开${link('/create/image', '图片转拼豆图纸工具')};需要现成图案可以从${link('/gallery', '拼豆图纸模板库')}挑选,配色方法见${link('/tutorials', '拼豆教程')}。</p>`)
  b.push(siteNav('/colors'))
  return staticShell(b.join('\n'))
}

function colorChartBrandStatic(palette) {
  const brand = palette.nameZh || palette.name
  const b = []
  b.push(`<h1>${esc(brand)}色卡对照表</h1>`)
  if (BRAND_INTROS[palette.id]) b.push(`<p class="lead">${esc(BRAND_INTROS[palette.id])}</p>`)
  b.push('<ul>')
  b.push(`<li>色号数量:${palette.colors.length} 色</li>`)
  b.push(`<li>豆径:${esc(palette.beadSizeLabel || `${palette.beadSize}mm`)}</li>`)
  b.push(`<li>产地:${esc(palette.origin || '-')}</li>`)
  b.push('</ul>')
  b.push(`<h2>全部色号(${palette.colors.length} 色)</h2>`)
  b.push(colorTableHtml(palette))
  b.push('<p class="note">色值为屏幕显示近似值,实际珠子颜色以实物为准;按图纸备料时以色号为准。</p>')
  const others = colorBrands().filter((item) => item.id !== palette.id)
  b.push('<h2>其他品牌色卡</h2>')
  b.push(`<p>${others
    .map((item) => link(colorChartPath(item.id), `${item.palette.nameZh || item.palette.name}色卡`))
    .join(' · ')} · ${link('/colors', '全部品牌')}</p>`)
  b.push(`<p class="note">${link('/create/image', '图片转拼豆图纸工具')} · ${link('/gallery', '拼豆图纸模板库')} · ${link('/tutorials', '拼豆教程')}</p>`)
  b.push(siteNav('/colors'))
  return staticShell(b.join('\n'))
}

// ── 备料工具页 ─────────────────────────────────────────────
// 熨烫页的表格取自教程数据(与教程同一份),计算器页正文是公式与常见尺寸用量表。
function pageTable(headers, rows) {
  return [
    '<table>',
    `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
    '</table>',
  ].join('')
}

function ironingStatic() {
  const { brandTable, failureTable, articles } = ironingReference()
  const b = []
  b.push('<h1>拼豆熨烫温度对照表</h1>')
  b.push('<p class="lead">各品牌熨斗档位、正反面时间与常见翻车的对照。表格内容与拼豆教程的熨烫章节同源,具体温度请以手上那包珠子的说明为准。</p>')
  b.push('<h2>熨烫要点</h2>')
  b.push('<ul>')
  for (const [title, text] of IRONING_RULES) {
    b.push(`<li><strong>${esc(title)}</strong>:${esc(text)}</li>`)
  }
  b.push('</ul>')
  b.push('<h2>品牌温度对照</h2>')
  if (brandTable) b.push(pageTable(brandTable.headers, brandTable.rows))
  b.push('<p class="note">新品牌第一次熨烫时,先在角落一两颗珠子上试温,观察融化程度再全面熨烫。</p>')
  b.push('<h2>常见翻车与处理</h2>')
  if (failureTable) b.push(pageTable(failureTable.headers, failureTable.rows))
  if (articles.length) {
    b.push('<h2>相关教程</h2>')
    b.push('<ul>')
    for (const article of articles) {
      b.push(`<li>${link(`/tutorials/${article.id}`, article.title)}</li>`)
    }
    b.push('</ul>')
  }
  // 参考来源:品牌官方渠道(E-E-A-T)。外链带 noopener
  b.push('<h2>参考来源</h2>')
  b.push('<ul>')
  for (const source of IRONING_SOURCES) {
    b.push(`<li><a href="${source.href}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a></li>`)
  }
  b.push('</ul>')
  b.push('<p class="note">以上为各品牌官方渠道;具体温度与时间请以你手上的产品说明为准。</p>')
  b.push(`<p class="note">${link('/colors', '品牌色卡对照表')} · ${link('/bead-calculator', '豆子数量计算器')} · ${link('/create/image', '图片转拼豆图纸工具')} · ${link('/gallery', '拼豆图纸模板库')}</p>`)
  b.push(siteNav('/ironing'))
  return staticShell(b.join('\n'))
}

function calculatorStatic() {
  const rows = beadPresetRows()
  const b = []
  b.push('<h1>拼豆豆子数量计算器</h1>')
  b.push('<p class="lead">按网格尺寸与空置比例估算用豆量。成品图案通常有空隙,所以结果是量级参考,精确颗数以图纸为准。</p>')
  b.push('<h2>估算方式</h2>')
  b.push('<p>豆子数 ≈ 宽 × 高 × 实际填充比例。例如 57 × 57 的网格、八成填充约需 2599 颗豆子;颜色数只影响每色平均用量,不影响总数。</p>')
  b.push('<h2>常见网格尺寸用量</h2>')
  b.push(pageTable(
    ['网格', '总格数', '八成填充', '六成填充'],
    rows.map((row) => [`${row.size} × ${row.size}`, String(row.cells), String(row.filled80), String(row.filled60)]),
  ))
  b.push('<p class="note">精确的非空格数只有图纸本身知道:打开图库里的图纸详情页可以看到逐色颗数。</p>')
  b.push(`<p>${link('/create/image', '按图片生成拼豆图纸')} · ${link('/gallery', '浏览拼豆图纸模板')} · ${link('/colors', '品牌色卡对照表')} · ${link('/ironing', '熨烫温度对照表')}</p>`)
  b.push(siteNav('/bead-calculator'))
  return staticShell(b.join('\n'))
}

// ── 图案 / 像素画落地页 ────────────────────────────────────
function tutorialLinksHtml(ids) {
  const items = ids
    .map((id) => tutorialArticle(id))
    .filter(Boolean)
    .map((article) => `<li>${link(`/tutorials/${article.id}`, article.title)}</li>`)
  return items.length ? `<ul>${items.join('')}</ul>` : ''
}

function beadPatternsStatic() {
  const b = []
  b.push('<h1>拼豆图案</h1>')
  b.push('<p class="lead">拼豆图案就是一颗颗豆子拼出的像素化图形。下面按题材汇总可以直接使用的免费图案,并说明尺寸、难度与用色怎么选,以及三种获取图案的方式。</p>')
  b.push('<h2>按题材找拼豆图案</h2>')
  b.push('<ul>')
  for (const meta of GALLERY_CATEGORY_META) {
    b.push(`<li>${link(categoryPagePath(meta.slug), meta.label)}${meta.intro ? `:${esc(meta.intro)}` : ''}</li>`)
  }
  b.push('</ul>')
  b.push('<h2>怎么挑一张合适的图案</h2>')
  b.push('<ul>')
  for (const [title, text] of PATTERN_TIPS) {
    b.push(`<li><strong>${esc(title)}</strong>:${esc(text)}</li>`)
  }
  b.push('</ul>')
  b.push('<h2>三种获取图案的方式</h2>')
  b.push('<ul>')
  for (const [title, text, href, cta] of PATTERN_WAYS) {
    b.push(`<li><strong>${esc(title)}</strong>:${esc(text)}${link(href, cta)}</li>`)
  }
  b.push('</ul>')
  b.push('<h2>常见网格尺寸与用豆量</h2>')
  b.push(pageTable(
    ['网格', '总格数', '八成填充'],
    beadPresetRows().map((row) => [`${row.size} × ${row.size}`, String(row.cells), String(row.filled80)]),
  ))
  b.push(`<p class="note">需要按自己的尺寸估算时,用${link('/bead-calculator', '豆子数量计算器')};品牌色号对照见${link('/colors', '色卡对照表')}。</p>`)
  b.push('<h2>相关教程</h2>')
  b.push(tutorialLinksHtml(PATTERN_ARTICLE_IDS))
  b.push(siteNav('/bead-patterns'))
  return staticShell(b.join('\n'))
}

function pixelArtStatic() {
  const b = []
  b.push('<h1>像素画生成器</h1>')
  b.push('<p class="lead">在浏览器里直接画像素画:自定义网格尺寸,画笔、填充、选区、镜像都齐备;也可以上传照片自动转成像素图,最后导出 PNG / SVG 或带色号的拼豆图纸。</p>')
  b.push('<h2>能做什么</h2>')
  b.push('<ul>')
  for (const [title, text] of PIXEL_FEATURES) {
    b.push(`<li><strong>${esc(title)}</strong>:${esc(text)}</li>`)
  }
  b.push('</ul>')
  b.push('<h2>三步画出一张像素图</h2>')
  b.push('<ol>')
  for (const [title, text] of PIXEL_STEPS) {
    b.push(`<li><strong>${esc(title)}</strong>:${esc(text)}</li>`)
  }
  b.push('</ol>')
  b.push('<h2>网格尺寸怎么选</h2>')
  const cellsBySize = new Map(beadPresetRows().map((row) => [row.size, row.cells]))
  b.push(pageTable(
    ['网格', '总格数', '常见用途'],
    PIXEL_GRID_USES.map(([size, use]) => [`${size} × ${size}`, String(cellsBySize.get(size) || '-'), use]),
  ))
  b.push(`<p class="note">不知道要多少豆子?用${link('/bead-calculator', '豆子数量计算器')}按填充比例估算;配色查${link('/colors', '品牌色卡对照表')}。</p>`)
  b.push('<h2>像素画还能怎么用</h2>')
  b.push(`<p>像素画和拼豆图纸是同一件事的两种叫法:都是网格上的一格一色。在拼豆Studio 里,同一张画布既能当像素画导出,也能转成带品牌色号的图纸。想要现成图案,可以从${link('/bead-patterns', '拼豆图案')}按题材进入;第一次做拼豆,建议先看${link('/ironing', '熨烫温度对照表')}。</p>`)
  b.push('<h2>相关教程</h2>')
  b.push(tutorialLinksHtml(PIXEL_ARTICLE_IDS))
  b.push(siteNav('/pixel-art'))
  return staticShell(b.join('\n'))
}

// 供脚本按路由取静态正文(无正文页为 null)
const zhLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'locales', 'zh-CN.json'), 'utf-8'))
const ROOT_STATIC = {
  '/': homeStatic(),
  '/gallery': galleryStatic(zhLocale),
  '/tutorials': tutorialsStatic(),
  '/create/image': createImageStatic(),
  '/faq': faqStatic(),
  '/colors': colorChartHubStatic(),
  '/ironing': ironingStatic(),
  '/bead-calculator': calculatorStatic(),
  '/bead-patterns': beadPatternsStatic(),
  '/pixel-art': pixelArtStatic(),
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
    title: '拼豆图纸模板与免费图库 - 拼豆Studio',
    desc: '免费拼豆图纸模板库：按主题与难度筛选像素画图案，一键载入画布制作；支持重映射到 COCO/MARD/Perler 品牌色卡，收藏并云端保存作品。',
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆图库与模板', item: `${SITE}/gallery` },
    ],
  },
  {
    file: 'tutorials.html',
    path: '/tutorials',
    title: '拼豆教程 - 新手入门、熨烫温度与配色全攻略 | 拼豆Studio',
    desc: '拼豆新手与进阶教程：工具选择、第一个作品、熨烫温度与防变形、配色设计、成品保护，配图示与温度对照表，可配合在线拼豆图纸工具直接制作。',
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆教程', item: `${SITE}/tutorials` },
    ],
  },
  {
    file: 'faq.html',
    path: '/faq',
    title: '拼豆常见问题 - 使用、导出、色号与商用解答 | 拼豆Studio',
    desc: '拼豆Studio 常见问题：是否需要注册、图片转图纸流程、支持的图片格式与品牌色卡、导出方式、作品保存、分享与商用范围。',
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆常见问题', item: `${SITE}/faq` },
    ],
    faq: true,
  },
  {
    file: 'colors.html',
    path: '/colors',
    title: COLOR_CHARTS_SEO.title,
    desc: COLOR_CHARTS_SEO.desc,
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆色卡对照表', item: `${SITE}/colors` },
    ],
  },
  {
    file: 'ironing.html',
    path: '/ironing',
    title: IRONING_SEO.title,
    desc: IRONING_SEO.desc,
    // 正文来自中文教程数据,与运行时 Helmet 一致:只声明 zh-CN 与 x-default
    singleLanguage: true,
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆熨烫温度对照表', item: `${SITE}/ironing` },
    ],
  },
  {
    file: 'bead-calculator.html',
    path: '/bead-calculator',
    title: CALCULATOR_SEO.title,
    desc: CALCULATOR_SEO.desc,
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '豆子数量计算器', item: `${SITE}/bead-calculator` },
    ],
  },
  {
    file: 'bead-patterns.html',
    path: '/bead-patterns',
    title: BEAD_PATTERNS_SEO.title,
    desc: BEAD_PATTERNS_SEO.desc,
    singleLanguage: true,
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '拼豆图案', item: `${SITE}/bead-patterns` },
    ],
  },
  {
    file: 'pixel-art.html',
    path: '/pixel-art',
    title: PIXEL_ART_SEO.title,
    desc: PIXEL_ART_SEO.desc,
    singleLanguage: true,
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '像素画生成器', item: `${SITE}/pixel-art` },
    ],
  },
  {
    file: 'create-image.html',
    path: '/create/image',
    title: '图片转拼豆图纸 - 免费在线转换工具 | 拼豆Studio',
    desc: '免费图片转拼豆图纸:上传照片自动生成带品牌色号的网格图纸,可调网格尺寸与颜色数,支持六大品牌色卡,导出 PNG/SVG。',
    breadcrumb: [
      { name: '首页', item: `${SITE}/` },
      { name: '图片转拼豆图纸', item: `${SITE}/create/image` },
    ],
    howTo: true,
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
  out = out.replace(HREFLANG_BLOCK_RE, hreflangBlock(page.path))

  // 面包屑只给内容子页注入
  if (page.breadcrumb) {
    out = out.replace('</head>', breadcrumbScript(page.breadcrumb) + EOL + '</head>')
  }

  // 聚合页(图库/教程)补 CollectionPage;首页已有 SoftwareApplication/WebSite 实体,
  // /create/image 是工具页(用 HowTo)、/faq 用 FAQPage,色卡/工具页是查表页,都不该挂 CollectionPage。
  if (page.path === '/gallery' || page.path === '/tutorials') {
    out = out.replace('</head>', collectionPageScript(page) + EOL + '</head>')
  }

  // 常见问题页补 FAQPage(问答与静态正文取同一份数据)
  if (page.faq) {
    out = out.replace('</head>', faqPageScript() + EOL + '</head>')
  }

  // 工具落地页补 HowTo(步骤与页面步骤条一致)
  if (page.howTo) {
    out = out.replace('</head>', howToScript() + EOL + '</head>')
  }

  // 静态正文(仅首页/图库/教程;隐私/条款/后台保持空 root)
  if (ROOT_STATIC[page.path]) {
    out = injectRoot(out, ROOT_STATIC[page.path])
  }

  fs.writeFileSync(path.join(dist, page.file), out)
  console.log(`prerendered: ${page.file} -> ${url}`)
}
// ── 品牌色卡页:/colors/<brand> ─────────────────────────────
//
// 六个品牌各自独立收录:title/description 与运行时 Helmet 共用 brandSeo(),
// 正文是完整色表 —— 这类页面本身就是「查表」,没有可精简的内容。
let colorChartPageCount = 0
for (const { palette } of colorBrands()) {
  const pagePath = colorChartPath(palette.id)
  const url = `${SITE}${pagePath}`
  const seo = brandSeo(palette)

  let out = indexWithBuildId
    .replace(/<title>.*?<\/title>/s, `<title>${esc(seo.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"[^>]*>/, `<meta name="description" content="${escAttr(seo.desc)}"${HEAD_ATTR} />`)
    .replace(/<meta name="robots" content="[^"]*"[^>]*>/, `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"${HEAD_ATTR} />`)
    .replace(/<link rel="canonical" href="[^"]*"[^>]*>/, `<link rel="canonical" href="${url}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:url" content="[^"]*"[^>]*>/, `<meta property="og:url" content="${url}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:title" content="[^"]*"[^>]*>/, `<meta property="og:title" content="${escAttr(seo.title)}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:description" content="[^"]*"[^>]*>/, `<meta property="og:description" content="${escAttr(seo.desc)}"${HEAD_ATTR} />`)

  if (!HREFLANG_BLOCK_RE.test(out)) {
    throw new Error(`预渲染中止:${pagePath} 的 hreflang 块缺失或结构变化`)
  }
  out = out.replace(HREFLANG_BLOCK_RE, hreflangBlock(pagePath))
  out = out.replace('</head>', breadcrumbScript([
    { name: '首页', item: `${SITE}/` },
    { name: '拼豆色卡对照表', item: `${SITE}/colors` },
    { name: `${palette.nameZh || palette.name}色卡对照表`, item: url },
  ]) + EOL + '</head>')
  out = injectRoot(out, colorChartBrandStatic(palette))

  const dir = path.join(dist, 'colors', palette.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), out)
  colorChartPageCount++
}
console.log(`完成 ${colorChartPageCount} 个品牌色卡页(/colors/<brand>)`)

// ── 教程文章页:/tutorials/<id> ─────────────────────────────
//
// 竞品(MakeBead / PixelBeads)都用大量独立内容页承接长尾词;教程原先只有
// /tutorials 一个总览页,18 篇文章没有独立 URL,长尾搜索没有落点。这里把
// 本地教程数据渲染成独立静态页,正文与应用内展示的文章一致,不新增说法。
function tutorialBlocksHtml(blocks = []) {
  const out = []
  for (const block of blocks) {
    if (!block) continue
    switch (block.type) {
      case 'paragraph':
        out.push(`<p>${esc(block.text)}</p>`)
        break
      case 'heading2':
        out.push(`<h2>${esc(block.text)}</h2>`)
        break
      case 'heading3':
        out.push(`<h3>${esc(block.text)}</h3>`)
        break
      case 'bulletList':
        out.push(`<ul>${(block.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`)
        break
      case 'numberedList':
        out.push(`<ol>${(block.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`)
        break
      case 'callout':
        out.push(`<p class="note">${block.title ? `<strong>${esc(block.title)}</strong> ` : ''}${esc(block.text)}</p>`)
        break
      case 'keyPoint':
        out.push(`<p class="note">${esc(block.text)}</p>`)
        break
      case 'table': {
        const head = (block.headers || []).map((h) => `<th>${esc(h)}</th>`).join('')
        const rows = (block.rows || [])
          .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
          .join('')
        out.push(`<table>${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${rows}</tbody></table>`)
        break
      }
      case 'divider':
        out.push('<hr />')
        break
      case 'svgDiagram':
        // 图形本身是 React 组件,静态页只保留图注
        if (block.caption) out.push(`<p class="note">${esc(block.caption)}</p>`)
        break
      default:
        break
    }
  }
  return out.join('\n')
}

function tutorialArticleBody(article, section, prev, next) {
  const nav = []
  if (prev) nav.push(`上一篇:${link(`/tutorials/${prev.article.id}`, prev.article.title)}`)
  if (next) nav.push(`下一篇:${link(`/tutorials/${next.article.id}`, next.article.title)}`)
  return staticShell([
    `<h1>${esc(article.title)}</h1>`,
    `<p class="lead">${esc(section.title)} · 拼豆教程</p>`,
    tutorialBlocksHtml(article.blocks),
    nav.length ? `<p class="note">${nav.join(' · ')}</p>` : '',
    `<p class="note">${link('/tutorials', '返回拼豆教程目录')} · ${link('/create/image', '图片转拼豆图纸工具')} · ${link('/gallery', '免费拼豆图纸模板库')} · ${link('/faq', '拼豆常见问题')}</p>`,
  ].filter(Boolean).join('\n'))
}

function articleScript(article, url) {
  const first = (article.blocks || []).find((b) => b && b.type === 'paragraph' && b.text)
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: first ? clampDesc(first.text, 120) : article.title,
    inLanguage: 'zh-CN',
    mainEntityOfPage: url,
    isPartOf: { '@id': `${SITE}/tutorials#webpage` },
    author: { '@id': `${SITE}/#organization` },
    publisher: { '@id': `${SITE}/#organization` },
  }
  return [
    '  <!-- Article: 教程文章 -->',
    '  <script type="application/ld+json">',
    JSON.stringify(data, null, 2),
    '  </script>',
  ].join(EOL)
}

const tutorialArticles = TUTORIALS_ZH.flatMap((section) =>
  (section.children || []).map((article) => ({ article, section })),
)
let tutorialPageCount = 0
for (let index = 0; index < tutorialArticles.length; index++) {
  const { article, section } = tutorialArticles[index]
  const prev = index > 0 ? tutorialArticles[index - 1] : null
  const next = index + 1 < tutorialArticles.length ? tutorialArticles[index + 1] : null
  const pagePath = `/tutorials/${article.id}`
  const url = `${SITE}${pagePath}`
  const title = `${article.title} - 拼豆教程 - 拼豆Studio`
  const first = (article.blocks || []).find((b) => b && b.type === 'paragraph' && b.text)
  const desc = first ? clampDesc(first.text, 90) : `${article.title}:拼豆Studio 拼豆教程。`

  let out = indexWithBuildId
    .replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"[^>]*>/, `<meta name="description" content="${escAttr(desc)}"${HEAD_ATTR} />`)
    .replace(/<link rel="canonical" href="[^"]*"[^>]*>/, `<link rel="canonical" href="${url}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:url" content="[^"]*"[^>]*>/, `<meta property="og:url" content="${url}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:title" content="[^"]*"[^>]*>/, `<meta property="og:title" content="${escAttr(title)}"${HEAD_ATTR} />`)
    .replace(/<meta property="og:description" content="[^"]*"[^>]*>/, `<meta property="og:description" content="${escAttr(desc)}"${HEAD_ATTR} />`)

  if (!HREFLANG_BLOCK_RE.test(out)) {
    throw new Error(`预渲染中止:${pagePath} 的 hreflang 块缺失或结构变化`)
  }
  out = out.replace(HREFLANG_BLOCK_RE, hreflangBlock(pagePath))
  out = out.replace('</head>', breadcrumbScript([
    { name: '首页', item: `${SITE}/` },
    { name: '拼豆教程', item: `${SITE}/tutorials` },
    { name: article.title, item: url },
  ]) + EOL + '</head>')
  out = out.replace('</head>', articleScript(article, url) + EOL + '</head>')
  out = injectRoot(out, tutorialArticleBody(article, section, prev, next))

  const dir = path.join(dist, 'tutorials', article.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), out)
  tutorialPageCount++
}
console.log(`完成 ${PAGES.length} 个预渲染页面(静态正文:首页 /gallery /tutorials /create/image /faq /colors /ironing /bead-calculator /bead-patterns /pixel-art)`)
console.log(`完成 ${tutorialPageCount} 个教程文章页(/tutorials/<id>)`)
