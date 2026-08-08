import { useState, useEffect, useCallback } from 'react'

export const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  // 注意:桌面判定实际使用 tablet 阈值(≥1024),无独立 desktop 断点
}

// 首屏渲染前就要拿到正确的设备分类，否则 useEffect 触发前会先用桌面端
// 默认值渲染一帧完整桌面 Header（Logo 全称 + 文字导航 + 语言选择器 + 登录/注册），
// 在手机宽度下必然溢出/挤在一行。SSR 场景下 window 不存在，退回桌面端。
const getDeviceFlags = () => {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1280
  return {
    isMobile: width < BREAKPOINTS.mobile,
    isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
    isDesktop: width >= BREAKPOINTS.tablet,
  }
}

export function useResponsive() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  })

  const initialFlags = getDeviceFlags()
  const [isMobile, setIsMobile] = useState(initialFlags.isMobile)
  const [isTablet, setIsTablet] = useState(initialFlags.isTablet)
  const [isDesktop, setIsDesktop] = useState(initialFlags.isDesktop)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

      setWindowSize({ width, height })
      setIsMobile(width < BREAKPOINTS.mobile)
      setIsTablet(width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet)
      setIsDesktop(width >= BREAKPOINTS.tablet)
      setIsTouchDevice(touch)
    }

    // rAF 节流:窗口拖动时 resize 高频触发,每帧最多重算一次
    let rafId = 0
    const onResize = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(checkDevice)
    }
    checkDevice()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(rafId) }
  }, [])

  return {
    windowSize,
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    breakpoint: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
  }
}
