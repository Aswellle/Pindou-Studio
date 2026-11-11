import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import IroningGuidePage from './IroningGuidePage'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})
afterEach(() => cleanup())

describe('IroningGuidePage', () => {
  it('渲染品牌温度表、翻车表与教程入口', () => {
    const { container } = render(
      <MemoryRouter>
        <IroningGuidePage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('拼豆熨烫温度对照表')

    const tables = container.querySelectorAll('.tools-table')
    expect(tables).toHaveLength(2)
    expect(tables[0].textContent).toContain('Perler')
    expect(tables[1].textContent).toContain('急救方法')

    const links = [...container.querySelectorAll('.tools-link-list a')]
    expect(links.length).toBeGreaterThanOrEqual(5)
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/tutorials\/[a-z-]+$/)
    }
  })

  it('给出熨烫要点与站内相关工具链接', () => {
    const { container } = render(
      <MemoryRouter>
        <IroningGuidePage />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('.tools-rule-card')).toHaveLength(4)

    // 页脚相关链接:胶囊行(nav),每个入口都是明确的可点标识
    const footer = container.querySelector('nav.tools-links')
    expect(footer.getAttribute('aria-label')).toBe('相关页面')
    const chips = [...footer.querySelectorAll('.tools-link-chip')]
    expect(chips).toHaveLength(4)
    const hrefs = chips.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/colors')
    expect(hrefs).toContain('/bead-calculator')
  })
})
