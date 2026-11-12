import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import GallerySearchInput from './GallerySearchInput'

afterEach(() => cleanup())

const renderInput = (props = {}) => {
  const onCommit = vi.fn()
  const utils = render(
    <GallerySearchInput
      value=""
      onCommit={onCommit}
      placeholder="搜索"
      ariaLabel="搜索"
      {...props}
    />
  )
  return { onCommit, input: utils.container.querySelector('input'), ...utils }
}

describe('GallerySearchInput', () => {
  it('普通输入立即提交(保持筛选即时响应)', () => {
    const { onCommit, input } = renderInput()
    fireEvent.change(input, { target: { value: 'duck' } })
    expect(onCommit).toHaveBeenLastCalledWith('duck')
    expect(input.value).toBe('duck')
  })

  it('输入法组合期间只更新草稿,不写 URL(避免打断拼音/假名/谚文)', () => {
    const { onCommit, input } = renderInput()
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'pin' } })
    fireEvent.change(input, { target: { value: 'pindou' } })

    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('pindou')

    // 上屏后的最终值只提交一次
    input.value = '拼豆'
    fireEvent.compositionEnd(input)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('拼豆')
  })

  it('外部值变化(chip 清除 / 前进后退)会回填输入框', () => {
    const { input, rerender } = renderInput({ value: '旧词' })
    expect(input.value).toBe('旧词')

    rerender(
      <GallerySearchInput value="" onCommit={vi.fn()} placeholder="搜索" ariaLabel="搜索" />
    )
    expect(input.value).toBe('')
  })

  it('自己提交后 URL 回声不会覆盖正在输入的内容', () => {
    const onCommit = vi.fn()
    const { input, rerender } = renderInput({ value: '', onCommit })
    fireEvent.change(input, { target: { value: '小' } })
    // 父级把刚提交的值写回 URL 再传下来:与已提交值相同,不应重置草稿
    rerender(<GallerySearchInput value="小" onCommit={onCommit} placeholder="搜索" ariaLabel="搜索" />)
    fireEvent.change(input, { target: { value: '小鸭' } })
    expect(input.value).toBe('小鸭')
    expect(onCommit).toHaveBeenLastCalledWith('小鸭')
  })

  it('失焦时补提交未写回的草稿', () => {
    const { onCommit, input } = renderInput()
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'unfinished' } })
    expect(onCommit).not.toHaveBeenCalled()

    // 组合结束事件缺失(部分输入法),失焦兜底提交
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('unfinished')
  })
})
