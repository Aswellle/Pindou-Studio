import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ColorChartsPage from './ColorChartsPage'
import { PALETTE_LIST } from '../../data/palettes/index.js'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})
afterEach(() => cleanup())

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/colors" element={<ColorChartsPage />} />
        <Route path="/colors/:brand" element={<ColorChartsPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('ColorChartsPage · 总览', () => {
  it('列出六个品牌,每个都链到自己的色卡页并标出色号数', () => {
    const { container } = renderAt('/colors')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('拼豆色卡对照表')

    const cards = [...container.querySelectorAll('.color-brand-card')]
    expect(cards).toHaveLength(PALETTE_LIST.length)
    for (const palette of PALETTE_LIST) {
      const href = `/colors/${palette.id}`
      const card = cards.find((a) => a.getAttribute('href') === href)
      expect(card, href).toBeTruthy()
      expect(card.textContent).toContain(`${palette.colors.length} 色`)
    }
  })
})

describe('ColorChartsPage · 品牌色卡', () => {
  it('渲染完整色表:每个色号一行,含名称与色值', () => {
    const { container } = renderAt('/colors/perler')
    const perler = PALETTE_LIST.find((p) => p.id === 'perler')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Perler')
    const rows = container.querySelectorAll('.color-chart-table tbody tr')
    expect(rows).toHaveLength(perler.colors.length)

    // 第一行:P01 / 白色 / HEX
    const first = perler.colors[0]
    const rowText = rows[0].textContent
    expect(rowText).toContain(first.id)
    expect(rowText).toContain(first.nameZh)
    expect(rowText).toContain(first.hex)
  })

  it('按色系分组的品牌输出分组行,颜色行数仍等于总色数', () => {
    const { container } = renderAt('/colors/mard')
    const mard = PALETTE_LIST.find((p) => p.id === 'mard')

    const groupRows = container.querySelectorAll('.color-chart-table .color-group-row')
    expect(groupRows.length).toBeGreaterThan(1)
    const colorRows = container.querySelectorAll('.color-chart-table tbody tr:not(.color-group-row)')
    expect(colorRows).toHaveLength(mard.colors.length)
  })

  it('搜索按色号/名称/色值过滤,并给出空态', () => {
    const { container } = renderAt('/colors/perler')
    const input = container.querySelector('.color-chart-search input')

    fireEvent.change(input, { target: { value: 'P01' } })
    expect(container.querySelectorAll('.color-chart-table tbody tr')).toHaveLength(1)

    fireEvent.change(input, { target: { value: 'no-such-color' } })
    expect(container.querySelector('.color-chart-table')).toBeNull()
    expect(screen.getByText('没有匹配的颜色。')).toBeTruthy()
  })

  it('未知品牌给出空态,不渲染色表', () => {
    const { container } = renderAt('/colors/nope')
    expect(screen.getByText('这个品牌还没有色卡数据。')).toBeTruthy()
    expect(container.querySelector('.color-chart-table')).toBeNull()
  })
})
