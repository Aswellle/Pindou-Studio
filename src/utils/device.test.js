import { describe, it, expect } from 'vitest'
import { isIOSSafariLike } from './device'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_LEGACY = 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
// iPadOS 13+ 默认桌面 UA
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const MAC_SAFARI = IPAD_DESKTOP_UA
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('isIOSSafariLike', () => {
  it('iPhone / 旧版 iPad UA 直接命中', () => {
    expect(isIOSSafariLike(IPHONE, 5)).toBe(true)
    expect(isIOSSafariLike(IPAD_LEGACY, 5)).toBe(true)
  })

  it('iPadOS 13+ 桌面 UA 靠多点触控识别(旧写法在此失效)', () => {
    expect(isIOSSafariLike(IPAD_DESKTOP_UA, 5)).toBe(true)
  })

  it('桌面 Mac Safari 不算(无多点触控)', () => {
    expect(isIOSSafariLike(MAC_SAFARI, 0)).toBe(false)
  })

  it('Android / Windows 不算', () => {
    expect(isIOSSafariLike(ANDROID, 5)).toBe(false)
    expect(isIOSSafariLike(WINDOWS_CHROME, 0)).toBe(false)
  })

  it('空 UA 不抛错', () => {
    expect(isIOSSafariLike('', 0)).toBe(false)
    expect(isIOSSafariLike(undefined, undefined)).toBe(false)
  })
})
