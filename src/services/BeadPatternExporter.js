/**
 * Bead Pattern Sheet Exporter
 * 生成标准化的拼豆图纸，包含：
 * 1. 编号网格（行列坐标）
 * 2. 彩色珠子圆形（拟真塑料质感）
 * 3. 颜色色卡（品牌色号 + 中文名称 + 数量统计）
 * 4. 表头元数据（图纸名称、尺寸、日期）
 * 5. 图例说明
 */

// PNG 导出超采样倍率：画布按 EXPORT_SCALE 倍物理像素渲染，
// 所有绘制代码仍用逻辑坐标（ctx.scale 统一放大），放大查看/打印时网格色块和文字才不糊。
const EXPORT_SCALE = 3

// 拟真珠子渲染 — 与 ImageQuantizer 预览保持一致
function drawBead(ctx, cx, cy, radius, hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const lighten = (c, f) => Math.min(255, Math.round(c + (255 - c) * f))
  const darken  = (c, f) => Math.max(0,   Math.round(c * (1 - f)))
  const highlight = `rgb(${lighten(r, 0.35)},${lighten(g, 0.35)},${lighten(b, 0.35)})`
  const shadow    = `rgb(${darken(r, 0.18)},${darken(g, 0.18)},${darken(b, 0.18)})`

  const grad = ctx.createRadialGradient(
    cx - radius * 0.25, cy - radius * 0.25, radius * 0.05,
    cx, cy, radius
  )
  grad.addColorStop(0,   highlight)
  grad.addColorStop(0.5, hexColor)
  grad.addColorStop(1.0, shadow)

  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // 月牙形高光
  ctx.beginPath()
  ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.28, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  ctx.fill()

  // 中心孔
  if (radius >= 4) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 0.14, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${darken(r,0.3)},${darken(g,0.3)},${darken(b,0.3)},0.7)`
    ctx.fill()
  }
}

/**
 * 根据背景颜色的相对亮度，返回适合叠加在其上的文字色。
 * ITU-R BT.601 公式；阈值 128 是专业拼豆站实测值。
 * 用 #b8b8b8 而非纯白，避免暗底文字过于刺眼。
 */
function textColorForBg(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum > 128 ? '#1a1a1a' : '#b8b8b8'
}

/**
 * 根据品牌色号 ID 或 HEX 查找色卡颜色信息
 * canvasData 单元格存储品牌色号 (如 P01, H23) 或 hex 字符串（向后兼容）
 */
function findPaletteColorById(idOrHex, palette) {
  // 优先按 id 精确匹配（新色板格式）
  const byId = palette.colors.find(c => c.id === idOrHex)
  if (byId) return byId

  // 降级：按 hex 值匹配（旧格式兼容）
  const byHex = palette.colors.find(c =>
    c.hex && c.hex.toLowerCase() === idOrHex.toLowerCase()
  )
  if (byHex) return byHex

  // 最终降级：RGB 欧氏距离（处理 hex 字符串格式）
  return null
}

/**
 * 根据HEX颜色查找色卡中最接近的颜色信息（fallback）
 */
function findClosestPaletteColor(hex, palette) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  let closest = null
  let minDistance = Infinity

  for (const color of palette.colors) {
    const dr = color.rgb.r - r
    const dg = color.rgb.g - g
    const db = color.rgb.b - b
    const distance = Math.sqrt(dr * dr + dg * dg + db * db)

    if (distance < minDistance) {
      minDistance = distance
      closest = color
    }
  }

  return closest
}

/**
 * 计算颜色统计
 * canvasData 单元格可为品牌色号（P01）或 hex 字符串（旧格式）
 */
function calculateColorStats(canvasData, gridSize, palette) {
  const stats = {}
  const rows = canvasData.length
  const cols = canvasData[0]?.length || gridSize

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = canvasData[y]?.[x]
      if (!cell) continue

      // 优先按色号 ID 精确匹配，降级按 hex 欧氏距离
      let paletteColor = findPaletteColorById(cell, palette)
      if (!paletteColor && cell.startsWith('#')) {
        paletteColor = findClosestPaletteColor(cell, palette)
      }

      const key = paletteColor?.id || cell
      const displayHex = paletteColor?.hex || (cell.startsWith('#') ? cell : '#888888')

      if (!stats[key]) {
        stats[key] = {
          id: paletteColor?.id || cell,
          name: (paletteColor?.nameZh || paletteColor?.name || cell),
          hex: displayHex,
          count: 0
        }
      }
      stats[key].count++
    }
  }

  return Object.values(stats).sort((a, b) => b.count - a.count)
}

/**
 * 把颜色统计分成 4 个层级：
 *   major  — 占比 ≥5% 的主色（画面骨架）
 *   minor  — 占比 1-5% 的辅色
 *   accent — 占比 <1% 且 ≥5 粒的点缀色
 *   trace  — <5 粒的微量色（采购需特别注意）
 */
function groupColorStats(colorStats, totalBeads) {
  const groups = { major: [], minor: [], accent: [], trace: [] }
  for (const item of colorStats) {
    const ratio = item.count / totalBeads
    if (item.count < 5)          groups.trace.push(item)
    else if (ratio >= 0.05)      groups.major.push(item)
    else if (ratio >= 0.01)      groups.minor.push(item)
    else                         groups.accent.push(item)
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => b.count - a.count)
  }
  return groups
}

/**
 * 生成拼豆图纸
 * @param {Object} options - 导出选项
 * @param {Array} options.canvasData - 画布数据二维数组
 * @param {number} options.gridSize - 网格尺寸
 * @param {string} options.paletteId - 色卡ID
 * @param {string} options.designName - 设计名称
 * @param {Object} options.palette - 色卡数据
 * @returns {Promise<HTMLCanvasElement>} 生成的canvas元素
 */
export async function generateBeadPatternSheet({
  canvasData, gridSize, gridWidth, gridHeight, paletteId,
  designName = '未命名', palette, onProgress = null,
  beadStyle = 'realistic',
  showCodes = null
}) {
  // 支持矩形网格（Phase 3）
  const cols = gridWidth || gridSize || (canvasData[0]?.length ?? gridSize)
  const rows = gridHeight || gridSize || canvasData.length
  const useProMode = (beadStyle === 'professional')
  const drawCodes = showCodes ?? useProMode

  // 配置参数
  const CELL_SIZE = 28        // 每格像素大小（适合打印）
  const BEAD_RADIUS = CELL_SIZE / 2 - 2  // 珠子半径
  const HEADER_HEIGHT = 80    // 表头高度
  const LEGEND_HEIGHT = 50    // 图例高度
  const COLOR_PANEL_WIDTH = 260  // 颜色面板宽度（分组色卡加宽）
  const PADDING = 20          // 边距
  const ROW_LABEL_WIDTH = 36  // 行标签宽度
  const COL_LABEL_HEIGHT = 28 // 列标签高度

  // 计算画布尺寸（支持矩形网格）
  const gridPixelW = cols * CELL_SIZE
  const gridPixelH = rows * CELL_SIZE
  const sheetWidth = gridPixelW + ROW_LABEL_WIDTH + PADDING * 2 + COLOR_PANEL_WIDTH
  const sheetHeight = gridPixelH + HEADER_HEIGHT + LEGEND_HEIGHT + COL_LABEL_HEIGHT + PADDING * 2

  // 创建 canvas — 物理像素按 EXPORT_SCALE 倍分辨率分配，
  // ctx.scale 后所有绘制代码仍按逻辑尺寸（sheetWidth/sheetHeight）操作，无需改动下方坐标计算
  const canvas = document.createElement('canvas')
  canvas.width = sheetWidth * EXPORT_SCALE
  canvas.height = sheetHeight * EXPORT_SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE)

  // 白色背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sheetWidth, sheetHeight)

  // ========== 1. 绘制表头 ==========
  ctx.fillStyle = '#2c2c2c'
  ctx.fillRect(0, 0, sheetWidth, HEADER_HEIGHT)

  // 标题
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 24px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(designName, sheetWidth / 2, HEADER_HEIGHT / 2 - 12)

  // 副标题信息
  ctx.font = '14px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#aaaaaa'
  ctx.fillText(`${cols} × ${rows} 格子`, sheetWidth / 2, HEADER_HEIGHT / 2 + 18)

  // 左侧信息
  ctx.textAlign = 'left'
  ctx.font = '12px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#888888'
  const today = new Date().toLocaleDateString('zh-CN')
  ctx.fillText(`日期：${today}`, PADDING, HEADER_HEIGHT / 2)
  ctx.fillText(`色卡：${palette?.nameZh || paletteId}`, PADDING, HEADER_HEIGHT / 2 + 18)

  // 右侧信息
  ctx.textAlign = 'right'
  ctx.fillText(`总珠子数：${canvasData.flat().filter(c => c).length}`, sheetWidth - PADDING, HEADER_HEIGHT / 2)
  ctx.fillText(`使用颜色：${[...new Set(canvasData.flat().filter(c => c))].length}`, sheetWidth - PADDING, HEADER_HEIGHT / 2 + 18)

  // ========== 2. 计算颜色统计 ==========
  const colorStats = calculateColorStats(canvasData, rows, palette)
  const totalBeads = canvasData.flat().filter(c => c).length
  const groups = groupColorStats(colorStats, totalBeads)

  // ========== 3. 绘制颜色面板 ==========
  const colorPanelX = sheetWidth - COLOR_PANEL_WIDTH - PADDING
  const colorPanelY = HEADER_HEIGHT + LEGEND_HEIGHT + PADDING
  const colorPanelHeight = sheetHeight - HEADER_HEIGHT - LEGEND_HEIGHT - PADDING * 2

  // 面板背景
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(colorPanelX, colorPanelY, COLOR_PANEL_WIDTH, colorPanelHeight)

  // 面板主标题
  ctx.fillStyle = '#222'
  ctx.font = 'bold 14px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('颜色清单', colorPanelX + 12, colorPanelY + 18)

  // 总计摘要
  ctx.font = '11px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#666'
  ctx.fillText(`共 ${colorStats.length} 色，${totalBeads} 粒`, colorPanelX + 12, colorPanelY + 36)

  // 分组绘制
  const groupConfig = [
    { key: 'major',  title: '主色（≥5%）',       titleColor: '#2c5aa0', warn: false },
    { key: 'minor',  title: '辅色（1–5%）',       titleColor: '#5a8a3a', warn: false },
    { key: 'accent', title: '点缀色',             titleColor: '#8a6a3a', warn: false },
    { key: 'trace',  title: '微量色 ⚠ 采购注意', titleColor: '#c33',   warn: true  },
  ]

  let colorY = colorPanelY + 55
  const colorItemH = 24

  for (const cfg of groupConfig) {
    const items = groups[cfg.key]
    if (items.length === 0) continue

    if (colorY + 18 > colorPanelY + colorPanelHeight - 10) break

    // 分组标题行
    ctx.font = 'bold 11px "Fira Code", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = cfg.titleColor
    ctx.textAlign = 'left'
    ctx.fillText(`${cfg.title} · ${items.length}种`, colorPanelX + 10, colorY)
    colorY += 16

    // 组内分隔线
    ctx.strokeStyle = cfg.titleColor + '44'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(colorPanelX + 8, colorY - 4)
    ctx.lineTo(colorPanelX + COLOR_PANEL_WIDTH - 8, colorY - 4)
    ctx.stroke()

    for (const item of items) {
      if (colorY + colorItemH > colorPanelY + colorPanelHeight - 10) break

      // 色块：专业模式用方形（与图纸方格形状一致），拟真模式用圆形
      if (useProMode) {
        const swX = colorPanelX + 10
        const swY = colorY + colorItemH / 2 - 10
        ctx.fillStyle = item.hex
        ctx.fillRect(swX, swY, 20, 20)
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'
        ctx.lineWidth = 1
        ctx.strokeRect(swX + 0.5, swY + 0.5, 19, 19)
      } else {
        ctx.beginPath()
        ctx.arc(colorPanelX + 20, colorY + colorItemH / 2, 8, 0, Math.PI * 2)
        ctx.fillStyle = item.hex
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // 色号 + 名称
      const label = item.id !== item.name ? `${item.id} ${item.name}` : item.name
      const truncated = label.length > 15 ? label.slice(0, 14) + '…' : label
      ctx.fillStyle = cfg.warn ? '#c33' : '#333'
      ctx.font = '10px "Fira Code", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(truncated, colorPanelX + 34, colorY + colorItemH / 2)

      // 数量（微量色加警示符）
      ctx.fillStyle = cfg.warn ? '#c33' : '#555'
      ctx.textAlign = 'right'
      ctx.fillText(
        cfg.warn ? `${item.count}颗 ⚠` : `${item.count}颗`,
        colorPanelX + COLOR_PANEL_WIDTH - 10,
        colorY + colorItemH / 2
      )

      colorY += colorItemH
    }
    colorY += 8  // 组间留白
  }

  // ========== 4. 绘制网格区域 ==========
  const gridStartX = PADDING + ROW_LABEL_WIDTH
  const gridStartY = HEADER_HEIGHT + LEGEND_HEIGHT + PADDING + COL_LABEL_HEIGHT

  // 列标签 (0, 1, 2, ...)
  ctx.fillStyle = '#666666'
  ctx.font = '11px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let x = 0; x < cols; x++) {
    const cx = gridStartX + x * CELL_SIZE + CELL_SIZE / 2
    ctx.fillText(x.toString(), cx, gridStartY - COL_LABEL_HEIGHT / 2)
  }

  // 行标签
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  for (let y = 0; y < rows; y++) {
    const cy = gridStartY + y * CELL_SIZE + CELL_SIZE / 2
    ctx.fillText(y.toString(), gridStartX - ROW_LABEL_WIDTH / 2 + 8, cy)
  }

  // 绘制网格背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(gridStartX, gridStartY, gridPixelW, gridPixelH)

  // 绘制网格线
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 0.5

  for (let i = 0; i <= cols; i++) {
    ctx.beginPath()
    ctx.moveTo(gridStartX + i * CELL_SIZE, gridStartY)
    ctx.lineTo(gridStartX + i * CELL_SIZE, gridStartY + gridPixelH)
    ctx.stroke()
  }
  for (let i = 0; i <= rows; i++) {
    ctx.beginPath()
    ctx.moveTo(gridStartX, gridStartY + i * CELL_SIZE)
    ctx.lineTo(gridStartX + gridPixelW, gridStartY + i * CELL_SIZE)
    ctx.stroke()
  }

  // 绘制珠子 — 分帧（每 2000 颗让出主线程一次，避免 UI 冻结）
  // 'realistic'    : 径向渐变 + 高光 + 中心孔（展示用）
  // 'professional' : 方形填色 + 色号标注（工艺施工用）
  const codeFontSize = Math.max(9, Math.floor(CELL_SIZE * 0.38))
  const codeFont = `bold ${codeFontSize}px "Helvetica Neue", "Arial", sans-serif`
  const total = rows * cols
  const BATCH_SIZE = 2000
  let processed = 0

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = canvasData[y]?.[x]
      if (cell) {
        let paletteColor = findPaletteColorById(cell, palette)
        if (!paletteColor && cell.startsWith('#')) paletteColor = findClosestPaletteColor(cell, palette)
        const hexColor = paletteColor?.hex || (cell.startsWith('#') ? cell : '#888888')
        const codeLabel = paletteColor?.id || ''
        const cellX = gridStartX + x * CELL_SIZE
        const cellY = gridStartY + y * CELL_SIZE
        const cx = cellX + CELL_SIZE / 2
        const cy = cellY + CELL_SIZE / 2

        if (useProMode) {
          // +0.5 / -1 留 1px 给网格线
          ctx.fillStyle = hexColor
          ctx.fillRect(cellX + 0.5, cellY + 0.5, CELL_SIZE - 1, CELL_SIZE - 1)
          if (drawCodes && codeLabel && CELL_SIZE >= 14) {
            ctx.fillStyle = textColorForBg(hexColor)
            ctx.font = codeFont
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(codeLabel, cx, cy + 1)
          }
        } else {
          drawBead(ctx, cx, cy, BEAD_RADIUS, hexColor)
        }
      }
      processed++
      if (processed % BATCH_SIZE === 0) {
        if (onProgress) onProgress('beads', processed / total)
        await new Promise(r => requestAnimationFrame(r))
      }
    }
  }
  if (onProgress) onProgress('beads', 1)

  // 专业模式：珠子方块绘制完后，在上层补画网格线
  // 细线作分隔，每 10 格加粗一条（专业图纸惯例，便于手工对照坐标）
  if (useProMode) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath()
      ctx.moveTo(gridStartX + i * CELL_SIZE + 0.5, gridStartY)
      ctx.lineTo(gridStartX + i * CELL_SIZE + 0.5, gridStartY + gridPixelH)
      ctx.stroke()
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath()
      ctx.moveTo(gridStartX, gridStartY + i * CELL_SIZE + 0.5)
      ctx.lineTo(gridStartX + gridPixelW, gridStartY + i * CELL_SIZE + 0.5)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1.5
    for (let i = 0; i <= cols; i += 10) {
      ctx.beginPath()
      ctx.moveTo(gridStartX + i * CELL_SIZE + 0.5, gridStartY)
      ctx.lineTo(gridStartX + i * CELL_SIZE + 0.5, gridStartY + gridPixelH)
      ctx.stroke()
    }
    for (let i = 0; i <= rows; i += 10) {
      ctx.beginPath()
      ctx.moveTo(gridStartX, gridStartY + i * CELL_SIZE + 0.5)
      ctx.lineTo(gridStartX + gridPixelW, gridStartY + i * CELL_SIZE + 0.5)
      ctx.stroke()
    }
  }

  // ========== 5. 绘制图例 ==========
  ctx.fillStyle = '#f0f0f0'
  ctx.fillRect(0, HEADER_HEIGHT, sheetWidth, LEGEND_HEIGHT)

  ctx.fillStyle = '#666666'
  ctx.font = '12px "Fira Code", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // 中心珠标记说明
  ctx.fillText('★ = 中心珠', PADDING, HEADER_HEIGHT + LEGEND_HEIGHT / 2)

  // 绘制一个示例中心珠
  const legendX = 120
  const legendY = HEADER_HEIGHT + LEGEND_HEIGHT / 2
  ctx.beginPath()
  ctx.arc(legendX, legendY, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#E53935'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(legendX - 3, legendY - 3, 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fill()

  // 色卡信息
  ctx.textAlign = 'right'
  ctx.fillStyle = '#888888'
  ctx.fillText(`导出自 拼豆Studio`, sheetWidth - PADDING, legendY)

  // ========== 6. 绘制边框 ==========
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1
  ctx.strokeRect(0, 0, sheetWidth, sheetHeight)

  // 网格区域边框
  ctx.strokeRect(gridStartX, gridStartY, gridPixelW, gridPixelH)

  return canvas
}

/**
 * 导出为 PNG 图片
 */
export async function exportAsPNG(canvasData, gridSize, paletteId, designName, palette, options = {}) {
  const cols = options.gridWidth || gridSize
  const rows = options.gridHeight || gridSize
  const canvas = await generateBeadPatternSheet({
    canvasData, gridSize,
    gridWidth: options.gridWidth,
    gridHeight: options.gridHeight,
    paletteId, designName, palette,
    onProgress: options.onProgress,
    beadStyle: options.beadStyle
  })

  const link = document.createElement('a')
  link.download = `${designName}-${cols}x${rows}-拼豆图纸.png`
  link.href = canvas.toDataURL('image/png', 1.0)
  link.click()
}

function escapeSVG(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 导出为 SVG (简化版，仅网格和珠子)
 */
export function exportAsSVG(canvasData, gridSize, paletteId, designName, palette, gridWidth, gridHeight, beadStyle = 'realistic') {
  const CELL_SIZE = 28
  const BEAD_RADIUS = CELL_SIZE / 2 - 2
  const HEADER_HEIGHT = 80
  const LEGEND_HEIGHT = 50
  const PADDING = 20
  const ROW_LABEL_WIDTH = 36
  const COL_LABEL_HEIGHT = 28
  const SVG_PANEL_WIDTH = 260

  const cols = gridWidth || gridSize || (canvasData[0]?.length ?? gridSize)
  const rows = gridHeight || gridSize || canvasData.length
  const useProMode = (beadStyle === 'professional')
  const codeFontSize = Math.max(9, Math.floor(CELL_SIZE * 0.38))
  const gridPixelW = cols * CELL_SIZE
  const gridPixelH = rows * CELL_SIZE
  const svgW = gridPixelW + ROW_LABEL_WIDTH + PADDING * 2 + SVG_PANEL_WIDTH
  const svgH = gridPixelH + HEADER_HEIGHT + LEGEND_HEIGHT + COL_LABEL_HEIGHT + PADDING * 2

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}">
  <style>text { font-family: "Fira Code", "Microsoft YaHei", sans-serif; }</style>
  <rect width="100%" height="100%" fill="white"/>
  <rect x="0" y="0" width="${svgW}" height="${HEADER_HEIGHT}" fill="#2c2c2c"/>
  <text x="${svgW / 2}" y="${HEADER_HEIGHT / 2 - 12}" fill="white" font-size="24" font-weight="bold" text-anchor="middle">${escapeSVG(designName)}</text>
  <text x="${svgW / 2}" y="${HEADER_HEIGHT / 2 + 18}" fill="#aaaaaa" font-size="14" text-anchor="middle">${cols} × ${rows} 格子</text>
`

  const gridStartX = PADDING + ROW_LABEL_WIDTH
  const gridStartY = HEADER_HEIGHT + LEGEND_HEIGHT + PADDING + COL_LABEL_HEIGHT

  for (let x = 0; x < cols; x++) {
    svg += `  <text x="${gridStartX + x * CELL_SIZE + CELL_SIZE / 2}" y="${gridStartY - COL_LABEL_HEIGHT / 2}" fill="#666666" font-size="11" text-anchor="middle">${x}</text>\n`
  }
  for (let y = 0; y < rows; y++) {
    svg += `  <text x="${gridStartX - ROW_LABEL_WIDTH / 2 + 8}" y="${gridStartY + y * CELL_SIZE + CELL_SIZE / 2}" fill="#666666" font-size="11" text-anchor="middle">${y}</text>\n`
  }

  svg += `  <rect x="${gridStartX}" y="${gridStartY}" width="${gridPixelW}" height="${gridPixelH}" fill="white"/>\n`

  for (let i = 0; i <= cols; i++) {
    svg += `  <line x1="${gridStartX + i * CELL_SIZE}" y1="${gridStartY}" x2="${gridStartX + i * CELL_SIZE}" y2="${gridStartY + gridPixelH}" stroke="#e0e0e0" stroke-width="0.5"/>\n`
  }
  for (let i = 0; i <= rows; i++) {
    svg += `  <line x1="${gridStartX}" y1="${gridStartY + i * CELL_SIZE}" x2="${gridStartX + gridPixelW}" y2="${gridStartY + i * CELL_SIZE}" stroke="#e0e0e0" stroke-width="0.5"/>\n`
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = canvasData[y]?.[x]
      if (!cell) continue
      let paletteColor = findPaletteColorById(cell, palette)
      if (!paletteColor && cell.startsWith('#')) paletteColor = findClosestPaletteColor(cell, palette)
      const hexColor = paletteColor?.hex || (cell.startsWith('#') ? cell : '#888888')
      const codeLabel = paletteColor?.id || ''
      const cellX = gridStartX + x * CELL_SIZE
      const cellY = gridStartY + y * CELL_SIZE
      const cx = cellX + CELL_SIZE / 2
      const cy = cellY + CELL_SIZE / 2

      if (useProMode) {
        const textColor = textColorForBg(hexColor)
        svg += `  <rect x="${cellX + 0.5}" y="${cellY + 0.5}" width="${CELL_SIZE - 1}" height="${CELL_SIZE - 1}" fill="${hexColor}" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>\n`
        if (codeLabel) {
          svg += `  <text x="${cx}" y="${cy}" fill="${textColor}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${codeFontSize}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${codeLabel}</text>\n`
        }
      } else {
        // SVG 中使用径向渐变模拟塑料质感
        const gid = `g${y}_${x}`
        svg += `  <defs><radialGradient id="${gid}" cx="35%" cy="35%" r="65%"><stop offset="0%" stop-color="${hexColor}" stop-opacity="1.4"/><stop offset="50%" stop-color="${hexColor}"/><stop offset="100%" stop-color="${hexColor}" stop-opacity="0.82"/></radialGradient></defs>\n`
        svg += `  <circle cx="${cx}" cy="${cy}" r="${BEAD_RADIUS}" fill="url(#${gid})"/>\n`
        svg += `  <circle cx="${cx - BEAD_RADIUS * 0.28}" cy="${cy - BEAD_RADIUS * 0.28}" r="${BEAD_RADIUS * 0.28}" fill="rgba(255,255,255,0.38)"/>\n`
      }
    }
  }

  const colorStats = calculateColorStats(canvasData, rows, palette)
  const svgTotalBeads = canvasData.flat().filter(c => c).length
  const svgGroups = groupColorStats(colorStats, svgTotalBeads)
  const panelX = gridPixelW + ROW_LABEL_WIDTH + PADDING * 2
  const panelY = HEADER_HEIGHT + LEGEND_HEIGHT + PADDING

  svg += `\n  <rect x="${panelX}" y="${panelY}" width="${SVG_PANEL_WIDTH}" height="${svgH - panelY - PADDING}" fill="#f8f8f8"/>\n`
  svg += `  <text x="${panelX + 12}" y="${panelY + 18}" fill="#222" font-size="14" font-weight="bold">颜色清单</text>\n`
  svg += `  <text x="${panelX + 12}" y="${panelY + 36}" fill="#666" font-size="11">共 ${colorStats.length} 色，${svgTotalBeads} 粒</text>\n`

  const svgGroupConfig = [
    { key: 'major',  title: '主色（≥5%）',       color: '#2c5aa0', warn: false },
    { key: 'minor',  title: '辅色（1–5%）',       color: '#5a8a3a', warn: false },
    { key: 'accent', title: '点缀色',             color: '#8a6a3a', warn: false },
    { key: 'trace',  title: '微量色 ⚠ 采购注意', color: '#cc3333', warn: true  },
  ]

  let colorY = panelY + 55
  const svgItemH = 24

  for (const cfg of svgGroupConfig) {
    const items = svgGroups[cfg.key]
    if (items.length === 0) continue

    svg += `  <text x="${panelX + 10}" y="${colorY}" fill="${cfg.color}" font-size="11" font-weight="bold">${cfg.title} · ${items.length}种</text>\n`
    svg += `  <line x1="${panelX + 8}" y1="${colorY + 4}" x2="${panelX + SVG_PANEL_WIDTH - 8}" y2="${colorY + 4}" stroke="${cfg.color}" stroke-width="0.8" stroke-opacity="0.3"/>\n`
    colorY += 16

    for (const item of items) {
      const label = item.id !== item.name ? `${item.id} ${item.name}` : item.name
      const truncated = label.length > 16 ? label.slice(0, 15) + '…' : label
      const countText = cfg.warn ? `${item.count}颗 ⚠` : `${item.count}颗`
      const textColor = cfg.warn ? '#cc3333' : '#333333'
      const countColor = cfg.warn ? '#cc3333' : '#555555'
      if (useProMode) {
        const swX = panelX + 10
        const swY = colorY + svgItemH / 2 - 10
        svg += `  <rect x="${swX + 0.5}" y="${swY + 0.5}" width="19" height="19" fill="${item.hex}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>\n`
      } else {
        svg += `  <circle cx="${panelX + 20}" cy="${colorY + svgItemH / 2}" r="8" fill="${item.hex}" stroke="rgba(0,0,0,0.22)" stroke-width="0.8"/>\n`
      }
      svg += `  <text x="${panelX + 34}" y="${colorY + svgItemH / 2 + 4}" fill="${textColor}" font-size="10">${truncated}</text>\n`
      svg += `  <text x="${panelX + SVG_PANEL_WIDTH - 10}" y="${colorY + svgItemH / 2 + 4}" fill="${countColor}" font-size="10" text-anchor="end">${countText}</text>\n`
      colorY += svgItemH
    }
    colorY += 8
  }

  svg += '</svg>'

  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const link = document.createElement('a')
  link.download = `${designName}-${cols}x${rows}-拼豆图纸.svg`
  link.href = URL.createObjectURL(blob)
  link.click()
}
