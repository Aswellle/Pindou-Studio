/**
 * 匹配预览(重构规格 §6.2 / §6.6)。
 *
 * 预览必须是**临时矩阵**:只对被用户勾选/接受的映射生效,绝不触碰真实画布。
 * 应用仍然走 services/beads/inventoryMatch.applyColorMapping —— 这里只负责
 * 「如果现在应用,会变成什么样」,复用同一套纯函数语义(空白格不动、
 * 同轮内不链式吞并),避免预览与最终结果出现分歧。
 *
 * 纯函数,不做 I/O。
 */

import { applyColorMapping } from '../../services/beads/inventoryMatch'

/**
 * 把已接受项整理成 applyColorMapping 需要的 entries。
 * @param {Array<object>} items - 匹配结果(effectiveItems)
 * @param {object} accepted - { sourceHex: true }
 * @returns {Array<{from: string, to: string}>}
 */
export function acceptedEntries(items, accepted) {
  return (items || [])
    .filter((item) => item?.targetColor && accepted?.[item.sourceHex])
    .map((item) => ({ from: item.sourceHex, to: item.targetColor.hex }))
}

/**
 * 生成替换后预览。
 *
 * @returns {{
 *   pattern: Array<Array<string|null>>,
 *   changedCells: number,
 *   selectedColors: number,
 *   changedColors: number,
 * }}
 */
export function buildMappingPreview(canvasData, items, accepted) {
  const entries = acceptedEntries(items, accepted)
  const selectedColors = entries.length
  const changedColors = entries.filter((e) => e.from !== e.to).length
  const result = applyColorMapping(canvasData, entries)
  return {
    pattern: result.data || canvasData || [],
    changedCells: result.changed,
    selectedColors,
    changedColors,
  }
}
