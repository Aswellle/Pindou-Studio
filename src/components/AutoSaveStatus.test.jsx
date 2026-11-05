import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import AutoSaveStatus from './AutoSaveStatus'
import i18n from '../i18n'

/**
 * 自动保存旁注。
 *
 * 顶栏不再承担这条信息(平板会被挤到断行),因此这里锁住三个行为:
 *   1. 保存中 / 失败立即显示,失败保持到下一次保存尝试;
 *   2. 已保存只停留 2.4s,随后淡出 —— 不长期占住画布上沿;
 *   3. 非画布页(active=false)不渲染。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const chip = () => document.body.querySelector('.autosave-chip')

describe('AutoSaveStatus', () => {
  it('保存中显示旋转指示与文案', () => {
    render(<AutoSaveStatus state="saving" />)
    expect(chip()).toBeTruthy()
    expect(chip().textContent).toContain('正在自动保存')
    expect(chip().getAttribute('role')).toBe('status')
    expect(chip().querySelector('.autosave-spinner')).toBeTruthy()
  })

  it('已保存停留 2.4s 后淡出移除', () => {
    vi.useFakeTimers()
    const { rerender } = render(<AutoSaveStatus state="saving" />)
    rerender(<AutoSaveStatus state="saved" />)
    expect(chip().textContent).toContain('已自动保存')

    act(() => {
      vi.advanceTimersByTime(2400)
    })
    expect(chip().classList.contains('is-exiting')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(chip()).toBeNull()
  })

  it('失败常驻并使用 alert 语义,直到下一次保存尝试', () => {
    vi.useFakeTimers()
    render(<AutoSaveStatus state="failed" />)
    expect(chip().textContent).toContain('自动保存不可用')
    expect(chip().getAttribute('role')).toBe('alert')

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(chip()).toBeTruthy()
  })

  it('非画布页不渲染', () => {
    render(<AutoSaveStatus state="saving" active={false} />)
    expect(chip()).toBeNull()
  })
})
