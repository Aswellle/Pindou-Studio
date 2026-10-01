/**
 * VectorRenderer — 基于 PatternDocument 的 SVG 渲染器
 *
 * 新渲染路径：PatternDocument → VectorRenderer → SVG
 * 与 BeadPatternExporter.exportAsSVG 并存，通过 Feature Flag 切换。
 */

/**
 * 从 PatternDocument 渲染 SVG
 *
 * @param {Object} doc - PatternDocument
 * @param {Object} [options]
 * @returns {string} SVG 字符串
 */
export function renderPatternDocumentToSVG(doc, options = {}) {
  const { grid, palette, style, layout } = doc
  const { width, height, cells } = grid
  const { cellSize, headerHeight, legendHeight } = layout

  const canvasWidth = width * cellSize
  const canvasHeight = height * cellSize + headerHeight + legendHeight

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">`)

  // 背景
  parts.push(`<rect width="${canvasWidth}" height="${canvasHeight}" fill="#ffffff"/>`)

  // 表头
  parts.push(`<text x="20" y="30" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1a1a1a">${escapeXml(doc.metadata.name || 'Bead Pattern')}</text>`)
  parts.push(`<text x="20" y="55" font-family="sans-serif" font-size="12" fill="#1a1a1a">${width} × ${height} | ${palette.colors.length} colors</text>`)

  const proMode = style.beadStyle === 'professional'
  // 色号自适应字号:4 字符色号缩至 8 逻辑 px 防溢出(V1 同规则)
  const codeFontSize = Math.max(9, Math.floor(cellSize * 0.38))
  const smallCodeFontSize = 8

  const textColorForBg = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum > 128 ? '#1a1a1a' : '#b8b8b8'
  }

  // 绘制珠子
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y]?.[x]
      if (!cell) continue

      const cx = x * cellSize + cellSize / 2
      const cy = headerHeight + y * cellSize + cellSize / 2
      const r = cellSize / 2 - 1

      if (proMode) {
        // 专业图纸:方形填色(+0.5/-1 留网格线位,与 V1 同语义)
        parts.push(`<rect x="${x * cellSize + 0.5}" y="${headerHeight + y * cellSize + 0.5}" width="${cellSize - 1}" height="${cellSize - 1}" fill="${cell}"/>`)
      } else {
        // 拟真珠子：径向渐变（高光 → 基色 → 暗部）
        const r = parseInt(cell.slice(1, 3), 16)
        const g = parseInt(cell.slice(3, 5), 16)
        const b = parseInt(cell.slice(5, 7), 16)
        const lighten = (c, f) => Math.min(255, Math.round(c + (255 - c) * f))
        const darken = (c, f) => Math.max(0, Math.round(c * (1 - f)))
        const highlight = `rgb(${lighten(r, 0.35)},${lighten(g, 0.35)},${lighten(b, 0.35)})`
        const shadow = `rgb(${darken(r, 0.18)},${darken(g, 0.18)},${darken(b, 0.18)})`
        const gradId = `grad-${x}-${y}`
        parts.push(`<defs><radialGradient id="${gradId}" cx="35%" cy="35%"><stop offset="0%" stop-color="${highlight}"/><stop offset="50%" stop-color="${cell}"/><stop offset="100%" stop-color="${shadow}"/></radialGradient></defs>`)
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gradId})"/>`)

        // 网格线(拟真模式逐珠描边)
        if (style.showGrid) {
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>`)
        }
      }

      // 色号(编号在 doc.palette.colors 中已解析为品牌色号)
      if (style.showCodes && proMode) {
        const colorId = palette.colors.find(c => c.hex === cell)?.id || ''
        if (colorId) {
          const fontSize = colorId.length >= 4 ? smallCodeFontSize : codeFontSize
          parts.push(`<text x="${cx}" y="${cy + 1}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${textColorForBg(cell)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(colorId)}</text>`)
        }
      }
    }
  }

  // 专业模式:网格线在珠子上层补画 — 细线分隔每格,每 10 格加粗一条(V1 同语义)
  if (proMode && style.showGrid) {
    const gridW = width * cellSize
    const gridH = height * cellSize
    const drawLines = (color, lineWidth, step) => {
      for (let i = 0; i <= width; i += step) {
        parts.push(`<line x1="${i * cellSize + 0.5}" y1="${headerHeight}" x2="${i * cellSize + 0.5}" y2="${headerHeight + gridH}" stroke="${color}" stroke-width="${lineWidth}"/>`)
      }
      for (let i = 0; i <= height; i += step) {
        parts.push(`<line x1="0" y1="${headerHeight + i * cellSize + 0.5}" x2="${gridW}" y2="${headerHeight + i * cellSize + 0.5}" stroke="${color}" stroke-width="${lineWidth}"/>`)
      }
    }
    drawLines('#d0d0d0', 1, 1)
    drawLines('#666666', 1.5, 10)
  }

  // 图例
  const legendY = headerHeight + height * cellSize + 20
  parts.push(`<text x="20" y="${legendY}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1a1a1a">Color Legend:</text>`)

  let lx = 20
  for (const color of palette.colors) {
    parts.push(`<circle cx="${lx + 6}" cy="${legendY + 15}" r="5" fill="${color.hex}"/>`)
    parts.push(`<text x="${lx + 14}" y="${legendY + 18}" font-family="sans-serif" font-size="10" fill="#1a1a1a">${escapeXml(color.id)}</text>`)
    lx += 60
  }

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
