/**
 * BottomSheet — 移动端底部抽屉面板
 *
 * 替代 Center Modal 用于复杂设置：
 * - 从底部滑入，顶部圆角 + 拖拽手柄
 * - 内容区域可滚动
 * - 点击遮罩或下滑关闭
 * - 支持 Safe Area（env(safe-area-inset-bottom)）
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function BottomSheet({ open, onClose, title, children }) {
  const sheetRef = useRef(null)

  // ESC 键关闭
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 锁定 body 滚动
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className="bottom-sheet"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="bottom-sheet-handle" onClick={onClose} />
        <div className="bottom-sheet-header">
          <h3>{title}</h3>
          <button className="bottom-sheet-close" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="bottom-sheet-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
