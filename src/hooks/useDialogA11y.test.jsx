import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useDialogA11y, __resetDialogStack } from './useDialogA11y'

/**
 * 浮层可访问性契约(规格 08 §5)。
 *
 * 覆盖三件事,每件都对应一个此前真实缺失的能力:
 *   - role/aria-modal 属性(读屏识别浮层边界);
 *   - Escape 关闭,且**只有栈顶浮层**响应(导出面板 + 确认框不会一起关);
 *   - 焦点进入容器、关闭后还给触发控件。
 */

function Dialog({ open, onClose, label = '测试浮层', disabled }) {
  const { ref, dialogProps } = useDialogA11y({ open, onClose, label, disabled })
  if (!open) return null
  return (
    <div ref={ref} {...dialogProps} data-testid="dialog">
      <button type="button">内部按钮</button>
    </div>
  )
}

beforeEach(() => {
  __resetDialogStack()
})

afterEach(() => {
  cleanup()
  __resetDialogStack()
})

describe('useDialogA11y', () => {
  it('展开 role / aria-modal / aria-label / tabIndex', () => {
    render(<Dialog open onClose={() => {}} />)
    const dialog = screen.getByTestId('dialog')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('测试浮层')
    expect(dialog.getAttribute('tabindex')).toBe('-1')
  })

  it('支持 alertdialog 角色', () => {
    function Alert({ onClose }) {
      const { ref, dialogProps } = useDialogA11y({ open: true, onClose, role: 'alertdialog', label: '确认删除' })
      return <div ref={ref} {...dialogProps} data-testid="alert" />
    }
    render(<Alert onClose={() => {}} />)
    expect(screen.getByTestId('alert').getAttribute('role')).toBe('alertdialog')
  })

  it('Escape 触发 onClose', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('非 Escape 键不关闭', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('disabled 时不响应 Escape(如导出进行中)', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} disabled />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('输入法组合态下的 Escape 不关闭浮层(取消候选词,不是关窗)', () => {
    // 中文拼音输入时 Esc 用于撤销候选词。浏览器在组合期间仍派发 keydown,
    // 若不排除 isComposing,用户想取消输入却把整个浮层关掉。
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keyCode 229(部分输入法的组合态信号)同样不关闭', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 229 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('组合结束后再按 Escape 恢复正常关闭', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape', isComposing: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('两层浮层叠加时只有栈顶响应 Escape', () => {
    const outerClose = vi.fn()
    const innerClose = vi.fn()
    render(
      <>
        <Dialog open onClose={outerClose} label="外层" />
        <Dialog open onClose={innerClose} label="内层" />
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(innerClose).toHaveBeenCalledTimes(1)
    expect(outerClose).not.toHaveBeenCalled()
  })

  it('栈顶关闭后,下一次 Escape 由剩下的浮层响应', () => {
    const outerClose = vi.fn()
    const innerClose = vi.fn()
    const { rerender } = render(
      <>
        <Dialog open onClose={outerClose} label="外层" />
        <Dialog open onClose={innerClose} label="内层" />
      </>,
    )
    rerender(
      <>
        <Dialog open onClose={outerClose} label="外层" />
        <Dialog open={false} onClose={innerClose} label="内层" />
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(outerClose).toHaveBeenCalledTimes(1)
  })

  it('打开时焦点进入容器,关闭后还给触发控件', () => {
    const trigger = document.createElement('button')
    trigger.textContent = '打开'
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = render(<Dialog open={false} onClose={() => {}} />)
    expect(document.activeElement).toBe(trigger)

    rerender(<Dialog open onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByTestId('dialog'))

    rerender(<Dialog open={false} onClose={() => {}} />)
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('触发控件已从文档移除时不抛错', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = render(<Dialog open={false} onClose={() => {}} />)
    rerender(<Dialog open onClose={() => {}} />)
    trigger.remove()
    expect(() => rerender(<Dialog open={false} onClose={() => {}} />)).not.toThrow()
  })

  it('容器内已有 autoFocus 元素时不抢焦点', () => {
    function WithAutoFocus({ open }) {
      const { ref, dialogProps } = useDialogA11y({ open, onClose: () => {}, label: '带输入框' })
      if (!open) return null
      return (
        <div ref={ref} {...dialogProps} data-testid="dialog">
          <input autoFocus data-testid="input" />
        </div>
      )
    }
    const { rerender } = render(<WithAutoFocus open={false} />)
    rerender(<WithAutoFocus open />)
    expect(document.activeElement).toBe(screen.getByTestId('input'))
  })
})
