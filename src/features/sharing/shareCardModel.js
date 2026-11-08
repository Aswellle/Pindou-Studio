/**
 * 分享卡排版模型(纯函数,可测)。
 *
 * 为什么把排版单独抽出来:真正的绘制依赖 canvas(jsdom 里跑不了),
 * 但容易算错的都是几何 —— 图案缩放取整、文字折行、二维码尺寸与留白。
 * 这里只做计算,渲染器按坐标落笔。
 *
 * 卡片固定 1200×630(与 index.html 的 og:image:width/height 一致,
 * 也是微信 / X / Facebook / Telegram 的标准大图比例)。
 *
 * 版式(v2):
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [logo] 拼豆Studio                              域名(品牌条) │
 *   ├───────────────────────┬──────────────────────────────────┤
 *   │                       │ 标题(≤2 行)                        │
 *   │   图案预览(白纸面板)      │ 署名                              │
 *   │                       │ [尺寸][豆子][颜色] 信息 chips        │
 *   │                       │ ●●●●●●●● 用色珠条 +N               │
 *   │                       │ [二维码]  扫码查看图纸               │
 *   └───────────────────────┴──────────────────────────────────┘
 *   [logo] 拼豆 Studio · tangnotes.site                (页脚)
 */

import { SITE_ORIGIN } from './shareUrl'

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/** 品牌名(与 data/site 一致;品牌不翻译,卡片四语言同形) */
export const BRAND_NAME = '拼豆Studio'
/** 品牌域名(取自生产 origin,只用于展示) */
export const BRAND_DOMAIN = (() => {
  try {
    return new URL(SITE_ORIGIN).hostname
  } catch {
    return SITE_ORIGIN
  }
})()

/**
 * 站点专属 LOGO:与 favicon / 登录页同源的 4×4 十六格拼豆色卡。
 * 行优先,与 scripts/generate-favicon.mjs 的 GRID 逐格一致。
 */
export const LOGO_GRID = [
  ['#E53935', '#FDD835', '#32CD32', '#1976D2'],
  ['#F06292', '#BA68C8', '#00BCD4', '#FF9800'],
  ['#FFFFFF', '#E0E0E0', '#000000', '#795548'],
  ['#8D6E63', '#A1887F', '#BDBDBD', '#6D4C41'],
]

const PAD = 44
const HEADER_H = 84
const PREVIEW_W = 640
const PREVIEW_Y = HEADER_H + 34 // 118
const PREVIEW_H = CARD_HEIGHT - PREVIEW_Y - PAD // 468
const PREVIEW_INNER = 24
const RIGHT_X = PAD + PREVIEW_W + 36 // 720
const RIGHT_W = CARD_WIDTH - RIGHT_X - PAD // 436

const TITLE_FONT = 44
const TITLE_LINE = 54
const TITLE_MAX_LINES = 2
const AUTHOR_FONT = 19
const CHIP_FONT = 22
const CHIP_H = 44
const SWATCH_SIZE = 28
const QR_SIZE = 170
const QR_MARGIN = 3
/** 右列底部品牌行(小 LOGO + 站名 + 域名)占用的竖向空间 */
const BRAND_ROW_H = 44

const PALETTE = {
  background: '#FBF7F0',
  backgroundDot: 'rgba(232, 115, 74, 0.07)',
  /* 品牌条:站点标志色「手作暖调橙」(与 --accent 同源),不再是深棕渐变 */
  headerFrom: '#E8734A',
  headerTo: '#E8734A',
  headerText: '#FFFFFF',
  panel: '#FFFFFF',
  panelShadow: 'rgba(43, 36, 32, 0.10)',
  panelBorder: '#E8DFD2',
  text: '#2B2420',
  muted: '#7A6C60',
  accent: '#E8734A',
  chipBorder: 'rgba(43, 36, 32, 0.14)',
  chipIcon: '#E8734A',
  qrCardBorder: '#E8DFD2',
  qrDark: '#111111',
  qrLight: '#FFFFFF',
  nearWhiteRing: 'rgba(43, 36, 32, 0.28)',
}

/**
 * 图案内容包围盒(裁掉四周全空行列)。
 * 与 ThumbnailCanvas.contentBox 同语义:所有分享卡在框里都被放到最大、居中。
 */
export function contentBounds(pattern) {
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

/** 等比放入 box,格子取整数像素(非整数格宽会出现 1px 接缝) */
export function fitPatternBox(width, height, box) {
  if (!(width > 0) || !(height > 0) || box.w <= 0 || box.h <= 0) {
    return { cell: 0, gridW: 0, gridH: 0, x: box.x, y: box.y }
  }
  const cell = Math.max(1, Math.floor(Math.min(box.w / width, box.h / height)))
  const gridW = cell * width
  const gridH = cell * height
  return {
    cell,
    gridW,
    gridH,
    x: Math.round(box.x + (box.w - gridW) / 2),
    y: Math.round(box.y + (box.h - gridH) / 2),
  }
}

/**
 * 用色统计:按 hex 计数取前 N 个(颗数降序、hex 升序保证稳定)。
 * 供卡片「用色珠条」使用,数字与分享页统计同口径。
 */
export function topColors(pattern, limit = 9) {
  const counts = new Map()
  if (Array.isArray(pattern)) {
    for (const row of pattern) {
      if (!Array.isArray(row)) continue
      for (const cell of row) {
        if (!cell || typeof cell !== 'string') continue
        const hex = cell.toUpperCase()
        counts.set(hex, (counts.get(hex) || 0) + 1)
      }
    }
  }
  const all = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) }
}

/**
 * 逐字折行。
 *
 * 中文没有空格分词,按字符累加最稳;英文单词会被拆开是已知取舍 ——
 * 分享卡标题以中文为主,拆开的英文单词仍可读。
 *
 * @param {(text: string) => number} measure 返回文本宽度
 */
export function wrapText(text, maxWidth, measure, maxLines = 99) {
  const source = String(text || '').trim()
  if (!source) return []
  if (typeof measure !== 'function') return [source]

  const lines = []
  let current = ''
  for (const char of [...source]) {
    const next = current + char
    if (current && measure(next) > maxWidth) {
      lines.push(current)
      current = char
      if (lines.length === maxLines) break
    } else {
      current = next
    }
  }
  if (lines.length < maxLines && current) lines.push(current)

  // 超出行数时给最后一行加省略号(逐字回退直到放得下)
  if (lines.length === maxLines && [...source].length > lines.join('').length) {
    let last = lines[maxLines - 1]
    while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}…`
  }
  return lines
}

/**
 * 构建卡片模型。
 *
 * @param {object} params
 * @param {object} params.snapshot - 公开快照(camelCase)
 * @param {string} params.shareUrl - 分享链接(QR 编码的**唯一**来源)
 * @param {object} params.labels - 已翻译的文案:{size, beads, colors, scan, footer}
 * @param {(text: string, font: string) => number} [params.measure] - 文本测宽
 */
export function buildShareCardModel({ snapshot, shareUrl, labels, measure }) {
  const pattern = Array.isArray(snapshot?.canvasData) ? snapshot.canvasData : []
  const bounds = contentBounds(pattern)
  const gridW = bounds?.width || Number(snapshot?.gridWidth) || 0
  const gridH = bounds?.height || Number(snapshot?.gridHeight) || 0

  const paper = {
    x: PAD + PREVIEW_INNER,
    y: PREVIEW_Y + PREVIEW_INNER,
    w: PREVIEW_W - PREVIEW_INNER * 2,
    h: PREVIEW_H - PREVIEW_INNER * 2,
  }
  // 无内容时也给出一个合法盒子,渲染器会画成空白纸面而不是崩溃
  const fitted = fitPatternBox(gridW, gridH, paper)

  const titleFont = `600 ${TITLE_FONT}px ${FONT_STACK}`
  const measureTitle = typeof measure === 'function' ? t => measure(t, titleFont) : null
  const titleLines = wrapText(snapshot?.title || '', RIGHT_W, measureTitle, TITLE_MAX_LINES)

  // ── 右列自上而下:标题 → 署名 → chips → 用色珠条 → 二维码 ──
  const titleTop = PREVIEW_Y + 26 // 首行基线
  const authorY = titleTop + (titleLines.length - 1) * TITLE_LINE + 40

  const chipFont = `600 ${CHIP_FONT}px ${FONT_STACK}`
  const chipTexts = [labels.size, labels.beads, labels.colors]
  // 三枚 chips 平分右列宽;文字过宽时由渲染器缩字号,几何仍均分
  const chipW = Math.floor((RIGHT_W - 16) / 3)
  const chips = chipTexts.map((text, index) => ({
    text,
    x: RIGHT_X + index * (chipW + 8),
    y: authorY + 26,
    w: chipW,
    h: CHIP_H,
    font: chipFont,
  }))

  const colors = topColors(pattern)
  const swatchY = chips[0].y + CHIP_H + 26
  const swatches = {
    x: RIGHT_X,
    y: swatchY,
    size: SWATCH_SIZE,
    step: SWATCH_SIZE + 10,
    colors: colors.shown,
    more: colors.more,
    moreX: RIGHT_X + colors.shown.length * (SWATCH_SIZE + 10),
    font: `${CHIP_FONT}px ${FONT_STACK}`,
  }

  const qrY = Math.min(swatchY + SWATCH_SIZE + 30, CARD_HEIGHT - PAD - QR_SIZE - BRAND_ROW_H - 18)
  const qr = {
    text: String(shareUrl || ''),
    x: RIGHT_X,
    y: qrY,
    size: QR_SIZE,
    margin: QR_MARGIN,
    dark: PALETTE.qrDark,
    light: PALETTE.qrLight,
    // 二维码白卡衬垫(含 quiet zone 之外的圆角卡边距)
    card: {
      x: RIGHT_X - 14,
      y: qrY - 14,
      w: QR_SIZE + 28,
      h: QR_SIZE + 28,
      r: 14,
      border: PALETTE.qrCardBorder,
    },
  }

  // 右列底部的品牌行:小 LOGO(十六格色卡)+ 站名 + 域名
  const brandY = Math.min(qr.card.y + qr.card.h + 26, CARD_HEIGHT - PAD - 4)
  const brandRow = {
    y: brandY,
    logoX: RIGHT_X,
    logoSize: 26,
    nameX: RIGHT_X + 26 + 10,
    nameY: brandY + 18,
    domainX: CARD_WIDTH - PAD,
    domainY: brandY + 18,
  }

  return {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    colors: PALETTE,
    header: {
      h: HEADER_H,
      // 站点专属 LOGO(4×4 十六格色卡)挂在左上角,站名随后
      logo: { x: PAD, y: HEADER_H / 2, size: 44 },
      brand: {
        text: BRAND_NAME,
        x: PAD + 44 + 14,
        y: HEADER_H / 2 + 11,
        font: `700 30px ${FONT_STACK}`,
        color: PALETTE.headerText,
      },
      domain: {
        text: BRAND_DOMAIN,
        x: CARD_WIDTH - PAD,
        y: HEADER_H / 2 + 7,
        font: `500 18px ${FONT_STACK}`,
        color: 'rgba(255, 255, 255, 0.78)',
      },
    },
    panel: { x: PAD, y: PREVIEW_Y, w: PREVIEW_W, h: PREVIEW_H, r: 20 },
    paper: { ...paper, r: 12 },
    pattern: {
      ...fitted,
      x0: bounds?.x0 ?? 0,
      y0: bounds?.y0 ?? 0,
      width: gridW,
      height: gridH,
    },
    title: {
      lines: titleLines,
      x: RIGHT_X,
      y: titleTop,
      font: titleFont,
      lineHeight: TITLE_LINE,
      color: PALETTE.text,
    },
    author: {
      // 「来自 xxx」句式:前缀由 labels.authorPrefix(i18n)提供,空署名不落笔
      text: snapshot?.authorLabel ? `${labels.authorPrefix || ''}${snapshot.authorLabel}`.trim() : '',
      x: RIGHT_X,
      y: authorY,
      font: `${AUTHOR_FONT}px ${FONT_STACK}`,
      color: PALETTE.muted,
    },
    chips,
    swatches,
    qr,
    scan: {
      text: labels.scan,
      x: qr.card.x + qr.card.w + 26,
      y: qr.y + QR_SIZE / 2,
      font: `600 26px ${FONT_STACK}`,
      color: PALETTE.accent,
      maxWidth: CARD_WIDTH - PAD - (qr.card.x + qr.card.w + 26),
    },
    // 右列底部的品牌行:站点 LOGO + 站名 + 域名(左下角不再放页脚,预览区独占左侧)
    brandRow,
    // 背景装饰珠(渲染器画半透明圆珠,位置按卡片比例固定)
    decorations: [
      { x: 676, y: 96, r: 7, color: '#E2574C' },
      { x: 704, y: 82, r: 5, color: '#F2B233' },
      { x: 664, y: 76, r: 4, color: '#4C82E2' },
    ],
  }
}

/** 与站点一致的字体栈(不加载远程字体,国内移动网络下也能立即渲染) */
export const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif"
