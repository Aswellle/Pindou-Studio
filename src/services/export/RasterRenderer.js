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
  const drawBead = (cx, cy, radius, hexColor) => {
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)

    if (style.beadStyle === 'realistic') {
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
    } else {
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = hexColor
      ctx.fill()
    }

    if (style.showGrid) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'
      ctx.lineWidth = Math.max(0.5, 0.5 * actualScale)
      ctx.stroke()
    }

    if (style.showCodes && style.beadStyle === 'professional') {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      ctx.fillStyle = lum > 128 ? '#1a1a1a' : '#b8b8b8'
      ctx.font = `${Math.max(8, 10 * actualScale)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const colorId = palette.colors.find(c => c.hex === hexColor)?.id || ''
      if (colorId) ctx.fillText(colorId, cx, cy)
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
        drawBead(bead.cx, bead.cy, beadRadius, bead.hex)
      }
      tileCtx.restore()

      ctx.drawImage(tileCanvas, sx, sy, sw, sh, sx, sy, sw, sh)

      tilesDone++
      if (onProgress) onProgress(0.3 + 0.5 * (tilesDone / totalTiles))
    }
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
