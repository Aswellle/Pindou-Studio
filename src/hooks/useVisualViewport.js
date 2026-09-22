/**
 * useVisualViewport — 统一 VisualViewport 管理器
 *
 * 维护可视视口状态：width, height, offsetTop, offsetLeft, keyboardHeight
 * 监听 visualViewport.resize 和 visualViewport.scroll
 *
 * 用于替代分散的 iOS 键盘处理逻辑，统一维护 --vh 和 --visible-vh CSS 变量。
 */

import { useState, useEffect } from 'react'

/**
 * @returns {{
 *   width: number,
 *   height: number,
 *   offsetTop: number,
 *   offsetLeft: number,
 *   keyboardHeight: number
 * }}
 */
export function useVisualViewport() {
  const [viewport, setViewport] = useState(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return { width: 0, height: 0, offsetTop: 0, offsetLeft: 0, keyboardHeight: 0 }
    }
    const vv = window.visualViewport
    return {
      width: vv.width,
      height: vv.height,
      offsetTop: vv.offsetTop,
      offsetLeft: vv.offsetLeft,
      keyboardHeight: Math.max(0, window.innerHeight - vv.height - vv.offsetTop),
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined

    const vv = window.visualViewport

    const update = () => {
      const newHeight = vv.height
      const newOffsetTop = vv.offsetTop
      const keyboardHeight = Math.max(0, window.innerHeight - newHeight - newOffsetTop)

      setViewport(prev => {
        if (
          prev.width === vv.width &&
          prev.height === newHeight &&
          prev.offsetTop === newOffsetTop &&
          prev.offsetLeft === vv.offsetLeft &&
          prev.keyboardHeight === keyboardHeight
        ) return prev
        return {
          width: vv.width,
          height: newHeight,
          offsetTop: newOffsetTop,
          offsetLeft: vv.offsetLeft,
          keyboardHeight,
        }
      })

      // 同步 CSS 变量（供组件引用）
      document.documentElement.style.setProperty('--visible-vh', `${newHeight}px`)
      document.documentElement.style.setProperty('--visible-vh-top', `${newOffsetTop}px`)
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update() // 初始化

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return viewport
}
