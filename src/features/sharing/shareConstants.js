/**
 * 图纸分享 — 常量与错误码。
 *
 * 只放不会随 UI 变化的稳定值:长度上限与数据库 CHECK 保持一致,
 * 卡片尺寸与 OG 声明保持一致,错误码供 i18n 映射。
 */

/** 分享状态(与 public.work_shares.status 的 CHECK 一致) */
export const SHARE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  REVOKED: 'revoked',
})

/** 客户端生命周期状态机:只有 published 成功后才允许进入 success */
export const SHARE_STATES = Object.freeze({
  IDLE: 'idle',
  CREATING: 'creating',
  RENDERING: 'rendering',
  UPLOADING: 'uploading',
  PUBLISHING: 'publishing',
  SUCCESS: 'success',
  ERROR: 'error',
})

/** 与数据库 CHECK / 项目模型一致 */
export const SHARE_LIMITS = Object.freeze({
  titleMax: 80,
  descriptionMax: 160,
  authorMax: 40,
  minDimension: 9,
  maxDimension: 200,
  maxCells: 40000,
  /** Storage bucket 的单文件上限(2MB) */
  cardBytes: 2 * 1024 * 1024,
})

/** 分享卡尺寸:与 OG 元数据、卡片渲染器共用同一来源 */
export const SHARE_CARD_SIZE = Object.freeze({ width: 1200, height: 630 })

/** Storage bucket 与对象路径规则 */
export const SHARE_BUCKET = 'work-share-cards'
export const shareCardPath = shareId => `${shareId}/r1.png`

/** 中性默认署名(用户未填写时使用;与数据库默认值一致) */
export const DEFAULT_AUTHOR_LABEL = '拼豆创作者'

/**
 * 稳定错误码 → i18n 键后缀 `share.errors.<code>`。
 *
 * 服务端 `raise exception 'xxx'` 的 message 会原样到达 PostgREST;
 * 这里把「已知服务端错误 + 网络/权限/存储错误」统一成稳定码,
 * UI 只认这些码,不直接展示原始英文错误。
 */
export const SHARE_ERROR_CODES = Object.freeze({
  NOT_AUTHENTICATED: 'notAuthenticated',
  WORK_NOT_FOUND: 'workNotFound',
  INVALID_PATTERN: 'invalidPattern',
  TITLE_REQUIRED: 'titleRequired',
  RATE_LIMITED: 'rateLimited',
  RELEASE_GATE_CLOSED: 'releaseGateClosed',
  IDENTITY_REQUIRED: 'identityRequired',
  NOT_OWNER: 'notOwner',
  SHARE_NOT_FOUND: 'shareNotFound',
  INVALID_STATE: 'invalidState',
  INVALID_PREVIEW_PATH: 'invalidPreviewPath',
  PREVIEW_MISSING: 'previewMissing',
  INVALID_PREVIEW_TYPE: 'invalidPreviewType',
  INVALID_PREVIEW_SIZE: 'invalidPreviewSize',
  INVALID_CATEGORY: 'invalidCategory',
  NETWORK: 'network',
  UNAUTHORIZED: 'unauthorized',
  CARD_RENDER_FAILED: 'cardRenderFailed',
  UPLOAD_FAILED: 'uploadFailed',
  UNKNOWN: 'unknown',
})

/** 服务端 message → 稳定错误码 */
const SERVER_CODE_MAP = {
  not_authenticated: SHARE_ERROR_CODES.NOT_AUTHENTICATED,
  work_not_found: SHARE_ERROR_CODES.WORK_NOT_FOUND,
  invalid_pattern: SHARE_ERROR_CODES.INVALID_PATTERN,
  title_required: SHARE_ERROR_CODES.TITLE_REQUIRED,
  rate_limited: SHARE_ERROR_CODES.RATE_LIMITED,
  release_gate_closed: SHARE_ERROR_CODES.RELEASE_GATE_CLOSED,
  identity_required: SHARE_ERROR_CODES.IDENTITY_REQUIRED,
  not_owner: SHARE_ERROR_CODES.NOT_OWNER,
  share_not_found: SHARE_ERROR_CODES.SHARE_NOT_FOUND,
  invalid_state: SHARE_ERROR_CODES.INVALID_STATE,
  invalid_preview_path: SHARE_ERROR_CODES.INVALID_PREVIEW_PATH,
  preview_missing: SHARE_ERROR_CODES.PREVIEW_MISSING,
  invalid_preview_type: SHARE_ERROR_CODES.INVALID_PREVIEW_TYPE,
  invalid_preview_size: SHARE_ERROR_CODES.INVALID_PREVIEW_SIZE,
  invalid_category: SHARE_ERROR_CODES.INVALID_CATEGORY,
}

/**
 * 把任意错误归一为稳定码。
 *
 * 网络失败与权限失败必须可区分(验收要求),所以先看错误形态再看 message。
 */
export function toShareErrorCode(error) {
  if (!error) return SHARE_ERROR_CODES.UNKNOWN
  const message = String(error.message || error.error_description || error || '').trim()

  if (SERVER_CODE_MAP[message]) return SERVER_CODE_MAP[message]

  // PostgREST / Postgres 权限:42501 / "permission denied"
  const code = String(error.code || '')
  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return SHARE_ERROR_CODES.UNAUTHORIZED
  }
  // supabase-js 网络层:Failed to fetch / NetworkError / 超时
  if (
    /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|econn/i.test(
      message
    ) ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  ) {
    return SHARE_ERROR_CODES.NETWORK
  }
  // 存储层
  if (/bucket|storage|object/i.test(message)) return SHARE_ERROR_CODES.UPLOAD_FAILED

  return SHARE_ERROR_CODES.UNKNOWN
}
