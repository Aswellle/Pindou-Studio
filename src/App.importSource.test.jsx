import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import i18n from './i18n'
import App from './App'

const { canvasProps, importedProject } = vi.hoisted(() => ({
  canvasProps: { current: null },
  importedProject: {
    schemaVersion: 1,
    name: '导入的图纸',
    grid: { width: 12, height: 10, cells: Array.from({ length: 10 }, () => Array(12).fill('#E53935')) },
    palette: { paletteId: 'mard' },
    source: { kind: 'chart-import' },
  },
}))

vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  return {
    default: React.forwardRef(function MockCanvas(props) {
      canvasProps.current = props
      return React.createElement('div', { className: 'mock-canvas' })
    }),
  }
})

vi.mock('./components/ImportPage', async () => {
  const React = await import('react')
  return {
    default: ({ onLoadProject }) => React.createElement(
      'button',
      { 'data-testid': 'load-imported', onClick: () => onLoadProject(importedProject) },
      'load imported'
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
beforeAll(async () => { window.scrollTo = () => {}; await i18n.changeLanguage('zh-CN') })
beforeEach(() => { restoreMedia = installMatchMedia() })
afterEach(() => { cleanup(); restoreMedia(); localStorage.clear() })

const readStored = () => JSON.parse(localStorage.getItem('saved-works') || '[]')

describe('App · 导入来源随保存落库', () => {
  it('导入 → 载入画布 → 保存,作品带 sourceKind=chart-import', async () => {
    const { findByTestId, findByText, findByPlaceholderText } = render(
      <MemoryRouter initialEntries={['/import']}>
        <HelmetProvider><App /></HelmetProvider>
      </MemoryRouter>
    )
    fireEvent.click(await findByTestId('load-imported'))
    await waitFor(() => expect(canvasProps.current?.gridWidth).toBe(12))

    fireEvent.click(await findByText('保存作品'))
    fireEvent.change(await findByPlaceholderText('请输入作品名称'), { target: { value: '导入副本' } })
    fireEvent.click(await findByText('确认保存'))

    await waitFor(() => expect(readStored()).toHaveLength(1))
    expect(readStored()[0].sourceKind).toBe('chart-import')
    expect(readStored()[0].gridWidth).toBe(12)
  })
})
