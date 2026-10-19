/**
 * projectModel — 版本化拼豆图纸项目模型
 *
 * 定位:个人图纸的**持久化/交换契约**(不是导出 DTO)。
 * 与 PatternDocument 的分工:
 *   - PatternDocument v2 只承载渲染布局(表头/图例/面板),用于 PNG/SVG 导出;
 *   - BeadPatternProject 承载可继续编辑的矩阵与来源/隐私/修订元数据。
 *
 * 契约要点(与 docs/agent-spec/03 一致):
 *   - cells 为等长二维数组,值只能是 null 或大写 #RRGGBB;
 *   - grid.width/height 是权威尺寸,兼容旧 gridSize/gridWidth/gridHeight;
 *   - 统计值(颜色数/总颗数)不作为权威字段持久化,由 cells 计算;
 *   - source/privacy/revision/settings 为可选扩展,旧数据读取时补默认值。
 *
 * 纯函数模块:不依赖 React、浏览器 API 或 Supabase,可在 Node/测试中直接运行。
 */

export const PROJECT_SCHEMA_VERSION = 1

/** 与 Tools.jsx / MobileToolbar.jsx 的自定义尺寸上下限一致(9–200) */
export const MIN_GRID_DIMENSION = 9
export const MAX_GRID_DIMENSION = 200
/** 单项目最大格子数:200×200,防止导入超大 JSON 卡死 */
export const MAX_GRID_CELLS = MAX_GRID_DIMENSION * MAX_GRID_DIMENSION

export const SOURCE_KINDS = Object.freeze([
  'blank',
  'photo-quantized',
  'chart-import',
  'native-file',
  'gallery-copy',
  'legacy-work',
])

export const VISIBILITIES = Object.freeze(['private'])

const HEX_RE = /^#[0-9A-Fa-f]{6}$/
const MAX_NAME_LENGTH = 120

/** 错误码 → 稳定标识,供 UI 映射 i18n 文案(不在此模块内翻译) */
export const PROJECT_ERROR_CODES = Object.freeze({
  NOT_OBJECT: 'notObject',
  UNSUPPORTED_VERSION: 'unsupportedVersion',
  MISSING_GRID: 'missingGrid',
  INVALID_DIMENSION: 'invalidDimension',
  DIMENSION_TOO_SMALL: 'dimensionTooSmall',
  DIMENSION_TOO_LARGE: 'dimensionTooLarge',
  GRID_TOO_LARGE: 'gridTooLarge',
  CELLS_NOT_ARRAY: 'cellsNotArray',
  ROW_COUNT_MISMATCH: 'rowCountMismatch',
  ROW_LENGTH_MISMATCH: 'rowLengthMismatch',
  ROW_NOT_ARRAY: 'rowNotArray',
  INVALID_COLOR: 'invalidColor',
  NAME_TOO_LONG: 'nameTooLong',
  INVALID_SOURCE_KIND: 'invalidSourceKind',
  INVALID_VISIBILITY: 'invalidVisibility',
})

function err(code, detail) {
  return detail === undefined ? { code } : { code, detail }
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function toIso(value) {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * 生成项目 id。
 * 优先 crypto.randomUUID(浏览器/Node 18+ 都有);测试或老环境回退时间戳+随机串。
 */
export function createProjectId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* 落到回退分支 */ }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 从 cells 推导宽高(行数 = 高,最大行长 = 宽)。
 * 不等长行由 validateProject 拒绝,此函数只做无校验推导。
 */
export function deriveGridDimensions(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return { width: 0, height: 0 }
  let width = 0
  for (const row of cells) {
    if (Array.isArray(row) && row.length > width) width = row.length
  }
  return { width, height: cells.length }
}

/**
 * 创建规范化项目对象(不校验,调用方需要保证输入合法;validateProject 负责校验)。
 *
 * @param {Object} params
 * @param {Array<Array<string|null>>} params.cells
 * @param {string} [params.name]
 * @param {string} [params.paletteId]
 * @param {Object} [params.source]
 * @param {string} [params.id]
 * @param {string} [params.createdAt]
 * @returns {Object} BeadPatternProject
 */
export function createProject({
  cells,
  name = '',
  paletteId = 'perler',
  source = null,
  id = null,
  createdAt = null,
} = {}) {
  const { width, height } = deriveGridDimensions(cells)
  const now = new Date().toISOString()
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: id || createProjectId(),
    name: typeof name === 'string' ? name.slice(0, MAX_NAME_LENGTH) : '',
    createdAt: toIso(createdAt) || now,
    updatedAt: now,
    grid: {
      width,
      height,
      cells: Array.isArray(cells) ? cells.map((row) => (Array.isArray(row) ? [...row] : [])) : [],
    },
    palette: {
      paletteId: paletteId || 'perler',
      sourcePaletteId: null,
    },
    source: {
      kind: 'blank',
      filename: null,
      mimeType: null,
      sourceTemplateId: null,
      attribution: null,
      ...(isPlainObject(source) ? source : {}),
    },
    privacy: { visibility: 'private' },
    revision: { parentRevisionId: null, note: null },
    settings: { showGrid: true, showCoordinates: true },
  }
}

/**
 * 校验项目对象。
 *
 * @param {*} input
 * @param {Object} [options]
 * @param {number} [options.minDimension=MIN_GRID_DIMENSION]
 * @param {number} [options.maxDimension=MAX_GRID_DIMENSION]
 * @param {boolean} [options.requireSchemaVersion=true] - 旧格式(如模板 JSON)可传 false
 * @returns {{ ok: boolean, errors: Array<{code: string, detail?: string}> }}
 */
export function validateProject(input, options = {}) {
  const {
    minDimension = MIN_GRID_DIMENSION,
    maxDimension = MAX_GRID_DIMENSION,
    requireSchemaVersion = true,
  } = options
  const errors = []

  if (!isPlainObject(input)) return { ok: false, errors: [err(PROJECT_ERROR_CODES.NOT_OBJECT)] }

  if (requireSchemaVersion) {
    if (input.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      return {
        ok: false,
        errors: [err(PROJECT_ERROR_CODES.UNSUPPORTED_VERSION, String(input.schemaVersion))],
      }
    }
  }

  if (typeof input.name === 'string' && input.name.length > MAX_NAME_LENGTH) {
    errors.push(err(PROJECT_ERROR_CODES.NAME_TOO_LONG))
  }

  const grid = input.grid
  if (!isPlainObject(grid)) {
    return { ok: false, errors: [...errors, err(PROJECT_ERROR_CODES.MISSING_GRID)] }
  }

  const { width, height } = grid
  // 尺寸「不可用」(非正整数)与尺寸「越界」(整数但超出 9–200)要分开:
  //   · 不可用 → width 不能参与任何比对,逐行长度校验必须跳过;
  //   · 越界 → width 仍是可信整数,但**只有当数据本身也参差时**才继续逐行比对。
  //     声明 width=500、每行却都整齐地是 35 时,逐行比对只会产生 20 条同源噪音,
  //     把「宽度写错了」这个唯一根因淹掉;而声明 width=3、各行是 3/3/1 时,
  //     数据确实不齐,行长度错误是独立信息,应当保留。
  let widthUsable = true
  for (const [label, value] of [['width', width], ['height', height]]) {
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(err(PROJECT_ERROR_CODES.INVALID_DIMENSION, label))
      if (label === 'width') widthUsable = false
    } else if (value < minDimension) {
      errors.push(err(PROJECT_ERROR_CODES.DIMENSION_TOO_SMALL, `${label}=${value}`))
    } else if (value > maxDimension) {
      errors.push(err(PROJECT_ERROR_CODES.DIMENSION_TOO_LARGE, `${label}=${value}`))
    }
  }

  if (!Array.isArray(grid.cells)) {
    return { ok: false, errors: [...errors, err(PROJECT_ERROR_CODES.CELLS_NOT_ARRAY)] }
  }

  const cells = grid.cells
  if (cells.length !== height) {
    errors.push(err(PROJECT_ERROR_CODES.ROW_COUNT_MISMATCH, `${cells.length} vs ${height}`))
  }
  if (Number.isInteger(width) && Number.isInteger(height) && width * height > MAX_GRID_CELLS) {
    errors.push(err(PROJECT_ERROR_CODES.GRID_TOO_LARGE, `${width}x${height}`))
  }

  // 数据自身是否参差(行与行长度不同)。与 width 声明值无关。
  const rowLens = new Set()
  for (const row of cells) if (Array.isArray(row)) rowLens.add(row.length)
  const dataRagged = rowLens.size > 1

  // 只有在 width 可信、且「不齐是真实存在的」时才逐行报告。
  const checkRowLength = widthUsable && (width >= minDimension && width <= maxDimension || dataRagged)

  for (let y = 0; y < cells.length; y++) {
    const row = cells[y]
    if (!Array.isArray(row)) {
      errors.push(err(PROJECT_ERROR_CODES.ROW_NOT_ARRAY, `row ${y + 1}`))
      continue
    }
    if (checkRowLength && row.length !== width) {
      errors.push(err(PROJECT_ERROR_CODES.ROW_LENGTH_MISMATCH, `row ${y + 1}: ${row.length} vs ${width}`))
    }
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]
      if (cell === null) continue
      if (typeof cell !== 'string' || !HEX_RE.test(cell)) {
        errors.push(err(PROJECT_ERROR_CODES.INVALID_COLOR, `(${y + 1},${x + 1}): ${String(cell).slice(0, 12)}`))
      }
    }
  }

  if (isPlainObject(input.source) && input.source.kind != null
    && !SOURCE_KINDS.includes(input.source.kind)) {
    errors.push(err(PROJECT_ERROR_CODES.INVALID_SOURCE_KIND, String(input.source.kind)))
  }
  if (isPlainObject(input.privacy) && input.privacy.visibility != null
    && !VISIBILITIES.includes(input.privacy.visibility)) {
    errors.push(err(PROJECT_ERROR_CODES.INVALID_VISIBILITY, String(input.privacy.visibility)))
  }

  return { ok: errors.length === 0, errors }
}

/**
 * 归一化项目:校验通过后补齐可选字段、统一大写 HEX、复制数组(不修改入参)。
 * 校验失败返回 null(调用方应先 validateProject 取错误码)。
 *
 * @param {Object} input
 * @param {Object} [options] - 透传给 validateProject
 * @returns {Object|null}
 */
export function normalizeProject(input, options = {}) {
  const result = validateProject(input, options)
  if (!result.ok) return null

  const { width, height } = input.grid
  const cells = input.grid.cells.map((row) => row.map((cell) => (cell === null ? null : cell.toUpperCase())))
  const base = createProject({
    cells,
    name: input.name,
    paletteId: input.palette?.paletteId,
    id: input.id,
    createdAt: input.createdAt,
  })

  return {
    ...base,
    updatedAt: toIso(input.updatedAt) || base.updatedAt,
    grid: { width, height, cells },
    palette: {
      paletteId: input.palette?.paletteId || 'perler',
      sourcePaletteId: input.palette?.sourcePaletteId ?? null,
    },
    source: { ...base.source, ...(isPlainObject(input.source) ? input.source : {}) },
    privacy: { ...base.privacy, ...(isPlainObject(input.privacy) ? input.privacy : {}) },
    revision: { ...base.revision, ...(isPlainObject(input.revision) ? input.revision : {}) },
    settings: { ...base.settings, ...(isPlainObject(input.settings) ? input.settings : {}) },
  }
}

/**
 * 由项目对象计算统计(不持久化,按需计算)。
 * 与 PatternDocument.calculateColorStats 语义一致:按 hex 计数,按数量降序。
 *
 * @param {Object} project
 * @returns {{ colors: Array<{hex: string, count: number}>, totalBeads: number, colorCount: number }}
 */
export function computeProjectStats(project) {
  const counts = new Map()
  const cells = project?.grid?.cells || []
  for (const row of cells) {
    for (const cell of row) {
      if (!cell) continue
      counts.set(cell, (counts.get(cell) || 0) + 1)
    }
  }
  const colors = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
  return {
    colors,
    totalBeads: colors.reduce((sum, c) => sum + c.count, 0),
    colorCount: colors.length,
  }
}
