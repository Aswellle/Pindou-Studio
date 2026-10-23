/**
 * 图纸分享卡片的布局规划(构建期,纯函数)。
 *
 * 为什么单独成模块:卡片是**画出来的**,不是拼 HTML。绘制依赖 canvas
 * (原生模块,jsdom 里跑不了),但真正容易算错的是布局 —— 图案缩放、
 * 居中、色卡换行、标题折行与截断。把这些几何计算抽成纯函数,就能在单测里
 * 覆盖边界(200×200 的长条图、只有 1 种颜色的图、超长标题),
 * 绘制脚本只负责按坐标落笔。
 *
 * 尺寸固定 1200×630:与 index.html 里声明的 og:image:width/height 一致,
 * 也是微信 / X / Facebook / Telegram 卡片的标准比例。改这个尺寸必须同步改
 * index.html 的 meta,否则部分平台会裁切。
 *
 * 字体度量通过 `measure` 注入而不是内置:规划函数保持纯,测试传一个
 * 确定性的假度量即可;绘制脚本传 `ctx.measureText` 包装,拿到真实字宽。
 */

// 显式 .js 扩展名:本文件会被 scripts/generate-og-snapshots.js 用 Node 直接
// import(Node ESM 不做扩展名补全),与 ogSnapshot.js 的既有写法一致。
import { patternDimensions, patternStats } from './ogSnapshot.js'

export const OG_CARD_WIDTH = 1200
export const OG_CARD_HEIGHT = 630

/** 色卡最多展示几种颜色。超出的在卡片上标注「另有 N 种」 */
export const OG_CARD_MAX_COLORS = 12

/** 色卡每行几个、单元格多大(px) */
const SWATCH_COLS = 4
const SWATCH_CELL_W = 126
const SWATCH_CELL_H = 54
const SWATCH_SIZE = 36

/** 布局常量 */
const PAD = 48
const PREVIEW_SIZE = OG_CARD_HEIGHT - PAD * 2 // 534
const RIGHT_X = PAD + PREVIEW_SIZE + PAD // 630
const RIGHT_W = OG_CARD_WIDTH - RIGHT_X - PAD // 522

/** 品牌 id → 卡片上的展示名(与 palette.brand.* 的文案同义) */
const BRAND_LABELS = {
  coco: 'COCO',
  mard: 'MARD',
  mard291: 'MARD 291',
  perler: 'Perler',
  hama: 'Hama',
  artkal: 'Artkal',
}

export function brandLabel(paletteId) {
  return BRAND_LABELS[paletteId] || BRAND_LABELS.perler
}

/**
 * 卡片文件名带上内容指纹。
 *
 * 为什么不用固定 `/og/pattern/<id>.png`:社交平台按 URL 缓存缩略图,
 * 图纸内容改了但 URL 没变,平台会继续显示旧卡片。把名称/色卡/图案的
 * 指纹拼进文件名,内容一变 URL 就变,平台自然会重新抓取。
 *
 * @returns {string} 站内绝对路径(以 / 开头),交由 absoluteUrl 补站点前缀
 */
export function ogCardPath(id, hash) {
  return `/og/pattern/${encodeURIComponent(id)}-${hash}.png`
}

/**
 * 内容指纹(FNV-1a 32 位)。
 *
 * 只用来生成文件名,不做安全用途 —— 碰撞的后果仅仅是某次内容更新没有
 * 刷新分享卡片,不会影响页面本身。
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
      if (!Array.isArray(row)) { parts.push('\u0001'); continue }
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

/**
 * 把 rows×cols 的图案等比缩放并居中放进 box。
 *
 * @returns {{cell:number, gridX:number, gridY:number, gridW:number, gridH:number}}
 */
export function fitPatternBox(rows, cols, box) {
  if (!(rows > 0) || !(cols > 0)) {
    return { cell: 0, gridX: box.x, gridY: box.y, gridW: 0, gridH: 0 }
  }
  // 取整到整数像素:非整数格宽会让相邻格子出现 1px 的接缝或重叠
  const cell = Math.max(1, Math.floor(Math.min(box.w / cols, box.h / rows)))
  const gridW = cell * cols
  const gridH = cell * rows
  return {
    cell,
    gridX: Math.round(box.x + (box.w - gridW) / 2),
    gridY: Math.round(box.y + (box.h - gridH) / 2),
    gridW,
    gridH,
  }
}

/** 取前 n 种颜色(已按颗数降序),并报告被省略的数量 */
export function pickSwatches(stats, max = OG_CARD_MAX_COLORS) {
  const list = Array.isArray(stats?.list) ? stats.list : []
  return {
    shown: list.slice(0, max),
    omitted: Math.max(0, list.length - max),
  }
}

/** 单个字符的显示宽度:中日韩全角记 2,其余记 1 */
function charWidth(ch) {
  const cp = ch.codePointAt(0)
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||   // 谚文字母
    (cp >= 0x2e80 && cp <= 0xa4cf) ||   // CJK 部首 / 表意文字 / 假名
    (cp >= 0xac00 && cp <= 0xd7a3) ||   // 谚文音节
    (cp >= 0xf900 && cp <= 0xfaff) ||   // CJK 兼容表意文字
    (cp >= 0xfe30 && cp <= 0xfe6f) ||   // CJK 兼容形式
    (cp >= 0xff00 && cp <= 0xff60) ||   // 全角形式
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)    // CJK 扩展 B 及以后
  ) return 2
  return 1
}

/**
 * 默认的字体度量(无 canvas 时的近似)。
 * 拉丁字符按 0.55em、全角按 1em 估算 —— 只用于规划函数独立调用时的兜底,
 * 实际绘制总是传入真实 measureText。
 */
export function defaultMeasure(text, { fontSize }) {
  let w = 0
  for (const ch of String(text || '')) {
    w += charWidth(ch) === 2 ? fontSize : fontSize * 0.55
  }
  return w
}

/**
 * 按像素宽度折行,超过 maxLines 时在最后一行加省略号。
 *
 * 为什么不用固定字符数截断:标题可能中英混排(「小鸭 Duck」),中文字宽是
 * 拉丁字符的近两倍,按字符数截断会让纯中文标题溢出、纯英文标题留白。
 */
export function wrapLines(text, {
  maxWidth,
  fontSize,
  weight = 'normal',
  maxLines = 2,
  measure = defaultMeasure,
} = {}) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return []
  const fits = (t) => measure(t, { fontSize, weight }) <= maxWidth

  const chars = [...s]
  const lines = []
  let i = 0
  while (i < chars.length && lines.length < maxLines) {
    const isLast = lines.length === maxLines - 1
    let cur = ''
    // 内层的 `cur &&` 保证空行时至少吞掉一个字符:只要 cur 非空才可能 break,
    // 因此循环结束时 cur 必然非空,不需要额外的空行保护。
    while (i < chars.length) {
      const next = cur + chars[i]
      if (cur && !fits(next)) break
      cur = next
      i++
    }

    if (isLast && i < chars.length) {
      // 还有剩余:回退到「加省略号仍放得下」的最长前缀
      let cut = cur
      while (cut && !fits(`${cut}…`)) cut = cut.slice(0, -1)
      lines.push(`${cut}…`)
      return lines
    }
    lines.push(cur)
  }
  return lines
}

/**
 * 规划一张图纸卡片。
 *
 * @param {object} template - 云端模板行(name/nameZh/pattern/paletteId)
 * @param {object} [opts]
 * @param {number} [opts.width]  卡片宽,默认 1200
 * @param {number} [opts.height] 卡片高,默认 630
 * @param {number} [opts.maxColors] 色卡最多几种
 * @param {Function} [opts.measure] 字体度量函数 (text, {fontSize, weight}) => px
 * @returns {object|null} 规划结果;无名称或无图案内容时返回 null
 */
export function planPatternCard(template, {
  width = OG_CARD_WIDTH,
  height = OG_CARD_HEIGHT,
  maxColors = OG_CARD_MAX_COLORS,
  measure = defaultMeasure,
} = {}) {
  if (!template) return null
  const name = String(template.nameZh || template.name || '').trim()
  if (!name) return null
  const pattern = template.pattern
  if (!Array.isArray(pattern) || pattern.length === 0) return null

  const { width: cols, height: rows } = patternDimensions(pattern)
  if (!cols || !rows) return null
  const stats = patternStats(pattern)
  if (stats.beads === 0) return null

  const previewBox = { x: PAD, y: PAD, w: PREVIEW_SIZE, h: PREVIEW_SIZE }
  const fit = fitPatternBox(rows, cols, previewBox)

  // ── 右栏文字 ──────────────────────────────────────────────
  const titleFontSize = 52
  const titleLineHeight = 62
  const titleLines = wrapLines(name, {
    maxWidth: RIGHT_W,
    fontSize: titleFontSize,
    weight: 'bold',
    maxLines: 2,
    measure,
  })

  const titleTop = 96
  const afterTitle = titleTop + titleLines.length * titleLineHeight
  const metaY = afterTitle + 26
  const statsY = metaY + 40
  const labelY = statsY + 52
  const gridTop = labelY + 30

  const { shown, omitted } = pickSwatches(stats, maxColors)
  const swatches = shown.map((s, idx) => {
    const col = idx % SWATCH_COLS
    const row = Math.floor(idx / SWATCH_COLS)
    const x = RIGHT_X + col * SWATCH_CELL_W
    const y = gridTop + row * SWATCH_CELL_H
    return {
      hex: s.hex,
      count: s.count,
      x,
      y,
      size: SWATCH_SIZE,
      // 颗数右对齐到格子底部上方,色号在下方;两个基线都从方块顶算起
      countX: x + SWATCH_SIZE + 10,
      countY: y + 19,
      hexX: x + SWATCH_SIZE + 10,
      hexY: y + 37,
    }
  })

  const rowsUsed = Math.ceil(shown.length / SWATCH_COLS)
  const afterGrid = gridTop + rowsUsed * SWATCH_CELL_H

  return {
    width,
    height,
    background: '#fdfbf7',
    preview: {
      ...previewBox,
      bg: '#f1e8d9',
      cols,
      rows,
      ...fit,
      // 格子够大时留缝并倒角,看起来像一颗颗拼豆;太小就实心填,避免糊成一片
      inset: fit.cell >= 8 ? Math.max(1, Math.round(fit.cell * 0.08)) : 0,
      radius: fit.cell >= 12 ? Math.min(4, fit.cell * 0.18) : 0,
    },
    title: {
      lines: titleLines,
      x: RIGHT_X,
      y: titleTop,
      fontSize: titleFontSize,
      lineHeight: titleLineHeight,
      weight: 'bold',
      color: '#2b2420',
    },
    meta: {
      text: `${cols} × ${rows}`,
      x: RIGHT_X,
      y: metaY,
      fontSize: 30,
      weight: 'bold',
      color: '#e8734a',
    },
    stats: {
      text: `${stats.beads} 颗豆子 · ${stats.colorCount} 种颜色`,
      x: RIGHT_X,
      y: statsY,
      fontSize: 24,
      weight: 'normal',
      color: '#6f6259',
    },
    swatchLabel: {
      text: `色卡 · ${brandLabel(template.paletteId)}`,
      x: RIGHT_X,
      y: labelY,
      fontSize: 20,
      weight: 'normal',
      color: '#a3968a',
    },
    swatches,
    overflow: omitted > 0
      ? {
        text: `另有 ${omitted} 种颜色`,
        x: RIGHT_X,
        y: afterGrid + 26,
        fontSize: 17,
        color: '#a3968a',
      }
      : null,
    // 页脚放右栏底部并右对齐:左侧预览图占了整条左边缘,
    // 放在 x=PAD 会压在图案上
    footer: {
      text: 'tangnotes.site',
      x: RIGHT_X + RIGHT_W,
      y: height - 38,
      fontSize: 22,
      color: '#a3968a',
      align: 'right',
    },
  }
}
