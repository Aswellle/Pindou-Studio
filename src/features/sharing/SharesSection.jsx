/**
 * SharesSection — 个人中心「我的分享」分区。
 *
 * 职责:列出本人创建的分享快照(不含矩阵),提供复制链接 / 下载卡片 / 打开 /
 * 撤销(二次确认)。撤销只影响「未来访问」:已经下载的图片、截图与第三方缓存
 * 无法收回 —— 文案里明确说清楚,不夸大撤销能力。
 *
 * 数据走 shareService.listMyShares / revokeShare(单一数据访问层);
 * 组件不直接触 supabase。
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Copy, Download, ExternalLink, RefreshCw, Share2 } from 'lucide-react'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { useScrollLock } from '../../hooks/useScrollLock'
import { copyText, downloadBlob } from './clipboard'
import { listMyShares, revokeShare, shareCardPublicUrl } from './shareService'
import { shareUrl } from './shareUrl'
import './sharing.css'

function formatDate(value, language) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleString(language, { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return String(value).slice(0, 10)
  }
}

export default function SharesSection({ onMessage }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [pendingRevoke, setPendingRevoke] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  useScrollLock(!!pendingRevoke)
  const { ref: confirmRef, dialogProps: confirmDialogProps } = useDialogA11y({
    open: !!pendingRevoke,
    onClose: () => setPendingRevoke(null),
    label: t('share.manage.revokeTitle'),
    role: 'alertdialog',
    // 撤销不可一键恢复:遮罩与 Escape 不关闭,必须显式选择
    dismissible: false,
  })

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    const result = await listMyShares()
    if (result.ok) {
      setItems(result.data)
    } else {
      setItems([])
      setLoadError(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCopy = async item => {
    setBusyId(item.id)
    const ok = await copyText(shareUrl(item.id))
    setBusyId(null)
    if (ok) {
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(prev => (prev === item.id ? null : prev)), 2000)
    } else if (onMessage) {
      onMessage(t('share.copyFailed'), 'error')
    }
  }

  const handleDownload = async item => {
    const url = shareCardPublicUrl(item.previewImagePath || '')
    if (!url) {
      if (onMessage) onMessage(t('share.errors.previewMissing'), 'error')
      return
    }
    setBusyId(item.id)
    try {
      const response = await fetch(url, { credentials: 'omit' })
      if (!response.ok) throw new Error(`card fetch failed: ${response.status}`)
      const blob = await response.blob()
      const name = (item.title || t('gallery.workName')).slice(0, 40)
      downloadBlob(blob, `${name}-share-card.png`)
    } catch {
      if (onMessage) onMessage(t('share.errors.network'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmRevoke = async () => {
    const target = pendingRevoke
    setPendingRevoke(null)
    if (!target) return
    setBusyId(target.id)
    const result = await revokeShare(target.id)
    setBusyId(null)
    if (result.ok) {
      setItems(prev => prev.map(it => (it.id === target.id ? { ...it, status: 'revoked' } : it)))
      if (onMessage) onMessage(t('share.manage.revokeDone'), 'success')
    } else if (onMessage) {
      onMessage(t('share.manage.revokeFailed'), 'error')
    }
  }

  return (
    <section className="pf-card shares-warn">
      <div className="pf-card-head">
        <h3>
          <Share2 size={16} aria-hidden="true" />
          {t('share.manage.sectionTitle')}
        </h3>
        <button type="button" className="pf-link-btn" onClick={refresh} disabled={loading}>
          <RefreshCw size={13} aria-hidden="true" className={loading ? 'spin' : undefined} />
          {t('share.manage.refresh')}
        </button>
      </div>

      {loadError ? (
        <p className="pf-note pf-note-warn" role="status">
          {t('share.errors.network')}
        </p>
      ) : null}

      {loading ? (
        <div className="pf-works-skeleton" aria-hidden="true">
          {[0, 1].map(i => (
            <span key={i} className="pf-works-skeleton-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="pf-empty">
          <Share2 size={32} aria-hidden="true" />
          <p>{t('share.manage.empty')}</p>
          <p className="pf-empty-hint">{t('share.manage.emptyHint')}</p>
        </div>
      ) : (
        <ul className="share-list">
          {items.map(item => {
            const status = item.status || 'draft'
            const created = formatDate(item.createdAt, i18n.language)
            return (
              <li key={item.id} className="share-list-item">
                <div className="share-list-body">
                  <span className="share-list-title" title={item.title}>
                    {item.title}
                  </span>
                  <span className="share-list-meta">
                    <span className={`share-status-chip status-${status}`}>
                      {t(`share.manage.status.${status}`, status)}
                    </span>
                    <span>
                      {item.gridWidth || item.gridHeight
                        ? `${item.gridWidth || '?'} × ${item.gridHeight || '?'}`
                        : ''}
                    </span>
                    {created ? <span>{t('share.manage.created', { date: created })}</span> : null}
                  </span>
                </div>
                <div className="share-list-actions">
                  {status === 'published' ? (
                    <>
                      <button
                        type="button"
                        className="share-btn ghost"
                        onClick={() => handleCopy(item)}
                        disabled={busyId === item.id}
                      >
                        <Copy size={13} aria-hidden="true" />
                        {copiedId === item.id ? t('share.copied') : t('share.manage.copy')}
                      </button>
                      <button
                        type="button"
                        className="share-btn ghost"
                        onClick={() => handleDownload(item)}
                        disabled={busyId === item.id}
                      >
                        <Download size={13} aria-hidden="true" />
                        {t('share.manage.download')}
                      </button>
                      <button
                        type="button"
                        className="share-btn ghost"
                        onClick={() => navigate(`/share/${item.id}`)}
                      >
                        <ExternalLink size={13} aria-hidden="true" />
                        {t('share.manage.open')}
                      </button>
                    </>
                  ) : null}
                  {status !== 'revoked' ? (
                    <button
                      type="button"
                      className="share-btn danger"
                      onClick={() => setPendingRevoke(item)}
                      disabled={busyId === item.id}
                    >
                      {t('share.manage.revoke')}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pendingRevoke ? (
        <div className="profile-confirm-overlay">
          <div
            className="modal-content confirm-box"
            ref={confirmRef}
            {...confirmDialogProps}
            onClick={e => e.stopPropagation()}
          >
            <h3>{t('share.manage.revokeTitle')}</h3>
            <p>
              {t('share.manage.revokeBody', {
                name: pendingRevoke.title || t('gallery.workName'),
              })}
            </p>
            <div className="confirm-actions">
              <button type="button" className="pf-btn ghost" autoFocus onClick={() => setPendingRevoke(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="pf-btn danger" onClick={confirmRevoke}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
