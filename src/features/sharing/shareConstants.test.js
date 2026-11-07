import { describe, it, expect } from 'vitest'
import { SHARE_LIMITS, shareCardPath, toShareErrorCode, SHARE_ERROR_CODES } from './shareConstants'

describe('SHARE_LIMITS', () => {
  it('与数据库 CHECK 同口径', () => {
    expect(SHARE_LIMITS.titleMax).toBe(80)
    expect(SHARE_LIMITS.descriptionMax).toBe(160)
    expect(SHARE_LIMITS.authorMax).toBe(40)
    expect(SHARE_LIMITS.minDimension).toBe(9)
    expect(SHARE_LIMITS.maxDimension).toBe(200)
    expect(SHARE_LIMITS.maxCells).toBe(40000)
    expect(SHARE_LIMITS.cardBytes).toBe(2 * 1024 * 1024)
  })

  it('卡片路径固定 <id>/r1.png', () => {
    expect(shareCardPath('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000/r1.png'
    )
  })
})

describe('toShareErrorCode', () => {
  it('服务端 raise exception message 映射为稳定码', () => {
    expect(toShareErrorCode({ message: 'release_gate_closed' })).toBe(SHARE_ERROR_CODES.RELEASE_GATE_CLOSED)
    expect(toShareErrorCode({ message: 'work_not_found' })).toBe(SHARE_ERROR_CODES.WORK_NOT_FOUND)
    expect(toShareErrorCode({ message: 'not_owner' })).toBe(SHARE_ERROR_CODES.NOT_OWNER)
  })

  it('权限失败可区分于网络失败', () => {
    expect(toShareErrorCode({ code: '42501', message: 'permission denied' })).toBe(
      SHARE_ERROR_CODES.UNAUTHORIZED
    )
    expect(toShareErrorCode({ message: 'Failed to fetch' })).toBe(SHARE_ERROR_CODES.NETWORK)
  })

  it('空值/未知错误归为 unknown', () => {
    expect(toShareErrorCode(null)).toBe(SHARE_ERROR_CODES.UNKNOWN)
    expect(toShareErrorCode({ message: 'weird server text' })).toBe(SHARE_ERROR_CODES.UNKNOWN)
  })
})
