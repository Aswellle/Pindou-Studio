import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import i18n from './i18n'
import App from './App'

/**
 * M3 集成回归:作品载入 → 再保存 的尺寸一致性。
 *
 * 背景:历史作品里存在「声明尺寸(gridSize)与 canvasData 实际形状不一致」的条目
 * (量化 / 模板载入 / 网格调整曾各自维护尺寸状态)。修复前:
 *   - 载入按声明尺寸建网格 → 数据错位或越界;
 *   - 再保存沿用同一套错误尺寸 → 错误被固化。
 * 修复后两端都走 normalizeLegacyWork,尺寸以数据实际形状为准。
 *
 * 这里把 Canvas 与 ProfilePage 换成最小桩,只断言 App 的接线与落库结果。
 * 作品的载入入口已从图库搬到个人中心,所以桩的是 ProfilePage。
 */

const { loadWorkSpy, canvasProps } = vi.hoisted(() => ({
  loadWorkSpy: vi.fn(),
  canvasProps: { current: null },
}))

vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(props) {
    canvasProps.current = props
    return React.createElement('div', { className: 'mock-canvas' })
  })
  return { default: MockCanvas }
})

// ProfilePage 桩:提供「载入这个错位作品」按钮,触发 App.handleLoadWork
vi.mock('./components/ProfilePage', async () => {
  const React = await import('react')
  const badWork = {
    id: 'w-bad',
    name: '错位作品',
    // 实际 12×10,但声明 29×29
    canvasData: Array.from({ length: 10 }, () => Array.from({ length: 12 }, () => '#E53935')),
    gridSize: 29,
    gridWidth: null,
    gridHeight: null,
    paletteId: 'mard',
    savedAt: '2026-10-01T00:00:00.000Z',
  }
  return {
    default: ({ onLoadWork }) => React.createElement(
      'button',
      { 'data-testid': 'load-work', onClick: () => { loadWorkSpy(badWork); onLoadWork(badWork) } },
      'load work'
    ),
  }
})

function installMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => { window.matchMedia = orig }
}

let restoreMedia

beforeAll(async () => {
  window.scrollTo = () => {}
  await i18n.changeLanguage('zh-CN')
})

beforeEach(() => {
  restoreMedia = installMatchMedia()
  loadWorkSpy.mockClear()
})

afterEach(() => {
  cleanup()
  restoreMedia()
  localStorage.clear()
})

const readStored = () => JSON.parse(localStorage.getItem('saved-works') || '[]')

describe('App · 作品载入 → 保存 尺寸一致性(M3)', () => {
  it('错位作品载入后按实际形状建网格,再保存写入正确尺寸', async () => {
    const { findByTestId, findByText, findByPlaceholderText } = render(
      <MemoryRouter initialEntries={['/profile']}>
        <HelmetProvider>
          <App />
        </HelmetProvider>
      </MemoryRouter>
    )

    // 1) 载入错位作品(声明 29×29,实际 12×10)
    fireEvent.click(await findByTestId('load-work'))
    await waitFor(() => expect(loadWorkSpy).toHaveBeenCalledTimes(1))

    // 载入即修正:App 传给 Canvas 的网格必须是数据实际形状,而不是声明的 29
    await waitFor(() => {
      expect(canvasProps.current?.gridWidth).toBe(12)
      expect(canvasProps.current?.gridHeight).toBe(10)
    })

    // 2) 回到画布后打开保存弹窗(保存名默认取 designName,与是否载入作品无关)
    const saveBtn = await findByText('保存作品')
    fireEvent.click(saveBtn)

    // 3) 填入名称并确认保存
    const nameInput = await findByPlaceholderText('请输入作品名称')
    fireEvent.change(nameInput, { target: { value: '错位作品副本' } })
    const confirmBtn = await findByText('确认保存')
    fireEvent.click(confirmBtn)

    await waitFor(() => expect(readStored()).toHaveLength(1))
    const [work] = readStored()
    expect(work.gridWidth).toBe(12)
    expect(work.gridHeight).toBe(10)
    expect(work.gridSize).toBe(12)
    expect(work.paletteId).toBe('mard')
    expect(work.name).toBe('错位作品副本')
  })
})
