/**
 * 熨烫参考页的数据组织(纯函数)。
 *
 * 不另写一份温度表:品牌档位与翻车处理直接取教程 zh 数据里的表格块,
 * 页面、静态快照与教程三处永远是同一份说法。教程内容只有中文,
 * 所以这一页按单语页处理(SEO_CONFIG.singleLanguage)。
 */

import { TUTORIALS_ZH } from '../../data/tutorials.zh.js'

/** 与熨烫页直接相关的教程文章(按阅读顺序) */
export const IRONING_ARTICLE_IDS = [
  'brands-guide',
  'ironing-technique',
  'double-sided-ironing',
  'ironing-rescue',
  'why-warping',
  'weight-pressing',
]

/**
 * 熨烫要点(页面卡片与静态正文共用)。
 * 每一条都能在教程原文里找到对应说法,不新造温度数字。
 */
export const IRONING_RULES = [
  ['中温、关闭蒸汽', '主流品牌的官方口径一致:中温、关蒸汽、边熨边看。宁可低温多次,也不要高温一次。'],
  ['隔纸、移动、观察', '珠子表面盖一层熨纸,熨斗画圆弧从中心向外移动,不要停在原地;表面微微反光即可。'],
  ['不超过 170°C', '任何情况下都不要超过 170°C。深色珠子吸热更多,大图案受热更慢,应延长时间而不是调高温度。'],
  ['双面烫 + 压重', '正面 30–50 秒、背面 20–30 秒;完成后趁温热压重,冷却至少 30 分钟再取下重物。'],
]

const ARTICLES = new Map()
for (const section of TUTORIALS_ZH) {
  for (const article of section.children || []) {
    if (article?.id) ARTICLES.set(article.id, { article, section })
  }
}

/** 按 id 取教程文章;不存在返回 null */
export function tutorialArticle(id) {
  const entry = ARTICLES.get(id)
  return entry ? { ...entry.article, sectionTitle: entry.section.title } : null
}

/** 取文章里的第一个表格块(headers/rows),没有则返回 null */
function tableBlock(article) {
  const block = (article?.blocks || []).find((b) => b && b.type === 'table')
  return block ? { headers: block.headers || [], rows: block.rows || [] } : null
}

/**
 * 熨烫页需要的全部参考数据。
 *
 * @returns {{
 *   brandTable: {headers:string[],rows:string[][]}|null,
 *   failureTable: {headers:string[],rows:string[][]}|null,
 *   brandArticle: object|null,
 *   articles: Array<object>,
 * }}
 */
export function ironingReference() {
  const brand = tutorialArticle('brands-guide')
  const rescue = tutorialArticle('ironing-rescue')
  return {
    brandTable: tableBlock(brand),
    failureTable: tableBlock(rescue),
    brandArticle: brand,
    articles: IRONING_ARTICLE_IDS.map((id) => tutorialArticle(id)).filter(Boolean),
  }
}
