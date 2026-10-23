/**
 * workVersions — 作品版本时间线的纯逻辑(无 IndexedDB、无 DOM)
 *
 * 「什么算一个版本」的判定放在这里,是 C2 唯一的语义决策点:
 *
 *   **一次显式保存 = 一个版本。**
 *
 * 自动保存(草稿槽)完全不进这条链路 —— 它写的是 `drafts` 仓,本模块根本不读它。
 * 这样「画一笔自动存一次」不会产生任何历史条目,版本爆炸在源头就被切断了,
 * 不需要靠事后合并/去重来补救。
 *
 * 回滚也是一次显式保存,因此同样产生一条版本 —— 验收要求「回滚本身也产生一条历史」,
 * 而且这条历史必须是回滚**之后**的内容,否则用户回滚错了就再也回不去。
 */

/** 版本保留上限:本地只留最近 N 个,更早的由存储层淘汰 */
export const MAX_VERSIONS_PER_WORK = 20

/** 统计珠子数与用色数(canvasData 里非 null 的格子即珠子) */
export function summarizeWork(canvasData) {
  if (!Array.isArray(canvasData)) return { beads: 0, colors: 0, width: 0, height: 0 }
  const colors = new Set()
  let beads = 0
  for (const row of canvasData) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      if (cell == null) continue
      beads++
      colors.add(cell)
    }
  }
  const height = canvasData.length
  const width = canvasData.reduce((max, row) => (
    Array.isArray(row) && row.length > max ? row.length : max
  ), 0)
  return { beads, colors: colors.size, width, height }
}

/**
 * 两个版本之间的差异摘要。
 *
 * 只做「能一眼看懂」的量级对比,不做逐格 diff —— 拼豆图纸的逐格 diff 在
 * 20×20 以上就没法用文本呈现了,而用户真正关心的是「这次改了多少」。
 *
 * @param {Object} older - 较早版本(含 canvasData)
 * @param {Object} newer - 较新版本
 * @returns {{ beads: number, colors: number, changedCells: number }}
 *   changedCells 为两版逐格比较后内容不同的格子数(尺寸不同时按缺格计)
 */
export function diffVersions(older, newer) {
  const a = older?.canvasData
  const b = newer?.canvasData
  const sumA = summarizeWork(a)
  const sumB = summarizeWork(b)
  const result = {
    beads: sumB.beads - sumA.beads,
    colors: sumB.colors - sumA.colors,
    changedCells: 0,
  }
  if (!Array.isArray(a) || !Array.isArray(b)) return result

  const rows = Math.max(a.length, b.length)
  for (let y = 0; y < rows; y++) {
    const rowA = Array.isArray(a[y]) ? a[y] : []
    const rowB = Array.isArray(b[y]) ? b[y] : []
    const cols = Math.max(rowA.length, rowB.length)
    for (let x = 0; x < cols; x++) {
      const va = rowA[x] ?? null
      const vb = rowB[x] ?? null
      if (va !== vb) result.changedCells++
    }
  }
  return result
}

/**
 * 判断这次保存是否值得记一个版本。
 *
 * 内容与上一版完全一致时不记录 —— 用户连点两次保存、或改完又改回去,
 * 不该在时间线里留下两条一模一样的条目(那才是真正让人不想用的「版本爆炸」)。
 *
 * @param {Object|null} previous - 上一版(可为 null,表示首个版本)
 * @param {Object} next - 本次保存的作品
 * @returns {boolean}
 */
export function shouldRecordVersion(previous, next) {
  if (!next || !Array.isArray(next.canvasData)) return false
  if (!previous) return true
  return diffVersions(previous, next).changedCells > 0
}

/**
 * 版本标签:i18n 键 + 插值参数,组件直接 `t(key, params)`。
 *
 * 不在纯逻辑层拼中文,是为了让 4 个语言文件保持唯一文案来源。
 *
 * @param {Object} version
 * @param {number} index - 在时间线中的序号(0 = 最新)
 * @param {number} total
 * @returns {{ key: string, params: Object }}
 */
export function versionLabel(version, index, total) {
  if (index === 0) return { key: 'versions.labelCurrent', params: {} }
  if (index === total - 1) return { key: 'versions.labelEarliest', params: {} }
  return { key: 'versions.labelOlder', params: { n: index } }
}
