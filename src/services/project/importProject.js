/**
 * importProject — 原生项目文件 / 旧模板 JSON 的导入解析与校验
 *
 * 规格来源:docs/agent-spec/03 §3–§5。
 *
 * 设计要点:
 *   - **纯函数、无 DOM**:文件读取(FileReader)与 UI 反馈留在组件层,
 *     这里只处理「已读到的文本/对象」,便于在 Node 与测试中直接验证;
 *   - **绝不半成功**:校验失败返回错误码列表,不返回部分矩阵 —— 半张图纸
 *     比明确失败更危险(用户会以为导入成功);
 *   - **不信任文件内容**:任何字段都先做类型/范围检查再使用,不执行、
 *     不注入、不把字符串当 HTML;
 *   - 错误码稳定(供 4 语言 i18n 映射),detail 只作调试提示。
 *
 * 支持两种输入:
 *   1. 原生项目文件 `.pindou.json` —— 必须有 schemaVersion,走 validateProject;
 *   2. 旧模板 JSON —— `{ name, nameZh?, category, difficulty?, pattern, paletteId? }`,
 *      走 normalizeCustomTemplate,再转成个人项目(gallery-copy 语义)。
 *      这是项目既有协议,不额外新增格式。
 */

import { normalizeProject, validateProject, PROJECT_ERROR_CODES, PROJECT_SCHEMA_VERSION, SOURCE_KINDS } from './projectModel'
import { legacyWorkToProject } from './adapters'
import { normalizeCustomTemplate } from '../../data/templates'

/** 文件字节上限:5MB。
 *  单张图纸不会撞到这条线 —— 200×200 满格按导出格式序列化实测约 0.38MB。
 *  真正需要余量的是**数组文件**:一个文件里最多可含 MAX_IMPORT_ITEMS 张图纸,
 *  每张 200×200 满格约 0.38MB,三张就超过原先的 1MB 上限。5MB 大约能放下
 *  13 张满格大图纸,覆盖「一次导入一批」的正常用法。
 *  主线程 JSON.parse 5MB 约几十毫秒,不会卡住界面;上限继续由 maxBytes 兜底,
 *  不做流式解析。注意:后台模板导入(AdminPanel)有自己独立的 1MB 上限。 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
/** 单次导入条目上限(数组文件),防止误传批量数据把界面卡死 */
export const MAX_IMPORT_ITEMS = 50

/** 导入层错误码(与 projectModel 的校验错误码并列,前缀区分来源) */
export const IMPORT_ERROR_CODES = Object.freeze({
  EMPTY: 'empty',                       // 空文本 / 空文件
  FILE_TOO_LARGE: 'fileTooLarge',       // 超过 MAX_IMPORT_BYTES
  TOO_MANY_ITEMS: 'tooManyItems',       // 数组超过 MAX_IMPORT_ITEMS
  JSON_PARSE: 'jsonParse',              // JSON.parse 失败
  NOT_JSON: 'notJson',                  // 文件扩展名/MIME 不是 JSON(读取前拒绝)
  UNRECOGNIZED: 'unrecognized',         // 既不是项目也不是模板
  TEMPLATE_INVALID: 'templateInvalid',  // 模板协议校验失败
  LEGACY_UNSUPPORTED: 'legacyUnsupported', // 旧作品形状但缺少必要字段
})

const err = (code, detail) => (detail === undefined ? { code } : { code, detail })

/** 判断是否「像」一个项目对象(有 grid 或 schemaVersion) */
function looksLikeProject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (value.grid != null || value.schemaVersion != null)
}

/** 判断是否「像」模板协议(有 pattern 数组) */
function looksLikeTemplate(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Array.isArray(value.pattern)
}

/** 判断是否「像」旧作品(有 canvasData 数组) */
function looksLikeLegacyWork(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Array.isArray(value.canvasData)
}

/**
 * 解析单个项目对象。
 * @returns {{ ok: true, project: Object } | { ok: false, errors: Array }}
 */
function parseProjectItem(item, options) {
  if (looksLikeProject(item)) {
    const normalized = normalizeProject(item, options)
    if (normalized) return { ok: true, project: normalized }
    const { errors } = validateProject(item, options)
    // validateProject 对未知版本会提前返回,保证错误码可识别
    return { ok: false, errors: errors.length ? errors : [err(PROJECT_ERROR_CODES.NOT_OBJECT)] }
  }

  // 旧作品形状:仅当显式允许时转换(导入个人项目文件时不允许,
  // 避免把「别人的作品备份」当成项目静默接受)
  if (options.allowLegacyShape && looksLikeLegacyWork(item)) {
    const project = legacyWorkToProject(item)
    if (!project) return { ok: false, errors: [err(IMPORT_ERROR_CODES.LEGACY_UNSUPPORTED)] }
    const normalized = normalizeProject(project, { ...options, requireSchemaVersion: false })
    if (normalized) return { ok: true, project: normalized }
    return { ok: false, errors: validateProject(project, { ...options, requireSchemaVersion: false }).errors }
  }

  if (looksLikeTemplate(item)) {
    const res = normalizeCustomTemplate(item)
    if (!res.ok) {
      return { ok: false, errors: res.errors.map(e => err(e.code, e.detail)) }
    }
    const tpl = res.template
    // 模板 → 项目:与 adapters.templateToProject 同语义,但这里直接构造,
    // 避免循环依赖(templateToProject 依赖 getPalette,导入不需要色卡实例)
    const project = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: null,
      name: tpl.nameZh || tpl.name || '',
      grid: {
        width: tpl.gridWidth,
        height: tpl.gridHeight,
        cells: tpl.pattern,
      },
      palette: { paletteId: tpl.paletteId || 'perler', sourcePaletteId: null },
      source: {
        kind: 'chart-import',
        filename: null,
        mimeType: null,
        sourceTemplateId: null,
        attribution: tpl.nameZh || tpl.name || null,
      },
      privacy: { visibility: 'private' },
      revision: { parentRevisionId: null, note: null },
      settings: { showGrid: true, showCoordinates: true },
    }
    // 模板路径放宽下限:既有模板协议允许小尺寸图案(内置模板之外的自定义模板
    // 可能只有几格),若按画布 9 格下限拒绝,会让「本来能载入的模板」导入失败。
    // 上限与颜色/矩形性校验保持不变。
    const normalized = normalizeProject(project, { ...options, minDimension: 1, requireSchemaVersion: true })
    if (normalized) return { ok: true, project: normalized }
    return {
      ok: false,
      errors: [{ code: IMPORT_ERROR_CODES.TEMPLATE_INVALID, detail: tpl.name || '' }],
    }
  }

  return { ok: false, errors: [err(IMPORT_ERROR_CODES.UNRECOGNIZED)] }
}

/**
 * 解析导入文本。
 *
 * @param {string} text - 已读取的文件/粘贴内容
 * @param {Object} [options]
 * @param {number} [options.maxBytes=MAX_IMPORT_BYTES]
 * @param {boolean} [options.allowLegacyShape=false] - 是否接受旧作品形状
 * @param {boolean} [options.allowTemplate=true] - 是否接受模板协议
 * @returns {{ ok: true, projects: Object[] } | { ok: false, errors: Array }}
 */
export function parseImportText(text, options = {}) {
  const {
    maxBytes = MAX_IMPORT_BYTES,
    allowLegacyShape = false,
    allowTemplate = true,
    ...projectOptions
  } = options

  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, errors: [err(IMPORT_ERROR_CODES.EMPTY)] }
  }
  // 按 UTF-8 字节估算(中文 3 字节),不依赖 TextEncoder 在旧环境的存在性
  const byteLength = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(text).length
    : text.length * 2
  if (byteLength > maxBytes) {
    return { ok: false, errors: [err(IMPORT_ERROR_CODES.FILE_TOO_LARGE, String(byteLength))] }
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [err(IMPORT_ERROR_CODES.JSON_PARSE, e.message)] }
  }

  const items = Array.isArray(parsed) ? parsed : [parsed]
  if (items.length === 0) return { ok: false, errors: [err(IMPORT_ERROR_CODES.EMPTY)] }
  if (items.length > MAX_IMPORT_ITEMS) {
    return { ok: false, errors: [err(IMPORT_ERROR_CODES.TOO_MANY_ITEMS, String(items.length))] }
  }

  const projects = []
  const errors = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const itemOptions = { ...projectOptions, allowLegacyShape }
    if (!allowTemplate && looksLikeTemplate(item) && !looksLikeProject(item)) {
      errors.push(err(IMPORT_ERROR_CODES.UNRECOGNIZED, `#${i + 1}`))
      continue
    }
    const res = parseProjectItem(item, itemOptions)
    if (res.ok) projects.push(res.project)
    else errors.push(...res.errors.map(e => ({ ...e, index: i + 1 })))
  }

  // 任何一条失败即整体失败:不允许「部分成功」的半张图纸进入画布
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, projects }
}

/**
 * 文件级门控(不读内容):扩展名/MIME/字节数。
 * 与 imageGuard 同思路 —— 把明显不合法的文件挡在读取之前。
 *
 * 注意:扩展名与 MIME 都不可信,这里只做「快速拒绝」;
 * 真正的合法性由 parseImportText 的内容校验决定。
 *
 * @param {{ name?: string, type?: string, size?: number }} file
 * @param {Object} [options]
 * @returns {null|string} null = 通过,否则为 IMPORT_ERROR_CODES 的码
 */
export function checkImportFile(file, { maxBytes = MAX_IMPORT_BYTES } = {}) {
  if (!file) return IMPORT_ERROR_CODES.UNRECOGNIZED
  if (typeof file.size === 'number' && file.size > maxBytes) return IMPORT_ERROR_CODES.FILE_TOO_LARGE
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  const looksJson = name.endsWith('.json') || type === 'application/json' || type === 'text/json'
  // 与「内容无法识别」区分:这里是**文件类型**不对,提示用户换文件,
  // 而不是让他去怀疑文件内容
  return looksJson ? null : IMPORT_ERROR_CODES.NOT_JSON
}

/**
 * 把导入结果转成可直接保存的作品(旧 work 形状)。
 * 保存仍走 useSavedWorks,因此导入的作品与手绘作品共用同一套
 * 本地/云端双模式与配额保护 —— 不新增存储路径。
 *
 * @param {Object} project
 * @param {Object} [options]
 * @param {string} [options.savedAt]
 * @returns {Object|null}
 */
export function projectToImportWork(project, options = {}) {
  const grid = project?.grid
  if (!grid || !Array.isArray(grid.cells)) return null
  const isSquare = grid.width === grid.height
  const kind = project.source?.kind
  return {
    id: options.id ?? Date.now(),
    name: project.name || '',
    canvasData: grid.cells.map(row => [...row]),
    gridSize: Math.max(grid.width, grid.height),
    gridWidth: isSquare ? null : grid.width,
    gridHeight: isSquare ? null : grid.height,
    paletteId: project.palette?.paletteId || 'perler',
    savedAt: options.savedAt || project.updatedAt || project.createdAt || new Date().toISOString(),
    // 导入来源:随作品一起持久化,重新打开时仍能区分「导入 / 图库复制 / 手绘」。
    // 只接受白名单值 —— 文件内容不可信,不能让任意字符串进存储层。
    sourceKind: SOURCE_KINDS.includes(kind) ? kind : 'native-file',
  }
}

export { PROJECT_SCHEMA_VERSION }
