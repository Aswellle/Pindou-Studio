/**
 * RasterRenderer — 基于 PatternDocument 的 PNG 渲染器
 *
 * 新渲染路径：PatternDocument → RasterRenderer → PNG
 * 与 BeadPatternExporter 并存，通过 Feature Flag 切换。
 *
 * 支持 Tile Rendering：大图自动分块渲染防止 OOM。
 */

import { createScaledCanvas, createDPICanvas } from '../BeadPatternExporter'

/**
 * 从 PatternDocument 渲染 PNG
 *
 * @param {Object} doc - PatternDocument
 * @param {Object} [options]
 * @param {number} [options.scale] - 超采样倍率（默认 3）
 * @param {number} [options.dpi] - 输出 DPI（默认 300）
 * @param {number} [options.tileSize] - 分块大小（默认 2048 物理像素）
 * @param {Function} [options.onProgress] - 进度回调
 * @returns {Promise<Blob>} PNG blob
 */
export async function renderPatternDocumentToPNG(doc, options = {}) {
  const { scale, dpi = 300, onProgress = null, tileSize = 2048 } = options
  const { grid, palette, style, layout } = doc
  const { width, height, cells } = grid
  const { cellSize, headerHeight, legendHeight } = layout

  const canvasWidth = width * cellSize
  const canvasHeight = height * cellSize + headerHeight + legendHeight

  if (onProgress) onProgress(0.1)

  // 创建超采样 canvas — DPI 策略或固定 scale
  let canvas, actualScale
  try {
    if (dpi && dpi !== 300) {
      ;({ canvas, scale: actualScale } = createDPICanvas(canvasWidth, canvasHeight, dpi))
    } else {
      ;({ canvas, scale: actualScale } = createScaledCanvas(canvasWidth, canvasHeight))
    }
  } catch {
    ;({ canvas, scale: actualScale } = createScaledCanvas(canvasWidth, canvasHeight))
  }

  const ctx = canvas.getContext('2d')
  const cs = cellSize * actualScale
  const headerH = headerHeight * actualScale
  const legendH = legendHeight * actualScale
  const beadRadius = cs / 2 - 1

  // 背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 表头
  ctx.fillStyle = '#1a1a1a'
  ctx.font = `bold ${16 * actualScale}px sans-serif`
  ctx.fillText(doc.metadata.name || 'Bead Pattern', 20 * actualScale, 30 * actualScale)
  ctx.font = `${12 * actualScale}px sans-serif`
  ctx.fillText(`${width} × ${height} | ${palette.colors.length} colors`, 20 * actualScale, 55 * actualScale)

  if (onProgress) onProgress(0.3)

  // Tile Rendering: 大图分块渲染防止 OOM
  const needsTiling = canvas.width > tileSize || canvas.height > tileSize
  const tileCols = needsTiling ? Math.ceil(canvas.width / tileSize) : 1
  const tileRows = needsTiling ? Math.ceil(canvas.height / tileSize) : 1
  const totalTiles = tileCols * tileRows

  // 复用 tile canvas
  let tileCanvas = null
  let tileCtx = null
  if (needsTiling) {
    try {
      tileCanvas = document.createElement('canvas')
      tileCanvas.width = Math.min(tileSize, canvas.width)
      tileCanvas.height = Math.min(tileSize, canvas.height)
      tileCtx = tileCanvas.getContext('2d')
    } catch { /* 不支持时降级 */ }
  }

  // 绘制珠子
  // 'realistic'    : 径向渐变圆珠(展示用)
  // 'professional' : 方形填色 + 品牌色号标注(工艺施工用,与 V1 专业图纸同语义)
  const proMode = style.beadStyle === 'professional'
  // 色号自适应字号:4 字符色号(C100 等)缩至 8 逻辑 px,防溢出相邻格(V1 同规则)
  const codeFontSize = Math.max(9, Math.floor(cellSize * 0.38)) * actualScale
  const smallCodeFontSize = 8 * actualScale

  const textColorForBg = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum > 128 ? '#1a1a1a' : '#b8b8b8'
  }

  const drawBead = (cx, cy, radius, hexColor) => {
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)

    if (!proMode) {
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
    }

    if (style.showGrid && !proMode) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'
      ctx.lineWidth = Math.max(0.5, 0.5 * actualScale)
      ctx.stroke()
    }
  }

  // 专业模式:方形填色 + 色号(编号在 doc.palette.colors 中已解析为品牌色号)
  const drawProCell = (cellX, cellY, hexColor) => {
    // +0.5 / -1 逻辑 px 留网格线位(网格线在珠子上层补画,放大后硬边锐利)
    ctx.fillStyle = hexColor
    ctx.fillRect(cellX + 0.5 * actualScale, cellY + 0.5 * actualScale, cs - actualScale, cs - actualScale)
    if (style.showCodes) {
      const colorId = palette.colors.find(c => c.hex === hexColor)?.id || ''
      if (colorId) {
        ctx.fillStyle = textColorForBg(hexColor)
        ctx.font = `bold ${colorId.length >= 4 ? smallCodeFontSize : codeFontSize}px "Helvetica Neue", "Arial", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(colorId, cellX + cs / 2, cellY + cs / 2 + actualScale)
      }
    }
  }

  // 珠子绘制循环（支持 Tile Rendering）
  const beadsPerTile = new Map()

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = cells[y]?.[x]
      if (!cell) continue
      const cx = x * cs + cs / 2
      const cy = headerH + y * cs + cs / 2

      if (needsTiling && tileCtx) {
        const tileCol = Math.floor(cx / tileSize)
        const tileRow = Math.floor(cy / tileSize)
        const tIdx = tileRow * tileCols + tileCol
        if (!beadsPerTile.has(tIdx)) beadsPerTile.set(tIdx, [])
        beadsPerTile.get(tIdx).push({ cx, cy, hex: cell })
      } else if (proMode) {
        drawProCell(x * cs, headerH + y * cs, cell)
      } else {
        drawBead(cx, cy, beadRadius, cell)
      }
    }
  }

  // 分块渲染：逐 tile 绘制再合并
  if (needsTiling && tileCtx && beadsPerTile.size > 0) {
    let tilesDone = 0
    for (const [tIdx, beads] of beadsPerTile) {
      const tileCol = tIdx % tileCols
      const tileRow = Math.floor(tIdx / tileCols)
      const sx = tileCol * tileSize
      const sy = tileRow * tileSize
      const sw = Math.min(tileSize, canvas.width - sx)
      const sh = Math.min(tileSize, canvas.height - sy)

      tileCtx.save()
      tileCtx.translate(-sx, -sy)
      for (const bead of beads) {
        if (proMode) drawProCell(bead.cx - cs / 2, bead.cy - cs / 2, bead.hex)
        else drawBead(bead.cx, bead.cy, beadRadius, bead.hex)
      }
      tileCtx.restore()

      ctx.drawImage(tileCanvas, sx, sy, sw, sh, sx, sy, sw, sh)

      tilesDone++
      if (onProgress) onProgress(0.3 + 0.5 * (tilesDone / totalTiles))
    }
  }

  // 专业模式:网格线在珠子上层补画(V1 同语义)
  // 细线分隔每格,每 10 格加粗一条(专业图纸惯例,便于手工对照坐标)
  if (proMode && style.showGrid) {
    const gridLeft = 0
    const gridTop = headerH
    const gridW = width * cs
    const gridH = height * cs
    const drawLines = (color, lineWidth, step) => {
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      for (let i = 0; i <= width; i += step) {
        ctx.beginPath()
        ctx.moveTo(gridLeft + i * cs + 0.5 * actualScale, gridTop)
        ctx.lineTo(gridLeft + i * cs + 0.5 * actualScale, gridTop + gridH)
        ctx.stroke()
      }
      for (let i = 0; i <= height; i += step) {
        ctx.beginPath()
        ctx.moveTo(gridLeft, gridTop + i * cs + 0.5 * actualScale)
        ctx.lineTo(gridLeft + gridW, gridTop + i * cs + 0.5 * actualScale)
        ctx.stroke()
      }
    }
    drawLines('#d0d0d0', actualScale, 1)
    drawLines('#666666', 1.5 * actualScale, 10)
  }

  if (onProgress) onProgress(0.85)

  // 图例
  const legendY = headerH + height * cs + 10
  ctx.fillStyle = '#1a1a1a'
  ctx.font = `bold ${12 * actualScale}px sans-serif`
  ctx.fillText('Color Legend:', 20 * actualScale, legendY)

  let lx = 20 * actualScale
  const ly = legendY + 15 * actualScale
  for (const color of palette.colors) {
    ctx.beginPath()
    ctx.arc(lx + 6 * actualScale, ly, 5 * actualScale, 0, Math.PI * 2)
    ctx.fillStyle = color.hex
    ctx.fill()
    ctx.fillStyle = '#1a1a1a'
    ctx.font = `${10 * actualScale}px sans-serif`
    ctx.fillText(`${color.id}`, lx + 14 * actualScale, ly + 3 * actualScale)
    lx += 60 * actualScale
  }

  if (onProgress) onProgress(0.95)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('PNG encoding failed'))
    }, 'image/png')
  })
}
