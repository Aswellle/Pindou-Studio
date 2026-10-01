/**
 * RasterRenderer — 基于 PatternDocument 的 PNG 渲染器
 *
 * 新渲染路径：PatternDocument → RasterRenderer → PNG
 * 与 BeadPatternExporter 并存，通过 Feature Flag 切换。
 *
 * sheet 布局（2026-10-01,与 VectorRenderer 同构）:
 * 表头深色带(标题 + 单行居中元信息:尺寸/总珠数/用色数/色卡/日期)
 * + 图例条(★中心珠标记 + 4×4 拼豆 Logo 品牌署名)
 * + 右侧分级颜色面板(标题行跟品牌色卡名,微量色 ⚠ 警示)
 * + 四周坐标尺(上列标 / 左右行标) + 网格区(专业模式方块+品牌色号+10格粗线)。
 *
 * 清晰度规则:超采样倍率为整数,所有填充/描边取整数逻辑坐标,
 * 物理像素对齐硬边锐利;半像素偏移在 3× 下反而发糊,一律不用。
 * 内存安全:与 V1 同策略,createScaledCanvas 面积预算自动降级超采样倍率。
 */

import { createScaledCanvas, createDPICanvas } from '../BeadPatternExporter'
import i18n from '../../i18n'
import { BRAND_MARK_CELLS, BRAND_MARK_WHITE_STROKE, BRAND_MARK_CELL, BRAND_WORDMARK } from './brandMark'

/**
 * 从 PatternDocument 渲染 PNG
 *
 * @param {Object} doc - PatternDocument
 * @param {Object} [options]
 * @param {number} [options.dpi] - 输出 DPI（默认 300，传 300 走固定 3× 超采样）
 * @param {Function} [options.onProgress] - 进度回调(0–1)
 * @param {Function} [options.onResolution] - 分辨率回调(物理像素,供 UI 显示)
 * @returns {Promise<Blob>} PNG blob
 */
export async function renderPatternDocumentToPNG(doc, options = {}) {
  const { dpi = 300, onProgress = null, onResolution = null } = options
  const { grid, palette, style, layout, stats } = doc
  const { width, height, cells } = grid
  const { cellSize, headerHeight, legendHeight, padding, rowLabelWidth, colLabelHeight, panelWidth } = layout
  const proMode = style.beadStyle === 'professional'

  if (onProgress) onProgress(0.1)

  // 画布尺寸(逻辑像素)——左右各一条行标尺,rowLabelWidth 计两次
  const gridPixelW = width * cellSize
  const gridPixelH = height * cellSize
  const sheetWidth = gridPixelW + rowLabelWidth * 2 + padding * 2 + panelWidth
  const sheetHeight = gridPixelH + headerHeight + legendHeight + colLabelHeight + padding * 2

  // 超采样 canvas — DPI 策略或面积预算自动降级(V1 同套逻辑)
  let canvas, actualScale
  try {
    if (dpi && dpi !== 300) {
      ;({ canvas, scale: actualScale } = createDPICanvas(sheetWidth, sheetHeight, dpi))
    } else {
      ;({ canvas, scale: actualScale } = createScaledCanvas(sheetWidth, sheetHeight))
    }
  } catch {
    ;({ canvas, scale: actualScale } = createScaledCanvas(sheetWidth, sheetHeight))
  }
  onResolution?.(canvas.width, canvas.height)

  const ctx = canvas.getContext('2d')
  // ctx.scale 后所有绘制按逻辑像素操作。
  // 清晰度规则:超采样倍率是整数,所有填充/描边一律取整数逻辑坐标,
  // 映射到物理像素后仍是整数 → 硬边锐利;半像素偏移(+0.5)在 3× 下会落在
  // 1.5px 物理位置,反而是模糊的来源,一律不用。
  ctx.scale(actualScale, actualScale)

  const totalBeads = stats.reduce((sum, s) => sum + s.count, 0)
  const paletteName = doc.metadata.paletteName || doc.metadata.paletteId
  const textColorForBg = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum > 128 ? '#1a1a1a' : '#b8b8b8'
  }

  // 白色背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sheetWidth, sheetHeight)

  // ========== 1. 表头深色带(标题 + 单行居中元信息) ==========
  ctx.fillStyle = '#2c2c2c'
  ctx.fillRect(0, 0, sheetWidth, headerHeight)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 24px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.fillText(doc.metadata.name || i18n.t('export.defaultName'), Math.round(sheetWidth / 2), Math.round(headerHeight / 2) - 14)

  ctx.font = '12px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#aaaaaa'
  const today = new Date(doc.metadata.createdAt || Date.now()).toLocaleDateString('zh-CN')
  const metaLine = [
    i18n.t('export.gridSize', { cols: width, rows: height }),
    i18n.t('export.totalBeads', { n: totalBeads }),
    i18n.t('export.usedColors', { n: stats.length }),
    i18n.t('export.palette', { palette: paletteName }),
    i18n.t('export.date', { date: today }),
  ].join(' · ')
  ctx.fillText(metaLine, Math.round(sheetWidth / 2), Math.round(headerHeight / 2) + 16)

  // ========== 2. 图例条(★中心珠标记 + 品牌 Logo 署名) ==========
  ctx.fillStyle = '#f0f0f0'
  ctx.fillRect(0, headerHeight, sheetWidth, legendHeight)
  ctx.fillStyle = '#666666'
  ctx.font = '12px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(i18n.t('export.centerBeadMark'), padding, headerHeight + legendHeight / 2)

  const legendCY = headerHeight + legendHeight / 2
  ctx.beginPath()
  ctx.arc(120, legendCY, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#E53935'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(117, legendCY - 3, 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fill()

  // 品牌署名:"导出自" + 4×4 拼豆 Logo + 字标
  const markSize = BRAND_MARK_CELL * 4
  const wordmarkWidth = 84
  const markX = Math.round(sheetWidth - padding - (markSize + 8 + wordmarkWidth))
  const markY = Math.round(legendCY - markSize / 2)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const fill = BRAND_MARK_CELLS[r][c]
      const mx = markX + c * BRAND_MARK_CELL
      const my = markY + r * BRAND_MARK_CELL
      ctx.fillStyle = fill
      ctx.fillRect(mx, my, BRAND_MARK_CELL, BRAND_MARK_CELL)
      if (fill === '#FFFFFF') {
        ctx.strokeStyle = BRAND_MARK_WHITE_STROKE
        ctx.lineWidth = 1
        ctx.strokeRect(mx, my, BRAND_MARK_CELL, BRAND_MARK_CELL)
      }
    }
  }
  ctx.fillStyle = '#2b2420'
  ctx.font = 'bold 15px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(BRAND_WORDMARK, markX + markSize + 8, legendCY)
  // "导出自"前缀:右对齐贴在 Logo 左侧(文本右缘 = markX - 6,免估宽度)
  ctx.fillStyle = '#666666'
  ctx.font = '12px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(i18n.t('export.exportedFrom'), markX - 6, legendCY)

  // ========== 3. 右侧分级颜色面板(标题行跟品牌色卡名) ==========
  const panelX = sheetWidth - panelWidth - padding
  const panelY = headerHeight + legendHeight + padding
  const panelHeight = sheetHeight - headerHeight - legendHeight - padding * 2

  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight)

  ctx.fillStyle = '#222222'
  ctx.font = 'bold 14px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${i18n.t('export.legendTitle')} · ${paletteName}`, panelX + 12, panelY + 18)

  ctx.font = '11px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#666666'
  ctx.fillText(i18n.t('export.legendTotal', { n: stats.length, m: totalBeads }), panelX + 12, panelY + 36)

  const groupConfig = [
    { key: 'major',  title: i18n.t('export.groupMajor'),  titleColor: '#2c5aa0', warn: false },
    { key: 'minor',  title: i18n.t('export.groupMinor'),  titleColor: '#5a8a3a', warn: false },
    { key: 'accent', title: i18n.t('export.groupAccent'), titleColor: '#8a6a3a', warn: false },
    { key: 'trace',  title: i18n.t('export.groupTrace'),  titleColor: '#c33',    warn: true  },
  ]
  const groups = palette.groups || { major: [], minor: [], accent: [], trace: [] }

  let colorY = panelY + 55
  const colorItemH = 24
  for (const cfg of groupConfig) {
    const items = groups[cfg.key] || []
    if (items.length === 0) continue
    if (colorY + 18 > panelY + panelHeight - 10) break

    ctx.font = 'bold 11px "Fira Code", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = cfg.titleColor
    ctx.textAlign = 'left'
    ctx.fillText(i18n.t('export.groupCount', { title: cfg.title, n: items.length }), panelX + 10, colorY)
    colorY += 16

    ctx.strokeStyle = cfg.titleColor + '44'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(panelX + 8, colorY - 4)
    ctx.lineTo(panelX + panelWidth - 8, colorY - 4)
    ctx.stroke()

    for (const item of items) {
      if (colorY + colorItemH > panelY + panelHeight - 10) break

      // 色块:专业模式方形(与图纸方格一致),拟真模式圆形
      if (proMode) {
        const swX = panelX + 10
        const swY = Math.round(colorY + colorItemH / 2 - 10)
        ctx.fillStyle = item.hex
        ctx.fillRect(swX, swY, 20, 20)
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'
        ctx.lineWidth = 1
        ctx.strokeRect(swX, swY, 20, 20)
      } else {
        ctx.beginPath()
        ctx.arc(panelX + 20, colorY + colorItemH / 2, 8, 0, Math.PI * 2)
        ctx.fillStyle = item.hex
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      const label = item.id !== item.name ? `${item.id} ${item.name}` : item.name
      const truncated = label.length > 15 ? label.slice(0, 14) + '…' : label
      ctx.fillStyle = cfg.warn ? '#c33' : '#333333'
      ctx.font = '10px "Fira Code", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(truncated, panelX + 34, colorY + colorItemH / 2)

      ctx.fillStyle = cfg.warn ? '#c33' : '#555555'
      ctx.textAlign = 'right'
      ctx.fillText(
        cfg.warn ? `${item.count}颗 ⚠` : `${item.count}颗`,
        panelX + panelWidth - 10,
        colorY + colorItemH / 2
      )

      colorY += colorItemH
    }
    colorY += 8
  }

  if (onProgress) onProgress(0.3)

  // ========== 4. 网格区域 + 四周坐标尺(上/左/右) ==========
  const gridStartX = padding + rowLabelWidth
  const gridStartY = headerHeight + legendHeight + padding + colLabelHeight
  const gridEndX = gridStartX + gridPixelW

  ctx.fillStyle = '#666666'
  ctx.font = '11px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let x = 0; x < width; x++) {
    ctx.fillText(x.toString(), gridStartX + x * cellSize + cellSize / 2, gridStartY - colLabelHeight / 2)
  }
  for (let y = 0; y < height; y++) {
    const rowY = gridStartY + y * cellSize + cellSize / 2
    ctx.textAlign = 'right'
    ctx.fillText(y.toString(), gridStartX - rowLabelWidth / 2 + 8, rowY)
    // 右侧行标尺(与左侧镜像,方便从右端对照)
    ctx.textAlign = 'left'
    ctx.fillText(y.toString(), gridEndX + rowLabelWidth / 2 - 8, rowY)
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(gridStartX, gridStartY, gridPixelW, gridPixelH)

  // 浅网格线(珠子底层;整数坐标 + 1px,整数倍超采样下物理对齐锐利)
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  for (let i = 0; i <= width; i++) {
    ctx.beginPath()
    ctx.moveTo(gridStartX + i * cellSize, gridStartY)
    ctx.lineTo(gridStartX + i * cellSize, gridStartY + gridPixelH)
    ctx.stroke()
  }
  for (let i = 0; i <= height; i++) {
    ctx.beginPath()
    ctx.moveTo(gridStartX, gridStartY + i * cellSize)
    ctx.lineTo(gridStartX + gridPixelW, gridStartY + i * cellSize)
    ctx.stroke()
  }

  // ========== 5. 珠子 ==========
  // 'realistic'    : 径向渐变圆珠(展示用)
  // 'professional' : 方形填色 + 品牌色号标注(工艺施工用)
  const beadRadius = cellSize / 2 - 2
  const codeFontSize = Math.max(9, Math.floor(cellSize * 0.38))
  const findCode = (hex) => palette.colors.find(c => c.hex === hex)?.id || ''

  const drawRealisticBead = (cx, cy, radius, hexColor) => {
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)
    const lighten = (c, f) => Math.min(255, Math.round(c + (255 - c) * f))
    const darken = (c, f) => Math.max(0, Math.round(c * (1 - f)))
    const grad = ctx.createRadialGradient(
      cx - radius * 0.25, cy - radius * 0.25, radius * 0.05,
      cx, cy, radius
    )
    grad.addColorStop(0, `rgb(${lighten(r, 0.35)},${lighten(g, 0.35)},${lighten(b, 0.35)})`)
    grad.addColorStop(0.5, hexColor)
    grad.addColorStop(1.0, `rgb(${darken(r, 0.18)},${darken(g, 0.18)},${darken(b, 0.18)})`)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    if (style.showGrid) {
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }
  }

  const drawProCell = (cellX, cellY, hexColor) => {
    // 整数坐标填充,格子间留 1 逻辑px 露出网格线(粗网格线在珠子上层补画)
    ctx.fillStyle = hexColor
    ctx.fillRect(cellX, cellY, cellSize - 1, cellSize - 1)
    if (style.showCodes) {
      const code = findCode(hexColor)
      if (code) {
        const fontSize = code.length >= 4 ? 8 : codeFontSize
        ctx.fillStyle = textColorForBg(hexColor)
        ctx.font = `bold ${fontSize}px "Helvetica Neue", "Arial", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(code, cellX + cellSize / 2, cellY + cellSize / 2 + 1)
      }
    }
  }

  const total = width * height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y]?.[x]
      if (!cell) continue
      const cellX = gridStartX + x * cellSize
      const cellY = gridStartY + y * cellSize
      if (proMode) drawProCell(cellX, cellY, cell)
      else drawRealisticBead(cellX + cellSize / 2, cellY + cellSize / 2, beadRadius, cell)
    }
    if (onProgress) onProgress(0.3 + 0.55 * ((y + 1) * width / total))
  }

  // 专业模式:网格线在珠子上层补画 — 1px 细线分格,2px 粗线每 10 格
  // (整数逻辑坐标,整数倍超采样下物理像素对齐,硬边锐利)
  if (proMode && style.showGrid) {
    const drawLines = (color, lineWidth, step) => {
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      for (let i = 0; i <= width; i += step) {
        ctx.beginPath()
        ctx.moveTo(gridStartX + i * cellSize, gridStartY)
        ctx.lineTo(gridStartX + i * cellSize, gridStartY + gridPixelH)
        ctx.stroke()
      }
      for (let i = 0; i <= height; i += step) {
        ctx.beginPath()
        ctx.moveTo(gridStartX, gridStartY + i * cellSize)
        ctx.lineTo(gridStartX + gridPixelW, gridStartY + i * cellSize)
        ctx.stroke()
      }
    }
    drawLines('#d0d0d0', 1, 1)
    drawLines('#666666', 2, 10)
  }

  if (onProgress) onProgress(0.95)

  // ========== 6. 边框 ==========
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1
  ctx.strokeRect(0, 0, sheetWidth, sheetHeight)
  ctx.strokeRect(gridStartX, gridStartY, gridPixelW, gridPixelH)

  if (onProgress) onProgress(1)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('PNG encoding failed'))
    }, 'image/png')
  })
}
