import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check } from 'lucide-react'

/**
 * AutoSaveStatus — 自动保存状态的悬浮旁注(桌面 / 平板)。
 *
 * 为什么不再放在顶栏:
 *   顶栏在平板宽度下要同时容纳 LOGO、四项文字导航、保存按钮、语言切换与账号区,
 *   「已自动保存」一旦常驻就会挤压导航,导致图标与文字断行。自动保存本质上是
 *   画布状态的旁注,不该参与顶栏布局。
 *
 * 出现位置固定在顶栏下方的居中悬浮层:不占任何布局空间,也不遮住左右侧栏;
 * 「保存中」即时出现,「已保存」停留 2.4s 后淡出,失败则保持到下一次保存尝试。
 * 手机端仍由 MobileCanvasInfoBar 承载(那里已有专属的一行摘要)。
 */
const SAVED_VISIBLE_MS = 2400
const EXIT_MS = 200

export default function AutoSaveStatus({ state, active = true }) {
  const { t } = useTranslation()
  const [display, setDisplay] = useState(null)
  const [exiting, setExiting] = useState(false)
  const timersRef = useRef([])

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timersRef.current) clearTimeout(timer)
      timersRef.current = []
    }
    clearTimers()

    // 空闲 / 待写入 / 关闭自动保存:没有需要展示的结论
    if (!active || state === 'idle' || state === 'pending' || state === 'off') {
      setDisplay(null)
      setExiting(false)
      return undefined
    }

    if (state === 'saving' || state === 'failed') {
      setDisplay(state)
      setExiting(false)
      return undefined
    }

    if (state === 'saved') {
      setDisplay('saved')
      setExiting(false)
      const hide = setTimeout(() => {
        setExiting(true)
        const remove = setTimeout(() => {
          setDisplay(null)
          setExiting(false)
        }, EXIT_MS)
        timersRef.current.push(remove)
      }, SAVED_VISIBLE_MS)
      timersRef.current.push(hide)
    }

    return () => clearTimers()
  }, [state, active])

  // 卸载时清掉仍在跑的计时器(例如保存提示停留期间切换页面)
  useEffect(
    () => () => {
      for (const timer of timersRef.current) clearTimeout(timer)
    },
    []
  )

  if (!display) return null

  const label =
    display === 'saving'
      ? t('autosave.statusSaving')
      : display === 'saved'
        ? t('autosave.statusSaved')
        : t('autosave.statusFailed')
  const isError = display === 'failed'

  return createPortal(
    <div
      className={`autosave-chip is-${display}${exiting ? ' is-exiting' : ''}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      title={isError ? t('autosave.statusFailedHint') : undefined}
    >
      <span className="autosave-chip-icon" aria-hidden="true">
        {display === 'saving' && <span className="autosave-spinner" />}
        {display === 'saved' && <Check size={12} strokeWidth={2.6} />}
        {display === 'failed' && <AlertTriangle size={12} strokeWidth={2.4} />}
      </span>
      <span className="autosave-chip-text">{label}</span>

      <style>{`
        .autosave-chip {
          position: fixed;
          top: 72px;
          left: 50%;
          z-index: 1150;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 11px 6px 9px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
          background: color-mix(in srgb, var(--bg-primary) 84%, transparent);
          box-shadow: 0 4px 16px rgba(43, 36, 32, 0.08);
          backdrop-filter: blur(8px) saturate(1.05);
          -webkit-backdrop-filter: blur(8px) saturate(1.05);
          color: var(--text-secondary);
          font-family: var(--font-sans);
          font-size: var(--text-sm);
          font-weight: var(--font-weight-medium);
          line-height: 1;
          white-space: nowrap;
          pointer-events: none;
          transform: translateX(-50%);
          animation: autosaveChipIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .autosave-chip.is-saving .autosave-chip-icon { color: var(--accent); }
        .autosave-chip.is-saved {
          color: var(--text-muted);
        }
        .autosave-chip.is-saved .autosave-chip-icon { color: var(--secondary-accent); }
        .autosave-chip.is-failed {
          color: var(--error);
          border-color: color-mix(in srgb, var(--error) 24%, var(--border-color));
          background: color-mix(in srgb, var(--error) 7%, var(--bg-primary));
        }
        .autosave-chip.is-failed .autosave-chip-icon { color: var(--error); }
        .autosave-chip.is-exiting {
          animation: autosaveChipOut ${EXIT_MS}ms ease-in forwards;
        }
        .autosave-chip-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 13px;
          height: 13px;
          flex: none;
        }
        .autosave-spinner {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          border: 1.5px solid color-mix(in srgb, var(--accent) 24%, transparent);
          border-top-color: var(--accent);
          animation: autosaveSpin 0.85s linear infinite;
        }
        @keyframes autosaveChipIn {
          from { opacity: 0; transform: translate(-50%, -5px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes autosaveChipOut {
          from { opacity: 1; transform: translate(-50%, 0); }
          to { opacity: 0; transform: translate(-50%, -4px); }
        }
        @keyframes autosaveSpin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .autosave-chip,
          .autosave-chip.is-exiting {
            animation-duration: 1ms;
          }
          .autosave-spinner {
            animation: none;
            border-color: color-mix(in srgb, var(--accent) 35%, transparent);
            border-top-color: var(--accent);
          }
        }
      `}</style>
    </div>,
    document.body
  )
}
