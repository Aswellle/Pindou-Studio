/**
 * SharePage — /share/:id 公开落地页。
 *
 * 访客无需登录即可查看:图纸、尺寸、豆子数、用色数与作者署名(快照值)。
 * 只有「复制到我的图纸」才进入登录/注册;登录后回到本页并**只执行一次**复制。
 *
 * 数据边界:只读 published 快照(RLS 兜底),不回查 works,不展示任何账号字段。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowRight, Copy, Flag, Loader2, Sparkles } from 'lucide-react'
import ThumbnailCanvas from '../../components/ThumbnailCanvas'
import { useToast } from '../../components/Toast'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { useScrollLock } from '../../hooks/useScrollLock'
import { canvasToLegacyWork } from '../../services/project/adapters'
import { shareStats } from './shareData'
import { fetchPublicShare, shareCardPublicUrl, submitShareReport } from './shareService'
import { shareIdFromPath } from './shareUrl'
import './sharing.css'

const SITE = 'https://tangnotes.site'
const COPY_INTENT_PREFIX = 'share-copy-intent:'
const REPORT_CATEGORIES = ['illegal', 'copyright', 'privacy', 'impersonation', 'other']

/** 站点 LOGO:4×4 拼豆色卡(与 index.html favicon、登录页同一品牌图形) */
function BrandLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="8" height="8" x="0" y="0" fill="#E53935" />
      <rect width="8" height="8" x="8" y="0" fill="#FDD835" />
      <rect width="8" height="8" x="16" y="0" fill="#32CD32" />
      <rect width="8" height="8" x="24" y="0" fill="#1976D2" />
      <rect width="8" height="8" x="0" y="8" fill="#F06292" />
      <rect width="8" height="8" x="8" y="8" fill="#BA68C8" />
      <rect width="8" height="8" x="16" y="8" fill="#00BCD4" />
      <rect width="8" height="8" x="24" y="8" fill="#FF9800" />
      <rect width="8" height="8" x="0" y="16" fill="#FFFFFF" stroke="#E0E0E0" />
      <rect width="8" height="8" x="8" y="16" fill="#9E9E9E" />
      <rect width="8" height="8" x="16" y="16" fill="#000000" />
      <rect width="8" height="8" x="24" y="16" fill="#795548" />
      <rect width="8" height="8" x="0" y="24" fill="#8D6E63" />
      <rect width="8" height="8" x="8" y="24" fill="#A1887F" />
      <rect width="8" height="8" x="16" y="24" fill="#BDBDBD" />
      <rect width="8" height="8" x="24" y="24" fill="#6D4C41" />
    </svg>
  )
}

export default function SharePage({ user, authLoading, onSaveWork }) {
  const { t } = useTranslation()
  const { id: rawId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const shareId = shareIdFromPath(`/share/${rawId || ''}`)
  const [status, setStatus] = useState('loading') // loading | ready | notFound | network
  const [share, setShare] = useState(null)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState('copyright')
  const [reportDetail, setReportDetail] = useState('')
  const [reportContact, setReportContact] = useState('')
  const [reportStatus, setReportStatus] = useState(null)
  const [reportBusy, setReportBusy] = useState(false)
  const resumedRef = useRef(false)

  useScrollLock(reportOpen)
  const { ref: reportRef, dialogProps: reportDialogProps } = useDialogA11y({
    open: reportOpen,
    onClose: () => setReportOpen(false),
    label: t('share.page.reportTitle'),
  })

  const load = useCallback(async () => {
    if (!shareId) {
      setStatus('notFound')
      return
    }
    setStatus('loading')
    const result = await fetchPublicShare(shareId)
    if (result.ok) {
      setShare(result.data)
      setStatus('ready')
      return
    }
    // 网络失败与「不存在/已撤销」必须区分:前者可重试,后者不可
    setStatus(result.error === 'network' ? 'network' : 'notFound')
  }, [shareId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只按分享 id 重新拉取
  useEffect(() => {
    load()
  }, [shareId])

  const stats = useMemo(
    () => (share ? shareStats(share.canvasData) : { beads: 0, colorCount: 0, colors: [] }),
    [share]
  )

  /** 简述:crawler 与社交卡片共用;长度与 og:description 的建议上限一致 */
  const description = useMemo(() => {
    if (!share) return ''
    return [
      share.description,
      t('share.card.size', { w: share.gridWidth, h: share.gridHeight }),
      t('share.card.beads', { n: stats.beads }),
      t('share.card.colors', { n: stats.colorCount }),
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 160)
  }, [share, stats, t])

  /** 把快照复制成当前用户的新作品(绝不覆盖来源或其他作品) */
  const copyToMyWorks = useCallback(async () => {
    if (!share || copying) return
    setCopying(true)
    try {
      const work = canvasToLegacyWork({
        canvasData: share.canvasData,
        name: (share.title || t('gallery.workName')).slice(0, 120),
        paletteId: share.paletteId || 'perler',
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now(),
        savedAt: new Date().toISOString(),
        sourceKind: 'shared-copy',
      })
      if (!work) {
        toast(t('share.page.copyFailed'), 'error')
        return
      }
      const ok = await onSaveWork?.(work)
      if (ok) {
        setCopied(true)
        toast(t('share.page.copySuccess'), 'success')
      } else {
        toast(t('share.page.copyFailed'), 'error')
      }
    } finally {
      setCopying(false)
    }
  }, [share, copying, t, toast, onSaveWork])

  /**
   * 登录后恢复一次 intent。
   *
   * 只用 sessionStorage 存一个标记(不存矩阵、不存分享内容);
   * 执行后立即删除,刷新页面不会重复创建副本。
   */
  useEffect(() => {
    if (!share || !user || authLoading || resumedRef.current) return
    const key = `${COPY_INTENT_PREFIX}${share.id}`
    let pending = false
    try {
      pending = sessionStorage.getItem(key) === '1'
    } catch {
      pending = false
    }
    if (!pending) return
    resumedRef.current = true
    try {
      sessionStorage.removeItem(key)
    } catch {
      // 无痕模式下 sessionStorage 可能不可用:忽略即可,标记已用完
    }
    copyToMyWorks()
  }, [share, user, authLoading, copyToMyWorks])

  const handleCopyClick = () => {
    if (!share) return
    if (authLoading) return
    if (!user) {
      try {
        sessionStorage.setItem(`${COPY_INTENT_PREFIX}${share.id}`, '1')
      } catch {
        // 存不了标记也仍然跳登录 —— 复制动作需要登录本身是明确的
      }
      navigate('/login', {
        state: { mode: 'register', next: `/share/${share.id}`, reason: 'shareCopy' },
      })
      return
    }
    copyToMyWorks()
  }

  /** 举报说明必填:空提交只会产生无法处理的垃圾记录,前端先拦一道 */
  const reportDetailValid = reportDetail.trim().length > 0

  const handleReport = async () => {
    if (!share || reportBusy || !reportDetailValid) return
    setReportBusy(true)
    const result = await submitShareReport({
      shareId: share.id,
      category: reportCategory,
      detail: reportDetail,
      contact: reportContact,
    })
    setReportBusy(false)
    if (result.ok) {
      setReportStatus({ tone: 'success', text: t('share.page.reportDone') })
      setReportDetail('')
      setReportContact('')
    } else {
      setReportStatus({ tone: 'error', text: t('share.page.reportFailed') })
    }
  }

  const helmet = share ? (
    <Helmet>
      <title>{`${share.title} - 拼豆图纸分享 - 拼豆Studio`}</title>
      <meta name="description" content={description} />
      {/* 分享内容默认不进搜索索引,但允许跟随站内链接 */}
      <meta name="robots" content="noindex, follow" />
      <meta property="og:title" content={`${share.title} - 拼豆图纸分享`} />
      <meta property="og:description" content={description} />
      {share.previewImagePath ? (
        <meta property="og:image" content={shareCardPublicUrl(share.previewImagePath)} />
      ) : null}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${share.title} - 拼豆图纸分享`} />
      <meta name="twitter:description" content={description} />
      {share.previewImagePath ? (
        <meta name="twitter:image" content={shareCardPublicUrl(share.previewImagePath)} />
      ) : null}
    </Helmet>
  ) : (
    <Helmet>
      <title>{t('share.page.notFoundTitle')}</title>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  )

  return (
    <div className="share-page">
      {helmet}
      <div className="share-page-inner">
        <header className="share-page-bar">
          <a className="share-page-brand" href={SITE} rel="noopener">
            <BrandLogo size={28} />
            {t('share.page.brand')}
          </a>
          <span className="share-page-tagline">{t('share.page.tagline')}</span>
        </header>

        {status === 'loading' ? (
          <div className="share-state-box" role="status">
            <Loader2 size={24} aria-hidden="true" />
            <p>{t('share.page.loading')}</p>
          </div>
        ) : null}

        {status === 'notFound' ? (
          <div className="share-state-box">
            <AlertCircle size={26} aria-hidden="true" />
            <h1>{t('share.page.notFoundTitle')}</h1>
            <p>{t('share.page.notFoundBody')}</p>
          </div>
        ) : null}

        {status === 'network' ? (
          <div className="share-state-box">
            <AlertCircle size={26} aria-hidden="true" />
            <h1>{t('share.page.networkTitle')}</h1>
            <p>{t('share.page.networkBody')}</p>
            <button type="button" className="share-btn" onClick={load}>
              {t('share.page.retry')}
            </button>
          </div>
        ) : null}

        {status === 'ready' && share ? (
          <>
            <div className="share-page-head">
              <h1>{share.title}</h1>
              {share.description ? <p className="share-page-desc">{share.description}</p> : null}
              {share.authorLabel ? (
                <p className="share-page-author">
                  {t('share.page.authorPrefix', { name: share.authorLabel })}
                </p>
              ) : null}
            </div>

            <div className="share-page-preview">
              <ThumbnailCanvas
                pattern={share.canvasData}
                gridWidth={share.gridWidth}
                gridHeight={share.gridHeight}
              />
            </div>

            <h2 className="share-page-section-title">{t('share.page.statsTitle')}</h2>
            <ul className="share-page-stats">
              <li>{t('share.card.size', { w: share.gridWidth, h: share.gridHeight })}</li>
              <li>{t('share.card.beads', { n: stats.beads })}</li>
              <li>{t('share.card.colors', { n: stats.colorCount })}</li>
              <li>
                {t('share.page.brandLabel')}
                <span>{t(`palette.brand.${share.paletteId || 'perler'}`, share.paletteId || 'perler')}</span>
              </li>
            </ul>

            <h2 className="share-page-section-title">{t('share.page.colorsTitle')}</h2>
            <ul className="share-color-grid">
              {stats.colors.slice(0, 24).map(color => (
                <li key={color.hex}>
                  <span className="share-swatch" style={{ background: color.hex }} aria-hidden="true" />
                  <span>{color.hex}</span>
                  <span>· {color.count}</span>
                </li>
              ))}
            </ul>

            <div className="share-page-cta">
              <button
                type="button"
                className="share-btn primary"
                onClick={handleCopyClick}
                disabled={copying || authLoading}
              >
                {copying ? <Loader2 size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? t('share.page.copySuccess') : t('share.page.copyToMine')}
              </button>
              <button type="button" className="share-btn ghost" onClick={() => navigate('/')}>
                <Sparkles size={16} aria-hidden="true" />
                {t('share.page.startFresh')}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>

            {!user && !authLoading ? <p className="share-page-note">{t('share.page.copyHint')}</p> : null}
            <p className="share-page-note">{t('share.page.snapshotNote')}</p>

            <footer className="share-page-foot">
              <span>{t('share.card.footer')}</span>
              <button type="button" className="share-link-btn" onClick={() => setReportOpen(true)}>
                <Flag size={12} aria-hidden="true" /> {t('share.page.report')}
              </button>
            </footer>
          </>
        ) : null}
      </div>

      {reportOpen ? (
        <div className="modal-overlay" onClick={() => setReportOpen(false)}>
          <div
            className="share-report-dialog"
            ref={reportRef}
            {...reportDialogProps}
            onClick={event => event.stopPropagation()}
          >
            <h2>{t('share.page.reportTitle')}</h2>

            <label className="share-field">
              <span>{t('share.page.reportCategory')}</span>
              <select
                value={reportCategory}
                onChange={event => setReportCategory(event.target.value)}
                disabled={reportBusy}
              >
                {REPORT_CATEGORIES.map(category => (
                  <option key={category} value={category}>
                    {t(`share.page.reportCategories.${category}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="share-field">
              <span>{t('share.page.reportDetailRequired')}</span>
              <textarea
                rows={4}
                maxLength={1000}
                value={reportDetail}
                onChange={event => setReportDetail(event.target.value)}
                disabled={reportBusy}
              />
            </label>

            <label className="share-field">
              <span>{t('share.page.reportContact')}</span>
              <input
                type="text"
                maxLength={120}
                value={reportContact}
                onChange={event => setReportContact(event.target.value)}
                disabled={reportBusy}
              />
            </label>

            {reportStatus ? (
              <p
                className={`share-status tone-${reportStatus.tone}`}
                role={reportStatus.tone === 'error' ? 'alert' : 'status'}
              >
                {reportStatus.text}
              </p>
            ) : null}

            <div className="share-dialog-actions">
              <button
                type="button"
                className="share-btn ghost"
                onClick={() => setReportOpen(false)}
                disabled={reportBusy}
              >
                {t('share.close')}
              </button>
              <button
                type="button"
                className="share-btn primary"
                onClick={handleReport}
                disabled={reportBusy || !reportDetailValid}
              >
                {t('share.page.reportSubmit')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
