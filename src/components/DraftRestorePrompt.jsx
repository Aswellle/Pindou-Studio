import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useScrollLock } from '../hooks/useScrollLock'

/**
 * DraftRestorePrompt — 自动保存草稿的恢复提示(规格 03 §7)。
 *
 * 为什么是「提示」而不是「静默恢复」:
 *   草稿可能是几分钟前随手涂的,也可能是半小时的心血。直接覆盖当前画布会让
 *   「我今天想画个新的」变成「怎么又回来了」;直接丢弃则等于白做自动保存。
 *   两种默认都错,只能让用户选一次。
 *
 * 只给两个动作:恢复 / 丢弃。**没有「稍后」** —— 留着提示在画布上挡着,
 * 用户下次打开还会看到,反而变成打扰。丢弃是明确的,恢复也是明确的。
 *
 * 走 .modal-overlay 共享浮层基础(iOS 键盘/视觉视口契约),portal 到 body
 * (iOS 上 fixed 元素嵌在滚动祖先里会被键盘顶偏,见 index.css 注释)。
 */
export default function DraftRestorePrompt({ draft, onRestore, onDiscard }) {
  const { t } = useTranslation()
  const open = Boolean(draft)

  useScrollLock(open)
  const { ref, dialogProps } = useDialogA11y({
    open,
    onClose: onDiscard,
    label: t('autosave.restoreTitle'),
  })

  if (!open) return null

  const rows = draft.canvasData?.length || 0
  const cols = draft.canvasData?.[0]?.length || 0
  const savedLabel = formatSavedAt(draft.savedAt)

  return createPortal(
    <div className="modal-overlay" onClick={onDiscard}>
      <div
        className="draft-restore-dialog"
        ref={ref}
        {...dialogProps}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t('autosave.restoreTitle')}</h3>
        <p className="draft-restore-body">
          {savedLabel
            ? t('autosave.restoreBodyWithTime', { time: savedLabel, w: cols, h: rows })
            : t('autosave.restoreBody', { w: cols, h: rows })}
        </p>
        <p className="draft-restore-hint">{t('autosave.restoreHint')}</p>
        <div className="draft-restore-actions">
          <button type="button" className="btn btn-ghost" onClick={onDiscard}>
            {t('autosave.discard')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onRestore}>
            {t('autosave.restore')}
          </button>
        </div>
      </div>

      <style>{`
        .draft-restore-dialog {
          background: var(--bg-primary);
          border-radius: var(--radius-card);
          padding: 24px;
          width: 380px;
          max-width: calc(100vw - 32px);
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 8px 40px rgba(43, 36, 32, 0.18);
        }
        .draft-restore-dialog h3 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }
        .draft-restore-body {
          font-size: var(--text-base);
          color: var(--text-primary);
          line-height: 1.6;
          margin: 0;
        }
        .draft-restore-hint {
          font-size: var(--text-sm);
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0;
        }
        .draft-restore-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 6px;
        }
      `}</style>
    </div>,
    document.body,
  )
}

/**
 * 草稿时间的友好显示。
 *
 * 不引第三方日期库:这里只需要「今天 hh:mm / 昨天 hh:mm / 具体日期」三档,
 * 而 toLocaleString 在四种语言下都能给出本地化格式。格式化失败(极旧浏览器/
 * 非法时间戳)时返回空串,由调用方退回不带时间的文案。
 */
function formatSavedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}
