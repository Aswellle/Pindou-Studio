/**
 * 图纸内容指纹(FNV-1a 32 位)。
 *
 * 只用来生成文件名(分享卡片 /og/pattern/<id>-<hash>.png、预览图
 * /pattern-img/<id>-<hash>.png),不做安全用途 —— 碰撞的后果仅仅是某次
 * 内容更新没有刷新文件名,不会影响页面本身。
 *
 * 单独成模块:分享卡片(ogCard.js)与预览图(patternImage.js)都要用它,
 * 而 ogCard 依赖 ogSnapshot,ogSnapshot 又需要预览图的 alt 文案 ——
 * 把哈希留在 ogCard 里会形成循环依赖。
 */

/**
 * @param {object} template 需含 id / name / nameZh / paletteId / pattern
 * @returns {string} 7 位 base36 指纹
 */
export function patternContentHash(template) {
  const parts = [
    String(template?.id ?? ''),
    String(template?.nameZh || template?.name || ''),
    String(template?.paletteId || ''),
  ]
  // 逐格推进而不是 JSON.stringify:200×200 的图案有 4 万个格子,
  // 拼成字符串再哈希会额外产生几百 KB 的中间结果。
  const pattern = template?.pattern
  if (Array.isArray(pattern)) {
    for (const row of pattern) {
      if (!Array.isArray(row)) {
        parts.push('\u0001')
        continue
      }
      for (const cell of row) parts.push(cell == null ? '\u0000' : String(cell))
      parts.push('\u0002')
    }
  }

  let h = 0x811c9dc5
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    // 段之间插入分隔符,避免 ['ab','c'] 与 ['a','bc'] 哈希相同
    h ^= 0x1f
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0').slice(-7)
}
