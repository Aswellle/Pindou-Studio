/**
 * useResponsiveShell — 统一响应式布局 Shell
 *
 * 整合断点检测、键盘安全、Safe Area 和滚动策略，
 * 为全站提供一致的响应式行为。
 *
 * Desktop ≥1024 / Tablet 640-1023 / Mobile <640
 */

import { useMemo } from 'react'
import { useResponsive } from './useResponsive'
import { useKeyboardSafe } from './useKeyboardSafe'
import { useVisualViewport } from './useVisualViewport'

export function useResponsiveShell() {
  const { isMobile, isTablet, isDesktop } = useResponsive()
  useKeyboardSafe()
  const viewport = useVisualViewport()

  const shell = useMemo(() => ({
    isMobile,
    isTablet,
    isDesktop,
    // 是否为移动端布局（手机或平板）
    isMobileLayout: isMobile || isTablet,
    // 可视视口信息
    visibleHeight: viewport.height,
    visibleWidth: viewport.width,
    keyboardHeight: viewport.keyboardHeight,
    // 滚动策略：移动端使用 block:'nearest' 避免级联滚动
    scrollIntoViewOptions: { block: 'nearest', behavior: 'smooth' },
    // Safe Area
    safeAreaBottom: 'env(safe-area-inset-bottom, 0px)',
  }), [isMobile, isTablet, isDesktop, viewport])

  return shell
}
