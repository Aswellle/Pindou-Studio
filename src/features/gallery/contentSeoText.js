/**
 * 动态内容页(图纸 / 主题 / 合集)的 meta description 生成器。
 *
 * 同一份描述必须同时用于运行时 Helmet(PatternDetailPage / ThemePage /
 * CollectionPage)与构建期快照(ogSnapshot.js)。此前两处各写一套:快照里是
 * 「名字 + 尺寸 + 豆子数」的完整句,运行时只有「名字 · 尺寸 · 品牌」,
 * React 一挂载就把静态 meta 覆盖成十几个字 —— 抓取端看到哪一份全凭时序。
 *
 * 描述统一交给 seoText.js 的 composeSeoDescription 组装到 150–160 字符:
 * 数据在前、固定说明在后,短名字的图纸也能达到 Bing 建议的长度。
 */

import { composeSeoDescription } from '../../utils/seoText.js'

const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

/**
 * 图纸详情页描述。
 *
 * @param {object} tpl
 * @param {string} tpl.name 展示名(云端用 nameZh/name,内置模板由调用方解析)
 * @param {number} tpl.width
 * @param {number} tpl.height
 * @param {number} tpl.beads 豆子总数
 * @param {number} tpl.colorCount 用色数
 * @param {string} [tpl.difficulty] easy / medium / hard
 * @param {string} [tpl.categoryLabel] 中文分类名(动物 / 图标 …)
 * @param {string} [tpl.brandLabel] 品牌色卡名(Perler 拼豆 …)
 */
export function patternSeoDescription(tpl) {
  const { name, width, height, beads, colorCount, difficulty, categoryLabel, brandLabel } = tpl || {}
  if (!name) return ''
  const diff = DIFFICULTY_LABELS[difficulty] || ''
  return composeSeoDescription([
    `${name}拼豆图纸：${width}×${height} 网格，共 ${beads} 颗豆子、${colorCount} 种颜色${
      diff ? `，${diff}难度` : ''
    }。`,
    `已按 ${brandLabel || 'Perler 拼豆'}色卡就近匹配色号，打开即可一键载入画布继续编辑、改色或去噪，也能导出带色号的 PNG/SVG 图纸与分色用量清单。`,
    categoryLabel ? `同类${categoryLabel}图纸可在分类页继续挑选。` : '',
    '照着清单备料就能开拼，也可以用图片转拼豆工具把自己的照片做成图纸。',
    '全部图纸免费浏览，登录后还能把作品保存到云端。',
    '无需注册即可浏览。',
    '打开即用。',
  ])
}

/** 主题详情页描述。description 来自后台策展文案,可能缺失或偏短。 */
export function themeSeoDescription(input) {
  const { title = '', description = '', count = 0 } = input || {}
  if (!title && !description) return ''
  const lead = `「${title || '本'}」拼豆图纸主题${
    count > 0 ? `收录 ${count} 张免费图纸` : '按题材整理'
  }。${description || ''}`
  return composeSeoDescription([
    lead,
    count > 0 ? `主题内共 ${count} 张图纸，可先看预览再挑一张开始。` : '',
    '每张图纸都标注网格尺寸、豆子总数与配色，打开即可一键载入画布制作或继续修改。',
    '支持导出带色号的 PNG/SVG 图纸，也能重映射到 COCO、MARD、Perler、Hama、Artkal 等品牌色卡。',
    '全部免费浏览，无需注册。',
    '可以按分类、难度与用色数继续筛选。',
    '桌面与手机浏览器都能直接打开。',
    '打开即用。',
  ])
}

/** 合集详情页描述。策展说明优先于普通描述,与页面正文的取用顺序一致。 */
export function collectionSeoDescription(input) {
  const { title = '', description = '', curationNote = '', count = 0 } = input || {}
  if (!title && !description && !curationNote) return ''
  const note = curationNote || description || ''
  const lead =
    count > 0
      ? `「${title || '本'}」合集收录 ${count} 张免费拼豆图纸。${note}`
      : `「${title || '本'}」是拼豆Studio 精选的拼豆图纸合集。${note}`
  return composeSeoDescription([
    lead,
    '合集按主题与场景整理，适合不知道从哪张开始的时候直接挑。',
    '每张图纸都可一键载入画布制作或继续修改，并支持导出带色号的 PNG/SVG。',
    '全部免费浏览，登录后还能把喜欢的作品保存到云端。',
    '也可以从完整图库按分类、难度与用色数继续筛选。',
    '无需注册即可查看。',
    '打开即用。',
  ])
}
