import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AuthPromptDialog from './AuthPromptDialog'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  cleanup()
})

describe('AuthPromptDialog · 登录引导浮层', () => {
  it('关闭时不渲染任何内容', () => {
    render(<AuthPromptDialog open={false} onClose={() => {}} />)
    expect(document.body.textContent).not.toContain('登录后解锁高级导出')
  })

  it('按原因展示对应标题与说明,并说明登录收益', () => {
    render(<AuthPromptDialog open reason="quality" onClose={() => {}} />)
    expect(screen.getByText('高分辨率导出需要登录')).toBeTruthy()
    expect(screen.getByText(/登录后可选择高分辨率与打印画质/)).toBeTruthy()
    expect(screen.getByText(/作品还会自动同步到云端/)).toBeTruthy()
  })

  it('熨烫场景使用熨烫文案', () => {
    render(<AuthPromptDialog open reason="ironing" onClose={() => {}} />)
    expect(screen.getByText('高级熨烫效果需要登录')).toBeTruthy()
  })

  it('注册/登录按钮把用户导向对应模式', () => {
    const onGoAuth = vi.fn()
    render(<AuthPromptDialog open reason="ironing" onClose={() => {}} onGoAuth={onGoAuth} />)
    fireEvent.click(screen.getByRole('button', { name: '免费注册' }))
    expect(onGoAuth).toHaveBeenCalledWith('register')
    fireEvent.click(screen.getByRole('button', { name: '已有账号，去登录' }))
    expect(onGoAuth).toHaveBeenCalledWith('login')
  })

  it('「稍后再说」与遮罩点击都可以关闭,不强迫注册', () => {
    const onClose = vi.fn()
    render(<AuthPromptDialog open reason="quality" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '稍后再说' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector('.auth-prompt-overlay'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('浮层具备 dialog 语义与可访问名称', () => {
    render(<AuthPromptDialog open reason="ironing" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('登录后解锁高级导出')
  })
})
