/**
 * 图纸分享 — 唯一的数据访问层。
 *
 * UI 组件不得直接 `supabase.from/rpc/storage`;所有分享读写都从这里走,
 * 便于统一错误码、统一鉴权假设(anon key + RLS)、统一测试替身。
 *
 * 返回值统一为 `{ ok, data, error, detail }`:
 *   · `error` 是稳定错误码(见 shareConstants.SHARE_ERROR_CODES),
 *   · `detail` 只用于开发期诊断,绝不直接展示给用户(可能含服务端英文信息)。
 */

import { supabase, SUPABASE_URL } from '../../services/supabase'
import { SHARE_BUCKET, SHARE_ERROR_CODES, shareCardPath, toShareErrorCode } from './shareConstants'
import { rowToShare, rowToShareSummary } from './shareData'

/** 公开读只取白名单列;不要 `select *`(避免未来新增列被无意公开)。 */
export const PUBLIC_SHARE_COLUMNS =
  'id,title,description,author_label,grid_width,grid_height,canvas_data,palette_id,preview_image_path,status,published_at'

const ok = data => ({ ok: true, data, error: null, detail: null })
const fail = (error, detail = null) => ({ ok: false, data: null, error, detail })

/** 云端是否可用(未配置 env 时全站本地模式,分享整体不可用) */
export function isSharingConfigured() {
  return Boolean(supabase)
}

/**
 * 服务端发布门禁是否开启。
 *
 * 由 `public.work_share_release_enabled()` 返回;客户端用它把入口显示为
 * 「暂未开放」,但**真正拦截在数据库**,隐藏按钮不构成权限边界。
 */
export async function fetchReleaseGate() {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  const { data, error } = await supabase.rpc('work_share_release_enabled')
  if (error) return fail(toShareErrorCode(error), error.message)
  return ok(Boolean(data))
}

/**
 * 创建草稿快照。
 *
 * 服务端会从 `public.works` 中按 `auth.uid()` 读取该作品并复制白名单字段,
 * 客户端只提交作品 id 与展示文本 —— **不提交矩阵**,因此伪造矩阵没有意义。
 */
export async function createDraft({ workId, title, description, authorLabel }) {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  const { data, error } = await supabase.rpc('create_work_share', {
    p_work_id: workId,
    p_title: title ?? '',
    p_description: description ?? '',
    p_author_label: authorLabel ?? '',
  })
  if (error) return fail(toShareErrorCode(error), error.message)

  const shareId = data?.share_id
  if (!shareId) return fail(SHARE_ERROR_CODES.UNKNOWN, 'missing share_id')
  return ok({
    id: shareId,
    title: data.title || '',
    description: data.description || '',
    authorLabel: data.author_label || '',
    gridWidth: Number(data.grid_width) || 0,
    gridHeight: Number(data.grid_height) || 0,
    canvasData: Array.isArray(data.canvas_data) ? data.canvas_data : [],
    paletteId: data.palette_id || 'perler',
    status: data.status || 'draft',
  })
}

/** 上传分享卡 PNG。路径固定 `<share-id>/r1.png`,不覆盖既有对象。 */
export async function uploadShareCard(shareId, blob) {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  if (!shareId || !blob) return fail(SHARE_ERROR_CODES.UPLOAD_FAILED, 'missing blob')
  const path = shareCardPath(shareId)
  const { error } = await supabase.storage.from(SHARE_BUCKET).upload(path, blob, {
    contentType: 'image/png',
    upsert: false,
    cacheControl: '31536000',
  })
  if (error) return fail(toShareErrorCode(error), error.message)
  return ok(path)
}

/** 发布:服务端校验对象存在、类型、大小、路径后再置为 published。 */
export async function publishShare(shareId, previewPath) {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  const { error } = await supabase.rpc('publish_work_share', {
    p_share_id: shareId,
    p_preview_image_path: previewPath ?? shareCardPath(shareId),
  })
  if (error) return fail(toShareErrorCode(error), error.message)
  return ok(true)
}

/** 撤销(幂等)。撤销后公开 RLS 立即拒绝该行。 */
export async function revokeShare(shareId) {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  const { error } = await supabase.rpc('revoke_work_share', { p_share_id: shareId })
  if (error) return fail(toShareErrorCode(error), error.message)
  return ok(true)
}

/** 我的分享列表(不含矩阵;最多 100 条)。 */
export async function listMyShares() {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  const { data, error } = await supabase.rpc('list_my_work_shares')
  if (error) return fail(toShareErrorCode(error), error.message)
  return ok((data || []).map(rowToShareSummary).filter(Boolean))
}

/**
 * 匿名读取公开快照。
 *
 * 只查 published(RLS 是最终边界,这里显式过滤只是让语义清晰)。
 * `maybeSingle` 区分「不存在」与「查询失败」:前者返回 notFound,
 * 后者返回 network/unauthorized —— 页面据此显示不同状态。
 */
export async function fetchPublicShare(shareId) {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  if (!shareId) return fail(SHARE_ERROR_CODES.SHARE_NOT_FOUND)
  const { data, error } = await supabase
    .from('work_shares')
    .select(PUBLIC_SHARE_COLUMNS)
    .eq('id', shareId)
    .eq('status', 'published')
    .maybeSingle()
  if (error) return fail(toShareErrorCode(error), error.message)
  if (!data) return fail(SHARE_ERROR_CODES.SHARE_NOT_FOUND)
  return ok(rowToShare(data))
}

/** 提交举报(匿名可调用;服务端限频)。 */
export async function submitShareReport({ shareId, category, detail = '', contact = '' }) {
  if (!supabase) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
  const { error } = await supabase.rpc('submit_work_share_report', {
    p_share_id: shareId,
    p_category: category,
    p_detail: detail,
    p_contact: contact,
  })
  if (error) return fail(toShareErrorCode(error), error.message)
  return ok(true)
}

/**
 * 分享卡公开 URL(优先同域 `/sb` 代理,受限网络下仍可访问)。
 * 只接受本 bucket 内、符合 `<uuid>/r1.png` 形状的路径。
 */
export function shareCardPublicUrl(path) {
  if (typeof path !== 'string' || !path) return ''
  if (!/^[0-9a-fA-F-]{36}\/r1\.png$/.test(path)) return ''
  const base = String(SUPABASE_URL || '').replace(/\/+$/, '')
  if (!base) return ''
  return `${base}/storage/v1/object/public/${SHARE_BUCKET}/${path}`
}
