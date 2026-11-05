/**
 * 统一 toast 短暂消息气泡(拼豆主题)。
 *
 * 设计结论(参考 Material snackbar、NN/g 与 WCAG 2.2.1):
 *   · 位置:桌面 / 平板固定在底部居中,手机上抬到工具栏与色卡之上 ——
 *     不遮挡顶部导航,也不压住底部操作区;
 *   · 时长:普通提示按字数 3.6–6s,错误默认常驻并给出手动关闭;
 *   · 动效:进入 300ms 缓出(上浮 + 极轻缩放),退出 240ms 淡出,
 *     不使用弹跳;prefers-reduced-motion 下退化为纯淡入淡出;
 *   · 可访问性:礼貌 / 紧迫两个常驻 live region,悬停或聚焦时暂停计时;
 *   · 排版:13px / 1.55 行高,最大宽度 420px(约 40–60 字符一行),
 *     自然换行,不缩字号、不截断功能性文案。
 *
 * 拼豆标记不再是粗糙的高光球:它保留珠面渐变、内圈与高光,中心改为
 * 与类型对应的图标(✓ / ! / i),颜色之外还有形状可读,兼顾美感与功能。
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Info, X } from 'lucide-react'

// 无 Provider 时返回 no-op,避免测试/独立组件触发 toast 崩溃
const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

const MAX_VISIBLE = 3
const EXIT_MS = 240
const MIN_DURATION_MS = 3600
const MAX_DURATION_MS = 6000

const TYPE_ICON = { success: Check, error: AlertTriangle, info: Info }

function normalizeType(type) {
  return type === 'success' || type === 'error' ? type : 'info'
}

/**
 * 时长按内容长度估算:短句约 3.6s,长句最多 6s。
 * 错误默认常驻(0),因为错误往往需要用户阅读或采取行动;
 * 调用方显式传 duration 时以调用方为准。
 */
export function resolveToastDuration(message, type, duration) {
  if (duration != null) return Math.max(0, Number(duration) || 0)
  if (type === 'error') return 0
  const chars = Array.from(String(message ?? '')).length
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, 1800 + chars * 70))
}

function ToastItem({ toast, onRemove }) {
  const { t } = useTranslation()
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)
  const exitTimerRef = useRef(null)
  const remainingRef = useRef(toast.duration)
  const startedAtRef = useRef(0)
  const exitingRef = useRef(false)

  const exit = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
    exitTimerRef.current = setTimeout(() => onRemove(toast.id), EXIT_MS)
  }, [onRemove, toast.id])

  // 自动消失:悬停 / 聚焦期间暂停,离开后按剩余时间续跑(WCAG 2.2.1)
  useEffect(() => {
    if (!toast.duration) return undefined
    remainingRef.current = toast.duration
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(exit, toast.duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [toast.duration, exit])

  const pause = () => {
    if (!toast.duration || exitingRef.current || !timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current))
  }

  const resume = () => {
    if (!toast.duration || exitingRef.current || timerRef.current) return
    if (remainingRef.current <= 0) {
      exit()
      return
    }
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(exit, remainingRef.current)
  }

  const Icon = TYPE_ICON[toast.type] || Info
  const persistent = !toast.duration

  return (
    <div
      className={`toast-item toast-${toast.type}${exiting ? ' exiting' : ''}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span className="toast-bead" aria-hidden="true">
        <Icon size={12} strokeWidth={2.5} />
      </span>
      <span className="toast-msg">{toast.message}</span>
      {persistent && (
        <button type="button" className="toast-close" onClick={exit} aria-label={t('common.close')}>
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const toast = useCallback((message, type = 'info', duration) => {
    const text = message == null ? '' : String(message)
    if (!text) return
    const safeType = normalizeType(type)
    const id = ++idRef.current
    setToasts(prev => {
      const next = [
        ...prev,
        {
          id,
          message: text,
          type: safeType,
          duration: resolveToastDuration(text, safeType, duration),
        },
      ]
      // 只保留最近几条:同时叠太多气泡会遮住画布,也失去「短暂提示」的意义
      return next.slice(-MAX_VISIBLE)
    })
  }, [])

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(item => item.id !== id))
  }, [])

  const politeToasts = toasts.filter(item => item.type !== 'error')
  const urgentToasts = toasts.filter(item => item.type === 'error')

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* 两个 live region 始终挂载:动态创建区域再写入文本,读屏往往不播报。
          普通反馈用 polite,错误用 assertive。 */}
      <div className="toast-container">
        <div className="toast-region" role="status" aria-live="polite" aria-atomic="false">
          {politeToasts.map(item => (
            <ToastItem key={item.id} toast={item} onRemove={removeToast} />
          ))}
        </div>
        <div className="toast-region" role="alert" aria-live="assertive" aria-atomic="false">
          {urgentToasts.map(item => (
            <ToastItem key={item.id} toast={item} onRemove={removeToast} />
          ))}
        </div>
      </div>

      <style>{`
        .toast-container {
          position: fixed;
          left: 50%;
          /* 底部偏移(含工具栏/色卡/键盘补偿)统一由 index.css 的
             --toast-bottom-offset 计算,组件不重抄键盘补偿表达式 */
          bottom: var(--toast-bottom-offset, 24px);
          transform: translateX(-50%);
          z-index: 2100;
          display: flex;
          flex-direction: column;
          align-items: center;
          max-width: calc(100vw - 32px);
          pointer-events: none;
        }
        .toast-region {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        /* 两个 live region 要常驻;空的那个不占高度,只有同时有内容时才拉开间距 */
        .toast-region + .toast-region:not(:empty) {
          margin-top: 8px;
        }
        .toast-item {
          --bead-color: var(--accent);
          display: flex;
          align-items: flex-start;
          gap: 10px;
          width: fit-content;
          max-width: min(420px, calc(100vw - 32px));
          padding: 10px 14px 10px 11px;
          border: 1px solid color-mix(in srgb, var(--bead-color) 13%, var(--border-color));
          border-radius: 14px;
          background: rgba(253, 251, 247, 0.94);
          background: color-mix(in srgb, var(--bead-color) 5%, color-mix(in srgb, var(--bg-primary) 92%, transparent));
          box-shadow:
            0 10px 28px rgba(43, 36, 32, 0.10),
            0 2px 6px rgba(43, 36, 32, 0.05);
          backdrop-filter: blur(10px) saturate(1.04);
          -webkit-backdrop-filter: blur(10px) saturate(1.04);
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: var(--text-base);
          font-weight: var(--font-weight-normal);
          line-height: 1.55;
          overflow-wrap: anywhere;
          text-wrap: pretty;
          pointer-events: auto;
          animation: toast-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .toast-item.exiting {
          animation: toast-out ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        .toast-success { --bead-color: var(--secondary-accent); }
        .toast-error { --bead-color: var(--error); }
        .toast-msg {
          min-width: 0;
          padding-top: 1px;
        }
        /* 拼豆:珠面渐变 + 高光 + 内圈;中心用图标表达类型,颜色之外还有形状 */
        .toast-bead {
          position: relative;
          flex: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.96);
          background:
            radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.5), transparent 42%),
            radial-gradient(circle at 50% 54%, var(--bead-color) 0%, color-mix(in srgb, var(--bead-color) 68%, #2b2420) 100%);
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.42),
            inset 0 -2px 4px rgba(43, 36, 32, 0.2),
            0 2px 6px color-mix(in srgb, var(--bead-color) 22%, transparent);
          animation: bead-settle 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .toast-bead::after {
          content: '';
          position: absolute;
          inset: 3px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.16);
          pointer-events: none;
        }
        .toast-bead svg {
          position: relative;
          z-index: 1;
          filter: drop-shadow(0 1px 1px rgba(43, 36, 32, 0.22));
        }
        .toast-close {
          flex: none;
          width: 22px;
          height: 22px;
          margin: -1px -4px -1px 0;
          align-self: center;
          display: grid;
          place-items: center;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: background-color 0.15s, color 0.15s;
        }
        .toast-close:hover {
          background: color-mix(in srgb, var(--bead-color) 10%, transparent);
          color: var(--text-primary);
        }
        .toast-close:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(6px) scale(0.99); }
        }
        @keyframes bead-settle {
          from { opacity: 0; transform: translateY(3px) scale(0.8) rotate(-6deg); }
          to { opacity: 1; transform: none; }
        }
        @media (max-width: 639px) {
          .toast-item {
            gap: 9px;
            padding: 11px 13px 11px 10px;
            max-width: calc(100vw - 24px);
            font-size: var(--text-md);
          }
          .toast-bead { width: 22px; height: 22px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .toast-item { animation: toast-fade-in 160ms ease-out both; }
          .toast-item.exiting { animation: toast-fade-out 160ms ease-in forwards; }
          .toast-bead { animation: none; }
        }
        @keyframes toast-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes toast-fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
