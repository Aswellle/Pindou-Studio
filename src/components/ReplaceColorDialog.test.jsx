import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ReplaceColorDialog from './ReplaceColorDialog'
import i18n from '../i18n'

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(() => cleanup())

const R = '#E53935'
const G = '#43A047'

function sample() {
  return [
    [R, R, G],
    [R, null, G],
    [null, null, null],
  ]
}

// 组件通过 createPortal 挂到 document.body,因此断言一律查 document.body,
// 不用 RTL render 返回的 container(它是空的)。
const $ = (sel) => document.body.querySelector(sel)
const $$ = (sel) => document.body.querySelectorAll(sel)

function setup(props = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <ReplaceColorDialog
      open
      canvasData={sample()}
      paletteId="perler"
      onClose={onClose}
      onConfirm={onConfirm}
      {...props}
    />
  )
  return { onConfirm, onClose }
}

describe('ReplaceColorDialog', () => {
  it('默认选中画布主色,并显示命中数量', () => {
    setup()
    // 画布上 R 出现 3 次、G 出现 2 次 → 主色是 R
    expect($('.replace-preview-label').textContent).toContain('3')
    expect($('.replace-swatch.active')).toBeTruthy()
  })

  it('空白格不作为可选来源色', () => {
    setup()
    // 只有 R 与 G 两种真实颜色
    expect($$('.replace-swatches:not(.compact) .replace-swatch')).toHaveLength(2)
  })

  it('切换来源色后命中数量随之更新', () => {
    setup()
    const swatches = $$('.replace-swatches:not(.compact) .replace-swatch')
    fireEvent.click(swatches[1]) // G
    expect($('.replace-preview-label').textContent).toContain('2')
  })

  it('确认时把 (from, to) 交给 onConfirm', () => {
    const { onConfirm } = setup()
    const targets = $$('.replace-swatches.compact .replace-swatch')
    fireEvent.click(targets[1])
    fireEvent.click(screen.getByText('确认替换'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [from, to] = onConfirm.mock.calls[0]
    expect(from).toBe(R)
    expect(to).toBeTruthy()
    expect(to).not.toBe(R)
  })

  it('画布为空时给出提示,不渲染替换控件', () => {
    setup({ canvasData: [[null, null], [null, null]] })
    expect(screen.getByText(/画布上还没有颜色/)).toBeTruthy()
    expect($('.replace-preview')).toBeNull()
    expect(screen.queryByText('确认替换')).toBeNull()
  })

  it('关闭按钮回调 onClose', () => {
    const { onClose } = setup()
    fireEvent.click($('.replace-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('open=false 时不渲染任何内容', () => {
    setup({ open: false })
    expect($('.replace-dialog')).toBeNull()
  })
})
