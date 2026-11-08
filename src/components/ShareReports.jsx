/**
 * ShareReports — 分享举报处置(管理员)。
 *
 * 数据经 admin RPC(RLS + is_admin 服务端强制):
 *   · admin_list_work_share_reports(p_status, p_limit) —— 列表(含分享摘要)
 *   · admin_resolve_work_share_report(p_report_id, p_action, p_reason)
 *       'reviewing' 受理中 / 'actioned' 成立并冻结分享 / 'dismissed' 驳回(需理由)
 *   · admin_restore_work_share(p_share_id, p_reason) —— 恢复误冻结的分享
 *
 * 闭环:待处理 → 受理中 → 已成立(分享冻结,可恢复)/ 已驳回;
 * 终态在服务端锁定,前端只隐藏不可用操作,不构成权限边界。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Flag, RefreshCw } from 'lucide-react'
import { supabase } from '../services/supabase'
import LoadingScreen from './LoadingScreen'
import { useToast } from './Toast'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useScrollLock } from '../hooks/useScrollLock'

const REPORT_STATUSES = ['received', 'reviewing', 'actioned', 'dismissed']
const FILTERS = ['all', ...REPORT_STATUSES]
// 终态(actioned/dismissed)在服务端锁定:前端据此隐藏处置按钮
const TERMINAL = new Set(['actioned', 'dismissed'])

function formatMinute(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 需要填写理由的处置(成立/驳回/恢复):模态框收集,理由进 moderation_log */
function ReasonModal({ mode, onSubmit, onClose }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  useScrollLock(true)
  const { ref, dialogProps } = useDialogA11y({
    open: true,
    onClose,
    label: t(`admin.reports.reasonTitle.${mode}`),
    role: 'alertdialog',
    dismissible: false,
  })
  const valid = reason.trim().length > 0

  return (
    <div className="admin-modal-overlay" onClick={undefined}>
      <div className="admin-modal" ref={ref} {...dialogProps} onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>{t(`admin.reports.reasonTitle.${mode}`)}</h3>
        </div>
        <div className="admin-modal-body">
          <p className="admin-modal-text">{t('admin.reports.reasonHint')}</p>
          <div className="admin-field">
            <label htmlFor="share-report-reason">{t('admin.reports.reasonLabel')}</label>
            <textarea
              id="share-report-reason"
              className="admin-textarea"
              style={{ minHeight: 90 }}
              maxLength={500}
              value={reason}
              autoFocus
              onChange={e => setReason(e.target.value)}
              placeholder={t('admin.reports.reasonPlaceholder')}
            />
          </div>
          <div className="admin-actions">
            <button className="admin-btn primary" disabled={!valid} onClick={() => onSubmit(reason.trim())}>
              {t('admin.reports.confirm')}
            </button>
            <button className="admin-btn secondary" onClick={onClose}>
              {t('admin.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ShareReports() {
  const { t } = useTranslation()
  const toast = useToast()
  const [reports, setReports] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  // 待填写理由的处置:{ report, mode: 'actioned' | 'dismissed' | 'restore' }
  const [pendingReason, setPendingReason] = useState(null)

  const load = useCallback(
    async (status = filter) => {
      if (!supabase) {
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error: err } = await supabase.rpc('admin_list_work_share_reports', {
        p_status: status,
        p_limit: 200,
      })
      if (err) {
        setError(err.message || String(err))
        setReports([])
      } else {
        setError('')
        setReports(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    },
    [filter]
  )

  useEffect(() => {
    load(filter)
  }, [filter, load])

  /** 处置:'reviewing' 直接执行;其余经理由模态框 */
  const resolve = async (report, action, reason = '') => {
    if (busyId) return
    setBusyId(report.id)
    try {
      const { error: err } = await supabase.rpc('admin_resolve_work_share_report', {
        p_report_id: report.id,
        p_action: action,
        p_reason: reason,
      })
      if (err) throw err
      toast(t(`admin.reports.toast.${action}`), 'success')
      setPendingReason(null)
      await load()
    } catch (e) {
      toast(e?.message || t('admin.users.opFailed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const restore = async (report, reason) => {
    if (busyId) return
    setBusyId(report.id)
    try {
      const { error: err } = await supabase.rpc('admin_restore_work_share', {
        p_share_id: report.share_id,
        p_reason: reason,
      })
      if (err) throw err
      toast(t('admin.reports.toast.restored'), 'success')
      setPendingReason(null)
      await load()
    } catch (e) {
      toast(e?.message || t('admin.users.opFailed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const submitReason = reason => {
    if (!pendingReason) return
    const { report, mode } = pendingReason
    if (mode === 'restore') restore(report, reason)
    else resolve(report, mode, reason)
  }

  const counts = useMemo(() => {
    const map = { all: reports.length }
    for (const s of REPORT_STATUSES) map[s] = reports.filter(r => r.status === s).length
    return map
  }, [reports])

  return (
    <div>
      <div className="admin-card">
        <div className="admin-card-head">
          <h3>
            <Flag size={16} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t('admin.reports.title')}
          </h3>
          <button className="admin-btn secondary small" onClick={() => load()} disabled={loading}>
            <RefreshCw size={13} aria-hidden="true" /> {t('admin.reports.refresh')}
          </button>
        </div>
        <p className="admin-field-hint">{t('admin.reports.hint')}</p>

        <div className="sr-filters" role="tablist" aria-label={t('admin.reports.title')}>
          {FILTERS.map(f => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`sr-filter ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`admin.reports.filter.${f}`)}
              {f !== 'all' && counts[f] ? <span className="sr-filter-count">{counts[f]}</span> : null}
            </button>
          ))}
        </div>

        {error && (
          <div className="admin-result warn">
            {t('admin.users.loadFailed')}: {error}
          </div>
        )}

        {loading ? (
          <LoadingScreen text={t('gallery.cloudLoading')} />
        ) : reports.length === 0 ? (
          // 加载失败时不显示「暂无举报」空态,避免误导(错误已在上方展示)
          !error && <div className="admin-empty">{t('admin.reports.empty')}</div>
        ) : (
          <div className="admin-list">
            {reports.map(r => {
              const shareGone = !r.share_status
              const shareLink = r.share_id ? `/share/${r.share_id}` : null
              const canResolve = !TERMINAL.has(r.status)
              return (
                <div key={r.id} className="sr-row">
                  <div className="sr-row-head">
                    <span className="sr-category">
                      {t(`share.page.reportCategories.${r.category}`, r.category)}
                    </span>
                    <span className={`sr-status st-${r.status}`}>
                      {t(`admin.reports.status.${r.status}`)}
                    </span>
                    <span className="sr-time">{formatMinute(r.created_at)}</span>
                  </div>

                  <p className="sr-detail">{r.detail || t('admin.reports.noDetail')}</p>

                  <div className="sr-share">
                    <span className="sr-share-label">{t('admin.reports.reportedShare')}</span>
                    {shareGone ? (
                      <span className="sr-share-missing">{t('admin.reports.shareMissing')}</span>
                    ) : (
                      <>
                        <span className="sr-share-title">{r.share_title || t('gallery.workName')}</span>
                        <span className="sr-share-meta">
                          {t(`admin.reports.shareStatus.${r.share_status}`, r.share_status)}
                          {r.share_author ? ` · ${t('admin.reports.shareAuthor')}: ${r.share_author}` : ''}
                          {r.share_grid_width ? ` · ${r.share_grid_width}×${r.share_grid_height}` : ''}
                        </span>
                        {shareLink ? (
                          <a
                            className="sr-share-link"
                            href={shareLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={12} aria-hidden="true" /> {t('admin.reports.viewShare')}
                          </a>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="sr-contact">
                    {r.contact
                      ? `${t('admin.reports.contactWith')}: ${r.contact}`
                      : t('admin.reports.noContact')}
                  </div>

                  <div className="sr-actions">
                    {canResolve && r.status === 'received' ? (
                      <button
                        className="admin-btn secondary small"
                        disabled={busyId === r.id}
                        onClick={() => resolve(r, 'reviewing')}
                      >
                        {t('admin.reports.startReview')}
                      </button>
                    ) : null}
                    {canResolve ? (
                      <>
                        <button
                          className="admin-btn danger small"
                          disabled={busyId === r.id}
                          onClick={() => setPendingReason({ report: r, mode: 'actioned' })}
                        >
                          {t('admin.reports.resolve')}
                        </button>
                        <button
                          className="admin-btn secondary small"
                          disabled={busyId === r.id}
                          onClick={() => setPendingReason({ report: r, mode: 'dismissed' })}
                        >
                          {t('admin.reports.dismiss')}
                        </button>
                      </>
                    ) : null}
                    {r.status === 'actioned' && r.share_status === 'revoked' ? (
                      <button
                        className="admin-btn secondary small"
                        disabled={busyId === r.id}
                        onClick={() => setPendingReason({ report: r, mode: 'restore' })}
                      >
                        {t('admin.reports.restore')}
                      </button>
                    ) : null}
                    {r.status === 'actioned' && r.share_status !== 'revoked' ? (
                      <span className="sr-hint">{t('admin.reports.alreadyNotPublic')}</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pendingReason ? (
        <ReasonModal
          mode={pendingReason.mode}
          onSubmit={submitReason}
          onClose={() => setPendingReason(null)}
        />
      ) : null}

      <style>{`
        .sr-filters {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin: 10px 0 14px;
        }
        .sr-filter {
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .sr-filter:hover { background: var(--bg-hover); color: var(--text-primary); }
        .sr-filter.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .sr-filter-count {
          background: rgba(255, 255, 255, 0.25);
          border-radius: 999px;
          padding: 0 6px;
          font-size: 11px;
          font-variant-numeric: tabular-nums;
        }
        .sr-row {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sr-row-head {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .sr-category {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
          background: var(--accent-soft);
          border-radius: 999px;
          padding: 2px 10px;
        }
        .sr-status {
          font-size: 11px;
          font-weight: 600;
          border-radius: 999px;
          padding: 2px 10px;
          border: 1px solid transparent;
        }
        .sr-status.st-received { background: var(--warning-bg); color: var(--warning); border-color: var(--warning-border); }
        .sr-status.st-reviewing { background: rgba(76, 130, 226, 0.1); color: #4c82e2; border-color: rgba(76, 130, 226, 0.3); }
        .sr-status.st-actioned { background: rgba(229, 57, 53, 0.08); color: var(--error); border-color: rgba(229, 57, 53, 0.3); }
        .sr-status.st-dismissed { background: var(--bg-tertiary); color: var(--text-secondary); border-color: var(--border-color); }
        .sr-time {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .sr-detail {
          margin: 0;
          font-size: var(--text-sm);
          line-height: 1.6;
          color: var(--text-primary);
          white-space: pre-wrap;
          word-break: break-word;
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 8px 10px;
        }
        .sr-share {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 12px;
        }
        .sr-share-label { color: var(--text-muted); flex-shrink: 0; }
        .sr-share-title { font-weight: 600; color: var(--text-primary); }
        .sr-share-meta { color: var(--text-secondary); }
        .sr-share-missing { color: var(--text-muted); font-style: italic; }
        .sr-share-link {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: var(--accent);
          text-decoration: none;
          font-size: 12px;
        }
        .sr-share-link:hover { text-decoration: underline; }
        .sr-contact {
          font-size: 12px;
          color: var(--text-secondary);
          word-break: break-all;
        }
        .sr-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }
        .sr-hint { font-size: 12px; color: var(--text-muted); }
      `}</style>
    </div>
  )
}
