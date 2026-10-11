import { describe, it, expect } from 'vitest'
import { passwordWeakness } from './password'

describe('passwordWeakness', () => {
  it('过短 / 全重复字符 / 连续序列 / 缺字母或数字分别返回对应错误键', () => {
    expect(passwordWeakness('aB3')).toBe('errors.passwordTooShort')
    expect(passwordWeakness('aaaaaaaa')).toBe('errors.passwordRepeat')
    expect(passwordWeakness('abcdefg8')).toBe('errors.passwordSequence')
    expect(passwordWeakness('Abcdefg8').endsWith('passwordSequence')).toBe(true)
    expect(passwordWeakness('13572468')).toBe('errors.passwordMix')
    expect(passwordWeakness('xzkvhqpw')).toBe('errors.passwordMix')
  })

  it('合法密码返回 null', () => {
    expect(passwordWeakness('bead2026')).toBe(null)
    expect(passwordWeakness('Xy!9kq2m')).toBe(null)
  })

  it('序列检测大小写不敏感且不含密码自身随机组合', () => {
    expect(passwordWeakness('XYZ9ab12')).toBe('errors.passwordSequence')
    expect(passwordWeakness('qz9xk2mv')).toBe(null)
  })
})
