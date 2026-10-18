/**
 * exportProject — 原生项目文件(.pindou.json)导出
 *
 * 规格:docs/agent-spec/03 §3「首选格式」。
 *
 * 与 PNG/SVG 导出的分工:
 *   - PNG/SVG 是**成品**导出(渲染视图,不可再编辑);
 *   - .pindou.json 是**工程文件**导出(可无损重新导入继续编辑)。
 *
 * 安全约束(规格明文要求):文件里不得包含登录 token、Supabase secret、
 * 个人资料或 Turnstile token。因此这里只挑白名单字段写出,
 * **不**直接序列化内部项目对象 —— 内部对象将来加字段时不会意外泄漏。
 */

import { PROJECT_SCHEMA_VERSION } from './projectModel'

/** 导出文件扩展名 */
export const PROJECT_FILE_EXTENSION = '.pindou.json'

/** 只导出这些顶层字段(白名单,新增内部字段不会自动泄漏到文件) */
const EXPORTED_FIELDS = [
  'schemaVersion',
  'name',
  'createdAt',
  'updatedAt',
  'grid',
  'palette',
  'source',
  'privacy',
  'revision',
  'settings',
]

/**
 * 项目 → 可写入文件的普通对象。
 *
 * @param {Object} project
 * @returns {Object|null}
 */
export function projectToFileObject(project) {
  const grid = project?.grid
  if (!grid || !Array.isArray(grid.cells) || grid.cells.length === 0) return null
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.height)) return null

  const out = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: typeof project.name === 'string' ? project.name : '',
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null,
    grid: {
      width: grid.width,
      height: grid.height,
      // 深拷贝:导出对象与内存对象不共享数组引用
      cells: grid.cells.map(row => (Array.isArray(row) ? [...row] : [])),
    },
    palette: {
      paletteId: project.palette?.paletteId || 'perler',
      sourcePaletteId: project.palette?.sourcePaletteId ?? null,
    },
    source: {
      kind: project.source?.kind || 'native-file',
      filename: null,          // 不把用户本机文件名写进文件(隐私)
      mimeType: null,
      sourceTemplateId: project.source?.sourceTemplateId ?? null,
      attribution: project.source?.attribution ?? null,
    },
    privacy: { visibility: 'private' },
    revision: {
      parentRevisionId: project.revision?.parentRevisionId ?? null,
      note: project.revision?.note ?? null,
    },
    settings: {
      showGrid: project.settings?.showGrid !== false,
      showCoordinates: project.settings?.showCoordinates !== false,
    },
  }
  // 白名单自检:保证没有多余顶层字段被带出
  for (const key of Object.keys(out)) {
    if (!EXPORTED_FIELDS.includes(key)) delete out[key]
  }
  return out
}

/**
 * 项目 → JSON 文本(2 空格缩进,便于人工阅读/版本管理)。
 *
 * @param {Object} project
 * @returns {string|null}
 */
export function projectToFileText(project) {
  const obj = projectToFileObject(project)
  if (!obj) return null
  return JSON.stringify(obj, null, 2)
}

/**
 * 生成下载文件名:`<安全化名称>-<W>x<H>.pindou.json`。
 * 去掉路径分隔符与 Windows 非法字符,避免浏览器保存时静默改名。
 *
 * @param {Object} project
 * @param {string} [fallbackName]
 * @returns {string}
 */
export function projectFileName(project, fallbackName = 'pattern') {
  const raw = (project?.name || fallbackName || 'pattern').trim()
  const safe = raw
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
    .trim() || 'pattern'
  const w = project?.grid?.width ?? 0
  const h = project?.grid?.height ?? 0
  return `${safe}-${w}x${h}${PROJECT_FILE_EXTENSION}`
}

/**
 * 触发浏览器下载(唯一有副作用的一步,单独隔离便于测试替换)。
 *
 * @param {string} text
 * @param {string} filename
 * @param {Object} [deps] - 测试注入点
 */
export function downloadProjectFile(text, filename, deps = {}) {
  const {
    createObjectURL = (blob) => URL.createObjectURL(blob),
    revokeObjectURL = (url) => URL.revokeObjectURL(url),
    createElement = (tag) => document.createElement(tag),
    BlobCtor = Blob,
  } = deps

  const blob = new BlobCtor([text], { type: 'application/json;charset=utf-8' })
  const url = createObjectURL(blob)
  const link = createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // 立即回收:部分浏览器(尤其 Safari)在下载开始前 revoke 会失败,
  // 因此延迟一拍;失败不影响下载本身。
  setTimeout(() => { try { revokeObjectURL(url) } catch { /* 忽略 */ } }, 1000)
}
