/**
 * 分享成功面板:复制链接 / 下载卡片 / 系统分享。
 *
 * 三条操作的共同要求:
 *   · 必须真的发生(不能只显示「已复制」而没写剪贴板);
 *   · 用户取消(AbortError)不是错误,也不能说成「已发送」;
 *   · 能力不存在时降级或隐藏,不假装成功。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Download, Share2 } from 'lucide-react'
import { cardFileName, copyText, downloadBlob } from './clipboard'
import { shareCardPublicUrl } from './shareService'

async function fetchCardBlob(url) {
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error(`card fetch failed: ${response.status}`)
  return response.blob()
}

export default function ShareSuccessPanel({ share, onDone }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState(null) // { tone: 'success'|'error'|'info', text }
  const [busy, setBusy] = useState(null) // 'copy' | 'download' | 'share'

  const url = share?.url || ''
  const title = share?.snapshot?.title || ''
  const cardUrl = shareCardPublicUrl(share?.previewPath || '')

  const handleCopy = async () => {
    setBusy('copy')
    const ok = await copyText(url)
    setBusy(null)
    setStatus(
      ok ? { tone: 'success', text: t('share.copied') } : { tone: 'error', text: t('share.copyFailed') }
    )
  }

  const handleDownload = async () => {
    if (!cardUrl) {
      setStatus({ tone: 'error', text: t('share.errors.cardRenderFailed') })
      return
    }
    setBusy('download')
    try {
      const blob = await fetchCardBlob(cardUrl)
      const ok = downloadBlob(blob, cardFileName(title))
      setStatus(ok ? null : { tone: 'error', text: t('share.errors.unknown') })
    } catch {
      setStatus({ tone: 'error', text: t('share.errors.network') })
    } finally {
      setBusy(null)
    }
  }

  const handleShare = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      setStatus({ tone: 'info', text: t('share.shareUnsupported') })
      return
    }
    setBusy('share')
    try {
      // 优先连图片一起分享;canShare 明确返回 false 时降级为文字 + URL
      let file = null
      if (cardUrl && typeof File !== 'undefined' && typeof navigator.canShare === 'function') {
        try {
          const blob = await fetchCardBlob(cardUrl)
          file = new File([blob], cardFileName(title), { type: 'image/png' })
          if (!navigator.canShare({ files: [file] })) file = null
        } catch {
          file = null
        }
      }

      if (file) {
        await navigator.share({ files: [file], title, text: t('share.successHint') })
      } else {
        await navigator.share({ title, text: t('share.successHint'), url })
      }
      setStatus(null)
    } catch (error) {
      // 用户取消不是失败:不显示错误,也不声称已发送
      if (error?.name === 'AbortError') {
        setStatus({ tone: 'info', text: t('share.shareCanceled') })
      } else {
        setStatus({ tone: 'error', text: t('share.errors.unknown') })
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="share-success">
      <p className="share-success-title" role="status">
        {t('share.successTitle')}
      </p>

      {cardUrl ? (
        <div className="share-card-preview">
          <img src={cardUrl} alt={t('share.successTitle')} loading="lazy" />
        </div>
      ) : null}

      <div className="share-link-box">
        <code>{url}</code>
      </div>
      <p className="share-hint">{t('share.successHint')}</p>

      <div className="share-actions">
        <button type="button" className="share-btn primary" onClick={handleCopy} disabled={busy !== null}>
          <Copy size={16} aria-hidden="true" />
          {t('share.copyLink')}
        </button>
        <button type="button" className="share-btn" onClick={handleDownload} disabled={busy !== null}>
          <Download size={16} aria-hidden="true" />
          {busy === 'download' ? t('share.downloading') : t('share.downloadCard')}
        </button>
        <button type="button" className="share-btn" onClick={handleShare} disabled={busy !== null}>
          <Share2 size={16} aria-hidden="true" />
          {t('share.shareSystem')}
        </button>
      </div>

      {status ? (
        <p className={`share-status tone-${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      ) : null}

      <div className="share-success-footer">
        <button type="button" className="share-btn ghost" onClick={onDone}>
          {t('share.done')}
        </button>
      </div>
    </div>
  )
}
