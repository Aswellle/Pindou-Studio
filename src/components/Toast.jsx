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
  const toast = useCallback((message, type = 'info', duration = 4200) => {
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
          /* 拼豆类型色默认值放在 item 层:success/error 在父级覆盖后可继承到珠子;
             若直接声明在 .toast-bead 上,自身声明会遮蔽父级继承,类型色不生效 */
          --bead-color: var(--accent);
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: linear-gradient(135deg, var(--bg-secondary), var(--bg-primary));
          border: 1px solid var(--border-color);
          border-left: 4px solid var(--accent);
          border-radius: 14px;
          box-shadow: 0 8px 24px rgba(43, 36, 32, 0.18);
          padding: 14px 20px;
          color: var(--text-primary);
          font-size: var(--text-md);
          line-height: 1.55;
          max-width: min(480px, calc(100vw - 32px));
          animation: toast-in 0.35s cubic-bezier(0.22, 1, 0.36, 1);
          word-break: break-word;
        }
        .toast-item.exiting {
          animation: toast-out 0.3s ease forwards;
        }
        /* 拼豆标记:高光立体小珠(顶部高光 + 中孔 + 底部暗边),类型色随类型变化 */
        .toast-bead {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 1px;
          background: radial-gradient(circle at 32% 30%, #ffffff 0%, var(--bead-color) 50%, rgba(0, 0, 0, 0.22) 100%);
          box-shadow: 0 2px 5px rgba(43, 36, 32, 0.28);
          position: relative;
        }
        /* 顶部高光 */
        .toast-bead::before {
          content: '';
          position: absolute;
          left: 4px;
          top: 3px;
          width: 7px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.8);
          transform: rotate(-25deg);
        }
        /* 中孔 */
        .toast-bead::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 5px;
          height: 5px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.35);
        }
        .toast-success { --bead-color: var(--secondary-accent); border-left-color: var(--secondary-accent); }
        .toast-error { --bead-color: #e74c3c; border-left-color: #e74c3c; }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-14px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-10px) scale(0.96); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
