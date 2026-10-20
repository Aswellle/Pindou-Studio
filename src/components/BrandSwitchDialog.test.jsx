import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import BrandSwitchDialog from './BrandSwitchDialog'
import i18n from '../i18n'
import { getPalette } from '../data/palettes'
import { planBrandSwitch } from '../utils/brandSwitch'

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(() => cleanup())

const PERLER = getPalette('perler')
const HAMA = getPalette('hama')
const PERLER_WHITE = PERLER.colors.find(c => c.id === 'P01').hex

// 组件通过 createPortal 挂到 document.body,断言一律查 document.body
const $ = (sel) => document.body.querySelector(sel)
const $$ = (sel) => document.body.querySelectorAll(sel)

function setup(props = {}) {
  const onClose = vi.fn()
  const onConvert = vi.fn()
  const onMappingOnly = vi.fn()
  render(
    <BrandSwitchDialog
      open
      canvasData={[[PERLER_WHITE, PERLER_WHITE, null]]}
      fromPaletteId="perler"
      toPaletteId="hama"
      onClose={onClose}
      onConvert={onConvert}
      onMappingOnly={onMappingOnly}
      {...props}
    />
  )
  return { onClose, onConvert, onMappingOnly }
}

describe('BrandSwitchDialog', () => {
  it('显示源品牌 → 目标品牌', () => {
    setup()
    const flow = $('.brand-switch-flow')
    expect(flow.textContent).toContain(i18n.t('palette.brand.perler'))
    expect(flow.textContent).toContain(i18n.t('palette.brand.hama'))
  })

  it('逐色预览显示目标品牌色号与数量', () => {
    setup()
    const rows = $$('.brand-switch-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toMatch(/H\d+/)
    expect(rows[0].textContent).toContain('2')
  })

  it('有变化时显示影响面,转换按钮可用', () => {
    setup()
    expect($('.brand-switch-summary').textContent).toMatch(/2/)
    const convert = screen.getByText(i18n.t('brandSwitch.convert'))
    expect(convert.disabled).toBe(false)
  })

  it('无变化时提示无需改动,转换按钮禁用', () => {
    // 目标品牌就是当前品牌 → 每种颜色都映射回自身
    setup({ toPaletteId: 'perler' })
    expect($('.brand-switch-summary').textContent).toContain(i18n.t('brandSwitch.noChange'))
    const convert = screen.getByText(i18n.t('brandSwitch.convert'))
    expect(convert.disabled).toBe(true)
  })

  it('转换 / 只改色号 / 关闭分别回调', () => {
    const { onConvert, onMappingOnly, onClose } = setup()
    fireEvent.click(screen.getByText(i18n.t('brandSwitch.convert')))
    fireEvent.click(screen.getByText(i18n.t('brandSwitch.mappingOnly')))
    fireEvent.click($('.brand-switch-close'))
    expect(onConvert).toHaveBeenCalledTimes(1)
    expect(onMappingOnly).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('空画布给出提示,不渲染预览列表', () => {
    setup({ canvasData: [[null, null]] })
    expect(screen.getByText(i18n.t('brandSwitch.emptyCanvas'))).toBeTruthy()
    expect($('.brand-switch-list')).toBeNull()
  })

  it('open=false 时不渲染任何内容', () => {
    setup({ open: false })
    expect($('.brand-switch-dialog')).toBeNull()
  })

  it('预览中的目标色块就是目标色卡里的实际颜色', () => {
    setup()
    const row = $$('.brand-switch-row')[0]
    const dots = row.querySelectorAll('.brand-switch-dot')
    // 第二个色块 = 目标色;jsdom 会把 hex 归一化成 rgb(),这里反算比对
    const target = planBrandSwitch([[PERLER_WHITE]], 'hama').rows[0].toHex
    const r = parseInt(target.slice(1, 3), 16)
    const g = parseInt(target.slice(3, 5), 16)
    const b = parseInt(target.slice(5, 7), 16)
    expect(dots[1].style.backgroundColor).toBe(`rgb(${r}, ${g}, ${b})`)
    // 且该色确实属于 Hama 色卡
    expect(HAMA.colors.some(c => c.hex.toLowerCase() === target.toLowerCase())).toBe(true)
  })
})
