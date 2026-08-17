/**
 * 统一 toast 短暂消息气泡(拼豆主题风)
 * - 淡入/淡出动画自然流畅(cubic-bezier 弹性淡入 + 平滑淡出)
 * - 背景取站点暖色主题(渐变 + 圆角 + 柔和阴影),左侧色条 + 拼豆圆点(带中孔)标识类型
 * - info(accent 橙)/ success(secondary-accent 青)/ error(暖红)
 * - 文案完整不省略;固定定位,不参与布局、不引起界面位移
 */
import { createContext, useContext, useState, useCallback, useRef } from 'react'

// 无 Provider 时返回 no-op,避免测试/独立组件触发 toast 崩溃
const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)
  const toast = useCallback((message, type = 'info', duration = 2800) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    // 先标记 exiting 播放淡出动画,再真正移除
    setTimeout(() => {
      setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 280)
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item toast-${t.type}${t.exiting ? ' exiting' : ''}`}>
            <span className="toast-bead" aria-hidden="true" />
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        .toast-container {
          position: fixed;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2000;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          pointer-events: none;
          max-width: calc(100vw - 32px);
        }
        .toast-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: linear-gradient(135deg, var(--bg-secondary), var(--bg-primary));
          border: 1px solid var(--border-color);
          border-left: 3px solid var(--accent);
          border-radius: 12px;
          box-shadow: 0 6px 20px rgba(43, 36, 32, 0.16);
          padding: 12px 18px;
          color: var(--text-primary);
          font-size: var(--text-sm);
          line-height: 1.55;
          max-width: min(460px, calc(100vw - 32px));
          animation: toast-in 0.28s cubic-bezier(0.21, 1.02, 0.73, 1);
          word-break: break-word;
        }
        .toast-item.exiting {
          animation: toast-out 0.26s ease forwards;
        }
        /* 拼豆圆点:带中孔的珠子,呼应拼豆设计主题 */
        .toast-bead {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 3px;
          background: var(--accent);
          box-shadow: inset 0 -2px 3px rgba(0, 0, 0, 0.18), inset 0 2px 2px rgba(255, 255, 255, 0.45);
          position: relative;
        }
        .toast-bead::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 3.5px;
          height: 3.5px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.3);
        }
        .toast-success { border-left-color: var(--secondary-accent); }
        .toast-success .toast-bead { background: var(--secondary-accent); }
        .toast-error { border-left-color: #e74c3c; }
        .toast-error .toast-bead { background: #e74c3c; }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-10px) scale(0.97); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
