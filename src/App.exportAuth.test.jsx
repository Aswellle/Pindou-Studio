import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './i18n'
import App from './App'

/**
 * 移动端导出面板的登录守卫接线。
 *
 * 桌面端有三个 ExportPanel 实例(侧栏常驻 / 桌面弹层 / 移动弹层),
 * 守卫参数 isAuthenticated / authEnabled / onRequireAuth 曾只在桌面两处传入,
 * 移动弹层缺参后 authEnabled 回落到 false —— 游客在手机上既能选高分辨率,
 * 也看不到熨烫入口的「需要登录」标记,点击入口还会直接打开工作室。
 *
 * 这类只在 JSX 传参层出现的漏洞组件单测覆盖不到,这里把 ExportPanel
 * 与 MobileToolbar 换成最小桩,直接断言 App 给移动实例的接线契约。
 */

const { exportProps } = vi.hoisted(() => ({ exportProps: { current: null } }))

vi.mock('./services/supabase', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

// 门禁要生效,站点必须被判定为「已配置账号系统」;游客态由 user=null 表达
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAdmin: false,
    loading: false,
    authAvailable: true,
    login: vi.fn(),
    register: vi.fn(),
    resetPassword: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
    verifyForgotOtp: vi.fn(),
    setPassword: vi.fn(),
    setPasswordWithOtp: vi.fn(),
    changeEmail: vi.fn(),
    verifyPassword: vi.fn(),
    setSecurityKey: vi.fn(),
    changePassword: vi.fn(),
    registerUsername: vi.fn(),
    loginByUsername: vi.fn(),
    forgotPasswordCustom: vi.fn(),
    usernameExists: vi.fn(),
  }),
}))

vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      cancelStroke: () => {},
      resetTransform: () => {},
      fitToScreen: () => {},
    }))
    return React.createElement('div', { className: 'mock-canvas' })
  })
  return { default: MockCanvas }
})

vi.mock('./components/ExportPanel', async () => {
  const React = await import('react')
  return {
    default: props => {
      exportProps.current = props
      return React.createElement('div', { 'data-testid': 'export-panel' })
    },
  }
})

vi.mock('./components/Tools/MobileToolbar', async () => {
  const React = await import('react')
  return {
    default: ({ onExport }) =>
      React.createElement('button', { 'data-testid': 'mobile-export', onClick: onExport }, 'export'),
  }
})

function LocationProbe() {
  const location = useLocation()
  const reason = location.state?.reason
  return <div data-testid="location">{location.pathname + (reason ? `:${reason}` : '')}</div>
}

function installMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => {
    window.matchMedia = orig
  }
}

let restoreMedia
let origInnerWidth

beforeAll(() => {
  window.scrollTo = () => {}
})

beforeEach(() => {
  origInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
  restoreMedia = installMatchMedia()
  exportProps.current = null
})

afterEach(() => {
  cleanup()
  restoreMedia()
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: origInnerWidth })
  localStorage.clear()
})

function renderMobileApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HelmetProvider>
        <App />
        <LocationProbe />
      </HelmetProvider>
    </MemoryRouter>
  )
}

describe('App 移动端导出守卫接线', () => {
  it('移动端 ExportPanel 拿到游客守卫参数', () => {
    const { getByTestId } = renderMobileApp()
    fireEvent.click(getByTestId('mobile-export'))

    expect(exportProps.current).toBeTruthy()
    expect(exportProps.current.isAuthenticated).toBe(false)
    expect(exportProps.current.authEnabled).toBe(true)
    expect(typeof exportProps.current.onRequireAuth).toBe('function')
  })

  it('移动端守卫入口跳转登录页并带上原因', () => {
    const { getByTestId } = renderMobileApp()
    fireEvent.click(getByTestId('mobile-export'))

    act(() => {
      exportProps.current.onRequireAuth('ironing')
    })
    expect(getByTestId('location').textContent).toBe('/login:ironing')
  })
})
