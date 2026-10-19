/**
 * useScrollLock — 全站统一的 body 滚动锁(引用计数)。
 *
 * 背景(R4):此前 App、ContactUsModal、ImageQuantizer、BottomSheet 各自保存/恢复
 * `document.body.style.overflow`,叠加弹层或快速开关时后挂载的组件会把前一个组件的
 * 锁当成初始值,先卸载的一方又直接清空样式 —— 结果要么提前解锁、要么锁残留。
 *
 * 规则:
 *   - 每个调用方持有一个锁令牌;只有计数归零才恢复原始样式;
 *   - `fixed` 锁会额外记录 scrollY 并把 body 固定(`position: fixed; top: -scrollY`),
 *     这是 iOS Safari 键盘弹起时避免整页被顶开的既有做法;
 *   - 若同时存在 fixed 锁与普通锁,fixed 优先;fixed 锁先释放而普通锁仍在时,
 *     自动降级为普通锁并恢复滚动位置,不提前解锁。
 *
 * 不锁 html/body 之外的元素 —— 页面内部滚动容器各自由自己的组件管理。
 */

import { useEffect, useRef } from 'react'

const locks = new Map() // token -> { fixed }
let saved = null
let nextToken = 0

function anyFixed() {
  for (const lock of locks.values()) if (lock.fixed) return true
  return false
}

function apply() {
  const body = document.body
  if (!body) return

  if (locks.size === 0) {
    if (!saved) return
    const { overflow, position, width, top, scrollY, fixedApplied } = saved
    body.style.overflow = overflow
    body.style.position = position
    body.style.width = width
    body.style.top = top
    saved = null
    if (fixedApplied && scrollY) window.scrollTo(0, scrollY)
    return
  }

  if (!saved) {
    saved = {
      overflow: body.style.overflow,
      position: body.style.position,
      width: body.style.width,
      top: body.style.top,
      scrollY: window.scrollY || 0,
      fixedApplied: false,
    }
  }
  body.style.overflow = 'hidden'

  const wantFixed = anyFixed()
  if (wantFixed && !saved.fixedApplied) {
    saved.fixedApplied = true
    body.style.position = 'fixed'
    body.style.width = '100%'
    body.style.top = `-${saved.scrollY}px`
  } else if (!wantFixed && saved.fixedApplied) {
    // fixed 锁先释放、仍有普通锁:降级为 overflow 锁并恢复滚动位置
    saved.fixedApplied = false
    body.style.position = saved.position
    body.style.width = saved.width
    body.style.top = saved.top
    if (saved.scrollY) window.scrollTo(0, saved.scrollY)
  }
}

function acquire(fixed) {
  const token = ++nextToken
  locks.set(token, { fixed: !!fixed })
  apply()
  return token
}

function release(token) {
  if (!locks.delete(token)) return
  apply()
}

/**
 * @param {boolean} active - 是否持有锁
 * @param {{fixed?: boolean}} [options] - fixed=true 用于 iOS 键盘场景
 */
export function useScrollLock(active, { fixed = false } = {}) {
  // 用 ref 记住令牌,保证 cleanup 释放的是自己持有的那把锁
  const tokenRef = useRef(null)

  useEffect(() => {
    if (!active) {
      if (tokenRef.current != null) {
        release(tokenRef.current)
        tokenRef.current = null
      }
      return undefined
    }
    tokenRef.current = acquire(fixed)
    return () => {
      if (tokenRef.current != null) {
        release(tokenRef.current)
        tokenRef.current = null
      }
    }
  }, [active, fixed])
}

/** 仅测试用:清空所有锁并恢复初始状态 */
export function __resetScrollLock() {
  locks.clear()
  saved = null
}
