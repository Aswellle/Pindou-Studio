/**
 * PatternDocument — 统一拼豆图纸内部模型
 *
 * PNG / SVG / PDF 导出共享同一份 PatternDocument，
 * 确保颜色、坐标、编号、图例、布局语义一致。
 *
 * 版本: 2
 */

/**
 * @typedef {Object} PatternDocument
 * @property {number} version - 模型版本（当前 2）
 * @property {Object} metadata - 图纸元数据
 * @property {string} metadata.name - 图纸名称
 * @property {number} metadata.width - 网格宽度
 * @property {number} metadata.height - 网格高度
 * @property {string} metadata.paletteId - 色板 ID
 * @property {string} metadata.createdAt - 创建时间（ISO 8601）
 * @property {Object} grid - 网格数据
 * @property {number} grid.width - 列数
 * @property {number} grid.height - 行数
 * @property {Array<Array<string|null>>} grid.cells - 颜色矩阵（hex 或 null）
 * @property {Object} palette - 色板
 * @property {Array} palette.colors - 使用的颜色列表 [{ id, name, hex, rgb }]
 * @property {Object} style - 渲染样式
 * @property {string} style.beadStyle - 'realistic' | 'professional'
 * @property {boolean} style.showCodes - 是否显示色号
 * @property {boolean} style.showGrid - 是否显示网格线
 * @property {boolean} style.showCoordinates - 是否显示坐标
 * @property {Object} layout - 布局参数
 * @property {number} layout.cellSize - 每格像素大小
 * @property {number} layout.headerHeight - 表头高度
 * @property {number} layout.legendHeight - 图例高度
 */

/**
 * 从 canvasData + 元数据构建 PatternDocument
 *
 * @param {Object} params
 * @param {Array} params.canvasData - 画布数据（hex/null 矩阵）
 * @param {number} params.gridSize - 网格尺寸
 * @param {number} [params.gridWidth] - 实际宽度
 * @param {number} [params.gridHeight] - 实际高度
 * @param {string} params.paletteId - 色板 ID
 * @param {string} [params.designName] - 图纸名称
 * @param {string} [params.beadStyle] - 珠子风格
 * @returns {PatternDocument}
 */
export function createPatternDocument({
  canvasData,
  gridSize,
  gridWidth,
  gridHeight,
  paletteId,
  designName = '',
  beadStyle = 'professional',
}) {
  const width = gridWidth || gridSize
  const height = gridHeight || gridSize

  // 提取实际使用的颜色
  const usedColors = extractUsedColors(canvasData, width, height)

  return {
    version: 2,
    metadata: {
      name: designName,
      width,
      height,
      paletteId,
      createdAt: new Date().toISOString(),
    },
    grid: {
      width,
      height,
      cells: canvasData,
    },
    palette: {
      colors: usedColors,
    },
    style: {
      beadStyle,
      showCodes: beadStyle === 'professional',
      showGrid: true,
      showCoordinates: true,
    },
    layout: {
      cellSize: 28,
      headerHeight: 80,
      legendHeight: 50,
    },
  }
}

/**
 * 从 canvasData 中提取实际使用的颜色列表
 *
 * @param {Array} canvasData - 颜色矩阵
 * @param {number} width - 实际宽度
 * @param {number} height - 实际高度
 * @returns {Array} 颜色列表 [{ id, name, hex, rgb: { r, g, b } }]
 */
function extractUsedColors(canvasData, width, height) {
  const seen = new Map()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = canvasData[y]?.[x]
      if (!cell) continue
      if (!seen.has(cell)) {
        const r = parseInt(cell.slice(1, 3), 16)
        const g = parseInt(cell.slice(3, 5), 16)
        const b = parseInt(cell.slice(5, 7), 16)
        seen.set(cell, {
          id: cell,
          name: cell,
          hex: cell,
          rgb: { r, g, b },
        })
      }
    }
  }
  return Array.from(seen.values())
}

/**
 * 将 PatternDocument 序列化为 JSON（用于 Golden Test）
 *
 * @param {PatternDocument} doc
 * @returns {string}
 */
export function serializePatternDocument(doc) {
  return JSON.stringify(doc, null, 2)
}

/**
 * 从 JSON 反序列化 PatternDocument
 *
 * @param {string} json
 * @returns {PatternDocument}
 */
export function deserializePatternDocument(json) {
  const doc = typeof json === 'string' ? JSON.parse(json) : json
  if (doc.version !== 2) {
    throw new Error(`Unsupported PatternDocument version: ${doc.version}`)
  }
  return doc
}
