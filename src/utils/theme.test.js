import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applyTheme,
  changeThemeMode,
  initTheme,
  resolveTheme,
  systemPrefersDark,
  THEME_BG,
} from './theme'
import { loadThemeMode, saveThemeMode, SETTINGS_KEY } from './editorPrefs'

describe('resolveTheme', () => {
  it('显式 light/dark 原样返回,不看系统', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('system 跟随系统偏好', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('缺省 / 非法值一律按 system 处理(与 index.html 内联脚本一致)', () => {
    expect(resolveTheme(undefined, true)).toBe('dark')
    expect(resolveTheme('banana', false)).toBe('light')
    expect(resolveTheme(null, false)).toBe('light')
  })
})

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
    if (typeof window.matchMedia !== 'function') {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() })
    }
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
    vi.restoreAllMocks()
  })

  it('显式 dark 写入 data-theme、color-scheme 与 theme-color', () => {
    const theme = applyTheme('dark', { systemDark: false })
    expect(theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe(THEME_BG.dark)
  })

  it('system 模式按系统偏好落地', () => {
    expect(applyTheme('system', { systemDark: true })).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(applyTheme('system', { systemDark: false })).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(THEME_BG.light)
  })

  it('非法模式按 system 兜底(与内联脚本判定一致)', () => {
    expect(applyTheme('banana', { systemDark: true })).toBe('dark')
  })
})

describe('editorPrefs 主题模式存取', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('无记录时回默认 system(未登录用户恒为跟随系统)', () => {
    expect(loadThemeMode()).toBe('system')
  })

  it('round-trip:save 后 load 返回同值,且保留 settings 其他字段', () => {
    saveThemeMode('dark')
    expect(loadThemeMode()).toBe('dark')
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY))
    expect(raw.themeMode).toBe('dark')
    raw.language = 'en-US'
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(raw))
    saveThemeMode('light')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).language).toBe('en-US')
    expect(loadThemeMode()).toBe('light')
  })

  it('非法值不落盘、读取时回默认', () => {
    saveThemeMode('banana')
    expect(loadThemeMode()).toBe('system')
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull()
  })

  it('损坏的 JSON 静默回退默认', () => {
    localStorage.setItem(SETTINGS_KEY, '{oops')
    expect(loadThemeMode()).toBe('system')
  })
})

describe('changeThemeMode / initTheme / systemPrefersDark', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
    vi.restoreAllMocks()
  })

  it('systemPrefersDark:无 matchMedia 时回 false 不抛错', () => {
    const original = window.matchMedia
    delete window.matchMedia
    expect(systemPrefersDark()).toBe(false)
    window.matchMedia = original
  })

  it('changeThemeMode 持久化并立即应用', () => {
    const theme = changeThemeMode('dark')
    expect(theme).toBe('dark')
    expect(loadThemeMode()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('initTheme:恢复持久化模式;system 模式下系统切换明暗时跟随', () => {
    const listeners = []
    window.matchMedia = vi.fn().mockImplementation((q) => ({
      matches: q.includes('dark') ? false : true,
      addEventListener: (_t, fn) => listeners.push(fn),
    }))
    saveThemeMode('dark')
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    // system 模式:matchMedia change 事件驱动跟随
    saveThemeMode('system')
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    listeners.forEach((fn) => fn({ matches: true }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    listeners.forEach((fn) => fn({ matches: false }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    // 显式 light 模式:系统切换不覆盖用户选择
    saveThemeMode('light')
    listeners.forEach((fn) => fn({ matches: true }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('initTheme:无 matchMedia(老浏览器/jsdom 兜底)不抛错且仍应用持久化模式', () => {
    saveThemeMode('dark')
    const original = window.matchMedia
    delete window.matchMedia
    expect(() => initTheme()).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    window.matchMedia = original
  })
})
