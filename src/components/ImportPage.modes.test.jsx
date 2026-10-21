import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ImportPage from './ImportPage'
import i18n from '../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  HTMLCanvasElement.prototype.getContext = () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 1,
      fillRect: () => {}, clearRect: () => {}, strokeRect: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
      putImageData: () => {}, drawImage: () => {}, setLineDash: () => {},
      setTransform: () => {}, save: () => {}, restore: () => {},
    })
})

afterEach(() => cleanup())

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/import']}>
    <ImportPage onLoadProject={vi.fn()} onSaveProject={vi.fn().mockResolvedValue(true)} {...props} />
  </MemoryRouter>
)

describe('ImportPage · 导入模式', () => {
  it('默认进入项目文件模式,展示 JSON 文件选择区', () => {
    const { container } = setup()
    const tabs = container.querySelectorAll('.import-mode')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('.import-file-input')).toBeTruthy()
    expect(container.querySelector('.chart-drop')).toBeNull()
  })

  it('切到图纸截图模式后展示图片选择区,不再显示 JSON 文件区', () => {
    const { container } = setup()
    fireEvent.click(container.querySelectorAll('.import-mode')[1])
    expect(container.querySelector('.chart-drop')).toBeTruthy()
    expect(container.querySelector('.import-file-input')).toBeNull()
    expect(container.querySelectorAll('.import-mode')[1].getAttribute('aria-selected')).toBe('true')
  })

  it('两种模式互不干扰:切回文件模式后仍是文件区', () => {
    const { container } = setup()
    fireEvent.click(container.querySelectorAll('.import-mode')[1])
    fireEvent.click(container.querySelectorAll('.import-mode')[0])
    expect(container.querySelector('.import-file-input')).toBeTruthy()
    expect(container.querySelector('.chart-drop')).toBeNull()
  })

  it('图纸截图模式的图片门控拒绝非图片文件并给出可见提示', async () => {
    const { container } = setup()
    fireEvent.click(container.querySelectorAll('.import-mode')[1])
    const input = container.querySelector('.chart-file-input')
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    await waitFor(() => {
      expect(container.querySelector('.chart-drop-error')).toBeTruthy()
    })
    expect(container.querySelector('.chart-drop-error').textContent).toContain('图片')
  })
})
