import { describe, it, expect } from 'vitest'
import { parseUserAgent } from './userAgent'

describe('parseUserAgent', () => {
  it('Windows + Chrome', () => {
    const out = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    expect(out.os).toBe('Windows')
    expect(out.browser).toBe('Chrome 120.0.0.0')
    expect(out.mobile).toBe(false)
    expect(out.label).toBe('Windows · Chrome 120.0.0.0')
  })

  it('Edge 不被误判成 Chrome(壳浏览器先于内核判定)', () => {
    const out = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91'
    )
    expect(out.browser).toBe('Edge 120.0.2210.91')
  })

  it('macOS + Safari', () => {
    const out = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    )
    expect(out.os).toBe('macOS')
    expect(out.browser).toBe('Safari 17.1')
  })

  it('Android 移动端 + Chrome', () => {
    const out = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    )
    expect(out.os).toBe('Android')
    expect(out.mobile).toBe(true)
    expect(out.browser).toBe('Chrome 120.0.0.0')
  })

  it('iPhone 上的 Chrome(CriOS)不被认成 Safari', () => {
    const out = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
    )
    expect(out.os).toBe('iOS')
    expect(out.browser).toBe('Chrome 120.0.0.0')
    expect(out.mobile).toBe(true)
  })

  it('Firefox 与微信内嵌 WebView(X5 内核)不崩溃,给出可读标签', () => {
    const firefox = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
    )
    expect(firefox.browser).toBe('Firefox 120.0')

    // 微信安卓 WebView 没有标准浏览器标识:至少要识别出 Android 系统
    const wechat = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 13; MI 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.43'
    )
    expect(wechat.os).toBe('Android')
    expect(wechat.browser).toContain('Chrome')
  })

  it('空串与乱码安全:返回 null 或空标签,不抛错', () => {
    expect(parseUserAgent('')).toBe(null)
    expect(parseUserAgent(null)).toBe(null)
    expect(parseUserAgent('   ')).toBe(null)
    // 完全未知的 UA:结构完整,标签可能为空
    const out = parseUserAgent('some-random-bot/1.0')
    expect(out).toEqual({ os: '', browser: '', mobile: false, label: '' })
  })
})
