/**
 * useWorkShares — 分享生命周期编排。
 *
 * 状态机严格按验收要求:
 *   idle → creating(服务端草稿) → rendering(本地卡片) → uploading(Storage)
 *        → publishing(服务端置为 published) → success
 * 任一阶段失败 → error;已创建的草稿 id 会保留,重试**复用**它,
 * 不会因为重试而制造多条草稿。
 *
 * 只有 publish 成功后才返回 success —— 绝不提前显示「已分享」。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_AUTHOR_LABEL, SHARE_ERROR_CODES, SHARE_STATES } from './shareConstants'
import { sanitizeShareInput, shareStats, validateSharePattern } from './shareData'
import { renderShareCard } from './shareCardRenderer'
import {
  createDraft,
  fetchReleaseGate,
  isSharingConfigured,
  listMyShares,
  publishShare,
  revokeShare,
  uploadShareCard,
} from './shareService'
import { shareUrl } from './shareUrl'

const BUSY_STATES = new Set([
  SHARE_STATES.CREATING,
  SHARE_STATES.RENDERING,
  SHARE_STATES.UPLOADING,
  SHARE_STATES.PUBLISHING,
])

export function useWorkShares({ enabled = true } = {}) {
  const { t } = useTranslation()
  const [state, setState] = useState(SHARE_STATES.IDLE)
  const [error, setError] = useState(null)
  const [share, setShare] = useState(null)
  const [gate, setGate] = useState(null) // null=未知 / true=开放 / false=关闭

  // 草稿复用:渲染或上传失败后重试不新建 share 行
  const draftRef = useRef(null)
  const busyRef = useRef(false)

  const configured = isSharingConfigured()

  const refreshGate = useCallback(async () => {
    if (!configured) {
      setGate(false)
      return false
    }
    const result = await fetchReleaseGate()
    // 查询失败时按「未开放」处理:宁可少显示入口,也不引导用户点一个必然失败的按钮
    setGate(result.ok ? result.data : false)
    return result.ok ? result.data : false
  }, [configured])

  useEffect(() => {
    if (!enabled) return
    refreshGate()
  }, [enabled, refreshGate])

  const reset = useCallback(() => {
    draftRef.current = null
    setShare(null)
    setError(null)
    setState(SHARE_STATES.IDLE)
  }, [])

  const fail = useCallback((code, detail) => {
    setError(code)
    setState(SHARE_STATES.ERROR)
    if (detail && typeof console !== 'undefined') {
      // 只记录错误码与简短信息,不打印矩阵/标题正文
      console.warn('[share]', code, String(detail).slice(0, 200))
    }
    return null
  }, [])

  /**
   * 创建并发布。
   *
   * @param {object} params
   * @param {object} params.work 云端作品(必须带 UUID id 与 canvasData)
   * @param {string} params.title
   * @param {string} params.description
   * @param {string} [params.authorLabel] 默认中性署名
   */
  const createAndPublish = useCallback(
    async ({ work, title, description, authorLabel }) => {
      if (busyRef.current) return null
      if (!configured) return fail(SHARE_ERROR_CODES.UNAUTHORIZED)
      if (!work?.id || typeof work.id !== 'string') return fail(SHARE_ERROR_CODES.WORK_NOT_FOUND)

      // 本地预检:只用于快速反馈,服务端仍会重新校验
      const patternCheck = validateSharePattern(work.canvasData)
      if (!patternCheck.ok) return fail(SHARE_ERROR_CODES.INVALID_PATTERN, patternCheck.error)

      const input = sanitizeShareInput({
        title,
        description,
        authorLabel: authorLabel || t('share.authorDefault', DEFAULT_AUTHOR_LABEL),
        fallbackTitle: work.name,
      })
      if (input.error) return fail(SHARE_ERROR_CODES.TITLE_REQUIRED)

      busyRef.current = true
      setError(null)
      setState(SHARE_STATES.CREATING)

      try {
        let draft = draftRef.current
        if (!draft) {
          const created = await createDraft({
            workId: work.id,
            title: input.title,
            description: input.description,
            authorLabel: input.authorLabel,
          })
          if (!created.ok) return fail(created.error, created.detail)
          draft = created.data
          draftRef.current = draft
        }

        setState(SHARE_STATES.RENDERING)
        const stats = shareStats(draft.canvasData)
        const url = shareUrl(draft.id)
        let blob
        try {
          const rendered = await renderShareCard({
            snapshot: { ...draft, title: draft.title || input.title },
            shareUrl: url,
            labels: {
              size: t('share.card.size', { w: draft.gridWidth, h: draft.gridHeight }),
              beads: t('share.card.beads', { n: stats.beads }),
              colors: t('share.card.colors', { n: stats.colorCount }),
              scan: t('share.card.scan'),
              footer: t('share.card.footer'),
            },
          })
          blob = rendered.blob
        } catch (renderError) {
          return fail(SHARE_ERROR_CODES.CARD_RENDER_FAILED, renderError?.code || renderError?.message)
        }

        setState(SHARE_STATES.UPLOADING)
        const uploaded = await uploadShareCard(draft.id, blob)
        if (!uploaded.ok) return fail(uploaded.error, uploaded.detail)

        setState(SHARE_STATES.PUBLISHING)
        const published = await publishShare(draft.id, uploaded.data)
        if (!published.ok) return fail(published.error, published.detail)

        const result = {
          id: draft.id,
          url,
          previewPath: uploaded.data,
          snapshot: { ...draft, title: draft.title || input.title },
          stats,
        }
        draftRef.current = null
        setShare(result)
        setState(SHARE_STATES.SUCCESS)
        return result
      } catch (unexpected) {
        return fail(SHARE_ERROR_CODES.UNKNOWN, unexpected?.message)
      } finally {
        busyRef.current = false
      }
    },
    [configured, fail, t]
  )

  /** 重试:复用已创建的草稿,重新渲染/上传/发布 */
  const retry = useCallback(
    payload => {
      if (state !== SHARE_STATES.ERROR) return null
      // 用户改了标题/说明/署名时不能复用旧快照 —— 草稿里存的是旧文案。
      // 放弃该草稿并重新创建:草稿永远不可公开,不会影响任何访客。
      const draft = draftRef.current
      if (draft && payload) {
        const input = sanitizeShareInput({
          title: payload.title,
          description: payload.description,
          authorLabel: payload.authorLabel,
          fallbackTitle: payload.work?.name,
        })
        if (
          input.title !== draft.title ||
          input.description !== draft.description ||
          input.authorLabel !== draft.authorLabel
        ) {
          draftRef.current = null
        }
      }
      return createAndPublish(payload)
    },
    [createAndPublish, state]
  )

  const revoke = useCallback(async shareId => {
    const result = await revokeShare(shareId)
    if (!result.ok) return result
    setShare(prev => (prev && prev.id === shareId ? null : prev))
    if (draftRef.current?.id === shareId) draftRef.current = null
    return result
  }, [])

  const loadShares = useCallback(async () => listMyShares(), [])

  return {
    configured,
    state,
    error,
    share,
    gate,
    isBusy: BUSY_STATES.has(state),
    createAndPublish,
    retry,
    reset,
    revoke,
    loadShares,
    refreshGate,
  }
}
