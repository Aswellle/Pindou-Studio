/**
 * chartImport — 图片图纸识别的编排层(纯函数)
 *
 * 把 gridDetector(找网格)与 cellSampler(采样/配色)串成「图片 → BeadPatternProject」:
 *   1. 自动检测网格(可被用户覆盖为手动列数/行数/边界);
 *   2. 按边界逐格采样中心颜色,与背景接近的格子判为空白;
 *   3. CIEDE2000 映射到所选品牌色卡,得到最终 hex 矩阵;
 *   4. 组装为 schemaVersion 1 的项目对象,source.kind = 'chart-import'。
 *
 * 为什么不复用照片量化 Worker:已有图纸截图是「每格一个离散颜色」,再跑 K-means/抖动
 * 会把清晰的色块搅成噪点(规格 03 §4B 明确要求独立路径)。
 *
 * 所有函数不依赖 DOM;图片解码与 canvas 读取在组件层完成。
 */

import {
  createProject,
  validateProject,
  PROJECT_SCHEMA_VERSION,
} from '../project/projectModel'
import { detectChartGrid } from './gridDetector'
import { sampleGridColors, mapCellsToPalette, estimateBackground, countUncertain } from './cellSampler'

/** 手动/检测允许的网格范围(与画布一致) */
export const CHART_MIN_DIMENSION = 2
export const CHART_MAX_DIMENSION = 200

/** 单次识别最多采样的格子数,与画布上限一致 */
export const CHART_MAX_CELLS = CHART_MAX_DIMENSION * CHART_MAX_DIMENSION

export const CHART_ERROR_CODES = Object.freeze({
  INVALID_IMAGE: 'chartInvalidImage',
  INVALID_GRID: 'chartInvalidGrid',
  GRID_TOO_LARGE: 'chartGridTooLarge',
  SAMPLE_FAILED: 'chartSampleFailed',
})

const err = (code, detail) => (detail === undefined ? { code } : { code, detail })

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0
}

/**
 * 检测图片中的图纸网格。结果不可靠时 status='failed' + reason,由 UI 提示手动设置。
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData - 工作分辨率像素
 * @returns {ReturnType<typeof detectChartGrid>}
 */
export function analyzeChart(imageData) {
  if (!imageData?.data) {
    return { ok: false, status: 'failed', reason: 'invalidImage', confidence: 0 }
  }
  return detectChartGrid(imageData, {
    maxGrid: CHART_MAX_DIMENSION,
  })
}

/**
 * 由「图片 + 网格参数」生成项目。
 *
 * @param {Object} params
 * @param {{data: Uint8ClampedArray, width: number, height: number}} params.imageData
 * @param {{x0:number,y0:number,x1:number,y1:number}} params.bounds - 网格线位置(工作分辨率坐标)
 * @param {number} params.cols
 * @param {number} params.rows
 * @param {Array<{id:string,hex:string,rgb:{r:number,g:number,b:number}}>} params.paletteColors
 * @param {string} [params.paletteId='mard']
 * @param {string} [params.name]
 * @param {string|null} [params.filename]
 * @param {boolean} [params.removeBackground=true] - 是否把与背景接近的格子判为空白
 * @param {number} [params.sampleRatio=0.5]
 * @param {Map<string, string|null>|Object<string, string|null>} [params.overrides]
 *   人工修正:`"x,y"` → hex 或 null(空白)。键为**列,行**(从 0 开始)。
 * @returns {{
 *   ok: true,
 *   project: Object,
 *   stats: { colorIds: string[], colorCount: number, beadCount: number, blankCount: number,
 *            uncertainCount: number, deltaEmax: number, overrideCount: number }
 * } | { ok: false, errors: Array<{code:string, detail?:string}> }}
 */
export function buildChartProject({
  imageData,
  bounds,
  cols,
  rows,
  paletteColors,
  paletteId = 'mard',
  name = '',
  filename = null,
  removeBackground = true,
  sampleRatio = 0.5,
  overrides = null,
}) {
  if (!imageData?.data || !bounds) {
    return { ok: false, errors: [err(CHART_ERROR_CODES.INVALID_IMAGE)] }
  }
  if (!isPositiveInt(cols) || !isPositiveInt(rows)) {
    return { ok: false, errors: [err(CHART_ERROR_CODES.INVALID_GRID, `${cols}x${rows}`)] }
  }
  if (cols > CHART_MAX_DIMENSION || rows > CHART_MAX_DIMENSION || cols * rows > CHART_MAX_CELLS) {
    return { ok: false, errors: [err(CHART_ERROR_CODES.GRID_TOO_LARGE, `${cols}x${rows}`)] }
  }
  if (!Array.isArray(paletteColors) || paletteColors.length === 0) {
    return { ok: false, errors: [err(CHART_ERROR_CODES.SAMPLE_FAILED)] }
  }
  // 边界必须落在图片内且不退化
  const { width, height } = imageData
  const b = {
    x0: Math.max(0, Math.min(bounds.x0, width - 1)),
    y0: Math.max(0, Math.min(bounds.y0, height - 1)),
    x1: Math.max(0, Math.min(bounds.x1, width)),
    y1: Math.max(0, Math.min(bounds.y1, height)),
  }
  if (b.x1 - b.x0 < cols || b.y1 - b.y0 < rows) {
    return { ok: false, errors: [err(CHART_ERROR_CODES.INVALID_GRID)] }
  }

  const background = removeBackground ? estimateBackground(imageData) : null
  const sampled = sampleGridColors(imageData, b, cols, rows, {
    sampleRatio,
    background,
    blankDeltaE: removeBackground ? undefined : 0,
  })
  if (!sampled.cells.length) {
    return { ok: false, errors: [err(CHART_ERROR_CODES.SAMPLE_FAILED)] }
  }

  const mapped = mapCellsToPalette(sampled.cells, paletteColors)

  // 人工修正:用户在预览里把某格指定为某个颜色或空白。覆盖发生在配色之后,
  // 因此被修正的格子不再计入「不确定」统计。
  const overrideMap = overrides instanceof Map ? overrides : new Map(Object.entries(overrides || {}))
  let overrideCount = 0
  for (const [key, value] of overrideMap) {
    const [xs, ys] = String(key).split(',')
    const x = Number(xs)
    const y = Number(ys)
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue
    if (x < 0 || x >= cols || y < 0 || y >= rows) continue
    mapped.hexCells[y][x] = value || null
    mapped.deltaEs[y][x] = null
    overrideCount++
  }

  const colorIds = []
  const seen = new Set()
  const hexToId = new Map(paletteColors.map((c) => [c.hex.toUpperCase(), c.id]))
  for (const row of mapped.hexCells) {
    for (const hex of row) {
      if (!hex) continue
      const id = hexToId.get(hex.toUpperCase()) || hex
      if (!seen.has(id)) { seen.add(id); colorIds.push(id) }
    }
  }

  const uncertainCount = countUncertain(mapped.deltaEs)

  const project = createProject({
    cells: mapped.hexCells,
    name: name || '',
    paletteId,
  })
  project.source = {
    ...project.source,
    kind: 'chart-import',
    filename: filename || null,
    mimeType: null,
    sourceTemplateId: null,
    attribution: null,
  }
  project.schemaVersion = PROJECT_SCHEMA_VERSION

  // 尺寸/矩形性/颜色白名单统一由项目模型兜底,避免识别层与存储层各写一套校验
  const validation = validateProject(project, { minDimension: 1 })
  if (!validation.ok) {
    return { ok: false, errors: validation.errors }
  }

  let blankCount = 0
  let beadCount = 0
  let deltaEmax = 0
  for (const row of mapped.hexCells) {
    for (const hex of row) {
      if (hex) beadCount++
      else blankCount++
    }
  }
  for (const row of mapped.deltaEs) {
    for (const d of row) if (d != null && d > deltaEmax) deltaEmax = d
  }

  return {
    ok: true,
    project,
    stats: {
      colorIds,
      colorCount: colorIds.length,
      beadCount,
      blankCount,
      uncertainCount,
      deltaEmax,
      overrideCount,
    },
  }
}
