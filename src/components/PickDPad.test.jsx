import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from '../i18n'
import PickDPad from './PickDPad'

/**
 * 点选方向盘:四向步进 + 中央 toggle 的接线与可寻址性。
 * 触屏没有 hover,方向/动作说明必须走 aria-label,不能只靠图标。
 */

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(() => cleanup())

describe('PickDPad', () => {
  it('四向按钮按方向回调 onMove,步进为 1 格', () => {
    const onMove = vi.fn()
    render(<PickDPad cursor={{ x: 5, y: 5 }} selected={false} onMove={onMove} onToggle={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '光标左移一格' }))
    expect(onMove).toHaveBeenLastCalledWith(-1, 0)
    fireEvent.click(screen.getByRole('button', { name: '光标上移一格' }))
    expect(onMove).toHaveBeenLastCalledWith(0, -1)
    fireEvent.click(screen.getByRole('button', { name: '光标下移一格' }))
    expect(onMove).toHaveBeenLastCalledWith(0, 1)
    fireEvent.click(screen.getByRole('button', { name: '光标右移一格' }))
    expect(onMove).toHaveBeenLastCalledWith(1, 0)
  })

  it('中央按钮按选中态显示「选取/取消」,并回调 onToggle', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <PickDPad cursor={{ x: 5, y: 5 }} selected={false} onMove={vi.fn()} onToggle={onToggle} />
    )
    expect(screen.getByRole('button', { name: '选取当前格' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '选取当前格' }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<PickDPad cursor={{ x: 5, y: 5 }} selected onMove={vi.fn()} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: '取消选取当前格' })).toBeTruthy()
  })

  it('整个方向盘带可寻址的组标签(读屏可发现)', () => {
    render(<PickDPad cursor={null} selected={false} onMove={vi.fn()} onToggle={vi.fn()} />)
    expect(screen.getByRole('group', { name: '点选方向盘' })).toBeTruthy()
  })
})
