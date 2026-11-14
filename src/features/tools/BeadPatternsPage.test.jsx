import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BeadPatternsPage from './BeadPatternsPage'
import { GALLERY_CATEGORY_META } from '../gallery/categoryMeta'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})
afterEach(() => cleanup())

const renderPage = () =>
  render(
    <MemoryRouter>
      <BeadPatternsPage />
    </MemoryRouter>
  )

describe('BeadPatternsPage', () => {
  it('按题材列出全部分类,并链到各自聚合页', () => {
    const { container } = renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('拼豆图案')

    const cards = [...container.querySelectorAll('.pattern-category-card')]
    expect(cards).toHaveLength(GALLERY_CATEGORY_META.length)
    for (const meta of GALLERY_CATEGORY_META) {
      expect(cards.some(a => a.getAttribute('href') === `/gallery/category/${meta.slug}`)).toBe(true)
    }
  })

  it('给出挑选要点、三种获取方式与尺寸用量表', () => {
    const { container } = renderPage()
    expect(container.querySelectorAll('.pattern-tips li')).toHaveLength(3)
    expect(container.querySelectorAll('.tools-rule-card')).toHaveLength(3)

    const rows = container.querySelectorAll('.tools-table tbody tr')
    expect(rows).toHaveLength(6)
    expect(rows[0].textContent).toContain('29 × 29')

    // 工具页互链
    const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/bead-calculator')
    expect(hrefs).toContain('/pixel-art')
    expect(hrefs).toContain('/colors')
  })
})
