import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import ToastProvider, { useToast, resolveToastDuration } from './Toast'
import i18n from '../i18n'

/**
 * 统一 toast 的行为契约:
 *   · 成功/普通提示按时长自动消失,悬停时暂停计时;
 *   · 错误默认常驻,必须手动关闭;
 *   · 错误进 assertive region,普通提示进 polite region(两个 live region 常驻)。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Probe() {
  const toast = useToast()
  return (
    <>
      <button type="button" onClick={() => toast('已保存', 'success', 1000)}>
        success
      </button>
      <button type="button" onClick={() => toast('出错了', 'error')}>
        error
      </button>
      <button type="button" onClick={() => toast('普通提示', 'info', 1000)}>
        info
      </button>
    </>
  )
}

function setup() {
  return render(
    <ToastProvider>
      <Probe />
    </ToastProvider>
  )
}

const item = type => document.body.querySelector(`.toast-item.toast-${type}`)

describe('Toast · 时长策略', () => {
  it('短消息不低于 3.6s,长消息封顶 6s', () => {
    expect(resolveToastDuration('好', 'info')).toBe(3600)
    expect(resolveToastDuration('很长的提示'.repeat(60), 'success')).toBe(6000)
  })

  it('错误默认常驻,显式时长以调用方为准', () => {
    expect(resolveToastDuration('失败', 'error')).toBe(0)
    expect(resolveToastDuration('失败', 'error', 5000)).toBe(5000)
  })
})

describe('Toast · 显示与消失', () => {
  it('成功提示渲染在新拼豆图标与成功配色中,到时淡出', () => {
    vi.useFakeTimers()
    setup()
    fireEvent.click(screen.getByText('success'))
    expect(item('success')).toBeTruthy()
    expect(item('success').textContent).toContain('已保存')
    expect(item('success').querySelector('.toast-bead svg')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(item('success').classList.contains('exiting')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(240)
    })
    expect(item('success')).toBeNull()
  })

  it('错误提示常驻,点关闭才移除', () => {
    vi.useFakeTimers()
    setup()
    fireEvent.click(screen.getByText('error'))
    expect(item('error')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(item('error')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    act(() => {
      vi.advanceTimersByTime(240)
    })
    expect(item('error')).toBeNull()
  })

  it('悬停暂停计时,移出后按剩余时间继续', () => {
    vi.useFakeTimers()
    setup()
    fireEvent.click(screen.getByText('info'))
    act(() => {
      vi.advanceTimersByTime(400)
    })

    fireEvent.mouseEnter(item('info'))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(item('info')).toBeTruthy()

    fireEvent.mouseLeave(item('info'))
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(item('info').classList.contains('exiting')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(240)
    })
    expect(item('info')).toBeNull()
  })
})

describe('Toast · live region', () => {
  it('普通提示进 polite region,错误进 assertive region', () => {
    setup()
    fireEvent.click(screen.getByText('success'))
    fireEvent.click(screen.getByText('error'))

    const polite = screen.getAllByRole('status').find(el => el.classList.contains('toast-region'))
    const urgent = screen.getAllByRole('alert').find(el => el.classList.contains('toast-region'))
    expect(polite?.textContent).toContain('已保存')
    expect(urgent?.textContent).toContain('出错了')
  })
})
