import { useState, useEffect, useCallback } from 'react'

export const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
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

    checkDevice()
    window.addEventListener('resize', checkDevice)
    return () => window.removeEventListener('resize', checkDevice)
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
