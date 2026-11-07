/**
 * 图纸分享 — 纯数据校验与统计。
 *
 * 这些函数**不是权限边界**(权限在数据库 RPC 与 RLS),只用于:
 *   · 在发请求前给出即时、可读的错误;
 *   · 从快照矩阵计算展示统计(绝不信任任何自报总数)。
 *
 * 不依赖 React / Supabase / 浏览器 API,可在 Node 与 jsdom 中直接测试。
 */

import { SHARE_LIMITS } from './shareConstants'

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

/**
 * 清理用户输入的展示文本:去控制字符、压缩连续空白、按字符数截断。
 *
 * 不转义 HTML —— 这些值只通过 React 文本节点渲染,从不拼 innerHTML。
 */
export function normalizeShareText(value, max) {
  if (typeof value !== 'string') return ''
  // 去掉 C0/C1 控制字符(保留普通空格与换行后在下一步压平)。
  // 用 \p{Cc} 而不是字面控制字符:字面范围会被 lint 规则误报。
  const cleaned = value.replace(/[\p{Cc}]/gu, ' ')
  const flat = cleaned.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max).trimEnd() : flat
}

/**
 * 归一化分享输入。
 *
 * @param {object} input
 * @param {string} [input.title] 用户填写的标题
 * @param {string} [input.description]
 * @param {string} [input.authorLabel]
 * @param {string} [input.fallbackTitle] 标题为空时的回退(作品名)
 * @returns {{ title: string, description: string, authorLabel: string, error: string|null }}
 */
export function sanitizeShareInput({
  title = '',
  description = '',
  authorLabel = '',
  fallbackTitle = '',
} = {}) {
  const fallback = normalizeShareText(fallbackTitle, SHARE_LIMITS.titleMax)
  const normalizedTitle = normalizeShareText(title, SHARE_LIMITS.titleMax) || fallback
  const normalizedDesc = normalizeShareText(description, SHARE_LIMITS.descriptionMax)
  const normalizedAuthor = normalizeShareText(authorLabel, SHARE_LIMITS.authorMax)

  return {
    title: normalizedTitle,
    description: normalizedDesc,
    authorLabel: normalizedAuthor,
    error: normalizedTitle ? null : 'titleRequired',
  }
}

/**
 * 校验矩阵形状与取值。
 *
 * 规则与 `projectModel.validateProject`、数据库 `work_share_matrix_valid` 同口径:
 *   · 非空二维数组,每行都是数组且等长;
 *   · 宽高 9–200,总格数 ≤ 40000;
 *   · 单元格只能是 null 或 #RRGGBB。
 *
 * @returns {{ ok: boolean, width: number, height: number, error: string|null }}
 */
export function validateSharePattern(pattern) {
  const fail = error => ({ ok: false, width: 0, height: 0, error })
  if (!Array.isArray(pattern) || pattern.length === 0) return fail('invalidPattern')
  if (pattern.length < SHARE_LIMITS.minDimension || pattern.length > SHARE_LIMITS.maxDimension) {
    return fail('dimensionOutOfRange')
  }

  let width = 0
  for (const row of pattern) {
    if (!Array.isArray(row)) return fail('invalidPattern')
    if (row.length > width) width = row.length
  }
  if (width < SHARE_LIMITS.minDimension || width > SHARE_LIMITS.maxDimension) {
    return fail('dimensionOutOfRange')
  }
  if (width * pattern.length > SHARE_LIMITS.maxCells) return fail('tooLarge')

  for (const row of pattern) {
    if (row.length !== width) return fail('raggedRows')
    for (const cell of row) {
      if (cell === null) continue
      if (typeof cell !== 'string' || !HEX_RE.test(cell)) return fail('invalidColor')
    }
  }

  return { ok: true, width, height: pattern.length, error: null }
}

/**
 * 从矩阵统计豆子与用色数。
 *
 * 与 `ogSnapshot.patternStats`、`computeProjectStats` 同口径:按 hex 计数、
 * 颗数降序;颗数相同时按 hex 升序,保证渲染稳定(不随对象迭代顺序抖动)。
 */
export function shareStats(pattern) {
  const counts = new Map()
  let beads = 0
  if (Array.isArray(pattern)) {
    for (const row of pattern) {
      if (!Array.isArray(row)) continue
      for (const cell of row) {
        if (!cell || typeof cell !== 'string') continue
        beads++
        const hex = cell.toUpperCase()
        counts.set(hex, (counts.get(hex) || 0) + 1)
      }
    }
  }
  const colors = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
  return { beads, colorCount: colors.length, colors }
}

/**
 * 公开快照行 → 前端对象(snake_case → camelCase)。
 * 只映射白名单字段;未知字段一律丢弃。
 */
export function rowToShare(row) {
  if (!row || typeof row !== 'object') return null
  const pattern = Array.isArray(row.canvas_data) ? row.canvas_data : null
  if (!pattern) return null
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    authorLabel: row.author_label || '',
    gridWidth: Number(row.grid_width) || 0,
    gridHeight: Number(row.grid_height) || 0,
    canvasData: pattern,
    paletteId: row.palette_id || 'perler',
    previewImagePath: row.preview_image_path || null,
    status: row.status,
    createdAt: row.created_at || null,
    publishedAt: row.published_at || null,
    revokedAt: row.revoked_at || null,
  }
}

/**
 * 列表 RPC 行 → 前端对象(不返回矩阵)。
 */
export function rowToShareSummary(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.share_id ?? row.id,
    sourceWorkId: row.source_work_id ?? null,
    title: row.title || '',
    description: row.description || '',
    authorLabel: row.author_label || '',
    gridWidth: Number(row.grid_width) || 0,
    gridHeight: Number(row.grid_height) || 0,
    paletteId: row.palette_id || 'perler',
    previewImagePath: row.preview_image_path || null,
    status: row.status,
    createdAt: row.created_at || null,
    publishedAt: row.published_at || null,
    revokedAt: row.revoked_at || null,
  }
}
