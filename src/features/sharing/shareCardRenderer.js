/**
 * 分享卡渲染器 — 1200×630 PNG。
 *
 * 设计约束(来自产品与平台事实):
 *   · 不依赖远程字体:只用系统字体栈,微信内置浏览器/弱网下也能立即渲染;
 *   · 不用 HTML 截图:避免字体加载时序、Safari 布局差异与 DPR 抖动;
 *   · 二维码黑模块白底、quiet zone 之外再包一层圆角白卡,视觉更完整;
 *   · 图案按内容包围盒放大,不留不等宽的外边距;
 *   · 近白色珠子补淡描边,避免在白纸上「隐身」。
 *
 * 视觉版式(v2):顶部品牌条(珠标 LOGO + 站名 + 域名)、信息 chips、
 * 用色珠条、圆角二维码卡 —— 让卡片在社交流里有「作品卡片」的完整感,
 * 而不是一页白纸。
 *
 * 失败一律抛 `ShareCardError`(稳定码),调用方据此显示「卡片生成失败,
 * 可重试」—— 绝不把没有卡片图的分享发布出去。
 */

import QRCode from 'qrcode'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FONT_STACK,
  LOGO_BEAD_COLORS,
  buildShareCardModel,
  wrapText,
} from './shareCardModel'

export class ShareCardError extends Error {
  constructor(code = 'cardRenderFailed') {
    super(code)
    this.name = 'ShareCardError'
    this.code = code
  }
}

const LIGHT_LUMA = 240

/** 近白判定(0.299R + 0.587G + 0.114B) */
function isNearWhite(hex) {
  if (typeof hex !== 'string') return false
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return false
  const n = Number.parseInt(match[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b >= LIGHT_LUMA
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

/** 单颗拼豆:主体圆 + 内圈 + 左上高光,即使缩小也有「珠子」的质感 */
function drawBead(ctx, cx, cy, r, color) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(43, 36, 32, 0.18)'
  ctx.lineWidth = Math.max(1, r * 0.1)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx - r * 0.32, cy - r * 0.34, r * 0.26, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.fill()
}

/** 品牌 LOGO:2×2 四色珠 */
function drawLogo(ctx, x, cy, bead) {
  const gap = bead * 0.4
  const offsets = [
    [-(bead + gap / 2), -(bead + gap / 2)],
    [bead + gap / 2, -(bead + gap / 2)],
    [-(bead + gap / 2), bead + gap / 2],
    [bead + gap / 2, bead + gap / 2],
  ]
  offsets.forEach(([dx, dy], index) => {
    drawBead(ctx, x + dx, cy + dy, bead, LOGO_BEAD_COLORS[index])
  })
}

function drawBackground(ctx, model) {
  const { colors } = model

  // 暖纸底 + 极淡波点纹理
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, model.width, model.height)
  ctx.fillStyle = colors.backgroundDot
  for (let y = model.header.h + 18; y < model.height - 8; y += 34) {
    for (let x = 18 + ((y / 34) % 2) * 17; x < model.width - 8; x += 34) {
      // 只铺左右留白区,避免与图案/文字争夺注意力
      const inLeftPad = x < model.panel.x - 10
      const inRightPad = x > model.panel.x + model.panel.w + 10
      const belowPanel = y > model.panel.y + model.panel.h + 6
      if (inLeftPad || inRightPad || belowPanel) {
        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // 顶部品牌条:赭石渐变
  const gradient = ctx.createLinearGradient(0, 0, model.width, 0)
  gradient.addColorStop(0, colors.headerFrom)
  gradient.addColorStop(1, colors.headerTo)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, model.width, model.header.h)

  // 右下角散落的装饰珠(低饱和,不抢主体)
  for (const dot of model.decorations) {
    ctx.globalAlpha = 0.5
    drawBead(ctx, dot.x, dot.y, dot.r, dot.color)
    ctx.globalAlpha = 1
  }

  // 预览面板:白纸 + 投影 + 描边
  ctx.save()
  ctx.shadowColor = colors.panelShadow
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 8
  ctx.fillStyle = colors.panel
  roundRect(ctx, model.panel.x, model.panel.y, model.panel.w, model.panel.h, model.panel.r)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = colors.panelBorder
  ctx.lineWidth = 1
  roundRect(
    ctx,
    model.panel.x + 0.5,
    model.panel.y + 0.5,
    model.panel.w - 1,
    model.panel.h - 1,
    model.panel.r
  )
  ctx.stroke()
}

function drawPattern(ctx, model, pattern) {
  const { cell, x, y, x0, y0, width, height } = model.pattern
  if (!cell || !width || !height || !Array.isArray(pattern)) return

  const gap = Math.max(1, cell * 0.12)
  const side = Math.max(1, cell - gap)
  const ringW = Math.max(1, cell * 0.06)

  ctx.save()
  // 裁剪在纸面内,任何异常数据都不会画到卡片外面
  roundRect(ctx, model.paper.x, model.paper.y, model.paper.w, model.paper.h, model.paper.r)
  ctx.clip()

  for (let gy = 0; gy < height; gy++) {
    const row = pattern[y0 + gy]
    if (!Array.isArray(row)) continue
    for (let gx = 0; gx < width; gx++) {
      const color = row[x0 + gx]
      if (!color) continue
      const px = x + gx * cell
      const py = y + gy * cell
      ctx.fillStyle = color
      ctx.fillRect(px, py, side, side)
      if (isNearWhite(color)) {
        ctx.strokeStyle = model.colors.nearWhiteRing
        ctx.lineWidth = ringW
        const inset = ringW / 2
        ctx.strokeRect(px + inset, py + inset, Math.max(1, side - ringW), Math.max(1, side - ringW))
      }
    }
  }
  ctx.restore()
}

/** chips:圆角胶囊 + 前置图形标记(网格/圆珠/双珠) */
function drawChips(ctx, model) {
  const chipFont = model.chips[0].font
  for (const [index, chip] of model.chips.entries()) {
    ctx.fillStyle = model.colors.panel
    ctx.strokeStyle = model.colors.chipBorder
    ctx.lineWidth = 1
    roundRect(ctx, chip.x, chip.y, chip.w, chip.h, 12)
    ctx.fill()
    ctx.stroke()

    const cy = chip.y + chip.h / 2
    const iconX = chip.x + 16
    if (index === 0) {
      // 尺寸:2×2 迷你网格
      const s = 5
      const gap = 3
      ctx.fillStyle = model.colors.chipIcon
      for (const [dx, dy] of [
        [0, 0],
        [s + gap, 0],
        [0, s + gap],
        [s + gap, s + gap],
      ]) {
        ctx.fillRect(iconX + dx, cy - s - gap / 2 + dy, s, s)
      }
    } else if (index === 1) {
      // 豆子:单颗珠
      drawBead(ctx, iconX + 4, cy, 6, model.colors.chipIcon)
    } else {
      // 颜色:两颗叠珠
      drawBead(ctx, iconX + 2, cy - 3, 5, '#E2574C')
      drawBead(ctx, iconX + 9, cy + 4, 5, '#4C82E2')
    }

    // 文字过宽时逐步缩字号,保证任何语言都不溢出胶囊
    let font = chipFont
    ctx.fillStyle = model.colors.text
    ctx.font = font
    let size = 22
    const textX = iconX + 20
    const maxTextW = chip.w - (textX - chip.x) - 10
    while (ctx.measureText(chip.text).width > maxTextW && size > 13) {
      size -= 1
      font = `600 ${size}px ${FONT_STACK}`
      ctx.font = font
    }
    ctx.textBaseline = 'middle'
    ctx.fillText(chip.text, textX, cy + 1)
    ctx.textBaseline = 'alphabetic'
  }
}

/** 用色珠条:前 N 色圆珠 + 「+N」 */
function drawSwatches(ctx, model) {
  const { swatches } = model
  for (const [index, item] of swatches.colors.entries()) {
    const cx = swatches.x + index * swatches.step + swatches.size / 2
    drawBead(ctx, cx, swatches.y + swatches.size / 2, swatches.size / 2, item.hex)
  }
  if (swatches.more > 0) {
    ctx.fillStyle = model.colors.muted
    ctx.font = swatches.font
    ctx.textBaseline = 'middle'
    ctx.fillText(`+${swatches.more}`, swatches.moreX + 4, swatches.y + swatches.size / 2 + 1)
    ctx.textBaseline = 'alphabetic'
  }
}

function drawTexts(ctx, model) {
  ctx.textBaseline = 'alphabetic'

  // 品牌条:珠标 LOGO + 站名 + 域名
  drawLogo(ctx, model.header.logo.x + model.header.logo.bead + 4, model.header.logo.y, model.header.logo.bead)
  ctx.fillStyle = model.header.brand.color
  ctx.font = model.header.brand.font
  ctx.fillText(model.header.brand.text, model.header.brand.x, model.header.brand.y)
  ctx.fillStyle = model.header.domain.color
  ctx.font = model.header.domain.font
  ctx.textAlign = 'right'
  ctx.fillText(model.header.domain.text, model.header.domain.x, model.header.domain.y)
  ctx.textAlign = 'left'

  ctx.fillStyle = model.title.color
  ctx.font = model.title.font
  model.title.lines.forEach((line, index) => {
    ctx.fillText(line, model.title.x, model.title.y + index * model.title.lineHeight)
  })

  if (model.author.text) {
    ctx.fillStyle = model.author.color
    ctx.font = model.author.font
    ctx.fillText(model.author.text, model.author.x, model.author.y)
  }

  drawChips(ctx, model)
  drawSwatches(ctx, model)

  // 「扫码查看图纸」:按二维码右侧可用宽度折行,垂直居中于二维码
  ctx.fillStyle = model.scan.color
  ctx.font = model.scan.font
  const scanLines = wrapText(model.scan.text, model.scan.maxWidth, text => ctx.measureText(text).width, 2)
  const scanLineHeight = 34
  const scanTop = model.scan.y - ((scanLines.length - 1) * scanLineHeight) / 2
  ctx.textBaseline = 'middle'
  scanLines.forEach((line, index) => {
    ctx.fillText(line, model.scan.x, scanTop + index * scanLineHeight)
  })
  ctx.textBaseline = 'alphabetic'

  // 页脚:小珠标 + 站点署名
  drawLogo(ctx, model.footer.logoX + model.footer.bead + 2, model.footer.y - 6, model.footer.bead)
  ctx.fillStyle = model.footer.color
  ctx.font = model.footer.font
  ctx.fillText(model.footer.text, model.footer.textX, model.footer.y)
}

/** 把二维码画到一个临时 canvas,再整块贴到卡片上(避免破坏卡片合成状态) */
async function drawQr(ctx, qr) {
  if (!qr.text) throw new ShareCardError('cardRenderFailed')

  // 二维码外围圆角白卡:quiet zone 之外再留一层呼吸感,边缘不贴字
  ctx.fillStyle = qr.light
  roundRect(ctx, qr.card.x, qr.card.y, qr.card.w, qr.card.h, qr.card.r)
  ctx.fill()
  ctx.strokeStyle = qr.card.border
  ctx.lineWidth = 1
  roundRect(ctx, qr.card.x + 0.5, qr.card.y + 0.5, qr.card.w - 1, qr.card.h - 1, qr.card.r)
  ctx.stroke()

  const temp = document.createElement('canvas')
  temp.width = qr.size
  temp.height = qr.size
  try {
    await QRCode.toCanvas(temp, qr.text, {
      errorCorrectionLevel: 'M',
      margin: qr.margin,
      width: qr.size,
      color: { dark: qr.dark, light: qr.light },
    })
  } catch {
    throw new ShareCardError('cardRenderFailed')
  }
  ctx.drawImage(temp, qr.x, qr.y, qr.size, qr.size)
}

function toPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new ShareCardError('cardRenderFailed'))
      }, 'image/png')
    } catch {
      reject(new ShareCardError('cardRenderFailed'))
    }
  })
}

/**
 * 渲染分享卡。
 *
 * @param {object} params
 * @param {object} params.snapshot 公开快照(camelCase,含 canvasData)
 * @param {string} params.shareUrl 分享链接(按当前访问环境生成)
 * @param {{size:string,beads:string,colors:string,scan:string,footer:string}} params.labels
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function renderShareCard({ snapshot, shareUrl, labels }) {
  if (typeof document === 'undefined') throw new ShareCardError('cardRenderFailed')

  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ShareCardError('cardRenderFailed')

  const fontForMeasure = `${FONT_STACK}`
  const measure = (text, font) => {
    ctx.font = font || fontForMeasure
    return ctx.measureText(text).width
  }

  const model = buildShareCardModel({ snapshot, shareUrl, labels, measure })

  drawBackground(ctx, model)
  drawPattern(ctx, model, snapshot?.canvasData)
  drawTexts(ctx, model)
  await drawQr(ctx, model.qr)

  const blob = await toPngBlob(canvas)
  return { blob, width: CARD_WIDTH, height: CARD_HEIGHT }
}
