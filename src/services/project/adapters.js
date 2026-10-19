/**
 * adapters — 现有数据结构与 BeadPatternProject 之间的双向转换
 *
 * 覆盖 7 个方向(docs/agent-spec/03 §2.3):
 *   legacyWorkToProject      useSavedWorks / localStorage 作品 → 项目
 *   canvasToLegacyWork       画布状态 → 旧作品(保存路径,宽高由 cells 推导)
 *   normalizeLegacyWork      旧作品宽松归一(存储层读写收口,不校验、不丢字段)
 *   projectToLegacyWork      项目 → 现有保存/载入工作流所需的字段
 *   templateToProject        模板/公共图纸 → 个人项目(gallery-copy,新 id)
 *   projectToTemplatePayload 项目 → 模板 JSON(仅管理员显式发布)
 *   projectToPatternDocument 项目 → PatternDocument v2(导出链路)
 *
 * 设计约束:
 *   - 全部纯函数,不读写存储、不依赖 React;
 *   - 非无损转换必须在函数注释中写明丢失字段(见 projectToLegacyWork);
 *   - 不修改入参(所有输出都是新数组/新对象)。
 */

import { createProject, normalizeProject, validateProject, deriveGridDimensions, PROJECT_SCHEMA_VERSION } from './projectModel'
import { createPatternDocument } from '../export/PatternDocument'
import { getPalette } from '../../data/palettes'

/** 从旧作品的 gridSize/gridWidth/gridHeight 推导真实宽高 */
function legacyDimensions(work) {
  const size = Number(work?.gridSize) || 0
  const width = Number(work?.gridWidth) || size
  const height = Number(work?.gridHeight) || size
  return { width, height }
}

/**
 * 旧作品 → 项目。
 *
 * 输入:`{ id, name, canvasData, gridSize, gridWidth, gridHeight, paletteId, savedAt }`
 * 输出:BeadPatternProject。
 *
 * 注意:旧数据可能行不等长或含非 hex 值(历史 bug),这里**不做校验**,
 * 只做结构映射 —— 校验由 normalizeProject/validateProject 在调用侧显式执行,
 * 以便区分「数据本身坏了」与「转换错了」。
 *
 * @param {Object} work
 * @param {Object} [options]
 * @param {string} [options.id] - 覆盖项目 id(默认复用 work.id 的字符串形式)
 * @returns {Object|null} work 非法时返回 null
 */
export function legacyWorkToProject(work, options = {}) {
  if (!work || !Array.isArray(work.canvasData)) return null
  const { width, height } = legacyDimensions(work)
  const cells = work.canvasData.map((row) => (Array.isArray(row) ? [...row] : []))

  const project = createProject({
    cells,
    name: work.name || '',
    paletteId: work.paletteId || 'perler',
    id: options.id || (work.id != null ? String(work.id) : null),
    createdAt: work.savedAt || null,
  })
  // 宽高以旧字段为准(可能大于 cells 的实际行长,用于保留「声明尺寸」语义)
  if (width > 0 && height > 0) {
    project.grid.width = width
    project.grid.height = height
  }
  project.updatedAt = work.savedAt || project.updatedAt
  project.source = {
    ...project.source,
    kind: 'legacy-work',
  }
  return project
}

/**
 * 画布状态 → 旧作品(保存路径)。
 *
 * 宽高**由 cells 实际形状推导**,而不是采信调用方传入的 gridSize/gridWidth/gridHeight:
 * 历史上有过声明尺寸与数据不一致的保存(量化/模板载入路径各自维护一套状态),
 * 以数据为准才能保证存下去的作品下次载入不偏移。
 *
 * 空画布(无 cells)没有保存意义,返回 null 由调用方跳过。
 *
 * @param {Object} params
 * @param {Array<Array<string|null>>} params.canvasData
 * @param {string} [params.name]
 * @param {string} [params.paletteId]
 * @param {string|number} [params.id]
 * @param {string} [params.savedAt]
 * @returns {Object|null}
 */
export function canvasToLegacyWork({
  canvasData,
  name = '',
  paletteId = 'perler',
  id = null,
  savedAt = null,
  sourceTemplateId = null,
} = {}) {
  if (!Array.isArray(canvasData) || canvasData.length === 0) return null

  // 不走 createProject + projectToLegacyWork:后者会把 name 截断到 120 字、
  // 把 paletteId 归一化,保存路径应当**原样**保留用户输入(旧行为如此),
  // 只需让尺寸与数据形状一致。
  const { width, height } = deriveGridDimensions(canvasData)
  const isSquare = width === height
  return {
    id: id ?? Date.now(),
    name,
    canvasData: canvasData.map((row) => [...row]),
    gridSize: Math.max(width, height),
    gridWidth: isSquare ? null : width,
    gridHeight: isSquare ? null : height,
    paletteId: paletteId || 'perler',
    savedAt: savedAt || new Date().toISOString(),
    // 图库复制溯源(可选):不参与尺寸/渲染,原样保留
    ...(sourceTemplateId !== null && sourceTemplateId !== undefined
      ? { sourceTemplateId }
      : {}),
  }
}

/**
 * 旧作品宽松归一(存储层读写收口)。
 *
 * 只重算尺寸相关字段(`gridSize/gridWidth/gridHeight`),其余字段原样保留
 * (spread),因此历史数据里的未知字段不会被丢掉。尺寸以 `canvasData` 的
 * **实际形状**为准:声明尺寸与数据不一致的旧作品(历史上不同路径各自维护
 * 尺寸状态)在载入后不再错位。
 *
 * 不做颜色校验、不拒绝任何行:品牌色号(`'P18'`)与参差行都保留原值,
 * 由画布/缩略图自行解析 —— 在这里拒绝会让老用户的作品直接打不开。
 *
 * @param {Object} work
 * @returns {Object} 归一后的 work;无法归一(非作品/空画布)时原样返回
 */
export function normalizeLegacyWork(work) {
  if (!work || typeof work !== 'object' || !Array.isArray(work.canvasData)) return work
  const { width, height } = deriveGridDimensions(work.canvasData)
  if (width <= 0 || height <= 0) return work

  const canvasData = work.canvasData.map((row) => {
    const safe = Array.isArray(row) ? row : []
    if (safe.length === width) return safe
    if (safe.length > width) return safe.slice(0, width)
    return [...safe, ...Array(width - safe.length).fill(null)]
  })
  const isSquare = width === height
  return {
    ...work,
    canvasData,
    gridSize: Math.max(width, height),
    gridWidth: isSquare ? null : width,
    gridHeight: isSquare ? null : height,
  }
}

/**
 * 项目 → 旧工作流字段。
 *
 * 输出与 `App.handleConfirmSave` / `useSavedWorks.workToRow` 消费的字段完全一致:
 * `{ id, name, canvasData, gridSize, gridWidth, gridHeight, paletteId, savedAt }`。
 *
 * **非无损**:丢失 `schemaVersion/createdAt/updatedAt/source/privacy/revision/settings`。
 * 这是刻意的 —— 旧工作流不认识这些字段;需要完整往返请使用项目 JSON 文件。
 * `id` 若为 UUID 字符串会原样返回,旧代码只把它当作渲染 key / 删除标识。
 *
 * @param {Object} project
 * @param {Object} [options]
 * @param {string|number} [options.savedAt] - 覆盖保存时间(默认用 project.updatedAt)
 * @returns {Object|null}
 */
export function projectToLegacyWork(project, options = {}) {
  const grid = project?.grid
  if (!grid || !Array.isArray(grid.cells)) return null
  const width = grid.width
  const height = grid.height
  const isSquare = width === height
  return {
    id: project.id,
    name: project.name || '',
    canvasData: grid.cells.map((row) => [...row]),
    // 方形项目沿用 gridSize,矩形项目同时给出真实宽高(与现有 work 字段语义一致)
    gridSize: Math.max(width, height),
    gridWidth: isSquare ? null : width,
    gridHeight: isSquare ? null : height,
    paletteId: project.palette?.paletteId || 'perler',
    savedAt: options.savedAt || project.updatedAt || project.createdAt || new Date().toISOString(),
  }
}

/**
 * 模板 → 项目。
 *
 * 输入:内置模板或 `normalizeCustomTemplate` 的输出
 * `{ id, name, nameZh, category, difficulty, size, pattern, paletteId }`。
 *
 * 行为:
 *   - 始终生成**新 id**(复制语义,不污染源模板);
 *   - `source.kind = 'gallery-copy'`,并记录源模板 id 与归属;
 *   - 宽高由 pattern 实际形状推导(修复模板 `size` 单值丢失矩形信息的问题)。
 *
 * @param {Object} template
 * @param {Object} [options]
 * @param {string} [options.name] - 覆盖项目名(默认 nameZh || name)
 * @returns {Object|null}
 */
export function templateToProject(template, options = {}) {
  if (!template || !Array.isArray(template.pattern)) return null
  const cells = template.pattern.map((row) => (Array.isArray(row) ? [...row] : []))
  const project = createProject({
    cells,
    name: options.name ?? (template.nameZh || template.name || ''),
    paletteId: template.paletteId || 'perler',
  })
  project.source = {
    ...project.source,
    kind: 'gallery-copy',
    sourceTemplateId: template.id != null ? String(template.id) : null,
    attribution: template.nameZh || template.name || null,
  }
  return project
}

/**
 * 项目 → 模板 JSON 负载(仅管理员/显式发布)。
 *
 * 输出可直接交给 `normalizeCustomTemplate` 或写入 `templates` 表:
 * `{ name, nameZh, category, difficulty, paletteId, pattern }`。
 *
 * **不**包含项目 id / createdAt / source —— 发布是「内容复制」,不是身份迁移。
 * 分类/难度需调用方提供(项目模型不承载图库分类)。
 *
 * @param {Object} project
 * @param {Object} options
 * @param {string} options.category - 必填,图库分类 id
 * @param {string} [options.difficulty='easy']
 * @param {string} [options.nameZh]
 * @returns {Object|null}
 */
export function projectToTemplatePayload(project, options = {}) {
  const grid = project?.grid
  if (!grid || !Array.isArray(grid.cells)) return null
  const { category, difficulty = 'easy', nameZh = '' } = options
  if (!category) return null
  return {
    name: project.name || '',
    nameZh,
    category,
    difficulty,
    paletteId: project.palette?.paletteId || 'perler',
    pattern: grid.cells.map((row) => [...row]),
  }
}

/**
 * 项目 → PatternDocument v2(导出链路)。
 *
 * 复用现有 `createPatternDocument`,保证 RasterRenderer/VectorRenderer 合同不变。
 * 品牌色卡对象由 `paletteId` 解析(与 ExportPanel 现有行为一致)。
 *
 * @param {Object} project
 * @param {Object} [exportOptions]
 * @param {string} [exportOptions.beadStyle='professional']
 * @param {string} [exportOptions.designName] - 覆盖图纸名(默认 project.name)
 * @returns {Object|null}
 */
export function projectToPatternDocument(project, exportOptions = {}) {
  const grid = project?.grid
  if (!grid || !Array.isArray(grid.cells)) return null
  const paletteId = project.palette?.paletteId || 'perler'
  const { beadStyle = 'professional', designName } = exportOptions
  return createPatternDocument({
    canvasData: grid.cells.map((row) => [...row]),
    gridSize: Math.max(grid.width, grid.height),
    gridWidth: grid.width,
    gridHeight: grid.height,
    paletteId,
    designName: designName ?? project.name ?? '',
    beadStyle,
    palette: getPalette(paletteId),
  })
}

/**
 * 校验并归一化任意来源的项目输入(原生 JSON 文件、旧作品转换结果等)。
 * 校验失败时返回错误码列表,不抛异常。
 *
 * @param {*} input
 * @param {Object} [options]
 * @param {boolean} [options.allowLegacyShape=false] - 允许无 schemaVersion 的旧结构
 * @returns {{ ok: true, project: Object } | { ok: false, errors: Array }}
 */
export function parseProject(input, options = {}) {
  const { allowLegacyShape = false, ...rest } = options

  // 旧作品形状(有 canvasData、无 grid)→ 先转换再校验
  if (allowLegacyShape && input && !input.grid && Array.isArray(input.canvasData)) {
    const project = legacyWorkToProject(input)
    const normalized = normalizeProject(project, { ...rest, requireSchemaVersion: false })
    return normalized ? { ok: true, project: normalized } : { ok: false, errors: [] }
  }

  const normalized = normalizeProject(input, {
    ...rest,
    requireSchemaVersion: !allowLegacyShape,
  })
  if (!normalized) {
    // 复用 validateProject 的错误明细(不重复实现校验逻辑)
    return {
      ok: false,
      errors: validateProject(input, { ...rest, requireSchemaVersion: !allowLegacyShape }).errors,
    }
  }
  return { ok: true, project: normalized }
}

export { PROJECT_SCHEMA_VERSION }
