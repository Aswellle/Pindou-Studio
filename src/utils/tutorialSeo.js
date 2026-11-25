/**
 * 教程文章的 meta description。
 *
 * 运行时(Tutorials.jsx 的 ContentSeo)与构建期(scripts/generate-prerender-html.js
 * 的 18 个文章快照)共用这一个函数:此前两边都写 clamp(首段, 90),描述只有
 * 37–93 字,Bing Webmaster 会把整批文章标成「元描述过短」;两处各改一次也
 * 容易出现抓取端与浏览器描述不一致。
 *
 * 取正文前两段(优先在句末收尾)作为信息主体,再按需补齐教程库的固定说明,
 * 最终长度落在 150–160 字符。
 */

import { clampSeoDescription, composeSeoDescription } from './seoText.js'

/**
 * @param {{title?:string, blocks?:Array<{type:string,text?:string}>}} article
 * @param {string} [sectionTitle] 文章所属专题(入门指南 / 熨烫全解 …)
 */
export function tutorialSeoDescription(article, sectionTitle = '') {
  if (!article?.title) return ''
  const paragraphs = (article.blocks || [])
    .filter(block => block?.type === 'paragraph' && block.text)
    .map(block => block.text)
  const body = paragraphs.length
    ? clampSeoDescription(paragraphs.slice(0, 2).join(''), 120)
    : `${article.title}：拼豆Studio 拼豆教程。`

  return composeSeoDescription([
    body,
    sectionTitle
      ? `本篇属于「${sectionTitle}」专题，附材料清单、操作步骤与常见问题。`
      : '本篇附材料清单、操作步骤与常见问题。',
    '拼豆Studio 教程全部免费阅读，可配合在线拼豆图纸工具边看边做。',
    '也可以从免费图纸模板库挑一张小图，按教程步骤练手。',
    '遇到不确定的步骤，还可以对照熨烫温度表或常见问题页。',
    '全部内容免费阅读，无需注册。',
    '打开即用。',
  ])
}
