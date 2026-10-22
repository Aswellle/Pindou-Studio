/**
 * 色卡表单的预设选项(重构规格 §4.2 / §6.4)。
 *
 * 预设全部从仓库现有数据派生,不写死「某品牌官方系列」这类仓库没有的元数据:
 *   - 品牌:内置 PALETTE_LIST + 已有个人色卡里用过的自定义品牌;
 *   - 豆径:内置色卡的 beadSize + 已有个人色卡的有效 beadSizeMm;
 *   - 阈值:UI 便利预设(严格 / 均衡 / 宽松),不是客观色彩标准。
 *
 * 纯函数,不做 I/O。
 */

import { PALETTE_LIST } from '../../data/palettes'

/** 内置色卡的豆径(去重、升序),用于下拉预设 */
export function builtinBeadSizes() {
  const set = new Set()
  for (const p of PALETTE_LIST) {
    const n = Number(p.beadSize)
    if (Number.isFinite(n) && n > 0) set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}

/** 品牌预设:内置品牌 id + 个人色卡里出现过的自定义品牌名 */
export function brandOptions(palettes = []) {
  const custom = new Set()
  for (const p of palettes || []) {
    const name = String(p.brandName || '').trim()
    // 内置品牌名本身走 i18n,只在数据里出现时也作为预设;重复值由调用方按 key 去重
    if (name) custom.add(name)
  }
  return { builtinIds: PALETTE_LIST.map((p) => p.id), custom: [...custom] }
}

/** 豆径预设:内置 + 个人色卡已用过的有效值 */
export function beadSizeOptions(palettes = []) {
  const set = new Set(builtinBeadSizes())
  for (const p of palettes || []) {
    const n = Number(p.beadSizeMm)
    if (Number.isFinite(n) && n > 0) set.add(Math.round(n * 100) / 100)
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * 系列预设:只汇总个人色卡里已用过的系列名。
 * 仓库的品牌数据没有「官方系列」元数据,所以这里不声称任何系列属于某品牌。
 */
export function seriesOptions(palettes = []) {
  const set = new Set()
  for (const p of palettes || []) {
    const name = String(p.seriesName || '').trim()
    if (name) set.add(name)
  }
  return [...set]
}

/** ΔE00 阈值预设(UI 便利值,不是色彩学标准) */
export const THRESHOLD_PRESETS = Object.freeze([
  { id: 'strict', value: 3, key: 'myBeads.match.thresholdStrict' },
  { id: 'balanced', value: 6, key: 'myBeads.match.thresholdBalanced' },
  { id: 'loose', value: 10, key: 'myBeads.match.thresholdLoose' },
])

/**
 * 阈值 → 预设 id;不在预设里返回 'custom'。
 * 注意 0 是合法值(最严格),不能被当成空值退回默认。
 */
export function thresholdPresetId(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'custom'
  const hit = THRESHOLD_PRESETS.find((p) => p.value === n)
  return hit ? hit.id : 'custom'
}

/**
 * 解析阈值输入。空值才用默认;数字 0 必须保持 0。
 * 这正是旧代码 `Number(v) || DEFAULT` 的错误来源。
 */
export function resolveThreshold(raw, fallback) {
  const text = String(raw ?? '').trim()
  if (text === '') return fallback
  const n = Number(text)
  if (!Number.isFinite(n)) return fallback
  return Math.min(30, Math.max(0, n))
}
