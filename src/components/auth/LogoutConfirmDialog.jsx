import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDialogA11y } from '../../hooks/useDialogA11y'

/**
 * LogoutConfirmDialog — 退出登录二次确认。
 *
 * 退出会同时清掉本机未完成的自动保存草稿(见 useAuth.logout),因此不能一键误触。
 * 这是必须做选择的对话框:遮罩点击与 Escape 都不关闭,只能点「取消」或「退出登录」。
 * 浮层定位/滚动/键盘补偿由 index.css 共享浮层组提供,组件只保留视觉差异。
 */
export default function LogoutConfirmDialog({ open, onClose, onConfirm }) {
  const { t } = useTranslation()
  const title = t('profile.confirmLogoutTitle')
  const { ref, dialogProps } = useDialogA11y({
    open,
    onClose,
    label: title,
    role: 'alertdialog',
    dismissible: false,
  })

  if (!open) return null

  return createPortal(
    <div className="logout-confirm-overlay">
      <div className="logout-confirm-panel" ref={ref} {...dialogProps} onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{t('profile.confirmLogoutBody')}</p>
        <div className="logout-confirm-actions">
          <button type="button" className="btn btn-ghost" autoFocus onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn logout-confirm-danger" onClick={onConfirm}>
            {t('auth.logout')}
          </button>
        </div>
      </div>
      <style>{`
        .logout-confirm-overlay {
          /* 定位/高度/内边距/居中由 index.css 共享浮层组提供;这里只留视觉差异 */
          z-index: 1300;
          background: rgba(43, 36, 32, 0.45);
        }
        .logout-confirm-panel {
          width: min(380px, 100%);
          padding: 24px;
          background: var(--bg-primary);
          border-radius: var(--radius-card, 12px);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
        }
        .logout-confirm-panel h3 {
          margin: 0 0 8px;
          font-size: var(--text-lg);
        }
        .logout-confirm-panel p {
          margin: 0 0 16px;
          color: var(--text-secondary);
          font-size: var(--text-md);
        }
        .logout-confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .logout-confirm-danger {
          background: var(--error);
          color: #fff;
        }
        .logout-confirm-danger:hover {
          opacity: 0.9;
        }
        @media (max-width: 640px) {
          .logout-confirm-panel { padding: 20px; }
          .logout-confirm-actions .btn { flex: 1 1 auto; }
        }
      `}</style>
    </div>,
    document.body
  )
}
