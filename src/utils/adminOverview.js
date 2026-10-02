/**
 * 管理概览(/admin/dashboard)纯计算层。
 *
 * 把 admin_overview() RPC 的聚合结果与云端模板库数据加工成页面可直接渲染的
 * 结构 —— 补零/排序/占比/健康检查全部在这里完成,组件只负责渲染与交互。
 * 全部纯函数:无 DOM、无 i18n(标签由组件按 gallery.categories.* /
 * gallery.difficulties.* / palette.brand.* 解析),便于单测。
 */

export const TREND_WINDOW_DAYS = 14
export const TOP_TEMPLATE_LIMIT = 5
export const HEALTH_SAMPLE_LIMIT = 3

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const toCount = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** pattern → 唯一颜色数(非法/空图案返回 0) */
export function patternColorCount(pattern) {
  if (!Array.isArray(pattern)) return 0
  const colors = new Set()
  for (const row of pattern) {
    if (!Array.isArray(row)) continue
    for (const cell of row) {
      if (typeof cell === 'string' && cell) colors.add(cell)
    }
  }
  return colors.size
}

/** pattern 尺寸 → { rows, cols };非法图案返回 null */
export function patternDims(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0) return null
  if (!Array.isArray(pattern[0]) || pattern[0].length === 0) return null
  return { rows: pattern.length, cols: pattern[0].length }
}

/** 注册序列归一化:非法行丢弃、同日期合并求和、按日期升序 */
export function normalizeTrend(series) {
  if (!Array.isArray(series)) return []
  const byDate = new Map()
  for (const row of series) {
    if (!row || typeof row.date !== 'string' || !DATE_RE.test(row.date)) continue
    const email = toCount(row.email)
    const username = toCount(row.username)
    const prev = byDate.get(row.date) || { email: 0, username: 0 }
    byDate.set(row.date, { email: prev.email + email, username: prev.username + username })
  }
  return [...byDate.entries()]
    .map(([date, counts]) => ({ date, email: counts.email, username: counts.username, total: counts.email + counts.username }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * 趋势柱数据:只保留最近 days 天,给出每根柱子的相对高度(0~100),
 * 以及窗口内的合计与两种注册方式的拆分。
 */
export function buildTrend(series, options = {}) {
  const days = Number(options.days) > 0 ? Math.floor(Number(options.days)) : TREND_WINDOW_DAYS
  const window = normalizeTrend(series).slice(-days)
  const peak = window.reduce((max, day) => Math.max(max, day.total), 0)
  const bars = window.map((day) => ({
    ...day,
    height: peak > 0 ? Math.round((day.total / peak) * 1000) / 10 : 0,
  }))
  return {
    bars,
    peak,
    windowTotal: window.reduce((sum, day) => sum + day.total, 0),
    emailTotal: window.reduce((sum, day) => sum + day.email, 0),
    usernameTotal: window.reduce((sum, day) => sum + day.username, 0),
    hasData: window.some((day) => day.total > 0),
  }
}

/** 按 key 计数 + 占比;knownKeys 先置零,保证「空分类」也能出现在分布里 */
function groupCounts(items, keyOf, knownKeys = [], total = items.length) {
  const counts = new Map()
  for (const key of knownKeys) counts.set(key, 0)
  for (const item of items) {
    const key = keyOf(item)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count, share: total > 0 ? count / total : 0 }))
    .sort((a, b) => (b.count - a.count) || a.id.localeCompare(b.id))
}

/**
 * 模板库统计:总数/来源拆分/累计下载,按分类、难度、品牌色卡的分布,
 * 以及下载量前 N 的模板(直接引用模板对象,便于渲染缩略图)。
 */
export function computeLibraryStats(templates = [], categories = []) {
  const list = Array.isArray(templates) ? templates : []
  const total = list.length
  const downloads = list.reduce((sum, tpl) => sum + toCount(tpl?.downloadCount), 0)
  const builtin = list.filter((tpl) => tpl?.source === 'builtin').length
  const categoryIds = (Array.isArray(categories) ? categories : [])
    .map((cat) => (typeof cat === 'string' ? cat : cat?.id))
    .filter(Boolean)

  return {
    total,
    builtin,
    custom: total - builtin,
    downloads,
    hasDownloads: downloads > 0,
    avgDownloads: total > 0 ? Math.round(downloads / total) : 0,
    byCategory: groupCounts(list, (tpl) => tpl?.category || 'uncategorized', categoryIds, total),
    byDifficulty: groupCounts(list, (tpl) => tpl?.difficulty || 'easy', [], total),
    byPalette: groupCounts(list, (tpl) => tpl?.paletteId || 'perler', [], total),
    topDownloaded: [...list]
      .sort((a, b) => (toCount(b?.downloadCount) - toCount(a?.downloadCount))
        || String(a?.name || '').localeCompare(String(b?.name || '')))
      .slice(0, TOP_TEMPLATE_LIMIT),
  }
}

/**
 * 内容库健康检查:每条问题给出数量、样例名称与最简修复入口(组件映射到后台 tab)。
 * 只用模板数据自身可判定的规则,不猜测作者意图。
 */
export function checkContentHealth(templates = [], categories = [], options = {}) {
  const list = Array.isArray(templates) ? templates : []
  const validPalettes = new Set((options.validPaletteIds || []).filter(Boolean))
  const categoryIds = new Set(
    (Array.isArray(categories) ? categories : [])
      .map((cat) => (typeof cat === 'string' ? cat : cat?.id))
      .filter(Boolean),
  )
  const labelOf = (tpl) => tpl?.nameZh || tpl?.name || (tpl?.id != null ? String(tpl.id) : '')

  const issues = []
  const add = (code, severity, offenders, samples) => {
    if (!offenders.length) return
    issues.push({
      code,
      severity,
      count: offenders.length,
      samples: (samples || offenders.map(labelOf)).filter(Boolean).slice(0, HEALTH_SAMPLE_LIMIT),
    })
  }

  add('invalidPattern', 'warn', list.filter((tpl) => patternColorCount(tpl?.pattern) === 0))
  add('thinColors', 'warn', list.filter((tpl) => {
    const colors = patternColorCount(tpl?.pattern)
    return colors > 0 && colors < 2
  }))
  add('sizeMismatch', 'info', list.filter((tpl) => {
    const dims = patternDims(tpl?.pattern)
    return !!dims && Number(tpl?.size) !== Math.max(dims.rows, dims.cols)
  }))
  add('missingNameZh', 'info', list.filter((tpl) => !tpl?.nameZh))
  if (validPalettes.size > 0) {
    add('unknownPalette', 'warn', list.filter((tpl) => tpl?.paletteId && !validPalettes.has(tpl.paletteId)))
  }

  const nameCounts = new Map()
  for (const tpl of list) {
    const key = String(tpl?.name || '').trim().toLowerCase()
    if (!key) continue
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
  }
  const dupNames = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([key]) => key).sort()
  add('duplicateName', 'warn', dupNames, dupNames)

  if (categoryIds.size > 0) {
    const used = new Set(list.map((tpl) => tpl?.category).filter(Boolean))
    const empty = [...categoryIds].filter((id) => !used.has(id)).sort()
    add('emptyCategory', 'info', empty, empty)
    add('orphanCategory', 'warn', list.filter((tpl) => tpl?.category && !categoryIds.has(tpl.category)))
  }

  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
  return { issues, ok: issues.length === 0 }
}
