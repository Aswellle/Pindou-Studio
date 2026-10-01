/**
 * VectorRenderer — 基于 PatternDocument 的 SVG 渲染器
 *
 * 新渲染路径：PatternDocument → VectorRenderer → SVG
 * 与 BeadPatternExporter.exportAsSVG 并存，通过 Feature Flag 切换。
 *
 * sheet 布局与 RasterRenderer 对齐（2026-10-01）:
 * 表头深色带(标题+单行居中元信息) + 图例条(★中心珠标记 + 品牌 Logo 署名)
 * + 右侧分级颜色面板(标题行跟品牌色卡名,微量色 ⚠) + 四周坐标尺
 * + 网格区(专业模式方块+品牌色号+10格粗线)。
 *
 * 清晰度规则(像素级锐利):
 *  - 填充矩形一律整数坐标(半像素偏移会让边缘抗锯齿发糊)
 *  - 描边线宽只用整数(1/2 逻辑px);1px 线 +0.5 对齐像素网格,2px 线取整数坐标
 *  - 网格线/方块加 shape-rendering="crispEdges" 关闭抗锯齿
 */

import i18n from '../../i18n'
import { BRAND_MARK_CELLS, BRAND_MARK_WHITE_STROKE, BRAND_MARK_CELL, BRAND_WORDMARK } from './brandMark'

/**
 * 从 PatternDocument 渲染 SVG
 *
 * @param {Object} doc - PatternDocument
 * @param {Object} [options]
 * @returns {string} SVG 字符串
 */
export function renderPatternDocumentToSVG(doc, options = {}) {
  const { grid, palette, style, layout, stats } = doc
  const { width, height, cells } = grid
  const { cellSize, headerHeight, legendHeight, padding, rowLabelWidth, colLabelHeight, panelWidth } = layout
  const proMode = style.beadStyle === 'professional'

  const gridPixelW = width * cellSize
  const gridPixelH = height * cellSize
  // 左右各一条行标尺 → rowLabelWidth 计两次
  const sheetWidth = gridPixelW + rowLabelWidth * 2 + padding * 2 + panelWidth
  const sheetHeight = gridPixelH + headerHeight + legendHeight + colLabelHeight + padding * 2
  const gridStartX = padding + rowLabelWidth
  const gridStartY = headerHeight + legendHeight + padding + colLabelHeight
  const gridEndX = gridStartX + gridPixelW

  const totalBeads = stats.reduce((sum, s) => sum + s.count, 0)
  const paletteName = doc.metadata.paletteName || doc.metadata.paletteId
  const textColorForBg = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum > 128 ? '#1a1a1a' : '#b8b8b8'
  }
  const CRISP = ' shape-rendering="crispEdges"'

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}">`)
  parts.push(`<style>text { font-family: "Fira Code", "Microsoft YaHei", sans-serif; }</style>`)

  // 背景
  parts.push(`<rect width="${sheetWidth}" height="${sheetHeight}" fill="#ffffff"/>`)

  // ========== 1. 表头深色带(标题 + 单行居中元信息) ==========
  parts.push(`<rect width="${sheetWidth}" height="${headerHeight}" fill="#2c2c2c"/>`)
  parts.push(`<text x="${Math.round(sheetWidth / 2)}" y="${Math.round(headerHeight / 2) - 14}" fill="#ffffff" font-size="24" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${escapeXml(doc.metadata.name || i18n.t('export.defaultName'))}</text>`)
  const today = new Date(doc.metadata.createdAt || Date.now()).toLocaleDateString('zh-CN')
  const metaLine = [
    i18n.t('export.gridSize', { cols: width, rows: height }),
    i18n.t('export.totalBeads', { n: totalBeads }),
    i18n.t('export.usedColors', { n: stats.length }),
    i18n.t('export.palette', { palette: paletteName }),
    i18n.t('export.date', { date: today }),
  ].join(' · ')
  parts.push(`<text x="${Math.round(sheetWidth / 2)}" y="${Math.round(headerHeight / 2) + 16}" fill="#aaaaaa" font-size="12" text-anchor="middle" dominant-baseline="middle">${escapeXml(metaLine)}</text>`)

  // ========== 2. 图例条(★中心珠标记 + 品牌 Logo 署名) ==========
  const legendCY = headerHeight + legendHeight / 2
  parts.push(`<rect x="0" y="${headerHeight}" width="${sheetWidth}" height="${legendHeight}" fill="#f0f0f0"/>`)
  parts.push(`<text x="${padding}" y="${legendCY}" fill="#666666" font-size="12" text-anchor="start" dominant-baseline="middle">${escapeXml(i18n.t('export.centerBeadMark'))}</text>`)
  parts.push(`<circle cx="120" cy="${legendCY}" r="10" fill="#E53935"/>`)
  parts.push(`<circle cx="117" cy="${legendCY - 3}" r="3" fill="rgba(255,255,255,0.4)"/>`)

  // 品牌署名:"导出自" + 4×4 拼豆 Logo + 字标
  const wordmarkWidth = 84
  const markSize = BRAND_MARK_CELL * 4
  const markX = sheetWidth - padding - (markSize + 8 + wordmarkWidth)
  const markY = Math.round(legendCY - markSize / 2)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const fill = BRAND_MARK_CELLS[r][c]
      const x = markX + c * BRAND_MARK_CELL
      const y = markY + r * BRAND_MARK_CELL
      const strokeAttr = fill === '#FFFFFF' ? ` stroke="${BRAND_MARK_WHITE_STROKE}" stroke-width="1"` : ''
      parts.push(`<rect x="${x}" y="${y}" width="${BRAND_MARK_CELL}" height="${BRAND_MARK_CELL}" fill="${fill}"${strokeAttr}${CRISP}/>`)
    }
  }
  parts.push(`<text x="${markX + markSize + 8}" y="${legendCY}" fill="#2b2420" font-size="15" font-weight="bold" text-anchor="start" dominant-baseline="middle">${escapeXml(BRAND_WORDMARK)}</text>`)
  // "导出自"前缀:右对齐贴在 Logo 左侧(文本右缘 = markX - 6,免估宽度)
  parts.push(`<text x="${markX - 6}" y="${legendCY}" fill="#666666" font-size="12" text-anchor="end" dominant-baseline="middle">${escapeXml(i18n.t('export.exportedFrom'))}</text>`)

  // ========== 3. 右侧分级颜色面板(标题行跟品牌色卡名) ==========
  const panelX = sheetWidth - panelWidth - padding
  const panelY = headerHeight + legendHeight + padding
  const panelHeight = sheetHeight - headerHeight - legendHeight - padding * 2

  parts.push(`<rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" fill="#f8f8f8"/>`)
  parts.push(`<text x="${panelX + 12}" y="${panelY + 18}" fill="#222222" font-size="14" font-weight="bold" text-anchor="start" dominant-baseline="middle">${escapeXml(`${i18n.t('export.legendTitle')} · ${paletteName}`)}</text>`)
  parts.push(`<text x="${panelX + 12}" y="${panelY + 36}" fill="#666666" font-size="11" text-anchor="start" dominant-baseline="middle">${escapeXml(i18n.t('export.legendTotal', { n: stats.length, m: totalBeads }))}</text>`)

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

    parts.push(`<text x="${panelX + 10}" y="${colorY}" fill="${cfg.titleColor}" font-size="11" font-weight="bold" text-anchor="start" dominant-baseline="middle">${escapeXml(i18n.t('export.groupCount', { title: cfg.title, n: items.length }))}</text>`)
    colorY += 16
    parts.push(`<line x1="${panelX + 8}" y1="${colorY - 4}" x2="${panelX + panelWidth - 8}" y2="${colorY - 4}" stroke="${cfg.titleColor}44" stroke-width="1"/>`)

    for (const item of items) {
      if (colorY + colorItemH > panelY + panelHeight - 10) break

      const itemCY = colorY + colorItemH / 2
      if (proMode) {
        const swY = Math.round(itemCY - 10)
        parts.push(`<rect x="${panelX + 10}" y="${swY}" width="20" height="20" fill="${item.hex}"${CRISP}/>`)
        parts.push(`<rect x="${panelX + 10.5}" y="${swY + 0.5}" width="19" height="19" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`)
      } else {
        parts.push(`<circle cx="${panelX + 20}" cy="${itemCY}" r="8" fill="${item.hex}"/>`)
        parts.push(`<circle cx="${panelX + 20}" cy="${itemCY}" r="8" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1"/>`)
      }

      const label = item.id !== item.name ? `${item.id} ${item.name}` : item.name
      const truncated = label.length > 15 ? label.slice(0, 14) + '…' : label
      parts.push(`<text x="${panelX + 34}" y="${itemCY}" fill="${cfg.warn ? '#c33' : '#333333'}" font-size="10" text-anchor="start" dominant-baseline="middle">${escapeXml(truncated)}</text>`)
      parts.push(`<text x="${panelX + panelWidth - 10}" y="${itemCY}" fill="${cfg.warn ? '#c33' : '#555555'}" font-size="10" text-anchor="end" dominant-baseline="middle">${escapeXml(cfg.warn ? `${item.count}颗 ⚠` : `${item.count}颗`)}</text>`)

      colorY += colorItemH
    }
    colorY += 8
  }

  // ========== 4. 四周坐标尺(上/左/右) ==========
  for (let x = 0; x < width; x++) {
    parts.push(`<text x="${gridStartX + x * cellSize + cellSize / 2}" y="${gridStartY - colLabelHeight / 2}" fill="#666666" font-size="11" text-anchor="middle" dominant-baseline="middle">${x}</text>`)
  }
  for (let y = 0; y < height; y++) {
    const rowY = gridStartY + y * cellSize + cellSize / 2
    parts.push(`<text x="${gridStartX - rowLabelWidth / 2 + 8}" y="${rowY}" fill="#666666" font-size="11" text-anchor="end" dominant-baseline="middle">${y}</text>`)
    // 右侧行标尺(与左侧镜像,方便从右端对照)
    parts.push(`<text x="${gridEndX + rowLabelWidth / 2 - 8}" y="${rowY}" fill="#666666" font-size="11" text-anchor="start" dominant-baseline="middle">${y}</text>`)
  }

  // 网格背景 + 浅网格线(珠子底层;1px 线 +0.5 对齐像素网格)
  parts.push(`<rect x="${gridStartX}" y="${gridStartY}" width="${gridPixelW}" height="${gridPixelH}" fill="#ffffff"/>`)
  for (let i = 0; i <= width; i++) {
    parts.push(`<line x1="${gridStartX + i * cellSize + 0.5}" y1="${gridStartY}" x2="${gridStartX + i * cellSize + 0.5}" y2="${gridStartY + gridPixelH}" stroke="#e0e0e0" stroke-width="1"${CRISP}/>`)
  }
  for (let i = 0; i <= height; i++) {
    parts.push(`<line x1="${gridStartX}" y1="${gridStartY + i * cellSize + 0.5}" x2="${gridStartX + gridPixelW}" y2="${gridStartY + i * cellSize + 0.5}" stroke="#e0e0e0" stroke-width="1"${CRISP}/>`)
  }

  // ========== 5. 珠子 ==========
  const codeFontSize = Math.max(9, Math.floor(cellSize * 0.38))
  const findCode = (hex) => palette.colors.find(c => c.hex === hex)?.id || ''

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y]?.[x]
      if (!cell) continue

      const cx = gridStartX + x * cellSize + cellSize / 2
      const cy = gridStartY + y * cellSize + cellSize / 2
      const cellX = gridStartX + x * cellSize
      const cellY = gridStartY + y * cellSize
      const r = cellSize / 2 - 2

      if (proMode) {
        // 专业图纸:方形填色(整数坐标,间隙露出网格线,锐利硬边)
        parts.push(`<rect x="${cellX}" y="${cellY}" width="${cellSize - 1}" height="${cellSize - 1}" fill="${cell}"${CRISP}/>`)
      } else {
        // 拟真珠子：径向渐变（高光 → 基色 → 暗部）
        const r0 = parseInt(cell.slice(1, 3), 16)
        const g0 = parseInt(cell.slice(3, 5), 16)
        const b0 = parseInt(cell.slice(5, 7), 16)
        const lighten = (c, f) => Math.min(255, Math.round(c + (255 - c) * f))
        const darken = (c, f) => Math.max(0, Math.round(c * (1 - f)))
        const highlight = `rgb(${lighten(r0, 0.35)},${lighten(g0, 0.35)},${lighten(b0, 0.35)})`
        const shadow = `rgb(${darken(r0, 0.18)},${darken(g0, 0.18)},${darken(b0, 0.18)})`
        const gradId = `grad-${x}-${y}`
        parts.push(`<defs><radialGradient id="${gradId}" cx="35%" cy="35%"><stop offset="0%" stop-color="${highlight}"/><stop offset="50%" stop-color="${cell}"/><stop offset="100%" stop-color="${shadow}"/></radialGradient></defs>`)
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gradId})"/>`)
        if (style.showGrid) {
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`)
        }
      }

      if (proMode && style.showCodes) {
        const code = findCode(cell)
        if (code) {
          const fontSize = code.length >= 4 ? 8 : codeFontSize
          parts.push(`<text x="${cx}" y="${cy + 1}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${textColorForBg(cell)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(code)}</text>`)
        }
      }
    }
  }

  // 专业模式:网格线在珠子上层补画 — 1px 细线(+0.5 对齐)分格,2px 粗线(整数坐标)每 10 格
  if (proMode && style.showGrid) {
    const drawLines = (color, lineWidth, step, offset) => {
      for (let i = 0; i <= width; i += step) {
        parts.push(`<line x1="${gridStartX + i * cellSize + offset}" y1="${gridStartY}" x2="${gridStartX + i * cellSize + offset}" y2="${gridStartY + gridPixelH}" stroke="${color}" stroke-width="${lineWidth}"${CRISP}/>`)
      }
      for (let i = 0; i <= height; i += step) {
        parts.push(`<line x1="${gridStartX}" y1="${gridStartY + i * cellSize + offset}" x2="${gridStartX + gridPixelW}" y2="${gridStartY + i * cellSize + offset}" stroke="${color}" stroke-width="${lineWidth}"${CRISP}/>`)
      }
    }
    drawLines('#d0d0d0', 1, 1, 0.5)
    drawLines('#666666', 2, 10, 0)
  }

  // ========== 6. 边框(1px,+0.5 对齐像素网格) ==========
  parts.push(`<rect x="0.5" y="0.5" width="${sheetWidth - 1}" height="${sheetHeight - 1}" fill="none" stroke="#cccccc" stroke-width="1"${CRISP}/>`)
  parts.push(`<rect x="${gridStartX + 0.5}" y="${gridStartY + 0.5}" width="${gridPixelW - 1}" height="${gridPixelH - 1}" fill="none" stroke="#cccccc" stroke-width="1"${CRISP}/>`)

  parts.push('</svg>')
  return parts.join('\n')
}

/**
 * XML 转义
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 将 SVG 字符串转为 Blob
 *
 * @param {string} svgString
 * @returns {Blob}
 */
export function svgStringToBlob(svgString) {
  return new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
}
