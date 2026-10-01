/**
 * PatternDocument — 统一拼豆图纸内部模型
 *
 * PNG / SVG / PDF 导出共享同一份 PatternDocument，
 * 确保颜色、坐标、编号、图例、布局语义一致。
 *
 * 版本: 2
 */

import { findClosestColorCIEDE2000 } from '../../utils/colorDiff'

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
 * @param {Object} [params.palette] - 品牌色卡对象(提供时把 hex 解析为品牌色号/名称,
 *   与 V1 专业图纸同语义:先精确 hex 命中,失败按 CIEDE2000 就近匹配)
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
  palette = null,
}) {
  const width = gridWidth || gridSize
  const height = gridHeight || gridSize

  // 提取实际使用的颜色
  const usedColors = extractUsedColors(canvasData, width, height, palette)
  // 颜色用量统计(按品牌码归并)与四级分组
  const colorStats = calculateColorStats(canvasData, width, height, palette)
  const totalBeads = colorStats.reduce((sum, s) => sum + s.count, 0)

  return {
    version: 2,
    metadata: {
      name: designName,
      width,
      height,
      paletteId,
      // 品牌显示名(表头"色卡："行);无色卡时回退 paletteId
      paletteName: palette?.nameZh || palette?.name || paletteId,
      createdAt: new Date().toISOString(),
    },
    grid: {
      width,
      height,
      cells: canvasData,
    },
    palette: {
      colors: usedColors,
      // 四级分组(major/minor/accent/trace),供右侧颜色面板绘制
      groups: groupColorStats(colorStats, totalBeads),
    },
    // 颜色用量统计(V1 专业图纸同结构,按品牌码归并,数量降序)
    stats: colorStats,
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
      // 完整 sheet 布局(与 V1 generateBeadPatternSheet 同值)
      padding: 20,
      rowLabelWidth: 36,
      colLabelHeight: 28,
      panelWidth: 260,
    },
  }
}

/**
 * 颜色用量统计(V1 专业图纸同语义):按解析出的品牌码归并计数,数量降序。
 * 有品牌色卡时 hex 解析为品牌码(精确命中 → CIEDE2000 就近),
 * 无色卡时以原始 hex 为键。
 *
 * @returns {Array} [{ id, name, hex, count }]
 */
export function calculateColorStats(canvasData, width, height, palette) {
  const brandColors = palette?.colors || null
  const stats = new Map()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = canvasData[y]?.[x]
      if (!cell) continue
      let id = cell
      let name = cell
      let hex = cell.startsWith('#') ? cell : '#888888'
      if (brandColors) {
        if (cell.startsWith('#')) {
          const exact = brandColors.find(c => c.hex?.toLowerCase() === cell.toLowerCase())
          const matched = exact || findClosestColorCIEDE2000(
            { r: parseInt(cell.slice(1, 3), 16), g: parseInt(cell.slice(3, 5), 16), b: parseInt(cell.slice(5, 7), 16) },
            brandColors
          )
          if (matched) {
            id = matched.id
            name = matched.nameZh || matched.name || matched.id
            hex = matched.hex
          }
        } else {
          // 旧格式:单元格存品牌码,直接按 id 查色卡
          const matched = brandColors.find(c => c.id === cell)
          if (matched) {
            name = matched.nameZh || matched.name || matched.id
            hex = matched.hex
          }
        }
      }
      if (!stats.has(id)) {
        stats.set(id, { id, name, hex, count: 0 })
      }
      stats.get(id).count++
    }
  }
  return Array.from(stats.values()).sort((a, b) => b.count - a.count)
}

/**
 * 把颜色统计分成 4 个层级(V1 同阈值):
 *   major  — 占比 ≥5% 的主色(画面骨架)
 *   minor  — 占比 1-5% 的辅色
 *   accent — 占比 <1% 且 ≥5 粒的点缀色
 *   trace  — <5 粒的微量色(采购需特别注意)
 *
 * @param {Array} colorStats - calculateColorStats 的结果(已按数量降序)
 * @param {number} totalBeads - 总珠子数
 * @returns {Object} { major, minor, accent, trace }
 */
export function groupColorStats(colorStats, totalBeads) {
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
 * 从 canvasData 中提取实际使用的颜色列表
 *
 * canvasData 单元格统一存 hex;提供品牌色卡时解析出品牌色号/名称
 * (V1 专业图纸同语义:精确 hex 命中 → CIEDE2000 就近匹配),
 * 无色卡时回退用 hex 充当编号。
 *
 * @param {Array} canvasData - 颜色矩阵
 * @param {number} width - 实际宽度
 * @param {number} height - 实际高度
 * @param {Object} [palette] - 品牌色卡对象({ colors: [{ id, name, nameZh, hex }] })
 * @returns {Array} 颜色列表 [{ id, name, hex, rgb: { r, g, b } }]
 */
function extractUsedColors(canvasData, width, height, palette) {
  const brandColors = palette?.colors || null
  const seen = new Map()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = canvasData[y]?.[x]
      if (!cell) continue
      if (!seen.has(cell)) {
        const r = parseInt(cell.slice(1, 3), 16)
        const g = parseInt(cell.slice(3, 5), 16)
        const b = parseInt(cell.slice(5, 7), 16)
        let id = cell
        let name = cell
        if (brandColors && cell.startsWith('#')) {
          const exact = brandColors.find(c => c.hex?.toLowerCase() === cell.toLowerCase())
          const matched = exact || findClosestColorCIEDE2000({ r, g, b }, brandColors)
          if (matched) {
            id = matched.id
            name = matched.nameZh || matched.name || matched.id
          }
        }
        seen.set(cell, {
          id,
          name,
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
