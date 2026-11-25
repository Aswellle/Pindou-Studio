/**
 * SEO 描述文案的纯函数工具。
 *
 * 为什么单独抽出来:同一段文章正文既要用于构建期预渲染(scripts/generate-prerender-html.js),
 * 又要用于运行时 Helmet(src/components/Tutorials.jsx)。两处若各写一套截断逻辑,
 * 抓取端与浏览器会看到两条不同的 description —— 这正是此前文章描述被截成
 * 半句加省略号、且两边长度不一致的成因。
 */

/**
 * 搜索引擎建议的描述长度区间。
 *
 * Bing Webmaster 的「元描述过短」提示以 150–160 字符为界;Google 中文结果
 * 通常在 80 字左右截断,所以核心信息必须放在前 80 字内 —— 下面的组装器
 * 按「数据/正文信息在前、固定说明在后」的顺序拼接,被截断也不影响可读性。
 */
export const SEO_DESC_MIN = 150
export const SEO_DESC_MAX = 160

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
    return chars
      .slice(0, limit + nextIdx + 1)
      .join('')
      .trim()
  }
  return `${chars.slice(0, limit - 1).join('')}…`
}

/**
 * 按句子组装 meta description,把长度控制在搜索引擎建议的区间内。
 *
 * 动态页面的描述由「页面数据 + 固定说明」拼成:图纸名、分类名、文章首段
 * 长短差异很大,单个模板很容易短于 150 字符(Bing Webmaster 会据此提示
 * 「元描述过短」),硬编码到 160 字符又会在数据变化后被截断。这里按顺序
 * 拼接**完整句子**,总长不超过 max,达到 min 即停止 —— 补充句只在需要时出现。
 *
 * parts 必须是完整句子(函数不会把句子切一半);只有第一句本身就超过 max
 * 时才会硬截断并补省略号。调用方把最重要的信息放在数组最前面。
 *
 * @param {Array<string>} parts 完整句子,按重要性排序
 * @param {{min?:number,max?:number}} [options]
 * @returns {string}
 */
export function composeSeoDescription(parts, { min = SEO_DESC_MIN, max = SEO_DESC_MAX } = {}) {
  const list = (Array.isArray(parts) ? parts : []).map(plainText).filter(Boolean)
  let out = ''

  for (const sentence of list) {
    if ([...out].length >= min) break
    if (!out) {
      const chars = [...sentence]
      out = chars.length <= max ? sentence : `${chars.slice(0, max - 1).join('')}…`
      continue
    }
    // 中英文混排时英文单词之间补空格,避免 "Perler色卡" 这类粘连。
    const sep = /[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(sentence) ? ' ' : ''
    const next = `${out}${sep}${sentence}`
    if ([...next].length <= max) out = next
  }

  return out
}
