/**
 * 分类聚合页的统计摘要(纯函数)。
 *
 * 目的:分类页此前只有一段简介 + 模板卡片,和 `/gallery?cat=xxx` 的筛选结果
 * 高度相似,GSC 里容易出现「Google 选择的规范网页与用户指定的不同」。
 * 把该分类的尺寸区间、难度分布、用色区间与总用豆量算成一句可读摘要:
 * 每个分类的数值天然不同,既是用户挑图时真正想看的量级信息,
 * 也让页面正文与图库筛选页产生实质差异。
 */

/** @returns {{count:number,minW:number,minH:number,maxW:number,maxH:number,minColors:number,maxColors:number,beads:number,easy:number,medium:number,hard:number}|null} */
export function categoryStats(patterns = []) {
  const usable = (patterns || []).filter((tpl) => Array.isArray(tpl?.pattern) && tpl.pattern.length > 0)
  if (!usable.length) return null

  let minW = Infinity
  let minH = Infinity
  let maxW = 0
  let maxH = 0
  let minColors = Infinity
  let maxColors = 0
  let beads = 0
  let easy = 0
  let medium = 0
  let hard = 0

  for (const tpl of usable) {
    const rows = tpl.pattern
    const h = rows.length
    let w = 0
    const colors = new Set()
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      if (row.length > w) w = row.length
      for (const cell of row) {
        if (!cell) continue
        beads++
        colors.add(cell)
      }
    }
    if (!w || !h) continue
    minW = Math.min(minW, w)
    minH = Math.min(minH, h)
    maxW = Math.max(maxW, w)
    maxH = Math.max(maxH, h)
    minColors = Math.min(minColors, colors.size)
    maxColors = Math.max(maxColors, colors.size)
    if (tpl.difficulty === 'easy') easy++
    else if (tpl.difficulty === 'medium') medium++
    else if (tpl.difficulty === 'hard') hard++
  }

  if (!Number.isFinite(minW) || !maxW) return null
  return { count: usable.length, minW, minH, maxW, maxH, minColors, maxColors, beads, easy, medium, hard }
}

/**
 * 摘要文案(中文;分类页正文本身是中文单语,与 intro 同一展示条件)。
 *
 * @param {ReturnType<typeof categoryStats>} stats
 */
export function categoryStatsText(stats) {
  if (!stats) return ''
  const size = stats.minW === stats.maxW && stats.minH === stats.maxH
    ? `${stats.minW}×${stats.minH}`
    : `${stats.minW}×${stats.minH} – ${stats.maxW}×${stats.maxH}`
  const colorRange = stats.minColors === stats.maxColors
    ? `${stats.minColors} 种`
    : `${stats.minColors}–${stats.maxColors} 种`

  // 难度:只列有数量的档位,按「简单 / 中等 / 困难」顺序
  const levels = [
    ['简单', stats.easy],
    ['中等', stats.medium],
    ['困难', stats.hard],
  ].filter(([, n]) => n > 0)
  const levelText = levels.length
    ? levels.map(([label, n]) => `${label} ${n}`).join(' / ')
    : '未标注'

  return `本类共 ${stats.count} 张:尺寸 ${size},难度分布 ${levelText},用色 ${colorRange},` +
    `总用豆量约 ${stats.beads.toLocaleString('zh-CN')} 颗。`
}
