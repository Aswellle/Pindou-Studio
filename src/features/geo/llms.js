/**
 * llms.txt / llms-full.txt 的内容构建(纯函数)。
 *
 * 这两个文件是给 AI 检索端的一份「站点摘要 + 优先页面清单」:
 *   · llms.txt  —— 轻量索引,按 llmstxt.org 的约定用 Markdown 写;
 *   · llms-full.txt —— 同一份索引的完整版,把页面里的关键事实、表格和问答
 *     直接展开,方便一次抓取就拿到可引用的段落。
 *
 * 为什么由构建脚本生成而不是手写:
 *   品牌色号数量、教程篇数、FAQ 条目、熨烫表都来自站内真实数据。手写副本
 *   在内容更新后必定滞后,AI 端读到的是旧数字;生成器让两份文件永远与
 *   页面同源。Google 与 Bing 都明确表示 llms.txt 不是排名因素,它的价值
 *   只在于降低抓取成本 —— 因此这里不堆关键词,只写可核对的页面与事实。
 */

import { FAQ_ITEMS, faqItemsFor } from '../../data/faq.js'
import { PALETTE_LIST } from '../../data/palettes/index.js'
import { TUTORIALS_ZH } from '../../data/tutorials.zh.js'
import { GALLERY_CATEGORY_META, categoryPagePath } from '../gallery/categoryMeta.js'
import { colorBrands, colorChartPath } from '../colors/colorCharts.js'
import { IRONING_RULES, IRONING_SOURCES, ironingReference } from '../tools/ironingGuide.js'
import { beadPresetRows } from '../tools/beadCalculator.js'

export const SITE = 'https://tangnotes.site'

const CORE_PAGES = [
  ['/', '在线拼豆图纸生成器', '自由绘制拼豆图纸、把图片转成像素拼豆、按六大品牌色卡配色,并导出带色号的 PNG/SVG。'],
  ['/create/image', '图片转拼豆图纸工具', '上传照片或插画,按目标网格与颜色数量化为拼豆图纸;浏览器本地处理,图片不上传。'],
  ['/gallery', '拼豆图纸模板库', '按题材、难度与用色筛选现成图纸,一键载入画布,可重映射到其他品牌色卡。'],
  ['/bead-patterns', '拼豆图案', '按题材汇总免费拼豆图案,并说明尺寸、难度、用色与获取方式。'],
  ['/pixel-art', '像素画生成器', '在自定义网格上绘制像素画,也能把照片转成像素图,导出 PNG/SVG 或拼豆图纸。'],
  ['/tutorials', '拼豆教程', '从工具选择、第一个作品到熨烫、防翘曲、配色与成品保护的 18 篇中文教程。'],
  ['/faq', '拼豆常见问题', '使用、图片格式、导出、色卡、尺寸、保存、分享与商用范围的 16 个问答。'],
]

const REFERENCE_PAGES = [
  ['/colors', '拼豆色卡对照表', 'COCO、MARD、MARD291、Perler、Hama、Artkal 六大品牌色卡总览。'],
  ['/ironing', '拼豆熨烫温度对照表', '各品牌熨斗档位、正反面时间、常见翻车原因与处理。'],
  ['/bead-calculator', '豆子数量计算器', '按网格宽高与填充比例估算用豆量,附常见尺寸用量表。'],
]

function abs(site, pathname) {
  return `${site}${pathname}`
}

/** Markdown 表格单元格:内容来自站内数据,转义竖线并压掉换行 */
function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function table(headers, rows) {
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n')
}

function tutorialIndex() {
  return TUTORIALS_ZH.map((section) => ({
    title: section.title,
    articles: (section.children || []).map((article) => ({
      id: article.id,
      title: article.title,
    })),
  }))
}

function firstParagraph(article, limit = 160) {
  const block = (article.blocks || []).find((item) => item && item.type === 'paragraph' && item.text)
  if (!block) return ''
  const text = block.text.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * llms.txt:轻量索引。控制在 10KB 以内,只列可抓取的页面与一句说明。
 *
 * @param {string} site
 */
export function buildLlmsTxt(site = SITE) {
  const lines = []
  lines.push('# 拼豆Studio (Bead Studio)')
  lines.push('')
  lines.push(
    '> 中文优先的免费在线拼豆图纸工具:自由绘制或上传图片转成像素拼豆图纸,' +
    '按 COCO / MARD / MARD291 / Perler / Hama / Artkal 六大品牌色卡配色,' +
    '导出带品牌色号的 PNG/SVG 图纸。界面支持简体中文、English、日本語、한국어;' +
    '设计与导出无需注册。',
  )
  lines.push('')
  lines.push('## 核心页面')
  for (const [pathname, title, desc] of CORE_PAGES) {
    lines.push(`- [${title}](${abs(site, pathname)}):${desc}`)
  }
  lines.push('')
  lines.push('## 参考工具')
  for (const [pathname, title, desc] of REFERENCE_PAGES) {
    lines.push(`- [${title}](${abs(site, pathname)}):${desc}`)
  }
  lines.push('')
  lines.push('## 品牌色卡')
  for (const { palette, id, colorCount } of colorBrands()) {
    const size = palette.beadSizeLabel || `${palette.beadSize}mm`
    lines.push(
      `- [${palette.nameZh || palette.name}色卡](${abs(site, colorChartPath(id))}):` +
      `${colorCount} 色,豆径 ${size},产地 ${palette.origin || '未标注'}。`,
    )
  }
  lines.push('')
  lines.push('## 图库分类')
  lines.push(
    `- ${GALLERY_CATEGORY_META.map(
      (meta) => `[${meta.label}](${abs(site, categoryPagePath(meta.slug))})`,
    ).join(' · ')}`,
  )
  lines.push('')
  lines.push('## 教程文章')
  for (const section of tutorialIndex()) {
    lines.push(`### ${section.title}`)
    for (const article of section.articles) {
      lines.push(`- [${article.title}](${abs(site, `/tutorials/${article.id}`)})`)
    }
  }
  lines.push('')
  lines.push('## 机器可读')
  lines.push(`- [llms-full.txt](${abs(site, '/llms-full.txt')}):关键事实、对照表与 FAQ 的完整文本。`)
  lines.push(`- [sitemap.xml](${abs(site, '/sitemap.xml')}):全部可收录页面。`)
  lines.push(`- [robots.txt](${abs(site, '/robots.txt')}):抓取策略(允许检索型爬虫,禁止纯训练型爬虫)。`)
  lines.push('')
  return lines.join('\n')
}

/**
 * llms-full.txt:索引 + 页面里的可引用事实。
 *
 * 只展开站内已经公开展示的内容:色卡数量、熨烫规则、估算公式、教程首段
 * 与 FAQ。温度数字保留出处(品牌官方渠道),避免 AI 端把参考值当成硬性标准。
 *
 * @param {string} site
 */
export function buildLlmsFullTxt(site = SITE) {
  const { brandTable, failureTable } = ironingReference()
  const faq = faqItemsFor('zh')
  const lines = []
  lines.push('# 拼豆Studio — 完整内容摘要')
  lines.push('')
  lines.push(
    '> 本文件是 https://tangnotes.site 的机器可读摘要,内容与站内页面一致。' +
    '站点是中文优先的免费在线拼豆图纸工具,支持自由绘制、图片转拼豆、六大品牌色卡与 PNG/SVG 导出。',
  )
  lines.push('')
  lines.push('## 站点能做什么')
  lines.push('')
  lines.push('- 在自定义网格(9–200,支持矩形)上绘制拼豆图纸,工具含画笔、橡皮、填充、抓手、取色与矩形/套索选区。')
  lines.push('- 上传图片(支持 PNG / JPEG / WebP / GIF / AVIF / HEIC / PDF)转成拼豆图纸;转换在浏览器本地完成,图片不上传服务器。')
  lines.push('- 按 CIEDE2000 感知色差匹配 COCO / MARD / MARD291 / Perler / Hama / Artkal 六大品牌色卡。')
  lines.push('- 导出 PNG / SVG 图纸,可带每颗豆子的品牌色号、颜色清单与用量统计。')
  lines.push('- 图库提供按题材与难度分类的免费图纸模板;登录后作品与收藏可保存到云端,并可生成公开只读分享链接。')
  lines.push('')
  lines.push('## 品牌色卡')
  lines.push('')
  lines.push(table(
    ['品牌', '色号数量', '豆径', '产地', '页面'],
    PALETTE_LIST.map((palette) => [
      palette.nameZh || palette.name,
      palette.colors.length,
      palette.beadSizeLabel || `${palette.beadSize}mm`,
      palette.origin || '未标注',
      abs(site, colorChartPath(palette.id)),
    ]),
  ))
  lines.push('')
  lines.push('## 拼豆熨烫参考')
  lines.push('')
  for (const [title, text] of IRONING_RULES) {
    lines.push(`- **${title}**:${text}`)
  }
  lines.push('')
  if (brandTable) {
    lines.push('### 品牌温度对照')
    lines.push('')
    lines.push(table(brandTable.headers, brandTable.rows))
    lines.push('')
  }
  if (failureTable) {
    lines.push('### 常见翻车与处理')
    lines.push('')
    lines.push(table(failureTable.headers, failureTable.rows))
    lines.push('')
  }
  lines.push('官方参考渠道:')
  for (const source of IRONING_SOURCES) {
    lines.push(`- ${source.label}: ${source.href}`)
  }
  lines.push('')
  lines.push('## 用豆量估算')
  lines.push('')
  lines.push('公式:豆子数 ≈ 宽 × 高 × 实际填充比例。颜色数只影响每色平均用量,不影响总数。')
  lines.push('')
  lines.push(table(
    ['方形网格', '总格数', '八成填充', '六成填充'],
    beadPresetRows().map((row) => [row.size, row.cells, row.filled80, row.filled60]),
  ))
  lines.push('')
  lines.push('## 图库分类')
  lines.push('')
  lines.push(table(
    ['分类', '页面', '简介'],
    GALLERY_CATEGORY_META.map((meta) => [
      meta.label,
      abs(site, categoryPagePath(meta.slug)),
      meta.intro || '',
    ]),
  ))
  lines.push('')
  lines.push('## 教程目录')
  lines.push('')
  for (const section of TUTORIALS_ZH) {
    lines.push(`### ${section.title}`)
    lines.push('')
    for (const article of section.children || []) {
      const summary = firstParagraph(article)
      lines.push(`- [${article.title}](${abs(site, `/tutorials/${article.id}`)})${summary ? `:${summary}` : ''}`)
    }
    lines.push('')
  }
  lines.push('## 常见问题')
  lines.push('')
  for (const item of faq) {
    lines.push(`### ${item.question}`)
    lines.push('')
    lines.push(item.answer)
    lines.push('')
  }
  lines.push('## 页面清单')
  lines.push('')
  for (const [pathname, title] of [...CORE_PAGES, ...REFERENCE_PAGES]) {
    lines.push(`- [${title}](${abs(site, pathname)})`)
  }
  lines.push('')
  lines.push(`完整可收录页面见 ${abs(site, '/sitemap.xml')}。`)
  lines.push('')
  return lines.join('\n')
}

/** 供测试与构建脚本核对:FAQ 条目数、品牌数与教程篇数 */
export function llmsFacts() {
  return {
    faqCount: FAQ_ITEMS.length,
    brandCount: PALETTE_LIST.length,
    categoryCount: GALLERY_CATEGORY_META.length,
    tutorialCount: TUTORIALS_ZH.reduce((sum, section) => sum + (section.children || []).length, 0),
  }
}
