/**
 * SEO 描述文案的纯函数工具。
 *
 * 为什么单独抽出来:同一段文章正文既要用于构建期预渲染(scripts/generate-prerender-html.js),
 * 又要用于运行时 Helmet(src/components/Tutorials.jsx)。两处若各写一套截断逻辑,
 * 抓取端与浏览器会看到两条不同的 description —— 这正是此前文章描述被截成
 * 半句加省略号、且两边长度不一致的成因。
 */

/** 压缩空白:把换行与连续空格压成单个空格(中文正文里常见全角空格也一并归一)。 */
export function plainText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\u3000/g, ' ')
    .trim()
}

/**
 * 截断为搜索引擎描述,优先在句末标点收尾。
 *
 * 规则:
 *   · 原文不超长 → 原样返回(不做无意义改写)
 *   · 超长 → 在 max 以内找最后一个句末标点(。!?；等);上限内找不到就放宽到
 *     1.5×max 再找。整句至少保留 max 的 40% 且不少于 12 个字符才采用,
 *     否则硬截断并补省略号
 * 这样避免出现「…变成儿童和成人都玩…」这类半句描述 —— SERP 里看起来像内容缺失。
 * 门槛不能用 max 的一半:中文一句话常常只有 14–20 字,按一半卡会把完整句判废,
 * 结果仍然切在半句上。
 *
 * @param {string} text
 * @param {number} max 字符上限(按 Unicode 码点计,中文一个字算一个)
 * @returns {string}
 */
export function clampSeoDescription(text, max = 90) {
  const t = plainText(text)
  const limit = Math.max(1, Number(max) || 90)
  if ([...t].length <= limit) return t

  const chars = [...t]
  const minKeep = Math.max(12, Math.floor(limit * 0.4))
  // 句末标点:中英文都覆盖(含英文句号 .),分号视作可收尾的边界(比逗号完整得多)
  const BOUNDARY = /[。！？!?；;.]/g

  // 第一步:在上限内取**最后一个**句末标点(尽量用满预算)。
  const head = chars.slice(0, limit).join('')
  let lastEnd = 0
  for (const m of head.matchAll(BOUNDARY)) lastEnd = m.index + 1
  if (lastEnd >= minKeep) return head.slice(0, lastEnd).trim()

  // 第二步:上限内没有合格断点(第一句本身就很长)→ 向后找跨过上限那一句的结束,
  // 最多放宽到 1.5 倍上限。多出几十个字符换一个完整句子,比在句中硬切更像正常描述。
  const ceiling = Math.floor(limit * 1.5)
  const tail = chars.slice(limit, ceiling).join('')
  // 注意用 search 而不是 match:BOUNDARY 带 /g,match() 返回的数组没有 index
  const nextIdx = tail.search(BOUNDARY)
  if (nextIdx >= 0) {
    return chars.slice(0, limit + nextIdx + 1).join('').trim()
  }
  return `${chars.slice(0, limit - 1).join('')}…`
}
