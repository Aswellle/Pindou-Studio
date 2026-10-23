/**
 * SelectionContextMenu — 长按选区弹出的上下文菜单(A4)。
 *
 * 移动端把全部选区命令平铺在底部操作条上,屏幕小的时候一屏放不下、还得
 * 来回找。长按选区直接就地弹出最常用的几条命令,手指不用离开画布。
 *
 * 三条来自验收要求的硬约束:
 *   1. **长按不触发拖动** —— 计时器在 Canvas 里管,菜单只管显示;
 *   2. **portal 到 body** —— 否则会被画布的 `overflow: hidden` 裁掉,
 *      iOS 上还会因为祖先的包含块而定位错乱;
 *   3. **点击外部关闭** —— 透明遮罩拦截一次点击,点哪儿都算「取消」。
 *
 * 遮罩与 `export-menu-overlay` 同构:只拦点击、不承载内容,因此不适用
 * 全屏浮层的键盘补偿契约(见 mobileOverlayContract.test.js 的 CLICK_CATCHERS)。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Copy, Scissors, ClipboardPaste, PaintBucket, Eraser, X } from 'lucide-react'
import './SelectionContextMenu.css'

const MENU_WIDTH = 176
const EDGE_GAP = 8

export default function SelectionContextMenu({
  open,
  x = 0,
  y = 0,
  canPaste = false,
  onCommand,
  onClose,
}) {
  const { t } = useTranslation()
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 先按触点放,再按实际尺寸把菜单拉回视口内。
  // 长按靠近屏幕右下角时,菜单若向右下展开会有一半在屏幕外 —— 用户
  // 只看到半张菜单,还得先猜它本来有几个按钮。
  useLayoutEffect(() => {
    if (!open) return
    const node = menuRef.current
    const w = node?.offsetWidth || MENU_WIDTH
    const h = node?.offsetHeight || 0
    const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 0) - w - EDGE_GAP
    const maxTop = (typeof window !== 'undefined' ? window.innerHeight : 0) - h - EDGE_GAP
    setPos({
      left: Math.max(EDGE_GAP, Math.min(x, maxLeft)),
      top: Math.max(EDGE_GAP, Math.min(y, maxTop)),
    })
  }, [open, x, y])

  // Escape 关闭:与全站浮层一致(输入法组合态下的 Esc 是「取消候选词」)
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (e.isComposing || e.keyCode === 229) return
      e.preventDefault()
      onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const run = (command) => {
    onCommand?.(command)
    onClose?.()
  }

  const items = [
    { command: 'copy', icon: <Copy size={16} />, label: t('tools.selectionCopyShort') },
    { command: 'cut', icon: <Scissors size={16} />, label: t('tools.selectionCutShort') },
    {
      command: 'paste',
      icon: <ClipboardPaste size={16} />,
      label: t('tools.selectionPasteShort'),
      disabled: !canPaste,
    },
    { command: 'fill', icon: <PaintBucket size={16} />, label: t('tools.selectionFillShort') },
    { command: 'erase', icon: <Eraser size={16} />, label: t('tools.selectionEraseShort') },
    { command: 'clear', icon: <X size={16} />, label: t('tools.clearSelectionBtn'), danger: true },
  ]

  return createPortal(
    <div className="selection-menu-overlay" onClick={onClose}>
      <div
        className="selection-menu"
        ref={menuRef}
        role="menu"
        aria-label={t('tools.selection')}
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.command}
            type="button"
            role="menuitem"
            className={`selection-menu-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => run(item.command)}
          >
            <span className="selection-menu-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
