/**
 * 图案几何与配色判定的纯函数。
 *
 * 从 ThumbnailCanvas 抽出来:同一套「裁掉四周空白 / 近白珠子补描边」的规则,
 * 现在既要给运行时 canvas 用,也要给构建期生成的图纸预览 PNG 用
 * (scripts/pattern-image-renderer.mjs)。两边各写一套就会慢慢分叉 ——
 * 用户看到的缩略图与搜索引擎拿到的图片会变成两张不同的图。
 */

/**
 * 图案内容包围盒 — 裁掉四周全空的行列。
 *
 * 模板数据常带不等的外边距(内置的熊 4 行顶边、独角兽 9 列左边…),
 * 直接按整张网格铺进缩略图,每张图的「光学大小」和位置都不一样:
 * 有的贴边、有的缩在角落,整面墙看起来就没有统一规矩。
 * 以内容为基准构图后,所有模板在各自的框里都居中、尽量大。
 *
 * @param {Array<Array<string|null>>} pattern
 * @returns {{x0:number,y0:number,width:number,height:number}|null} 无内容时返回 null
 */
export function contentBox(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < pattern.length; y++) {
    const row = pattern[y]
    if (!Array.isArray(row)) continue
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x0: minX, y0: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

// 近白判定阈值(0–255 亮度)。拼豆色卡里存在 #F8F8F8 / #FFFFFF 这类珠子,
// 它们画在白纸上与纸同色 —— 整块图案会「消失」,只剩零星深色格点。
const LIGHT_LUMA = 240

const lightCache = new Map()

/**
 * 是否近白色(亮度 ≥ 240)。
 * 近白珠子需要补一圈淡描边,否则在白底/透明底上不可见。
 */
export function isNearWhite(hex) {
  if (typeof hex !== 'string') return false
  if (lightCache.has(hex)) return lightCache.get(hex)
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  let light = false
  if (match) {
    const n = Number.parseInt(match[1], 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    light = 0.299 * r + 0.587 * g + 0.114 * b >= LIGHT_LUMA
  }
  lightCache.set(hex, light)
  return light
}
