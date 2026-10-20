/**
 * 批量颜色导入(规格 05 §2 P1:CSV / JSON)。
 *
 * 规格要求:
 *   - 提供模板下载;
 *   - 处理编码(BOM / 换行 / 引号转义);
 *   - 导入前预览并报告错误;
 *   - **不允许部分写入后无提示失败** —— 因此这里只产出「全部合法」或「带错误列表」,
 *     由调用方在全部校验通过后才一次性写入。
 *
 * 纯函数,不做文件 I/O。
 */

import { normalizeColorInput, COLOR_SOURCES } from './personalPalette'

export const IMPORT_ERRORS = Object.freeze({
  EMPTY: 'empty',
  NO_HEADER: 'noHeader',
  MISSING_COLUMN: 'missingColumn',
  TOO_MANY_ROWS: 'tooManyRows',
  BAD_JSON: 'badJson',
  BAD_SHAPE: 'badShape',
})

/** 单次导入上限:避免一次贴进上万行把界面卡死 */
export const MAX_IMPORT_ROWS = 2000

/** CSV 模板列(顺序即模板顺序) */
export const CSV_COLUMNS = ['code', 'name', 'hex', 'notes', 'source']

/**
 * 生成 CSV 模板文本(带 UTF-8 BOM,Excel 直接打开不乱码)。
 * @param {string} [sampleCode]
 */
export function buildCsvTemplate(sampleCode = 'A1') {
  const rows = [
    CSV_COLUMNS.join(','),
    `${sampleCode},白色,#FFFFFF,原厂色卡,${COLOR_SOURCES.FACTORY}`,
    'A2,黑色,#000000,,factory',
    'M1,我的混色,#7A5C3E,自己调的,estimated',
  ]
  // BOM:Excel 在没有 BOM 时按本地编码解析中文会乱码
  return '﻿' + rows.join('\r\n') + '\r\n'
}

/** 去掉 BOM 并统一换行 */
function normalizeText(text) {
  return String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

/**
 * 解析 CSV 文本(支持双引号包裹、引号内逗号与换行、`""` 转义)。
 * 不依赖第三方库:这里的 CSV 只需要处理常见的表格导出格式。
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const src = normalizeText(text)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      continue
    }
    field += ch
  }
  // 最后一行没有换行结尾时也要收进来
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // 丢弃完全空白的行(尾部空行很常见)
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''))
}

function headerIndex(header) {
  const map = new Map()
  header.forEach((h, i) => map.set(String(h).trim().toLowerCase(), i))
  return map
}

/**
 * 把 CSV 文本解析成颜色草稿列表。
 * @returns {{ ok: true, drafts: Array } | { ok: false, errors: Array }}
 */
export function parseColorsCsv(text, { existingColors = [] } = {}) {
  const rows = parseCsv(text)
  if (rows.length === 0) return { ok: false, errors: [{ code: IMPORT_ERRORS.EMPTY }] }
  // 只有一行:要么是「只有表头没有数据」,要么是直接把颜色行粘进来。
  // 用表头列判断,给出比「缺列」更准确的提示。
  if (rows.length === 1) {
    const only = headerIndex(rows[0])
    return {
      ok: false,
      errors: [{ code: only.has('code') && only.has('hex') ? IMPORT_ERRORS.EMPTY : IMPORT_ERRORS.NO_HEADER }],
    }
  }

  const idx = headerIndex(rows[0])
  if (!idx.has('code') || !idx.has('hex')) {
    return { ok: false, errors: [{ code: IMPORT_ERRORS.MISSING_COLUMN, detail: 'code,hex' }] }
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return { ok: false, errors: [{ code: IMPORT_ERRORS.TOO_MANY_ROWS, detail: String(MAX_IMPORT_ROWS) }] }
  }

  const drafts = []
  const errors = []
  const accepted = [...existingColors]

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const pick = (key) => (idx.has(key) ? String(row[idx.get(key)] ?? '').trim() : '')
    const input = {
      code: pick('code'),
      name: pick('name'),
      hex: pick('hex'),
      notes: pick('notes'),
      source: pick('source') || COLOR_SOURCES.FACTORY,
    }
    const res = normalizeColorInput(input, { existingColors: accepted })
    if (!res.ok) {
      // 行号按用户看到的表格行计(表头是第 1 行)
      errors.push({ row: r + 1, code: res.errors[0].code, detail: res.errors[0].detail })
      continue
    }
    drafts.push({ row: r + 1, ...res.color })
    accepted.push({ id: `__draft_${r}`, code: res.color.code })
  }

  if (drafts.length === 0 && errors.length > 0) return { ok: false, errors }
  return { ok: true, drafts, errors }
}

/**
 * 解析 JSON 颜色数组。接受两种形状:
 *   [{ code, name, hex, notes, source }]
 *   { colors: [...] }
 */
export function parseColorsJson(text, { existingColors = [] } = {}) {
  let parsed
  try {
    parsed = JSON.parse(normalizeText(text))
  } catch (e) {
    return { ok: false, errors: [{ code: IMPORT_ERRORS.BAD_JSON, detail: e?.message }] }
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.colors
  if (!Array.isArray(list)) {
    return { ok: false, errors: [{ code: IMPORT_ERRORS.BAD_SHAPE }] }
  }
  if (list.length > MAX_IMPORT_ROWS) {
    return { ok: false, errors: [{ code: IMPORT_ERRORS.TOO_MANY_ROWS, detail: String(MAX_IMPORT_ROWS) }] }
  }
  if (list.length === 0) return { ok: false, errors: [{ code: IMPORT_ERRORS.EMPTY }] }

  const drafts = []
  const errors = []
  const accepted = [...existingColors]
  list.forEach((item, i) => {
    const res = normalizeColorInput(item, { existingColors: accepted })
    if (!res.ok) {
      errors.push({ row: i + 1, code: res.errors[0].code, detail: res.errors[0].detail })
      return
    }
    drafts.push({ row: i + 1, ...res.color })
    accepted.push({ id: `__draft_${i}`, code: res.color.code })
  })
  if (drafts.length === 0 && errors.length > 0) return { ok: false, errors }
  return { ok: true, drafts, errors }
}

/** 按扩展名/内容选择解析器 */
export function parseColorImport(text, { filename = '', existingColors = [] } = {}) {
  const name = String(filename).toLowerCase()
  const trimmed = normalizeText(text).trimStart()
  if (name.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseColorsJson(text, { existingColors })
  }
  return parseColorsCsv(text, { existingColors })
}
