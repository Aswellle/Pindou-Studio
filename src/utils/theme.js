/**
 * 主题(浅色 / 深色 / 跟随系统)的应用层 —— 纯 DOM 操作,不依赖 React。
 *
 * 分层:`editorPrefs.js` 只管 `bead_studio_settings` 的读写;本模块负责把
 * 模式解析成实际主题并落到 `<html>` 上。首帧主题由 index.html 的同步内联
 * 脚本设置(防白闪),本模块与之保持同一套判定规则:
 *   · mode 不是 'light'/'dark' → 视为 system,取 prefers-color-scheme
 *   · data-theme 只接受 'light' | 'dark'
 * 内联脚本是 HTML 字符串、这里是 JS,两处没有共享代码 —— 改判定规则或
 * 字段名必须同步改 index.html。
 */

import { loadThemeMode, saveThemeMode } from './editorPrefs'

/** 两种主题下 <body> 的底色:用于同步 <meta name="theme-color">(移动端地址栏/状态栏颜色) */
export const THEME_BG = { light: '#fdfbf7', dark: '#201a15' }

/**
 * 模式 → 实际主题。mode 缺省 / 非法按 system 处理(与 index.html 内联脚本一致)。
 * @param {'light'|'dark'|'system'} mode
 * @param {boolean} systemDark 系统当前是否偏好深色
 * @returns {'light'|'dark'}
 */
export function resolveTheme(mode, systemDark) {
  const m = mode === 'light' || mode === 'dark' ? mode : 'system'
  if (m !== 'system') return m
  return systemDark ? 'dark' : 'light'
}

/** 系统当前是否偏好深色。无 matchMedia(老浏览器 / jsdom)回退 false。 */
export function systemPrefersDark() {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function setMetaThemeColor(content) {
  try {
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', content)
  } catch {
    // 无 head 的极端环境:跳过,不影响主题本身
  }
}

/**
 * 把主题落到 DOM:`<html data-theme>` + `color-scheme` + `theme-color` meta。
 * CSS 侧的全部暗色规则都挂在 `[data-theme='dark']` 选择器下。
 * @returns {'light'|'dark'} 实际落地的主题
 */
export function applyTheme(mode, { systemDark = systemPrefersDark() } = {}) {
  const theme = resolveTheme(mode, systemDark)
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  try {
    root.style.colorScheme = theme // 表单控件 / 滚动条 / 系统 UI 跟随
  } catch {
    // 个别环境不支持 style.colorScheme:仅影响原生控件配色,主题本身不受影响
  }
  setMetaThemeColor(THEME_BG[theme])
  return theme
}

/**
 * 应用当前持久化的模式,并接管后续的系统主题变化。
 * main.jsx 挂载时调用一次;首帧已由 index.html 内联脚本设置,这里只做
 * 幂等的重设 + 注册 matchMedia 监听(system 模式下系统切换明暗时跟随)。
 */
export function initTheme() {
  applyTheme(loadThemeMode())
  if (typeof window.matchMedia !== 'function') return
  try {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      // 只有 system 模式才跟随;显式选择的模式不受系统切换影响
      if (loadThemeMode() === 'system') applyTheme('system', { systemDark: e.matches })
    }
    mql.addEventListener('change', onChange)
  } catch {
    // 老 Safari 无 addEventListener:初始化已设对,只是不再实时跟随
  }
}

/** 用户显式切换模式:持久化 + 立即应用。返回实际落地的主题。 */
export function changeThemeMode(mode) {
  saveThemeMode(mode)
  return applyTheme(mode)
}
