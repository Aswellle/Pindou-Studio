/**
 * ShareWorkDialog — 从一个云端作品创建公开分享。
 *
 * 交互约束:
 *   · 打开时展示作品真实缩略图与尺寸,标题可改、说明可填;
 *   · 署名默认中性(「拼豆创作者」),不提供公开昵称/头像的选项;
 *   · 明确告知「获得链接的人都能访问」「分享的是快照」「不含账号资料」;
 *   · 只有服务端发布成功后才进入成功面板;
 *   · 失败保留草稿,重试不会创建重复分享。
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Share2, X } from 'lucide-react'
import WorkThumbnail from '../gallery/components/WorkThumbnail'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { useScrollLock } from '../../hooks/useScrollLock'
import { SHARE_ERROR_CODES, SHARE_LIMITS, SHARE_STATES } from './shareConstants'
import { useWorkShares } from './useWorkShares'
import ShareSuccessPanel from './ShareSuccessPanel'
import './sharing.css'

const BUSY = new Set([
  SHARE_STATES.CREATING,
  SHARE_STATES.RENDERING,
  SHARE_STATES.UPLOADING,
  SHARE_STATES.PUBLISHING,
])

export default function ShareWorkDialog({ open, work, onClose, onPublished }) {
  const { t } = useTranslation()
  const { state, error, share, gate, createAndPublish, retry, reset, configured } = useWorkShares({
    enabled: open,
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [authorLabel, setAuthorLabel] = useState('')

  const busy = BUSY.has(state)
  const isSuccess = state === SHARE_STATES.SUCCESS

  useScrollLock(open)
  const { ref: dialogRef, dialogProps } = useDialogA11y({
    open,
    // 发布进行中不允许关闭:否则组件卸载会丢掉草稿 id,用户再点时可能重复创建
    onClose,
    disabled: busy,
    label: t('share.title'),
  })

  // 打开/切换作品时重置表单与内部状态
  // biome-ignore lint/correctness/useExhaustiveDependencies: work.id/open 是重置信号
  useEffect(() => {
    if (!open) return
    reset()
    setTitle(work?.name || '')
    setDescription('')
    setAuthorLabel(t('share.authorDefault'))
  }, [open, work?.id])

  const payload = useMemo(
    () => ({ work, title, description, authorLabel }),
    [work, title, description, authorLabel]
  )

  if (!open) return null

  const gateClosed = gate === false
  const canSubmit = configured && !gateClosed && !busy && Boolean(work?.id) && state !== SHARE_STATES.SUCCESS

  const handleSubmit = async () => {
    const result = await createAndPublish(payload)
    if (result) onPublished?.(result)
  }

  const handleRetry = async () => {
    const result = await retry(payload)
    if (result) onPublished?.(result)
  }

  const errorText = error ? t(`share.errors.${error}`, t('share.errors.unknown')) : ''

  const stateText = {
    [SHARE_STATES.CREATING]: t('share.state.creating'),
    [SHARE_STATES.RENDERING]: t('share.state.rendering'),
    [SHARE_STATES.UPLOADING]: t('share.state.uploading'),
    [SHARE_STATES.PUBLISHING]: t('share.state.publishing'),
  }[state]

  return createPortal(
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="share-dialog"
        ref={dialogRef}
        {...dialogProps}
        onClick={event => event.stopPropagation()}
      >
        <div className="share-dialog-head">
          <h2>
            <Share2 size={18} aria-hidden="true" />
            {t('share.title')}
          </h2>
          <button
            type="button"
            className="share-icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label={t('share.close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {isSuccess && share ? (
          <ShareSuccessPanel share={share} onDone={onClose} />
        ) : (
          <div className="share-dialog-body">
            <div className="share-work-summary">
              <div className="share-work-thumb">
                <WorkThumbnail work={work} />
              </div>
              <div className="share-work-meta">
                <span className="share-work-name">{work?.name || t('gallery.workName')}</span>
                <span>
                  {work?.gridWidth || work?.gridSize || ''}
                  {' × '}
                  {work?.gridHeight || work?.gridSize || ''}
                </span>
              </div>
            </div>

            {!configured ? (
              <p className="share-note warn" role="status">
                {t('share.cloudUnavailable')}
              </p>
            ) : null}

            {gateClosed ? (
              <div className="share-note warn" role="status">
                <strong>{t('share.gateClosed')}</strong>
                <span>{t('share.gateClosedHint')}</span>
              </div>
            ) : null}

            <label className="share-field">
              <span>{t('share.fieldTitle')}</span>
              <input
                type="text"
                value={title}
                maxLength={SHARE_LIMITS.titleMax}
                placeholder={t('share.fieldTitlePlaceholder')}
                onChange={event => setTitle(event.target.value)}
                disabled={busy || state === SHARE_STATES.SUCCESS}
              />
              <span className="share-field-count">
                {title.length}/{SHARE_LIMITS.titleMax}
              </span>
            </label>

            <label className="share-field">
              <span>{t('share.fieldDescription')}</span>
              <textarea
                value={description}
                maxLength={SHARE_LIMITS.descriptionMax}
                placeholder={t('share.fieldDescriptionPlaceholder')}
                rows={3}
                onChange={event => setDescription(event.target.value)}
                disabled={busy}
              />
              <span className="share-field-count">
                {description.length}/{SHARE_LIMITS.descriptionMax}
              </span>
            </label>

            <label className="share-field">
              <span>{t('share.authorLabel')}</span>
              <input
                type="text"
                value={authorLabel}
                maxLength={SHARE_LIMITS.authorMax}
                onChange={event => setAuthorLabel(event.target.value)}
                disabled={busy}
              />
              <span className="share-field-hint">{t('share.authorHint')}</span>
            </label>

            <p className="share-note">{t('share.notice')}</p>
            <p className="share-note subtle">{t('share.rights')}</p>

            {stateText ? (
              <p className="share-status" role="status">
                {stateText}
              </p>
            ) : null}

            {state === SHARE_STATES.ERROR ? (
              <div className="share-note error" role="alert">
                <strong>{errorText}</strong>
                <span>{t('share.retryHint')}</span>
              </div>
            ) : null}

            <div className="share-dialog-actions">
              <button type="button" className="share-btn ghost" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </button>
              {state === SHARE_STATES.ERROR ? (
                <button
                  type="button"
                  className="share-btn primary"
                  onClick={handleRetry}
                  disabled={!canSubmit}
                >
                  {t('share.retry')}
                </button>
              ) : (
                <button
                  type="button"
                  className="share-btn primary"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {t('share.create')}
                </button>
              )}
            </div>

            {error === SHARE_ERROR_CODES.NETWORK ? (
              <p className="share-hint">{t('share.errors.network')}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
