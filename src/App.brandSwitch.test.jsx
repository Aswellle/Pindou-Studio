import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import i18n from './i18n'
import App from './App'
import { getPalette } from './data/palettes'

/**
 * 品牌切换(规格 04 §4)的 App 接线:
 *   - 空画布 → 直接切口径,不弹框;
 *   - 有内容 → 弹预览框,由用户选「转换」或「只改色号」;
 *   - 转换 = 一次 setCanvas = 一条历史,撤销即回到切换前矩阵;
 *   - 只改色号 → 矩阵逐格不变。
 *
 * Canvas 与 ColorPalette 都用桩,只验证 App 的事务语义与分支。
 */

const { canvasProps } = vi.hoisted(() => ({ canvasProps: { current: null } }))

vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(props, ref) {
    canvasProps.current = props
    React.useImperativeHandle(ref, () => ({
      cancelStroke: () => {}, resetTransform: () => {}, fitToScreen: () => {},
    }))
    // 「画一格」:把画布变成非空,触发品牌切换的预览分支
    const paint = () => {
      const rows = props.gridHeight || props.gridSize
      const cols = props.gridWidth || props.gridSize
      const next = Array.from({ length: rows }, () => Array(cols).fill(null))
      next[0][0] = '#E53935'
      props.onCanvasChange(next)
    }
    return React.createElement(
      'div',
      { className: 'mock-canvas' },
      React.createElement('button', { 'data-testid': 'paint', onClick: paint }, 'paint')
    )
  })
  return { default: MockCanvas }
})

// 把当前色卡与切换入口暴露成按钮
vi.mock('./components/ColorPalette', async () => {
  const React = await import('react')
  return {
    default: ({ currentPalette, onPaletteChange }) => React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'palette' }, currentPalette),
      React.createElement('button', { 'data-testid': 'to-hama', onClick: () => onPaletteChange('hama') }, 'hama')
    ),
  }
})

vi.mock('./components/Tools', async () => {
  const React = await import('react')
  return { default: () => React.createElement('div') }
})

function installMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: true, media: query, onchange: null,
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

beforeEach(() => { restoreMedia = installMatchMedia() })

afterEach(() => {
  cleanup()
  restoreMedia()
  localStorage.clear()
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </MemoryRouter>
  )
}

const $ = (sel) => document.body.querySelector(sel)
const $$ = (sel) => document.body.querySelectorAll(sel)
const dialogOpen = () => Boolean($('.brand-switch-dialog'))

describe('App · 品牌切换(规格 04 §4)', () => {
  it('空画布切换色卡:直接生效,不弹预览框', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(getByTestId('palette').textContent).toBe('perler'))

    fireEvent.click(getByTestId('to-hama'))

    await waitFor(() => expect(getByTestId('palette').textContent).toBe('hama'))
    expect(dialogOpen()).toBe(false)
  })

  it('有内容时切换色卡:弹出预览,矩阵先不动', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('paint'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const before = canvasProps.current.committedData

    fireEvent.click(getByTestId('to-hama'))
    await waitFor(() => expect(dialogOpen()).toBe(true))

    // 预览阶段只读:色卡未切、矩阵未动
    expect(getByTestId('palette').textContent).toBe('perler')
    expect(canvasProps.current.committedData).toBe(before)
  })

  it('取消预览:色卡与矩阵都保持原样', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('paint'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const before = canvasProps.current.committedData

    fireEvent.click(getByTestId('to-hama'))
    await waitFor(() => expect(dialogOpen()).toBe(true))

    fireEvent.click($('.brand-switch-close'))
    await waitFor(() => expect(dialogOpen()).toBe(false))
    expect(getByTestId('palette').textContent).toBe('perler')
    expect(canvasProps.current.committedData).toBe(before)
  })

  it('转换:矩阵换成目标品牌色,且一次撤销回到切换前', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('paint'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const before = canvasProps.current.committedData.map(r => [...r])

    fireEvent.click(getByTestId('to-hama'))
    await waitFor(() => expect(dialogOpen()).toBe(true))
    fireEvent.click($('.brand-switch-actions .btn-primary'))

    await waitFor(() => {
      const after = canvasProps.current.committedData
      expect(after[0][0].toLowerCase()).not.toBe('#e53935')
      expect(getByTestId('palette').textContent).toBe('hama')
    })

    // 目标色必须真实属于 Hama 色卡
    const hamaHexes = getPalette('hama').colors.map(c => c.hex.toLowerCase())
    expect(hamaHexes).toContain(canvasProps.current.committedData[0][0].toLowerCase())

    // 一次撤销 = 回到切换前(证明只压了一条历史)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => {
      expect(canvasProps.current.committedData).toEqual(before)
    })
  })

  it('只改色号:色卡切换但矩阵逐格不变', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('paint'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const before = canvasProps.current.committedData

    fireEvent.click(getByTestId('to-hama'))
    await waitFor(() => expect(dialogOpen()).toBe(true))
    fireEvent.click($$('.brand-switch-actions .btn-secondary')[0])

    await waitFor(() => expect(getByTestId('palette').textContent).toBe('hama'))
    expect(canvasProps.current.committedData).toBe(before)
    expect(dialogOpen()).toBe(false)
  })
})
