/**
 * sitemapLastmod — 静态页 lastmod 从 git 历史自动推导(纯函数部分)。
 *
 * 为什么需要它:
 *   public/sitemap.xml 的静态页 lastmod 此前靠手工维护,内容更新时很容易
 *   忘记同步。lastmod 长期不准,搜索引擎会逐渐不信任这个字段,等于白写。
 *   改为构建时按「页面 → 源文件」映射取最后一次提交时间,不需要人工干预。
 *
 * 为什么按页面映射而不是一揽子取整个仓库:
 *   整仓最新提交会把任何改动(包括只改 CI)都算到所有页面上。按页面映射
 *   保留可解释性:改教程只会动 /tutorials,改隐私条款只会动 /privacy。
 *   映射允许重叠(locale 文件影响多个页面),重叠只会让日期偏新;真正要
 *   避免的是「内容变了日期没变」——那个方向会失去 lastmod 的意义。
 *
 * 取不到历史时(浅克隆、无 git 环境)保留模板里的现有值,由构建脚本决定
 * 是否回退,这里只做纯替换。
 */

import { TUTORIALS_ZH } from '../../data/tutorials.zh.js'
import { PALETTE_LIST } from '../../data/palettes/index.js'

/**
 * 每个静态页由哪些源文件构成(git pathspec,相对仓库根目录)。
 * 新增静态页时必须同步在这里登记,契约测试会检查两边是否一致。
 */
export const PAGE_LASTMOD_SOURCES = {
  '/': [
    'src/App.jsx',
    'src/components',
    'src/hooks',
    'src/services',
    'src/utils',
    'src/data',
    'src/i18n/locales',
    'index.html',
    'scripts/generate-prerender-html.js',
  ],
  '/gallery': [
    'src/features/gallery',
    'src/components/ThumbnailCanvas.jsx',
    'src/i18n/locales',
    'scripts/generate-prerender-html.js',
  ],
  '/tutorials': [
    'src/components/Tutorials.jsx',
    'src/data/tutorials.js',
    'src/data/tutorials.en.js',
    'src/data/tutorials.ja.js',
    'src/data/tutorials.ko.js',
    'src/data/tutorials.zh.js',
    'src/hooks/useTutorials.js',
    'src/i18n/locales',
    'scripts/generate-prerender-html.js',
  ],
  '/create/image': [
    'src/components/CreateImagePage.jsx',
    'src/components/ImageQuantizer',
    'src/i18n/locales',
    'scripts/generate-prerender-html.js',
  ],
  '/faq': [
    'src/components/FaqPage.jsx',
    'src/components/FaqPage.css',
    'src/data/faq.js',
    'scripts/generate-prerender-html.js',
  ],
  '/colors': [
    'src/features/colors',
    'src/data/palettes',
    'src/i18n/locales',
    'scripts/generate-prerender-html.js',
  ],
  '/ironing': [
    'src/features/tools',
    'src/data/tutorials.zh.js',
    'scripts/generate-prerender-html.js',
  ],
  '/bead-calculator': [
    'src/features/tools',
    'src/i18n/locales',
    'scripts/generate-prerender-html.js',
  ],
  '/privacy': [
    'src/components/LegalPages.jsx',
    'scripts/generate-prerender-html.js',
  ],
  '/terms': [
    'src/components/LegalPages.jsx',
    'scripts/generate-prerender-html.js',
  ],
}

// 教程文章页:/tutorials/<id> 由本地教程数据渲染,源文件固定。
// 与 sitemap 模板里的条目一一对应(契约测试会检查两边)。
const TUTORIAL_SOURCES = [
  'src/components/Tutorials.jsx',
  'src/data/tutorials.js',
  'src/data/tutorials.zh.js',
  'src/i18n/locales',
  'scripts/generate-prerender-html.js',
]
for (const section of TUTORIALS_ZH) {
  for (const article of section.children || []) {
    PAGE_LASTMOD_SOURCES[`/tutorials/${article.id}`] = TUTORIAL_SOURCES
  }
}

// 品牌色卡页:/colors/<brand> 由本地色卡数据渲染,六个品牌源文件相同。
const COLOR_CHART_SOURCES = [
  'src/features/colors',
  'src/data/palettes',
  'src/components/BackButton.jsx',
  'src/i18n/locales',
  'scripts/generate-prerender-html.js',
]
for (const palette of PALETTE_LIST) {
  PAGE_LASTMOD_SOURCES[`/colors/${palette.id}`] = COLOR_CHART_SOURCES
}

/**
 * git 的 %ct 是 Unix 秒。取 UTC 日期而不是本地日期:
 * 构建机器时区不同会得到不同结果,UTC 保证同一提交在任何环境推导一致。
 *
 * @param {number} epochSeconds
 * @returns {string|null} YYYY-MM-DD
 */
export function formatGitDate(epochSeconds) {
  const epoch = Number(epochSeconds)
  if (!Number.isFinite(epoch) || epoch <= 0) return null
  return new Date(epoch * 1000).toISOString().slice(0, 10)
}

const URL_BLOCK_RE = /<url>[\s\S]*?<\/url>/g
const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/
const LASTMOD_RE = /<lastmod>[^<]*<\/lastmod>/

/**
 * 用推导出的日期刷新 sitemap 中对应页面的 lastmod。
 *
 * 规则:
 *   - 只改 datesByLoc 里登记过的页面;动态条目(图纸/主题/合集)原样保留;
 *   - 新日期不早于现有值时不动 —— 不因为浅克隆查到更早的记录把日期往回拨;
 *   - 条目缺 lastmod 时补一条(保持正常缩进)。
 *
 * @param {string} xml
 * @param {Record<string, string>} datesByLoc - pathname → YYYY-MM-DD
 * @returns {string}
 */
export function applyLastmods(xml, datesByLoc) {
  if (typeof xml !== 'string' || !datesByLoc) return xml
  return xml.replace(URL_BLOCK_RE, (block) => {
    const loc = block.match(LOC_RE)?.[1]
    if (!loc) return block

    let pathname
    try {
      pathname = new URL(loc).pathname
    } catch {
      return block
    }

    const date = datesByLoc[pathname]
    if (!date) return block

    const current = block.match(LASTMOD_RE)?.[0]
    if (current) {
      const currentDate = current.replace(/<\/?lastmod>/g, '')
      // ISO 日期字符串可直接按字典序比较
      return currentDate >= date ? block : block.replace(LASTMOD_RE, `<lastmod>${date}</lastmod>`)
    }

    return block.replace(/(<\/loc>)/, `$1\n    <lastmod>${date}</lastmod>`)
  })
}
