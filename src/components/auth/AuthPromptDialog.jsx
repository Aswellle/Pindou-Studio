import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDialogA11y } from '../../hooks/useDialogA11y'

/**
 * AuthPromptDialog — 高级功能入口的登录引导浮层。
 *
 * 设计原则(规格 08 §5 / 增长最佳实践):
 *   - 不把入口做成 disabled:按钮可点、能解释「为什么需要登录」,键盘与读屏可达;
 *   - 先展示价值再要求注册:说明解锁什么、登录后还能得到什么(云端同步);
 *   - 提供「稍后再说」出口,不做阻断式弹窗疲劳;关闭后仍可继续游客创作;
 *   - 复用 useDialogA11y:role/aria-modal/Escape/焦点归还,移动端不自动聚焦输入框。
 *
 * 只负责解释与分流;真正的跳转由父级(ExportPanel → App)注入 onGoAuth。
 */
export default function AuthPromptDialog({ open, reason = 'ironing', onClose, onGoAuth }) {
  const { t } = useTranslation()
  const { ref, dialogProps } = useDialogA11y({
    open,
    onClose,
    label: t('auth.gate.title'),
  })

  if (!open) return null

  const title = reason === 'quality' ? t('auth.gate.qualityTitle') : t('auth.gate.ironingTitle')
  const description = reason === 'quality' ? t('auth.gate.qualityDescription') : t('auth.gate.ironingDescription')

  return createPortal(
    <div className="auth-prompt-overlay" onClick={onClose}>
      {/* className 与 dialogProps 保持同行:移动端浮层契约测试按行扫描 */}
      <div className="auth-prompt-panel" ref={ref} {...dialogProps} onClick={e => e.stopPropagation()}>
        <div className="auth-prompt-lock" aria-hidden="true">🔒</div>
        <h3>{title}</h3>
        <p className="auth-prompt-desc">{description}</p>
        <p className="auth-prompt-benefits">{t('auth.gate.description')}</p>
        <div className="auth-prompt-actions">
          <button type="button" className="btn btn-primary" onClick={() => onGoAuth?.('register')}>
            {t('auth.gate.register')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onGoAuth?.('login')}>
            {t('auth.gate.login')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('auth.gate.later')}
          </button>
        </div>
      </div>
      <style>{`
        .auth-prompt-overlay {
          position: fixed;
          inset: 0;
          z-index: 1300;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.45);
        }
        .auth-prompt-panel {
          width: min(420px, 100%);
          max-height: calc(100dvh - 32px);
          overflow-y: auto;
          background: var(--bg-primary);
          border-radius: var(--radius-card, 12px);
          padding: 22px 20px 18px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
        }
        .auth-prompt-lock {
          font-size: 22px;
          line-height: 1;
          margin-bottom: 8px;
        }
        .auth-prompt-panel h3 {
          margin: 0 0 8px;
          font-size: var(--text-lg);
          color: var(--text-primary);
        }
        .auth-prompt-desc {
          margin: 0 0 8px;
          font-size: var(--text-sm);
          line-height: 1.6;
          color: var(--text-secondary);
        }
        .auth-prompt-benefits {
          margin: 0 0 16px;
          padding: 8px 10px;
          font-size: var(--text-xs);
          line-height: 1.6;
          color: var(--text-secondary);
          background: var(--bg-secondary);
          border-radius: 8px;
        }
        .auth-prompt-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .auth-prompt-actions .btn {
          width: 100%;
          justify-content: center;
        }
        @media (max-width: 640px) {
          .auth-prompt-panel { padding: 18px 16px 16px; }
        }
      `}</style>
    </div>,
    document.body
  )
}
