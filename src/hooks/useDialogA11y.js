/**
 * useDialogA11y — 全屏浮层的可访问性契约(规格 08 §5)。
 *
 * 规格要求:`role="dialog"`、`aria-modal="true"`、可访问标题、可预期的焦点管理、
 * Escape 关闭、关闭后焦点返回触发控件。此前只有 BrandSwitchDialog /
 * ReplaceColorDialog / MyBeadsPage 手工写了 role 与 aria-modal,其余浮层全裸,
 * 且没有任何一处处理 Escape —— 键盘用户与读屏用户都无法确认浮层边界。
 *
 * 本 hook 把这几件事收在一处,避免每个浮层各写一遍(再各漏一遍):
 *   1. `dialogProps` —— 直接展开到浮层根元素上(role / aria-modal / aria-label / tabIndex);
 *   2. Escape 关闭 —— 文档级监听,配合栈只让**最后打开**的浮层响应,
 *      避免「导出面板 + 其确认框」一次按键两层一起关;
 *   3. 焦点管理 —— 打开时焦点落在容器本身(**不是**首个输入框,否则移动端
 *      立刻唤起键盘,与浮层收缩动画竞争,正是规格 08 §5 警告的 autoFocus 问题),
 *      关闭时还给打开前的触发控件。
 *
 * 不做焦点循环(trap):`aria-modal` 已让辅助技术忽略浮层外的内容;而 ExportPanel
 * 的确认框是外层遮罩的**兄弟节点**,硬 trap 反而会把键盘用户困在外层、进不去确认框。
 */

import { useEffect, useRef } from 'react'

// 已打开的浮层令牌,按挂载顺序入栈;只有栈顶响应 Escape
const stack = []

/**
 * @param {object} options
 * @param {boolean} options.open - 浮层是否打开
 * @param {() => void} [options.onClose] - Escape 时调用
 * @param {string} [options.label] - 可访问名称(读屏播报的浮层标题)
 * @param {boolean} [options.disabled] - 临时屏蔽 Escape(如提交中)
 * @param {'dialog'|'alertdialog'} [options.role] - 破坏性确认用 alertdialog
 */
export function useDialogA11y({ open, onClose, label, disabled = false, role = 'dialog' }) {
  const ref = useRef(null)
  const restoreRef = useRef(null)
  const tokenRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const token = Symbol('dialog')
    tokenRef.current = token
    stack.push(token)
    restoreRef.current = document.activeElement

    const node = ref.current
    // 已经有 autoFocus 元素抢到焦点时不覆盖(桌面端保存对话框保留原有自动聚焦)
    if (node && !node.contains(document.activeElement)) {
      node.focus?.({ preventScroll: true })
    }

    return () => {
      const idx = stack.indexOf(token)
      if (idx !== -1) stack.splice(idx, 1)
      tokenRef.current = null

      const back = restoreRef.current
      restoreRef.current = null
      // 触发控件可能已随浮层一起卸载(如列表项被删),只还原仍挂在文档上的
      if (back && back !== document.body && document.contains(back)) {
        back.focus?.({ preventScroll: true })
      }
    }
  }, [open])

  useEffect(() => {
    if (!open || disabled) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (stack[stack.length - 1] !== tokenRef.current) return
      e.preventDefault()
      onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, disabled, onClose])

  return {
    ref,
    dialogProps: {
      role,
      'aria-modal': 'true',
      'aria-label': label,
      tabIndex: -1,
    },
  }
}

/** 仅测试用:清空栈(测试未走 unmount 时避免跨用例污染) */
export function __resetDialogStack() {
  stack.length = 0
}
