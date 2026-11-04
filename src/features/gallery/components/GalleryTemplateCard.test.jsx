import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import GalleryTemplateCard from './GalleryTemplateCard'
import i18n from '../../../i18n'

/**
 * GalleryTemplateCard — 从 GalleryPage 抽出的卡片组件行为契约(重构文档 04 §4):
 *   - 卡片主体 Enter/Space 打开载入确认;内部按钮不触发打开;
 *   - 收藏/导出/品牌按钮 stopPropagation;
 *   - 品牌/导出菜单 portal 到 body,Escape 关闭;
 *   - 矩形模板显示真实 W × H。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  // jsdom 无 canvas 实现:缩略图直绘不崩即可(与 GalleryPage.test.jsx 同一套)
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, clearRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fill: () => {}, arc: () => {}, save: () => {}, restore: () => {},
    clip: () => {}, translate: () => {}, scale: () => {}, drawImage: () => {},
    setTransform: () => {}, fillText: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
  }
  HTMLCanvasElement.prototype.getContext = () => ctx
})

afterEach(cleanup)

const TEMPLATE = {
  id: 'tpl-1',
  name: '小鸭',
  nameZh: '小鸭',
  size: 16,
  category: 'animal',
  difficulty: 'easy',
  pattern: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '#FFCC00')),
  paletteId: 'perler',
}

const baseProps = {
  template: TEMPLATE,
  favorite: false,
  onToggleFavorite: vi.fn(),
  onOpen: vi.fn(),
  onExportTemplate: vi.fn(),
  brandId: 'perler',
  brandOverridden: false,
  onBrandSelect: vi.fn(),
  getDownloadCount: () => 3,
}

// 每个用例独立 props:vi.fn 不跨用例累计调用次数
function makeProps() {
  return {
    ...baseProps,
    onToggleFavorite: vi.fn(),
    onOpen: vi.fn(),
    onExportTemplate: vi.fn(),
    onBrandSelect: vi.fn(),
  }
}

function setup(overrides = {}) {
  const props = makeProps()
  const view = render(<GalleryTemplateCard {...props} {...overrides} />)
  return { props, ...view }
}

describe('GalleryTemplateCard · 打开与收藏', () => {
  it('点击卡片主体触发 onOpen;Enter/Space 同样触发', () => {
    const { props } = setup()
    const card = screen.getByRole('button', { name: /小鸭/ })
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    expect(props.onOpen).toHaveBeenCalledTimes(3)
  })

  it('点击收藏按钮不触发打开,并回传 stopPropagation 后的事件', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: '我的收藏' }))
    expect(props.onToggleFavorite).toHaveBeenCalledTimes(1)
    expect(props.onOpen).not.toHaveBeenCalled()
  })

  it('矩形模板显示真实宽高', () => {
    setup({ template: { ...TEMPLATE, name: '帽子', size: 48, pattern: Array.from({ length: 27 }, () => Array.from({ length: 48 }, () => '#333333')) } })
    expect(screen.getByText('48 x 27')).toBeTruthy()
  })
})

describe('GalleryTemplateCard · 品牌菜单', () => {
  it('品牌徽章打开菜单(portal 到 body),选择后回传品牌并关闭', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: /拼豆品牌/ }))
    const menu = document.querySelector('.brand-menu')
    expect(menu).toBeTruthy()
    // 菜单在 body 下,不在卡片内(避免 overflow 裁剪)
    expect(document.body.contains(menu)).toBe(true)
    const items = [...menu.querySelectorAll('[role="menuitem"]')]
    fireEvent.click(items[1]) // 第一个品牌选项
    expect(props.onBrandSelect).toHaveBeenCalledWith(expect.any(String))
    expect(document.querySelector('.brand-menu')).toBeNull()
  })

  it('「默认品牌」回传 null 表示清除覆盖', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: /拼豆品牌/ }))
    fireEvent.click(document.querySelector('.brand-menu [role="menuitem"]'))
    expect(props.onBrandSelect).toHaveBeenCalledWith(null)
  })

  it('Escape 关闭菜单', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /拼豆品牌/ }))
    expect(document.querySelector('.brand-menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.brand-menu')).toBeNull()
  })
})

describe('GalleryTemplateCard · 导出菜单', () => {
  it('导出按钮打开菜单,选择格式后回传 (template, style, event)', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: '导出图纸' }))
    const menu = document.querySelector('.export-menu')
    expect(menu).toBeTruthy()
    const items = [...menu.querySelectorAll('[role="menuitem"]')]
    fireEvent.click(items[0])
    expect(props.onExportTemplate).toHaveBeenCalledWith(
      TEMPLATE,
      'professional',
      expect.anything()
    )
    expect(document.querySelector('.export-menu')).toBeNull()
  })

  it('exporting 时导出按钮禁用', () => {
    setup({ exporting: true })
    expect(screen.getByRole('button', { name: '导出图纸' }).disabled).toBe(true)
  })
})
