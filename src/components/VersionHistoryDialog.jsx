/**
 * VersionHistoryDialog — 作品版本时间线(C2)。
 *
 * 语义边界(与 workVersions.js 一致,不在这里重复判断):
 *   **一次显式保存 = 一个版本。** 自动保存的草稿不进这条链路,
 *   所以画一笔自动存一次不会让时间线膨胀。
 *
 * 三条交互约束:
 *   1. **回滚本身也产生一条历史** —— 由 useSavedWorks.rollbackToVersion 保证,
 *      这里只负责提示用户「当前内容会先被保留」,不能让回滚看起来是破坏性的;
 *   2. **配额可见** —— 面板底部显示版本占用的估算字节数;
 *   3. **差异可读** —— 每条版本显示与当前版本的珠子数/用色数变化,
 *      逐格差异只给总数(拼豆图纸的逐格 diff 没法用文本呈现)。
 *
 * 浮层基础全部复用 `.modal-overlay`(index.css 的共享组):iOS 键盘收缩、
 * portal 到 body、safe-area 都由那一套统一处理,这里只保留自己的内容样式。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { History, RotateCcw, X } from 'lucide-react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { diffVersions, summarizeWork, versionLabel, MAX_VERSIONS_PER_WORK } from '../services/project/workVersions'
import './VersionHistoryDialog.css'

/** 字节数 → 人类可读;版本占用是估算值,不需要精确到字节 */
function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 版本时间显示:只到分钟,秒对用户没有意义 */
function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function VersionHistoryDialog({ open, work, loadVersions, onRollback, onClose }) {
  const { t } = useTranslation()
  const [state, setState] = useState({ loading: true, versions: [], bytes: 0 })
  const [busyId, setBusyId] = useState(null)

  const { ref, dialogProps } = useDialogA11y({
    open,
    onClose,
    label: t('versions.title'),
  })

  // 打开时拉一次时间线。work 变了(切换作品)也重拉。
  useEffect(() => {
    if (!open || !work?.id) return undefined
    let cancelled = false
    setState({ loading: true, versions: [], bytes: 0 })
    ;(async () => {
      const result = await loadVersions(work.id)
      if (!cancelled) setState({ loading: false, ...result })
    })()
    return () => { cancelled = true }
  }, [open, work?.id, loadVersions])

  // 当前版本(时间线第一条)作为差异基准
  const current = state.versions[0] || null
  const rows = useMemo(() => state.versions.map((v, index) => {
    // 参数顺序是 (older, newer),返回值 = newer - older。
    // 这一行是「旧版」,要表达「它相对当前版差多少」→ 旧版减当前版,
    // 所以把 current 当 older、v 当 newer。旧版少一颗珠子时显示 -1,
    // 与用户「这一版比现在少」的直觉一致。
    const diff = index === 0 ? null : diffVersions(current, v)
    const sum = summarizeWork(v.canvasData)
    return { version: v, index, diff, sum, label: versionLabel(v, index, state.versions.length) }
  }), [state.versions, current])

  const handleRollback = useCallback(async (version, index) => {
    if (!work || busyId != null) return
    const time = formatTime(version.savedAt)
    if (!window.confirm(t('versions.rollbackConfirm', { time }))) return
    setBusyId(version.versionId ?? index)
    try {
      const restored = await onRollback(work, version)
      if (!restored) {
        window.alert(t('versions.rollbackFailed'))
        return
      }
      // 回滚会追加一条新版本,必须重拉才能看到(否则时间线看起来没变)
      const result = await loadVersions(work.id)
      setState({ loading: false, ...result })
    } finally {
      setBusyId(null)
    }
  }, [work, busyId, onRollback, loadVersions, t])

  if (!open) return null

  return createPortal(
    <div className="modal-overlay version-overlay" onClick={onClose}>
      <div
        className="version-dialog"
        ref={ref}
        {...dialogProps}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="version-header">
          <h3>
            <History size={18} aria-hidden="true" />
            {t('versions.title')}
          </h3>
          <button
            type="button"
            className="version-close"
            onClick={onClose}
            aria-label={t('versions.close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {state.loading ? (
          <p className="version-empty">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <div className="version-empty">
            <p>{t('versions.empty')}</p>
            <span>{t('versions.emptyHint')}</span>
          </div>
        ) : (
          <ul className="version-list">
            {rows.map(({ version, index, diff, sum, label }) => (
              <li key={version.versionId ?? index} className={`version-item${index === 0 ? ' current' : ''}`}>
                <div className="version-meta">
                  <span className="version-time">{formatTime(version.savedAt)}</span>
                  <span className="version-label">{t(label.key, label.params)}</span>
                </div>
                <div className="version-stats">
                  <span>{sum.beads} {t('versions.beads')}</span>
                  <span>{sum.colors} {t('versions.colors')}</span>
                </div>
                {/* 与当前版本的差异:珠子数变化是用户最关心的量级信息 */}
                <div className="version-diff">
                  {index === 0 ? (
                    <span className="diff-same">{t('versions.diffSame')}</span>
                  ) : (
                    <>
                      <span className={diff.beads === 0 ? 'diff-same' : diff.beads > 0 ? 'diff-up' : 'diff-down'}>
                        {t('versions.diffBeads', { n: diff.beads > 0 ? `+${diff.beads}` : diff.beads })}
                      </span>
                      <span className={diff.colors === 0 ? 'diff-same' : diff.colors > 0 ? 'diff-up' : 'diff-down'}>
                        {t('versions.diffColors', { n: diff.colors > 0 ? `+${diff.colors}` : diff.colors })}
                      </span>
                      <span className="diff-cells">{t('versions.diffCells', { n: diff.changedCells })}</span>
                    </>
                  )}
                </div>
                {index !== 0 && (
                  <button
                    type="button"
                    className="version-rollback"
                    onClick={() => handleRollback(version, index)}
                    disabled={busyId != null}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {t('versions.rollback')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="version-footer">
          <span>{t('versions.storage', { size: formatBytes(state.bytes) })}</span>
          <span className="version-limit">{t('versions.limitHint', { n: MAX_VERSIONS_PER_WORK })}</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
