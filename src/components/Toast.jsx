/**
 * 统一 toast 短暂消息气泡
 * 用法:包一层 <ToastProvider>,任意组件 useToast() → toast('文案', 'info'|'error'|'success')
 * 自动 2.6s 后消失,固定定位不参与布局(不引起界面位移)。
 */
import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)
export const useToast = () => useContext(ToastContext)

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)
  const toast = useCallback((message, type = 'info', duration = 2600) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
      <style>{`
        .toast-container {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2000;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          pointer-events: none;
          max-width: calc(100vw - 32px);
        }
        .toast-item {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          box-shadow: 0 4px 16px rgba(43,36,32,0.18);
          padding: 10px 18px;
          font-size: var(--text-sm);
          color: var(--text-primary);
          animation: toast-in 0.2s ease;
          max-width: min(420px, 100%);
          text-align: center;
        }
        .toast-error { border-color: #e74c3c; color: #c0392b; }
        .toast-success { border-color: var(--secondary-accent); color: var(--secondary-accent); }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
