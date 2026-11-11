import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PixelArtPage from './PixelArtPage'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})
afterEach(() => cleanup())

const renderPage = () =>
  render(
    <MemoryRouter>
      <PixelArtPage />
    </MemoryRouter>
  )

describe('PixelArtPage', () => {
  it('输出能力清单、三步流程与尺寸用途表', () => {
    const { container } = renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('像素画生成器')

    expect(container.querySelectorAll('.tools-rule-card')).toHaveLength(6)
    expect(container.querySelectorAll('.pattern-steps li')).toHaveLength(3)

    const rows = container.querySelectorAll('.tools-table tbody tr')
    expect(rows).toHaveLength(6)
    expect(rows[0].textContent).toContain('29 × 29')
    expect(rows[0].textContent).toContain('841')
  })

  it('主行动直接打开画布,并互链备料工具', () => {
    const { container } = renderPage()
    const primary = container.querySelector('.tools-cta-primary')
    expect(primary.getAttribute('href')).toBe('/')
    expect(primary.textContent).toContain('画布')

    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const href of ['/create/image', '/bead-patterns', '/bead-calculator', '/colors', '/ironing']) {
      expect(hrefs, href).toContain(href)
    }
  })
})
