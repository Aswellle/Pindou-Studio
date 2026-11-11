import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BeadCalculatorPage from './BeadCalculatorPage'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})
afterEach(() => cleanup())

const resultNumbers = (container) =>
  [...container.querySelectorAll('.calc-results dd')].map((dd) =>
    Number(dd.textContent.replace(/[^\d]/g, ''))
  )

describe('BeadCalculatorPage', () => {
  it('默认 29×29、八成填充:841 格 / 673 颗', () => {
    const { container } = render(
      <MemoryRouter>
        <BeadCalculatorPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('拼豆豆子数量计算器')
    expect(resultNumbers(container)).toEqual([841, 673])
  })

  it('修改网格尺寸后结果同步更新', () => {
    const { container } = render(
      <MemoryRouter>
        <BeadCalculatorPage />
      </MemoryRouter>
    )
    const [width, height] = container.querySelectorAll('input[type="number"]')

    fireEvent.change(width, { target: { value: '57' } })
    fireEvent.change(height, { target: { value: '57' } })
    expect(resultNumbers(container)).toEqual([3249, 2599])
  })

  it('填写颜色数后给出每色平均用量', () => {
    const { container } = render(
      <MemoryRouter>
        <BeadCalculatorPage />
      </MemoryRouter>
    )
    const colors = container.querySelectorAll('input[type="number"]')[2]
    fireEvent.change(colors, { target: { value: '12' } })

    // 673 颗 / 12 色 → ceil = 57
    expect(resultNumbers(container)).toEqual([841, 673, 57])
    expect(screen.getByText('每色平均')).toBeTruthy()
  })

  it('非法尺寸显示提示而不是 0', () => {
    const { container } = render(
      <MemoryRouter>
        <BeadCalculatorPage />
      </MemoryRouter>
    )
    const width = container.querySelectorAll('input[type="number"]')[0]
    fireEvent.change(width, { target: { value: '' } })

    expect(container.querySelector('.calc-results')).toBeNull()
    expect(screen.getByText('请输入 1–500 之间的网格尺寸。')).toBeTruthy()
  })

  it('常见尺寸用量表覆盖全部预设', () => {
    const { container } = render(
      <MemoryRouter>
        <BeadCalculatorPage />
      </MemoryRouter>
    )
    const rows = container.querySelectorAll('.tools-table tbody tr')
    expect(rows).toHaveLength(6)
    expect(rows[0].textContent).toContain('29 × 29')
  })
})
